import { AppError } from "../errors";

export type Role = "ADMIN" | "TEACHER" | "STUDENT";

export interface SessionUser {
  id: string;
  tenantId: string;
  role: Role;
  name?: string | null;
  email?: string | null;
}

/** Throws UNAUTHENTICATED when no user. */
export function assertUser(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in.");
}

/** Throws FORBIDDEN unless the user has one of the allowed roles. */
export function assertRole(user: SessionUser | null | undefined, allowed: readonly Role[]): asserts user is SessionUser {
  assertUser(user);
  if (!allowed.includes(user.role)) throw new AppError("FORBIDDEN", "You do not have access to this resource.");
}

/**
 * Tenant guard: resources from another tenant are reported as NOT_FOUND
 * so existence is not leaked across tenants (IDOR).
 */
export function assertSameTenant(user: SessionUser, resourceTenantId: string | null | undefined): void {
  if (!resourceTenantId || resourceTenantId !== user.tenantId) throw new AppError("NOT_FOUND", "Not found.");
}

export const TEACHING_ROLES: readonly Role[] = ["TEACHER", "ADMIN"];
