/**
 * content.js — Repo Deployer extension content script
 *
 * Injected on every https://github.com/{owner}/{repo} page.
 * Detects the canonical repo URL and reports it to the background service worker.
 * Also provides a manual trigger fallback for non-GitHub pages (handled via popup).
 */

'use strict';

(function () {
  // Only run once even if the script is injected multiple times (SPA navigation)
  if (window.__repoDeployerInjected) return;
  window.__repoDeployerInjected = true;

  function detectRepoUrl() {
    // Primary: canonical link
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const href = canonical.getAttribute('href') || '';
      if (/github\.com\/[^/]+\/[^/]+/.test(href)) {
        return href.split('?')[0];
      }
    }

    // Secondary: og:url meta tag
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      const content = ogUrl.getAttribute('content') || '';
      if (/github\.com\/[^/]+\/[^/]+/.test(content)) {
        return content.split('?')[0];
      }
    }

    // Tertiary: window.location
    const loc = window.location.href.split('?')[0];
    if (/github\.com\/[^/]+\/[^/]+/.test(loc)) {
      return loc;
    }

    return null;
  }

  function reportUrl(url) {
    chrome.runtime.sendMessage({ type: 'REPORT_URL', url }, () => {
      // Ignore any sendMessage errors (e.g., extension context invalidated)
      if (chrome.runtime.lastError) { /* noop */ }
    });
  }

  // Initial detection
  const url = detectRepoUrl();
  if (url) reportUrl(url);

  // Re-detect on SPA navigation (GitHub uses Turbo/pjax)
  const observer = new MutationObserver(() => {
    const newUrl = detectRepoUrl();
    if (newUrl && newUrl !== window.__lastReportedUrl) {
      window.__lastReportedUrl = newUrl;
      reportUrl(newUrl);
    }
  });

  observer.observe(document.documentElement, { subtree: false, childList: true });
})();
