// Bridges Clerk's session token (only available via the useAuth() React hook)
// to the plain-module API client, so private /api/* ATS requests can send
// `Authorization: Bearer <token>` for backend JWT verification.

type TokenGetter = () => Promise<string | null>;

let _getter: TokenGetter | null = null;

export function setClerkTokenGetter(fn: TokenGetter | null): void {
  _getter = fn;
}

export async function getClerkToken(): Promise<string | null> {
  if (!_getter) return null;
  try {
    return await _getter();
  } catch {
    return null;
  }
}
