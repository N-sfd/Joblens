"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import type { ZohoConnectionStatus } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

export default function ZohoSettingsPage() {
  const { isAdmin, canWrite, isReadOnly } = useAtsRole();
  const [conn, setConn] = useState<ZohoConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConn(await api.getZohoConnection());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Zoho connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { authorize_url } = await api.getZohoAuthorizeUrl();
      window.location.href = authorize_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Zoho OAuth.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Zoho Mail from JobLens?")) return;
    setBusy(true);
    setError(null);
    try {
      setConn(await api.disconnectZoho());
      setMessage("Zoho Mail disconnected.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.syncZohoMail();
      setMessage(
        `Sync complete: ${res.total_fetched} retrieved, ${res.imported} new, ${res.skipped} skipped.` +
          (res.request_id ? ` (request ${res.request_id})` : ""),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  const connected = conn?.connected ?? false;
  const statusMessage = conn?.status_message || (connected ? "Connected" : "Not connected");

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/ats/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Settings
      </Link>

      <div className="mb-6">
        <p className="page-kicker">Integration</p>
        <h1 className="page-title">Zoho Mail</h1>
        <p className="page-subtitle">Securely connect a Zoho mailbox to import recruiter job emails into CRM + ATS.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}
      {message && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">{message}</div>
      )}

      {isReadOnly && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
          Read Only accounts can view connection status but cannot connect, disconnect, or synchronize Zoho.
        </div>
      )}

      <div className="card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5">
            <p className="font-medium text-slate-900 text-sm">Connection status</p>
            <p className="text-sm text-slate-700">{statusMessage}</p>
            {connected && conn?.mailbox_email && (
              <p className="text-xs text-slate-500">Connected account: {conn.mailbox_email}</p>
            )}
            <p className="text-xs text-slate-500">Token status: {conn?.token_status ?? "Missing"}</p>
            {conn?.last_sync_at && (
              <p className="text-xs text-slate-400">
                Last successful sync: {new Date(conn.last_sync_at).toLocaleString()}
              </p>
            )}
            {conn?.last_sync_result && (
              <p className="text-xs text-slate-500">Last sync result: {conn.last_sync_result}</p>
            )}
            {conn?.last_error && (
              <p className="text-xs text-red-600">{conn.last_error}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && (!connected || conn?.can_reconnect) && (
              <button type="button" className="btn-primary" disabled={busy} onClick={connect}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : connected ? "Reconnect" : "Connect Zoho Mail"}
              </button>
            )}
            {canWrite && connected && (
              <button type="button" className="btn-primary flex items-center gap-2" disabled={busy} onClick={sync}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Sync Now
              </button>
            )}
            {isAdmin && connected && (
              <button type="button" className="btn-secondary flex items-center gap-2" disabled={busy} onClick={disconnect}>
                <Unplug size={14} /> Disconnect
              </button>
            )}
          </div>
        </div>

        {connected && (
          <p className="text-xs text-slate-500">
            Imported emails appear in{" "}
            <Link href="/ats/zoho-inbox" className="text-indigo-600 hover:text-indigo-800 font-medium">
              Zoho Inbox
            </Link>
            . Jobs are never created until you review and save.
          </p>
        )}
      </div>
    </div>
  );
}
