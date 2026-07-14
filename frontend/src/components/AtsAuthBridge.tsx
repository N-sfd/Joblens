"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setClerkTokenGetter } from "@/lib/clerkToken";
import { isClerkConfigured } from "@/lib/clerkConfigured";

function AtsAuthBridgeInner() {
  const { getToken } = useAuth();

  setClerkTokenGetter(() => getToken());

  useEffect(() => {
    setClerkTokenGetter(() => getToken());
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  return null;
}

// Mounted inside the protected ATS layout. Registers Clerk's getToken() so the
// API client can attach the session JWT to private ATS requests.
export default function AtsAuthBridge() {
  if (!isClerkConfigured()) return null;
  return <AtsAuthBridgeInner />;
}
