import { randomInt } from "node:crypto";
import { z } from "zod";

/** Pure helpers for creating accounts outside the UI (there is no self-service sign-up by design). */
export const roleSchema = z.enum(["ADMIN", "TEACHER", "STUDENT"]);
export const MIN_PASSWORD_LENGTH = 12;

export const newUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  role: roleSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional(),
});
export type NewUser = z.infer<typeof newUserSchema>;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** 16 random characters from an unambiguous alphabet (about 91 bits). Shown once; the user should change it. */
export function generatePassword(len = 16): string {
  return Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1").trim();

/** Parses a simple CSV with the header `name,email,role`. Returns valid rows and per-line errors. */
export function parseUserCsv(text: string): { users: Array<Omit<NewUser, "password">>; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  const users: Array<Omit<NewUser, "password">> = [];
  if (lines.length === 0) return { users, errors: ["The file is empty."] };
  const header = lines[0]!.split(",").map((h) => unquote(h).toLowerCase());
  const idx = { name: header.indexOf("name"), email: header.indexOf("email"), role: header.indexOf("role") };
  if (idx.name < 0 || idx.email < 0 || idx.role < 0) return { users, errors: ["The header must contain name, email and role."] };
  const seen = new Set<string>();
  lines.slice(1).forEach((line, n) => {
    const cells = line.split(",").map(unquote);
    const parsed = newUserSchema.omit({ password: true }).safeParse({ name: cells[idx.name], email: cells[idx.email], role: (cells[idx.role] ?? "").toUpperCase() });
    if (!parsed.success) return void errors.push(`Line ${n + 2}: invalid name, email or role.`);
    if (seen.has(parsed.data.email)) return void errors.push(`Line ${n + 2}: duplicate email ${parsed.data.email}.`);
    seen.add(parsed.data.email);
    users.push(parsed.data);
  });
  return { users, errors };
}
