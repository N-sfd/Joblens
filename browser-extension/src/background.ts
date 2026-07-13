/** Background service worker — coordinates auth polling and tab messaging. */

import { parseExtensionMessage, type ExtensionMessage } from "./types/messages";
import {
  getAuth,
  pollAuthExchange,
  setAuth,
  startAuthChallenge,
} from "./shared/api";
import { isSupportedGreenhouseUrl } from "./utils/url";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[JobLens] M1 extension installed (read-only diagnostics)");
});

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const msg = parseExtensionMessage(raw);
  if (!msg) {
    sendResponse({ type: "ERROR", error: "invalid_message" } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "OPEN_JOBLENS") {
    getAuth().then((auth) => {
      const path = typeof msg.payload === "object" && msg.payload && "path" in msg.payload
        ? String((msg.payload as { path: string }).path)
        : "/jobs/discover";
      chrome.tabs.create({ url: `${auth.joblensOrigin}${path}` });
      sendResponse({ type: "OPEN_JOBLENS", requestId: msg.requestId });
    });
    return true;
  }

  if (msg.type === "AUTH_START") {
    startAuthChallenge()
      .then(async (started) => {
        await chrome.tabs.create({ url: started.connect_url });
        // Poll exchange until confirmed or timeout (~2 min)
        const deadline = Date.now() + 120_000;
        const challenge = started.challenge;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2000));
          const tokens = await pollAuthExchange(challenge);
          if (tokens) {
            await setAuth({
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: Date.now() + tokens.expires_in * 1000,
              connected: true,
              challenge: null,
            });
            sendResponse({
              type: "AUTH_SUCCESS",
              requestId: msg.requestId,
              payload: { connected: true },
            } satisfies ExtensionMessage);
            return;
          }
        }
        sendResponse({ type: "ERROR", requestId: msg.requestId, error: "auth_timeout" } satisfies ExtensionMessage);
      })
      .catch((e) => {
        sendResponse({
          type: "ERROR",
          requestId: msg.requestId,
          error: e instanceof Error ? e.message : "auth_start_failed",
        } satisfies ExtensionMessage);
      });
    return true;
  }

  if (msg.type === "GET_STATUS") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      const auth = await getAuth();
      const url = tab?.url ?? null;
      sendResponse({
        type: "GET_STATUS",
        requestId: msg.requestId,
        payload: {
          connected: auth.connected && !!auth.accessToken,
          tabId: tab?.id ?? null,
          url,
          supported: isSupportedGreenhouseUrl(url),
          permissionDenied: false,
        },
      } satisfies ExtensionMessage);
    });
    return true;
  }

  // Forward ANALYZE_FORM etc. are handled from popup → content directly
  sendResponse({ type: "ERROR", error: "unsupported_in_background", requestId: msg.requestId });
  return false;
});

export {};
