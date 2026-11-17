/** Refuses to run in production with a missing, short or placeholder signing secret (forged JWTs would be trivial). */
export function assertProductionSecret(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  const s = env.NEXTAUTH_SECRET ?? "";
  if (s.length < 32 || /change-me/i.test(s)) throw new Error("NEXTAUTH_SECRET must be a random value of at least 32 characters in production.");
}
