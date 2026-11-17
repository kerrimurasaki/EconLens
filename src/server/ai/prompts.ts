import fs from "node:fs";
import path from "node:path";

export const PROMPT_VERSIONS = {
  normalizeEvent: "normalizeEvent.v2",
  inferEconomics: "inferEconomics.v2",
  generateExperience: "generateExperience.v2",
  regenerateBlock: "regenerateBlock.v2",
} as const;

const cache = new Map<string, string>();

export function loadPrompt(name: keyof typeof PROMPT_VERSIONS): string {
  const file = PROMPT_VERSIONS[name];
  let text = cache.get(file);
  if (!text) {
    text = fs.readFileSync(path.join(process.cwd(), "prompts", `${file}.md`), "utf8");
    cache.set(file, text);
  }
  return text;
}

/** Wraps untrusted text so the model sees it as data. Strips any attempt to close/open the delimiter. */
export function wrapUntrusted(text: string): string {
  // Strip repeatedly: a single pass can be defeated by nesting ("</untrusted_</untrusted_source>source>").
  let cleaned = text;
  for (let prev = ""; prev !== cleaned; ) {
    prev = cleaned;
    cleaned = cleaned.replace(/<\/?\s*untrusted_source\s*>/gi, "");
  }
  return `<untrusted_source>\n${cleaned}\n</untrusted_source>`;
}
