// Bridges Clerk's session token (via useAuth().getToken) to the plain API
// client so private /api/* ATS requests send `Authorization: Bearer <token>`.

export type ClerkTokenOptions = { skipCache?: boolean };

type TokenGetter = (opts?: ClerkTokenOptions) => Promise<string | null>;

export type ClerkAuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
};

let _getter: TokenGetter | null = null;
let _getAuthState: (() => ClerkAuthState) | null = null;

export function setClerkTokenGetter(fn: TokenGetter | null): void {
  _getter = fn;
}

/** Preferred bridge: token getter + live auth readiness. */
export function setClerkAuthBridge(bridge: {
  getToken: TokenGetter;
  getAuthState: () => ClerkAuthState;
} | null): void {
  if (!bridge) {
    _getter = null;
    _getAuthState = null;
    return;
  }
  _getter = bridge.getToken;
  _getAuthState = bridge.getAuthState;
}

export function hasClerkTokenGetter(): boolean {
  return _getter != null;
}

export function getClerkAuthState(): ClerkAuthState {
  if (!_getAuthState) return { isLoaded: false, isSignedIn: false };
  try {
    return _getAuthState();
  } catch {
    return { isLoaded: false, isSignedIn: false };
  }
}

/** Resolve Clerk JWT with optional forced refresh. */
export async function getClerkToken(
  opts?: ClerkTokenOptions & { timeoutMs?: number },
): Promise<string | null> {
  if (!_getter) return null;
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const tokenOpts: ClerkTokenOptions | undefined =
    opts?.skipCache != null ? { skipCache: opts.skipCache } : undefined;
  try {
    return await Promise.race([
      _getter(tokenOpts),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

/**
 * Wait until Clerk is loaded and (optionally) signed-in with a token.
 * Avoids the false "session expired" when getToken() is called too early.
 */
export async function waitForClerkSession(opts?: {
  attempts?: number;
  delayMs?: number;
  requireSignedIn?: boolean;
}): Promise<{
  status: "ready" | "signed_out" | "unavailable" | "timeout";
  token: string | null;
}> {
  const attempts = opts?.attempts ?? 40;
  const delayMs = opts?.delayMs ?? 100;
  const requireSignedIn = opts?.requireSignedIn ?? true;

  for (let i = 0; i < attempts; i++) {
    if (!_getter) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    const state = getClerkAuthState();
    if (!state.isLoaded) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (requireSignedIn && !state.isSignedIn) {
      return { status: "signed_out", token: null };
    }
    const token = await getClerkToken({ timeoutMs: 5000 });
    if (token) return { status: "ready", token };
    if (!requireSignedIn) return { status: "ready", token: null };
    await new Promise((r) => setTimeout(r, delayMs));
  }

  if (!_getter) return { status: "unavailable", token: null };
  return { status: "timeout", token: null };
}

/** @deprecated Prefer waitForClerkSession — kept for older call sites. */
export async function waitForClerkToken(opts?: {
  attempts?: number;
  delayMs?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const result = await waitForClerkSession({
    attempts: opts?.attempts,
    delayMs: opts?.delayMs,
    requireSignedIn: true,
  });
  return result.token;
}
