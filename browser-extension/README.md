# Repo Deployer — Browser Extension

A companion browser extension for **Chrome** and **Firefox** that detects GitHub repository URLs on the active tab and sends them directly to your Repo Deployer instance with one click.

## Features

- **Auto-detects** the GitHub repo URL on the active tab (canonical link + og:url + location)
- **One-click import** into your Repo Deployer app via a local API call — no browser bookmarks involved
- **Manual URL fallback** — type or paste any GitHub URL and import it regardless of the current page
- **Configurable app URL** — works with any host/port where Repo Deployer is running
- Badge indicator on GitHub repo pages so you always know the extension is ready

---

## Installation

### Chrome / Chromium / Edge (Manifest V3)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this `browser-extension/` folder

> The `manifest.json` in the root of this folder is the Chrome/MV3 version.

### Firefox (Manifest V2)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `browser-extension/manifest.firefox.json`

> Firefox loads the add-on temporarily; it is removed on browser restart.  
> For a permanent install, package it as a `.xpi` and sign it through AMO.

---

## First-time Setup

1. Click the extension icon.
2. In the **App URL** field, enter your Repo Deployer address (default: `http://localhost:3000`).
3. Click **Save**.

---

## How It Works

| Component | Role |
|---|---|
| `content.js` | Injected on `github.com/*/*` pages; detects the canonical repo URL and sends it to the background worker. |
| `background.js` | Service worker (Chrome) / event page (Firefox); caches detected URLs per tab and updates the badge. |
| `popup.js` | Popup UI logic; reads the cached URL, lets the user import it or type a manual URL, calls `/api/repositories/import-url`. |

The import API call goes to `POST /api/repositories/import-url` on your local Repo Deployer backend.  
No data ever leaves your machine to a third-party server.
