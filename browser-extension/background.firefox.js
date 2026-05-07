/**
 * background.firefox.js — Firefox-compatible background script (MV2 / event page)
 *
 * Functionally identical to background.js but uses browser.* APIs.
 * The sidebar opens via the sidebar_action toolbar button — no explicit open() call needed.
 */

'use strict';

// { tabId: string[] } — deduplicated GitHub repo URLs per tab
const tabUrlCache = {};

function normaliseGitHubUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

function setBadge(tabId, urls) {
  const n = urls?.length ?? 0;
  if (n > 0) {
    browser.browserAction.setBadgeText({ text: n > 9 ? '9+' : String(n), tabId }).catch(() => {});
    browser.browserAction.setBadgeBackgroundColor({ color: '#238636', tabId }).catch(() => {});
  } else {
    browser.browserAction.setBadgeText({ text: '', tabId }).catch(() => {});
  }
}

function notifySidePanel() {
  browser.runtime.sendMessage({ type: 'TAB_CHANGED' }).catch(() => {});
}

browser.runtime.onMessage.addListener((message, sender) => {

  // Content script reports the full list of GitHub repo URLs for its tab
  if (message.type === 'REPORT_URLS') {
    const tabId = sender.tab?.id;
    if (tabId == null) return;
    const urls = (message.urls || []).filter(Boolean);
    tabUrlCache[tabId] = urls;
    setBadge(tabId, urls);
    browser.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      if (active?.id === tabId) notifySidePanel();
    });
    return Promise.resolve({ ok: true });
  }

  // Side panel requests the URLs for the currently active tab
  if (message.type === 'GET_DETECTED_URLS') {
    return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const tabId = tab?.id;
      const cached = tabId != null ? tabUrlCache[tabId] : undefined;
      if (cached !== undefined) return { urls: cached };
      const norm = normaliseGitHubUrl(tab?.url || '');
      return { urls: norm ? [norm] : [] };
    });
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  delete tabUrlCache[tabId];
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const norm = normaliseGitHubUrl(tab.url || '');
  tabUrlCache[tabId] = norm ? [norm] : [];
  setBadge(tabId, tabUrlCache[tabId]);
  browser.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
    if (active?.id === tabId) notifySidePanel();
  });
});

browser.tabs.onActivated.addListener(() => {
  notifySidePanel();
});
