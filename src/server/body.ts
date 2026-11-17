import { AppError } from "./errors";

const MAX_BODY_BYTES = 1_000_000;

/** Reads a JSON body with a hard size cap. Malformed bodies become an empty object (and then fail validation). */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AppError("VALIDATION", "Request is too large.");
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new AppError("VALIDATION", "Request is too large.");
    return text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof AppError) throw e;
    return {};
  }
}
