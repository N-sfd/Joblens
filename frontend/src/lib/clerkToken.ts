// Bridges Clerk's session token (only available via the useAuth() React hook)
// to the plain-module API client, so private /api/* ATS requests can send
// `Authorization: Bearer <token>` for backend JWT verification.

type TokenGetter = () => Promise<string | null>;

let _getter: TokenGetter | null = null;

export function setClerkTokenGetter(fn: TokenGetter | null): void {
  _getter = fn;
}

export function hasClerkTokenGetter(): boolean {
  return _getter != null;
}

/** Resolve Clerk JWT with a hard timeout so ATS UI never spins forever. */
export async function getClerkToken(timeoutMs = 4000): Promise<string | null> {
  if (!_getter) return null;
  try {
    return await Promise.race([
      _getter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

/** Poll until a token is available or attempts are exhausted. */
export async function waitForClerkToken(opts?: {
  attempts?: number;
  delayMs?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const attempts = opts?.attempts ?? 20;
  const delayMs = opts?.delayMs ?? 100;
  const timeoutMs = opts?.timeoutMs ?? 2500;
  for (let i = 0; i < attempts; i++) {
    if (!_getter) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    const token = await getClerkToken(timeoutMs);
    if (token) return token;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
