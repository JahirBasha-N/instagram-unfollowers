// Content script — extracts Instagram session data and stores it for the extension.
// Runs on instagram.com at document_idle.

(function () {
  'use strict';

  const SESSION_USER_ID_KEY = 'ig_user_id';
  const SESSION_CSRF_KEY = 'ig_csrf_token';

  function getCookie(name) {
    // Escape regex special chars to prevent injection via cookie name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + escaped + '=([^;]+)'));
    return match ? match[1] : null;
  }

  function getCsrfToken() {
    return getCookie('csrftoken');
  }

  function getUserIdFromCookie() {
    // Most reliable: Instagram sets ds_user_id cookie for logged-in users
    return getCookie('ds_user_id');
  }

  function getUserIdFromScriptTags() {
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const id = findViewerId(data, 0);
        if (id) return id;
      } catch {
        // ignore parse errors
      }
    }
    return null;
  }

  function getUserIdFromSharedData() {
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('_sharedData')) {
          const match = text.match(/_sharedData\s*=\s*({.+?})\s*;/);
          if (match) {
            const data = JSON.parse(match[1]);
            const id =
              data?.config?.viewerId ||
              data?.config?.viewer?.id;
            if (id) return id;
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  function getUserIdFromRegex() {
    const html = document.documentElement.innerHTML;
    const patterns = [
      /"viewerId"\s*:\s*"(\d+)"/,
      /"id"\s*:\s*"(\d+)"\s*,\s*"username"/,
      /viewer.*?"id"\s*:\s*"(\d+)"/,
      /"Owner"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function findViewerId(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 8) return null;
    if (obj.viewerId && /^\d+$/.test(String(obj.viewerId))) {
      return String(obj.viewerId);
    }
    if (obj.viewer?.id && /^\d+$/.test(String(obj.viewer.id))) {
      return String(obj.viewer.id);
    }
    if (obj.config?.viewerId) {
      return String(obj.config.viewerId);
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const result = findViewerId(obj[key], depth + 1);
        if (result) return result;
      }
    }
    return null;
  }

  function extractUserId() {
    // Cookie-based extraction is most reliable — try it first
    return (
      getUserIdFromCookie() ||
      getUserIdFromScriptTags() ||
      getUserIdFromSharedData() ||
      getUserIdFromRegex()
    );
  }

  function storeSessionData() {
    const userId = extractUserId();
    const csrfToken = getCsrfToken();

    if (!userId || !csrfToken) return;

    chrome.storage.session.set({
      [SESSION_USER_ID_KEY]: userId,
      [SESSION_CSRF_KEY]: csrfToken,
    });
  }

  // Run extraction immediately
  storeSessionData();

  // Re-extract on SPA navigation (throttled to avoid excessive calls)
  let throttleTimer = null;
  const throttledStore = () => {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      storeSessionData();
    }, 3000);
  };

  new MutationObserver(throttledStore)
    .observe(document.body, { childList: true, subtree: true });
})();
