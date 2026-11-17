export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

/** Client helper: calls a JSON API and throws an ApiError carrying the server's code and message. */
export async function api<T>(url: string, method: "POST" | "PATCH" | "PUT", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", "NETWORK");
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null;
  if (!res.ok || !json || json.error) throw new ApiError(json?.error?.message ?? "Something went wrong.", json?.error?.code ?? "UNKNOWN");
  return json.data as T;
}
