/**
 * popup.js — Repo Deployer browser extension popup script
 *
 * Responsibilities:
 *  1. Show all GitHub repo URLs detected on the current page as a list.
 *     Each entry has an individual Import and Remove button.
 *  2. Auto-refresh the list whenever the active tab or its content changes.
 *  3. Let the user import all remaining listed URLs in one bulk action.
 *  4. Let the user import any manually typed URL.
 *  5. Scan browser bookmarks for GitHub repos, import them all, remove them
 *     from the browser, and save a JSON backup file to the Downloads folder.
 *  6. Persist the app base URL in chrome.storage.sync.
 */

'use strict';

const DEFAULT_APP_URL = 'http://localhost:3000';

// ─── DOM references ────────────────────────────────────────────────────────────
const detectedListEl  = document.getElementById('detected-urls-list');
const urlCountEl      = document.getElementById('url-count');
const btnScanPage     = document.getElementById('btn-scan-page');
const btnImportAll    = document.getElementById('btn-import-all');
const manualInput     = document.getElementById('manual-url');
const btnManual       = document.getElementById('btn-manual');
const appUrlInput     = document.getElementById('app-url');
const btnSave         = document.getElementById('btn-save');
const statusEl        = document.getElementById('status');
const openAppLink     = document.getElementById('open-app');

// Bookmark import DOM
const bmAlert          = document.getElementById('bm-alert');
const bmFoundRow       = document.getElementById('bm-found-row');
const bmCountEl        = document.getElementById('bm-count');
const bmProgressWrap   = document.getElementById('bm-progress-wrap');
const bmBar            = document.getElementById('bm-bar');
const bmProgressLabel  = document.getElementById('bm-progress-label');
const bmResultRow      = document.getElementById('bm-result-row');
const bmRImported      = document.getElementById('bm-r-imported');
const bmRSkipped       = document.getElementById('bm-r-skipped');
const bmRFailed        = document.getElementById('bm-r-failed');
const bmBackupNote     = document.getElementById('bm-backup-note');
const btnScanBm        = document.getElementById('btn-scan-bm');
const btnImportBm      = document.getElementById('btn-import-bm');
const btnScanAgain     = document.getElementById('btn-scan-again');

// ─── Global state ─────────────────────────────────────────────────────────────
let detectedUrls   = [];   // mutable local copy — user can remove entries
let foundBookmarks = [];

// ─── General helpers ──────────────────────────────────────────────────────────

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

// ─── URL list rendering ───────────────────────────────────────────────────────

function renderDetectedUrls() {
  detectedListEl.innerHTML = '';

  if (detectedUrls.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'url-empty';
    empty.textContent = 'No GitHub repo URLs found on this page';
    detectedListEl.appendChild(empty);
    urlCountEl.textContent = '';
    btnImportAll.disabled = true;
    return;
  }

  urlCountEl.textContent = `${detectedUrls.length} found`;
  btnImportAll.disabled = false;

  detectedUrls.forEach((url, idx) => {
    const item = document.createElement('div');
    item.className = 'url-list-item';

    const text = document.createElement('span');
    text.className = 'url-text';
    text.textContent = url;
    text.title = url;

    const btnImport = document.createElement('button');
    btnImport.className = 'btn-item-import';
    btnImport.textContent = 'Import';
    btnImport.addEventListener('click', () => importSingleUrl(url, btnImport));

    const btnRemove = document.createElement('button');
    btnRemove.className = 'btn-item-remove';
    btnRemove.textContent = '✕';
    btnRemove.title = 'Remove from list';
    btnRemove.addEventListener('click', () => {
      detectedUrls.splice(idx, 1);
      renderDetectedUrls();
    });

    item.appendChild(text);
    item.appendChild(btnImport);
    item.appendChild(btnRemove);
    detectedListEl.appendChild(item);
  });
}

// ─── Fetch detected URLs from background and refresh the list ─────────────────

function refreshDetectedUrls() {
  chrome.runtime.sendMessage({ type: 'GET_DETECTED_URLS' }, response => {
    if (chrome.runtime.lastError) return;
    detectedUrls = (response?.urls || []).filter(Boolean);
    renderDetectedUrls();
  });
}

// ─── Import helpers ───────────────────────────────────────────────────────────

async function importSingleUrl(repoUrl, button) {
  const appUrl = await getAppUrl();
  const apiBase = appUrl.replace(/\/$/, '');

  if (button) button.disabled = true;
  btnManual.disabled = true;

  try {
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
  } catch {
    showStatus('error', 'Could not reach the app. Is it running?');
  } finally {
    if (button) button.disabled = false;
    btnManual.disabled = false;
  }
}

async function importAllDetected() {
  if (detectedUrls.length === 0) return;

  const appUrl = await getAppUrl();
  const apiBase = appUrl.replace(/\/$/, '');

  btnImportAll.disabled = true;
  btnImportAll.textContent = 'Importing…';

  try {
    const resp = await fetch(`${apiBase}/api/repositories/bulk-import-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: detectedUrls }),
    });

    if (resp.ok) {
      const data = await resp.json();
      showStatus(
        data.failed > 0 ? 'error' : 'success',
        `✓ ${data.imported} imported · ${data.skipped} already in lib · ${data.failed} failed`,
      );
    } else {
      const err = await resp.json().catch(() => ({}));
      showStatus('error', err.detail || `Server error ${resp.status}`);
    }
  } catch {
    showStatus('error', 'Could not reach the app. Is it running?');
  } finally {
    btnImportAll.disabled = detectedUrls.length === 0;
    btnImportAll.textContent = 'Import All Detected Repos';
  }
}

// ─── Bookmark import helpers ──────────────────────────────────────────────────

function isGitHubRepo(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return false;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length >= 2;
  } catch {
    return false;
  }
}

function extractGitHubBookmarks(nodes) {
  const found = [];
  for (const node of nodes) {
    if (node.url && isGitHubRepo(node.url)) {
      found.push({ id: node.id, url: node.url, title: node.title || '' });
    }
    if (node.children) {
      found.push(...extractGitHubBookmarks(node.children));
    }
  }
  return found;
}

function scanBookmarks() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree(tree => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(extractGitHubBookmarks(tree));
      }
    });
  });
}

function buildDateString() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`
  );
}

async function downloadBackupFile(bookmarks, apiBase) {
  const payload = {
    exported_at: new Date().toISOString(),
    source: 'Repo Deployer browser extension',
    total: bookmarks.length,
    bookmarks: bookmarks.map(bm => ({
      url: normaliseGitHubUrl(bm.url) || bm.url,
      title: bm.title,
      original_bookmark_id: bm.id,
    })),
  };

  // Try backend first — writes directly to the Desktop
  try {
    const resp = await fetch(`${apiBase}/api/bookmarks/save-backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const data = await resp.json();
      return { filename: data.filename, location: 'desktop' };
    }
  } catch {
    // backend unreachable — fall through
  }

  // Fallback: browser download to Downloads folder
  const filename = `github_bookmarks_${buildDateString()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url: objectUrl, filename, saveAs: false }, () => {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve({ filename, location: 'downloads' });
      }
    });
  });
}

function removeBookmark(id) {
  return new Promise(resolve => {
    chrome.bookmarks.remove(id, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function showBmAlert(type, msg) {
  bmAlert.className = `status ${type}`;
  bmAlert.textContent = msg;
  bmAlert.style.display = 'flex';
  if (type === 'success' || type === 'info') {
    setTimeout(() => { bmAlert.style.display = 'none'; }, 5000);
  }
}

function setBmProgress(done, total, label) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  bmBar.style.width = `${pct}%`;
  bmProgressLabel.textContent = label;
}

async function runBookmarkImport() {
  const total = foundBookmarks.length;
  if (total === 0) return;

  btnScanBm.style.display    = 'none';
  btnImportBm.style.display  = 'none';
  bmFoundRow.style.display   = 'none';
  bmResultRow.style.display  = 'none';
  bmBackupNote.style.display = 'none';
  bmProgressWrap.style.display = 'block';

  const appUrl = await getAppUrl();
  const apiBase = appUrl.replace(/\/$/, '');

  // ── Step 1: save backup — nothing is deleted until this succeeds ────────────
  setBmProgress(10, 100, 'Saving backup file…');
  let backupFilename = '';
  let backupLocation = '';
  try {
    const backup = await downloadBackupFile(foundBookmarks, apiBase);
    backupFilename = backup.filename;
    backupLocation = backup.location;
  } catch (err) {
    showBmAlert('error', `Backup failed — import aborted. (${err.message})`);
    bmProgressWrap.style.display = 'none';
    bmFoundRow.style.display   = 'flex';
    btnImportBm.style.display  = 'block';
    btnScanBm.style.display    = 'block';
    return;
  }

  // ── Step 2: single bulk request — one DB transaction for all URLs ───────────
  setBmProgress(50, 100, `Importing ${total} repos into the database…`);

  let imported = 0, skipped = 0, failed = 0;
  let toRemove = [];

  try {
    const resp = await fetch(`${apiBase}/api/repositories/bulk-import-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: foundBookmarks.map(bm => bm.url) }),
    });

    if (resp.ok) {
      const data = await resp.json();
      imported = data.imported;
      skipped  = data.skipped;
      failed   = data.failed;
      toRemove = foundBookmarks
        .filter(bm => normaliseGitHubUrl(bm.url) !== null)
        .map(bm => bm.id);
    } else {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${resp.status}`);
    }
  } catch (err) {
    showBmAlert('error', `Import failed — bookmarks not removed. (${err.message})`);
    bmProgressWrap.style.display = 'none';
    bmFoundRow.style.display   = 'flex';
    btnImportBm.style.display  = 'block';
    btnScanBm.style.display    = 'block';
    return;
  }

  // ── Step 3: remove bookmarks in parallel ────────────────────────────────────
  if (toRemove.length > 0) {
    setBmProgress(90, 100, `Removing ${toRemove.length} bookmark(s) from browser…`);
    await Promise.all(toRemove.map(id => removeBookmark(id)));
  }

  // ── Step 4: show results ────────────────────────────────────────────────────
  bmProgressWrap.style.display = 'none';
  bmRImported.textContent = imported;
  bmRSkipped.textContent  = skipped;
  bmRFailed.textContent   = failed;
  bmResultRow.style.display = 'flex';

  if (backupFilename) {
    const where = backupLocation === 'desktop' ? '🖥 Desktop' : '📁 Downloads folder';
    bmBackupNote.textContent = `💾 ${where}: ${backupFilename}`;
    bmBackupNote.style.display = 'block';
  }

  if (failed > 0) {
    showBmAlert('error', `${failed} repo(s) failed to import — their bookmarks were not removed.`);
  } else {
    showBmAlert('success', `Done! ${imported} imported, ${skipped} already in library.`);
  }

  btnScanAgain.style.display = 'block';
  foundBookmarks = [];
}

// ─── Initialise ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  // Load saved app URL
  const savedAppUrl = await getAppUrl();
  appUrlInput.value = savedAppUrl;
  openAppLink.href  = savedAppUrl;

  // Initial URL fetch from background
  refreshDetectedUrls();

  // Auto-refresh whenever the active tab or its page content changes
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TAB_CHANGED') {
      refreshDetectedUrls();
    }
  });

  // Manually scan the page for linked GitHub repo URLs
  btnScanPage.addEventListener('click', () => {
    btnScanPage.disabled = true;
    btnScanPage.textContent = 'Scanning…';

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        btnScanPage.disabled = false;
        btnScanPage.textContent = '🔍 Scan Page for Repo Links';
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE_LINKS' }, (response) => {
        btnScanPage.disabled = false;
        btnScanPage.textContent = '🔍 Scan Page for Repo Links';
        if (chrome.runtime.lastError || !response?.urls?.length) return;
        const existing = new Set(detectedUrls);
        response.urls.forEach(url => existing.add(url));
        detectedUrls = [...existing];
        renderDetectedUrls();
      });
    });
  });

  // Import all detected URLs
  btnImportAll.addEventListener('click', importAllDetected);

  // Import manual URL
  btnManual.addEventListener('click', () => {
    const raw = manualInput.value.trim();
    const url = normaliseGitHubUrl(raw);
    if (!url) { showStatus('error', 'Not a valid GitHub repo URL.'); return; }
    importSingleUrl(url, null);
  });

  manualInput.addEventListener('keydown', e => {
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

  // Scan bookmarks
  btnScanBm.addEventListener('click', async () => {
    btnScanBm.disabled = true;
    btnScanBm.textContent = 'Scanning…';
    bmAlert.style.display      = 'none';
    bmFoundRow.style.display   = 'none';
    btnImportBm.style.display  = 'none';
    bmResultRow.style.display  = 'none';
    bmBackupNote.style.display = 'none';
    btnScanAgain.style.display = 'none';

    try {
      foundBookmarks = await scanBookmarks();
      bmCountEl.textContent = foundBookmarks.length;

      if (foundBookmarks.length === 0) {
        showBmAlert('info', 'No GitHub repo bookmarks found.');
      } else {
        bmFoundRow.style.display  = 'flex';
        btnImportBm.style.display = 'block';
      }
    } catch (err) {
      showBmAlert('error', `Could not read bookmarks: ${err.message}`);
    } finally {
      btnScanBm.disabled = false;
      btnScanBm.textContent = '🔍 Scan Bookmarks for GitHub Repos';
    }
  });

  // Import all bookmarks
  btnImportBm.addEventListener('click', runBookmarkImport);

  // Scan again — reset and re-scan
  btnScanAgain.addEventListener('click', () => {
    bmResultRow.style.display  = 'none';
    bmBackupNote.style.display = 'none';
    btnScanAgain.style.display = 'none';
    bmAlert.style.display      = 'none';
    btnScanBm.style.display    = 'block';
    btnScanBm.click();
  });
});
