"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";

function ZohoOAuthCallbackPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const zohoError = params.get("error");

    if (zohoError) {
      setError(params.get("error_description") || zohoError);
      return;
    }
    if (!code || !state) {
      setError("Missing OAuth code or state from Zoho.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await api.completeZohoOAuth(code, state);
        if (!cancelled) router.replace("/ats/settings/zoho?connected=1");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to complete Zoho connection.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [params, router]);

  return (
    <div className="p-8 max-w-lg mx-auto text-center">
      {error ? (
        <>
          <ErrorBanner message={error} className="mb-4 text-left" />
          <Link href="/ats/settings/zoho" className="text-sm text-indigo-600 hover:text-indigo-800">
            Back to Zoho settings
          </Link>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
          <p className="text-slate-600">Completing Zoho Mail connection…</p>
        </div>
      )}
    </div>
  );
}

export default function ZohoOAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <ZohoOAuthCallbackPageInner />
    </Suspense>
  );
}
