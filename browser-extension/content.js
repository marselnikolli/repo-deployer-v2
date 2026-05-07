/**
 * content.js — Repo Deployer extension content script
 *
 * Injected on every http/https page.
 * 1. Auto: detects the canonical repo URL of the current page and reports it to the background.
 * 2. Manual: responds to SCAN_PAGE_LINKS messages (sent by the popup button) by scanning
 *    all <a href> links for GitHub repo URLs and returning them directly to the popup.
 */

'use strict';

(function () {
  if (window.__repoDeployerInjected) return;
  window.__repoDeployerInjected = true;

  // Owner-level paths on github.com that are never repo names
  const NON_REPO_OWNERS = new Set([
    'login', 'logout', 'session', 'settings', 'notifications',
    'marketplace', 'explore', 'trending', 'topics', 'collections',
    'events', 'search', 'new', 'organizations', 'orgs',
    'features', 'pricing', 'about', 'contact', 'security',
    'enterprise', 'team', 'blog', 'copilot', 'sponsors',
    'pulls', 'issues', 'discussions', 'actions', 'packages',
    'releases', 'codespaces', 'profile', 'apps', 'users',
  ]);

  function normaliseGitHubUrl(href) {
    try {
      const u = new URL(href);
      if (u.hostname !== 'github.com') return null;
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      if (NON_REPO_OWNERS.has(parts[0].toLowerCase())) return null;
      return `https://github.com/${parts[0]}/${parts[1]}`;
    } catch {
      return null;
    }
  }

  // ── Original tab/page URL detection (canonical → og:url → location) ──────────
  function detectPageRepoUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const href = (canonical.getAttribute('href') || '').split('?')[0];
      if (/github\.com\/[^/]+\/[^/]+/.test(href)) return href;
    }

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      const content = (ogUrl.getAttribute('content') || '').split('?')[0];
      if (/github\.com\/[^/]+\/[^/]+/.test(content)) return content;
    }

    const loc = window.location.href.split('?')[0];
    if (/github\.com\/[^/]+\/[^/]+/.test(loc)) return loc;

    return null;
  }

  // ── Additional: scan all links on the page for GitHub repo URLs ───────────────
  function scanLinkedGitHubUrls() {
    const seen = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const norm = normaliseGitHubUrl(a.href);
      if (norm) seen.add(norm);
    });
    return seen;
  }

  // ── Auto scan: page canonical URL only ───────────────────────────────────────
  let lastKey = '';
  let scanTimer = null;

  function scan() {
    const pageUrl = detectPageRepoUrl();
    const norm = pageUrl ? normaliseGitHubUrl(pageUrl) : null;
    const urls = norm ? [norm] : [];
    const key = urls.join('\n');
    if (key === lastKey) return;
    lastKey = key;
    try {
      chrome.runtime.sendMessage({ type: 'REPORT_URLS', urls }, () => {
        void chrome.runtime.lastError;
      });
    } catch { /* extension context invalidated — ignore */ }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 500);
  }

  // Initial scan (document_idle → DOM is ready)
  scan();

  // Re-scan on DOM mutations (SPA navigation, lazy-loaded content)
  new MutationObserver(scheduleScan).observe(
    document.documentElement,
    { subtree: true, childList: true },
  );

  // ── Manual page-link scan — triggered by the popup button ────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SCAN_PAGE_LINKS') {
      const urls = [...scanLinkedGitHubUrls()];
      sendResponse({ urls });
    }
    return true; // keep channel open for the async sendResponse
  });
})();
