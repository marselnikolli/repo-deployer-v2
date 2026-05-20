/**
 * background.js — Repo Deployer extension service worker (Manifest V3)
 *
 * Responsibilities:
 *  - Open the side panel when the action icon is clicked.
 *  - Cache the list of detected GitHub repo URLs per tab.
 *  - Update the extension badge (shows count) on each tab.
 *  - Notify the side panel whenever the active tab or its URLs change.
 */

'use strict';

// Open side panel on action icon click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Per-tab cache  { tabId: { urls: string[], metadata: object|null } }
const tabUrlCache = {};

// ─── Normalise a GitHub URL to owner/repo form ─────────────────────────────────
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

// ─── Badge helper — shows URL count ───────────────────────────────────────────
function setBadge(tabId, urls) {
  const n = Array.isArray(urls) ? urls.length : (urls?.length ?? 0);
  if (n > 0) {
    chrome.action.setBadgeText({ text: n > 9 ? '9+' : String(n), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#238636', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// ─── Notify the side panel to refresh its URL list ────────────────────────────
function notifySidePanel() {
  // Sending to a non-open side panel throws "no receiver" — suppress it.
  chrome.runtime.sendMessage({ type: 'TAB_CHANGED' }, () => {
    void chrome.runtime.lastError;
  });
}

// ─── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script reports the full list of GitHub repo URLs on its page
  if (message.type === 'REPORT_URLS') {
    const tabId = sender.tab?.id;
    if (tabId == null) return;
    const urls = (message.urls || []).filter(Boolean);
    tabUrlCache[tabId] = { urls, metadata: message.metadata || null };
    setBadge(tabId, urls);
    sendResponse({ ok: true });
    // Tell the panel to refresh if this is the tab the user is looking at
    chrome.tabs.query({ active: true, currentWindow: true }, ([active]) => {
      if (active?.id === tabId) notifySidePanel();
    });
    return;
  }

  // Side panel requests the URLs for the currently active tab
  if (message.type === 'GET_DETECTED_URLS') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      const tabId = tab?.id;
      const cached = tabId != null ? tabUrlCache[tabId] : undefined;
      if (cached !== undefined) {
        sendResponse({ urls: cached.urls, metadata: cached.metadata });
      } else {
        const norm = normaliseGitHubUrl(tab?.url || '');
        sendResponse({ urls: norm ? [norm] : [], metadata: null });
      }
    });
    return true; // async response
  }
});

// ─── Clean up cache when a tab is closed ──────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabUrlCache[tabId];
});

// ─── Re-evaluate on navigation (content script will override once loaded) ─────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const norm = normaliseGitHubUrl(tab.url || '');
  const urls = norm ? [norm] : [];
  tabUrlCache[tabId] = { urls, metadata: null };
  setBadge(tabId, urls);
  chrome.tabs.query({ active: true, currentWindow: true }, ([active]) => {
    if (active?.id === tabId) notifySidePanel();
  });
});

// ─── Notify panel whenever the user switches tabs ─────────────────────────────
chrome.tabs.onActivated.addListener(() => {
  notifySidePanel();
});
