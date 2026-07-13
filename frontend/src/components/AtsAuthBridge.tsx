"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setClerkTokenGetter } from "@/lib/clerkToken";

// Mounted inside the protected ATS layout. Registers Clerk's getToken() so the
// API client can attach the session JWT to private ATS requests.
//
// Register during render (not only in useEffect): child effects run before
// parent effects, so /api/ats/* calls from AtsAccessGate/dashboard would
// otherwise race and go out without Authorization → 401.
export default function AtsAuthBridge() {
  const { getToken } = useAuth();

  setClerkTokenGetter(() => getToken());

  useEffect(() => {
    setClerkTokenGetter(() => getToken());
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  return null;
}
