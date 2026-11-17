import { describe, expect, it, vi } from "vitest";
import {
  extractExcerpt,
  FetchBlockedError,
  isBlockedIp,
  robotsAllows,
  safeFetch,
  validateUrl,
  type Resolver,
  type Transport,
} from "@/server/sources/safeFetch";

const html = (body: string, extra: Record<string, string> = {}) => ({
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8", ...extra },
  body: Buffer.from(body),
});
const publicResolver: Resolver = async () => ["93.184.216.34"];
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e as FetchBlockedError).reason);

describe("isBlockedIp (T16)", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "ff02::1", "2001:db8::1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
});

describe("validateUrl (T16)", () => {
  it.each([
    ["file:///etc/passwd", "BAD_SCHEME"],
    ["ftp://example.com/x", "BAD_SCHEME"],
    ["javascript:alert(1)", "BAD_SCHEME"],
    ["http://user:pw@example.com/", "CREDENTIALS"],
    ["http://example.com:8080/", "BAD_PORT"],
    ["http://localhost/", "BLOCKED_ADDRESS"],
    ["http://foo.localhost/", "BLOCKED_ADDRESS"],
    ["not a url", "BAD_URL"],
  ])("rejects %s", (url, why) => {
    expect(() => validateUrl(url)).toThrowError(expect.objectContaining({ reason: why }));
  });
});

describe("safeFetch (T16)", () => {
  it.each(["http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://2130706433/", "http://0x7f.0.0.1/"])(
    "blocks literal private address %s without connecting",
    async (url) => {
      const transport = vi.fn<Transport>();
      expect(await reason(safeFetch(url, { transport, resolver: publicResolver }))).toBe("BLOCKED_ADDRESS");
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it("blocks a hostname resolving to a private address", async () => {
    const transport = vi.fn<Transport>();
    expect(await reason(safeFetch("https://evil.example/", { transport, resolver: async () => ["10.0.0.1"] }))).toBe("BLOCKED_ADDRESS");
    expect(transport).not.toHaveBeenCalled();
  });

  it("blocks mixed public/private DNS answers (rebinding-style)", async () => {
    const transport = vi.fn<Transport>();
    expect(await reason(safeFetch("https://evil.example/", { transport, resolver: async () => ["93.184.216.34", "127.0.0.1"] }))).toBe("BLOCKED_ADDRESS");
  });

  it("pins the connection to the validated IP", async () => {
    const transport = vi.fn<Transport>(async () => html("<title>T</title>" + "x".repeat(10)));
    await safeFetch("https://news.example/a", { transport, resolver: publicResolver, respectRobots: false });
    expect(transport.mock.calls[0]![0].ip).toBe("93.184.216.34");
  });

  it("re-validates every redirect hop (redirect to private IP)", async () => {
    const transport = vi.fn<Transport>(async () => ({ status: 302, headers: { location: "http://169.254.169.254/latest/" }, body: Buffer.alloc(0) }));
    expect(await reason(safeFetch("https://news.example/a", { transport, resolver: publicResolver, respectRobots: false }))).toBe("BLOCKED_ADDRESS");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("blocks redirect to a non-http scheme and to a host that resolves privately", async () => {
    const t1 = async () => ({ status: 301, headers: { location: "file:///etc/passwd" }, body: Buffer.alloc(0) });
    expect(await reason(safeFetch("https://a.example/", { transport: t1, resolver: publicResolver, respectRobots: false }))).toBe("BAD_SCHEME");
    const resolver: Resolver = async (h) => (h === "internal.example" ? ["192.168.0.9"] : ["93.184.216.34"]);
    const t2 = async () => ({ status: 301, headers: { location: "https://internal.example/" }, body: Buffer.alloc(0) });
    expect(await reason(safeFetch("https://a.example/", { transport: t2, resolver, respectRobots: false }))).toBe("BLOCKED_ADDRESS");
  });

  it("limits redirects", async () => {
    const transport = async () => ({ status: 302, headers: { location: "https://a.example/next" }, body: Buffer.alloc(0) });
    expect(await reason(safeFetch("https://a.example/", { transport, resolver: publicResolver, respectRobots: false, maxRedirects: 2 }))).toBe("TOO_MANY_REDIRECTS");
  });

  it("rejects oversize bodies and non-text content types", async () => {
    const big = async () => html("x".repeat(2000));
    expect(await reason(safeFetch("https://a.example/", { transport: big, resolver: publicResolver, respectRobots: false, maxBytes: 1000 }))).toBe("TOO_LARGE");
    const pdf = async () => ({ status: 200, headers: { "content-type": "application/pdf" }, body: Buffer.from("x") });
    expect(await reason(safeFetch("https://a.example/", { transport: pdf, resolver: publicResolver, respectRobots: false }))).toBe("BAD_CONTENT_TYPE");
  });

  it("surfaces transport timeouts", async () => {
    const transport = async () => { throw new FetchBlockedError("TIMEOUT", "timed out"); };
    expect(await reason(safeFetch("https://a.example/", { transport, resolver: publicResolver, respectRobots: false }))).toBe("TIMEOUT");
  });

  it("respects robots.txt", async () => {
    const transport: Transport = async ({ url }) =>
      url.pathname === "/robots.txt" ? { status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("User-agent: *\nDisallow: /private") } : html("<p>hi</p>");
    expect(await reason(safeFetch("https://a.example/private/x", { transport, resolver: publicResolver }))).toBe("ROBOTS_DISALLOWED");
    expect(await reason(safeFetch("https://a.example/public", { transport, resolver: publicResolver }))).toBe("ok");
  });

  it("returns text and retrieval time on success", async () => {
    const transport = async () => html("<title>Hello</title><p>Body</p>");
    const r = await safeFetch("https://a.example/", { transport, resolver: publicResolver, respectRobots: false });
    expect(r.text).toContain("Body");
    expect(r.retrievedAt).toBeInstanceOf(Date);
  });
});

describe("robotsAllows / extractExcerpt", () => {
  it("handles allow overriding disallow by specificity", () => {
    const txt = "User-agent: *\nDisallow: /a\nAllow: /a/ok";
    expect(robotsAllows(txt, "/a/no")).toBe(false);
    expect(robotsAllows(txt, "/a/ok/page")).toBe(true);
    expect(robotsAllows("", "/x")).toBe(true);
  });

  it("strips scripts and tags and returns the title", () => {
    const r = extractExcerpt("<title> My  page </title><script>evil()</script><style>p{}</style><p>Hello &amp; <b>world</b></p>");
    expect(r.title).toBe("My page");
    expect(r.excerpt).toBe("My page Hello & world");
    expect(r.excerpt).not.toContain("evil");
  });
});
