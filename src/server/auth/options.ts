import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db";
import { allowed } from "../rateLimit";
import { assertProductionSecret } from "./secret";

const credentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

// Compared against when the user does not exist, to keep timing similar.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        assertProductionSecret();
        // Slow down password guessing per email address (in-memory; use a shared store behind several instances).
        if (!allowed(`login:${parsed.data.email.toLowerCase()}`, 10, 15 * 60_000)) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? getDummyHash());
        if (!user || !ok) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.uid,
        role: token.role,
        tenantId: token.tenantId,
      };
      return session;
    },
  },
};
