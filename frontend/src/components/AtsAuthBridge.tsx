"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setClerkAuthBridge } from "@/lib/clerkToken";
import { isClerkConfigured } from "@/lib/clerkConfigured";

function AtsAuthBridgeInner() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    setClerkAuthBridge({
      getToken: (opts) => getToken(opts),
      getAuthState: () => ({
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
      }),
    });
    return () => setClerkAuthBridge(null);
  }, [getToken, isLoaded, isSignedIn]);

  return null;
}

// Mounted inside the protected ATS layout. Registers Clerk's getToken() so the
// API client can attach a fresh session JWT to every private ATS request.
export default function AtsAuthBridge() {
  if (!isClerkConfigured()) return null;
  return <AtsAuthBridgeInner />;
}
