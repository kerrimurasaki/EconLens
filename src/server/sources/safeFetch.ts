import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class FetchBlockedError extends Error {
  constructor(
    public readonly reason:
      | "BAD_URL"
      | "BAD_SCHEME"
      | "BAD_PORT"
      | "CREDENTIALS"
      | "BLOCKED_ADDRESS"
      | "DNS_FAILED"
      | "TOO_MANY_REDIRECTS"
      | "TOO_LARGE"
      | "TIMEOUT"
      | "BAD_CONTENT_TYPE"
      | "ROBOTS_DISALLOWED"
      | "HTTP_ERROR"
      | "NETWORK",
    message: string,
  ) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

// ---------- IP classification ----------

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + Number(o), 0);
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = ipv4ToInt(base);
    return n >= start && n < start + size;
  });
}

function expandV6(ip: string): bigint | null {
  let addr = ip.split("%")[0]!.toLowerCase();
  // embedded IPv4 tail
  const tail = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = ipv4ToInt(tail[1]!);
    addr = addr.replace(tail[1]!, `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`);
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  let v = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    v = (v << 16n) | BigInt(parseInt(g, 16));
  }
  return v;
}

function isBlockedV6(ip: string): boolean {
  const v = expandV6(ip);
  if (v === null) return true; // unparseable: fail closed
  const top = (bits: number) => v >> BigInt(128 - bits);
  if (v === 0n || v === 1n) return true; // :: and ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible
  if (top(96) === 0xffffn || top(96) === 0n) return isBlockedV4(intToV4(Number(v & 0xffffffffn)));
  // NAT64 64:ff9b::/96
  if (top(96) === 0x64ff9b0000000000000000n) return isBlockedV4(intToV4(Number(v & 0xffffffffn)));
  if (top(7) === 0xfcn >> 1n) return true; // fc00::/7 unique local
  if (top(10) === 0x3fan) return true; // fe80::/10 link-local
  if (top(8) === 0xffn) return true; // multicast
  if (top(32) === 0x20010db8n) return true; // documentation
  if (top(32) === 0x20010000n) return true; // Teredo 2001::/32
  if (top(48) === 0x0064ff9b0001n) return true; // 64:ff9b:1::/48 local-use NAT64
  if (top(10) === 0x3fbn) return true; // fec0::/10 deprecated site-local
  if (top(64) === 0x100n << 48n) return true; // 100::/64 discard prefix
  if (top(16) === 0x2002n) return isBlockedV4(intToV4(Number((v >> 80n) & 0xffffffffn))); // 6to4
  return false;
}

function intToV4(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** True when the address must never be fetched (private, loopback, link-local, metadata, reserved, unparseable). */
export function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) return isBlockedV6(ip);
  return true;
}

// ---------- URL validation ----------

export function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("BAD_URL", "That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("BAD_SCHEME", "Only http and https URLs are allowed.");
  if (url.username || url.password) throw new FetchBlockedError("CREDENTIALS", "URLs with embedded credentials are not allowed.");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw new FetchBlockedError("BAD_PORT", "Only ports 80 and 443 are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new FetchBlockedError("BLOCKED_ADDRESS", "That address is not allowed.");
  }
  return url;
}

// ---------- fetch ----------

export interface TransportRequest {
  url: URL;
  /** Pre-validated IP the connection must use (prevents DNS rebinding). */
  ip: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}
export interface TransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;
export type Resolver = (hostname: string) => Promise<string[]>;

export interface SafeFetchOptions {
  resolver?: Resolver;
  transport?: Transport;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  respectRobots?: boolean;
  userAgent?: string;
  /** Hard deadline across all redirects and the robots.txt request. */
  totalTimeoutMs?: number;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
  retrievedAt: Date;
}

const defaultResolver: Resolver = async (host) => {
  const res = await dns.lookup(host, { all: true, verbatim: true });
  return res.map((r) => r.address);
};

const defaultTransport: Transport = ({ url, ip, headers, timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: "GET",
        headers,
        servername: net.isIP(url.hostname) ? undefined : url.hostname,
        // Pin the connection to the already-validated IP.
        lookup: (_h, opts, cb) => {
          const family = net.isIP(ip);
          if ((opts as { all?: boolean }).all) (cb as unknown as (e: null, a: unknown) => void)(null, [{ address: ip, family }]);
          else cb(null, ip, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new FetchBlockedError("TOO_LARGE", "The page is too large."));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new FetchBlockedError("TIMEOUT", "The request timed out.")));
    req.on("error", (e) => reject(e instanceof FetchBlockedError ? e : new FetchBlockedError("NETWORK", "Could not reach that address.")));
    req.end();
  });

async function resolveSafe(url: URL, resolver: Resolver): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addrs: string[];
  if (net.isIP(host)) addrs = [host];
  else {
    try {
      addrs = await resolver(host);
    } catch {
      throw new FetchBlockedError("DNS_FAILED", "Could not resolve that host.");
    }
  }
  if (addrs.length === 0) throw new FetchBlockedError("DNS_FAILED", "Could not resolve that host.");
  // If ANY answer is private the host is rejected (defends against mixed answers).
  if (addrs.some(isBlockedIp)) throw new FetchBlockedError("BLOCKED_ADDRESS", "That address is not allowed.");
  return addrs[0]!;
}

const ALLOWED_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];

/** Parses the `User-agent: *` group of a robots.txt body and tests a path. */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  let applies = false;
  const disallow: string[] = [];
  const allow: string[] = [];
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = line.match(/^([a-zA-Z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "user-agent") applies = val === "*";
    else if (applies && key === "disallow" && val) disallow.push(val);
    else if (applies && key === "allow" && val) allow.push(val);
  }
  const matches = (rule: string) => {
    const anchored = rule.endsWith("$");
    const body = anchored ? rule.slice(0, -1) : rule;
    const re = new RegExp("^" + body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
    return re.test(path);
  };
  const longest = (rules: string[]) => rules.filter(matches).reduce((a, r) => Math.max(a, r.length), -1);
  return longest(allow) >= longest(disallow);
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const deadline = options.totalTimeoutMs ?? 20_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      safeFetchInner(rawUrl, options),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new FetchBlockedError("TIMEOUT", "The request timed out.")), deadline); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function safeFetchInner(rawUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const {
    resolver = defaultResolver,
    transport = defaultTransport,
    maxBytes = 1_000_000,
    timeoutMs = 8000,
    maxRedirects = 3,
    respectRobots = true,
    userAgent = "EconLensBot/0.1 (educational; teacher-initiated fetch)",
  } = options;

  let url = validateUrl(rawUrl);
  const headers = { "user-agent": userAgent, accept: "text/html,text/plain;q=0.9", "accept-encoding": "identity" };
  const robotsChecked = new Set<string>();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ip = await resolveSafe(url, resolver);

    if (respectRobots && !robotsChecked.has(url.origin)) {
      robotsChecked.add(url.origin);
      const robotsUrl = new URL("/robots.txt", url.origin);
      try {
        const r = await transport({ url: robotsUrl, ip, headers, timeoutMs, maxBytes: 200_000 });
        if (r.status >= 200 && r.status < 300 && !robotsAllows(r.body.toString("utf8"), url.pathname + url.search)) {
          throw new FetchBlockedError("ROBOTS_DISALLOWED", "The site's robots.txt does not allow automated access to this page.");
        }
      } catch (e) {
        if (e instanceof FetchBlockedError && e.reason === "ROBOTS_DISALLOWED") throw e;
        // robots.txt unreachable: proceed (standard behaviour for missing robots).
      }
    }

    const res = await transport({ url, ip, headers, timeoutMs, maxBytes });

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      let next: URL;
      try {
        next = new URL(res.headers.location, url);
      } catch {
        throw new FetchBlockedError("BAD_URL", "The page redirected to an invalid address.");
      }
      url = validateUrl(next.toString()); // re-validate scheme/port/host on every hop; IP re-checked at loop top
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new FetchBlockedError("HTTP_ERROR", `The page returned status ${res.status}.`);

    const contentType = (res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) throw new FetchBlockedError("BAD_CONTENT_TYPE", "Only web pages and plain text can be read.");
    if (res.body.length > maxBytes) throw new FetchBlockedError("TOO_LARGE", "The page is too large.");

    return { finalUrl: url.toString(), status: res.status, contentType, text: res.body.toString("utf8"), retrievedAt: new Date() };
  }
  throw new FetchBlockedError("TOO_MANY_REDIRECTS", "The page redirected too many times.");
}

// ---------- HTML -> excerpt ----------

export function extractExcerpt(rawHtml: string, maxChars = 4000): { title: string | null; excerpt: string } {
  // Bound the work: the regexes below are not linear on adversarial input, so never feed them a huge page.
  const html = rawHtml.slice(0, 150_000);
  const title = html.match(/<title[^>]{0,200}>([\s\S]{0,400}?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const text = stripMarkup(html)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title ? title.slice(0, 200) : null, excerpt: text.slice(0, maxChars) };
}

const SKIP_TAGS = ["script", "style", "noscript", "template"];

/** Linear single-pass tag stripper (no backtracking regexes). Unterminated constructs drop the rest of the input. */
function stripMarkup(html: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) { out.push(html.slice(i)); break; }
    out.push(html.slice(i, lt), " ");
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const name = /^<([a-z][a-z0-9]*)/.exec(lower.slice(lt, lt + 20))?.[1];
    if (name && SKIP_TAGS.includes(name)) {
      const close = lower.indexOf(`</${name}`, lt + 1);
      if (close === -1) break;
      const gt = html.indexOf(">", close);
      if (gt === -1) break;
      i = gt + 1;
      continue;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) break;
    i = gt + 1;
  }
  return out.join("");
}
