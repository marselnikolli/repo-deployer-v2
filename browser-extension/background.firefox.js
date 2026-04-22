/**
 * background.firefox.js — Firefox-compatible background script (MV2 / event page)
 *
 * Functionally identical to background.js but uses browser.* APIs
 * (Firefox still supports both chrome.* and browser.* in MV2).
 */

'use strict';

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

function setBadge(tabId, detected) {
  if (detected) {
    browser.browserAction.setBadgeText({ text: '↑', tabId });
    browser.browserAction.setBadgeBackgroundColor({ color: '#238636', tabId });
  } else {
    browser.browserAction.setBadgeText({ text: '', tabId });
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'REPORT_URL') {
    const tabId = sender.tab?.id;
    if (!tabId) return;
    const norm = normaliseGitHubUrl(message.url);
    tabUrlCache[tabId] = norm;
    setBadge(tabId, Boolean(norm));
    return Promise.resolve({ ok: true });
  }

  if (message.type === 'GET_DETECTED_URL') {
    return browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      const cached = tabId ? tabUrlCache[tabId] : null;
      if (cached) return { url: cached };
      const tabUrl = tabs[0]?.url || '';
      return { url: normaliseGitHubUrl(tabUrl) };
    });
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  delete tabUrlCache[tabId];
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const norm = normaliseGitHubUrl(tab.url || '');
  tabUrlCache[tabId] = norm;
  setBadge(tabId, Boolean(norm));
});
