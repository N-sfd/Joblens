"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setClerkTokenGetter } from "@/lib/clerkToken";

// Mounted inside the protected ATS layout. Registers Clerk's getToken() so the
// API client can attach the session JWT to private ATS requests.
export default function AtsAuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setClerkTokenGetter(() => getToken());
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  return null;
}
