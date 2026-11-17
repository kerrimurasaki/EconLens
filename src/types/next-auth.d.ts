import type { DefaultSession } from "next-auth";
import type { Role } from "@/server/auth/policy";

declare module "next-auth" {
  interface User {
    role: Role;
    tenantId: string;
  }
  interface Session {
    user: { id: string; role: Role; tenantId: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    tenantId: string;
  }
}
