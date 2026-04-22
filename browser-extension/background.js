/**
 * background.js — Repo Deployer extension service worker (Manifest V3)
 *
 * Responsibilities:
 *  - Listen for messages from popup.js and content.js.
 *  - Cache the detected GitHub repo URL for the active tab.
 *  - Update the extension badge to show a visual cue on GitHub repo pages.
 */

'use strict';

// Per-tab detected URL cache  { tabId: normalised_url | null }
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

// ─── Badge helper ──────────────────────────────────────────────────────────────
function setBadge(tabId, detected) {
  if (detected) {
    chrome.action.setBadgeText({ text: '↑', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#238636', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// ─── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script reports detected URL
  if (message.type === 'REPORT_URL') {
    const tabId = sender.tab?.id;
    if (!tabId) return;
    const norm = normaliseGitHubUrl(message.url);
    tabUrlCache[tabId] = norm;
    setBadge(tabId, Boolean(norm));
    sendResponse({ ok: true });
    return;
  }

  // Popup asks for the cached URL
  if (message.type === 'GET_DETECTED_URL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      const cached = tabId ? tabUrlCache[tabId] : null;
      if (cached) {
        sendResponse({ url: cached });
      } else {
        // Fallback: try to get the URL from the active tab directly
        const tabUrl = tabs[0]?.url || '';
        const norm = normaliseGitHubUrl(tabUrl);
        sendResponse({ url: norm });
      }
    });
    return true; // async response
  }
});

// ─── Clean up cache when a tab is closed ──────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabUrlCache[tabId];
});

// ─── Re-evaluate badge when navigating ────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const norm = normaliseGitHubUrl(tab.url || '');
  tabUrlCache[tabId] = norm;
  setBadge(tabId, Boolean(norm));
});
