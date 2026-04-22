/**
 * popup.js — Repo Deployer browser extension popup script
 *
 * Responsibilities:
 *  1. Read the detected GitHub repo URL from the background service worker.
 *  2. Let the user import it (or any manually typed URL) into the Repo Deployer
 *     app via a local API call.
 *  3. Persist the app base URL in chrome.storage.sync.
 */

'use strict';

const DEFAULT_APP_URL = 'http://localhost:3000';

// ─── DOM references ────────────────────────────────────────────────────────────
const detectedUrlEl = document.getElementById('detected-url');
const btnImport     = document.getElementById('btn-import');
const manualInput   = document.getElementById('manual-url');
const btnManual     = document.getElementById('btn-manual');
const appUrlInput   = document.getElementById('app-url');
const btnSave       = document.getElementById('btn-save');
const statusEl      = document.getElementById('status');
const openAppLink   = document.getElementById('open-app');

// ─── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(type, message) {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
  statusEl.style.display = 'flex';
  if (type === 'success' || type === 'info') {
    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
  }
}

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

async function getAppUrl() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['appUrl'], result => {
      resolve(result.appUrl || DEFAULT_APP_URL);
    });
  });
}

async function importRepo(repoUrl) {
  const appUrl = await getAppUrl();
  const apiBase = appUrl.replace(/\/$/, '');

  btnImport.disabled = true;
  btnManual.disabled = true;

  try {
    // Prefer the dedicated single-URL import endpoint
    const resp = await fetch(`${apiBase}/api/repositories/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: repoUrl }),
    });

    if (resp.ok) {
      const data = await resp.json();
      showStatus('success', `✓ Imported: ${data.name || repoUrl}`);
    } else if (resp.status === 409) {
      showStatus('info', 'Already in your library.');
    } else {
      const err = await resp.json().catch(() => ({}));
      showStatus('error', err.detail || `Server error ${resp.status}`);
    }
  } catch (e) {
    showStatus('error', 'Could not reach the app. Is it running?');
  } finally {
    btnImport.disabled = false;
    btnManual.disabled = false;
  }
}

// ─── Initialise ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  // Load saved app URL
  const savedAppUrl = await getAppUrl();
  appUrlInput.value = savedAppUrl;
  openAppLink.href  = savedAppUrl;

  // Ask the background worker for the active tab's detected repo URL
  chrome.runtime.sendMessage({ type: 'GET_DETECTED_URL' }, (response) => {
    const url = response && response.url ? normaliseGitHubUrl(response.url) : null;
    if (url) {
      detectedUrlEl.textContent    = url;
      detectedUrlEl.classList.remove('not-github');
      btnImport.disabled = false;
    }
  });

  // Import detected URL
  btnImport.addEventListener('click', () => {
    const url = normaliseGitHubUrl(detectedUrlEl.textContent);
    if (url) importRepo(url);
  });

  // Import manual URL
  btnManual.addEventListener('click', () => {
    const raw = manualInput.value.trim();
    const url = normaliseGitHubUrl(raw);
    if (!url) {
      showStatus('error', 'Not a valid GitHub repo URL.');
      return;
    }
    importRepo(url);
  });

  manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnManual.click();
  });

  // Save app URL
  btnSave.addEventListener('click', () => {
    const val = appUrlInput.value.trim().replace(/\/$/, '');
    if (!val) return;
    chrome.storage.sync.set({ appUrl: val }, () => {
      openAppLink.href = val;
      showStatus('success', 'App URL saved!');
    });
  });
});
