import { ZodError } from "zod";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "CONFIRMATION_REQUIRED"
  | "AI_ERROR"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  CONFIRMATION_REQUIRED: 409,
  AI_ERROR: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return STATUS[this.code];
  }
}

export interface ErrorPayload {
  error: { code: ErrorCode; message: string };
}

/** Maps any thrown value to the consistent `{ error: { code, message } }` payload. Never leaks internals. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json({ error: { code: err.code, message: err.message } } satisfies ErrorPayload, {
      status: err.status,
    });
  }
  if (err instanceof ZodError) {
    return Response.json(
      { error: { code: "VALIDATION", message: "Invalid input." } } satisfies ErrorPayload,
      { status: 400 },
    );
  }
  console.error("Unhandled server error", err instanceof Error ? err.name : "unknown");
  return Response.json({ error: { code: "INTERNAL", message: "Something went wrong." } } satisfies ErrorPayload, {
    status: 500,
  });
}
