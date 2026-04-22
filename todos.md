# Feature Implementation Brief — GitHub Repository Manager (Web App)

## Context
This is a React-based web app for importing, organizing, and managing GitHub repository URLs.
The following tasks need to be implemented. Tackle them in priority order.

---

## 1. Browser Extension (Chrome + Firefox)
Build a companion browser extension for Chrome and Firefox that:
- Detects GitHub repository URLs on the active tab
- Lets the user send the URL directly to the web app (one-click import)
- Does NOT rely on browser bookmarks — it should capture the URL in-context and push it to the platform via a local API call or a shared localStorage/IndexedDB bridge
- Works whether or not the user is currently on a GitHub page (manual trigger fallback)

---

## 2. Clone to ZIP + Background Sync
- When a repository is cloned, save a `.zip` archive of the `main` branch (fallback to `master` if `main` doesn't exist)
- This process must run **in the background** — non-blocking, no UI freeze
- The ZIP download/save should be integrated into the existing **sync feature**, running in parallel with any sync operations
- If the sync feature is triggered, the ZIP process should also fire for any repos that don't yet have a local archive
- Show per-repo ZIP status (pending / in progress / done / failed) in the UI

---

## 3. Smart Repository Categorization
The current categorization logic needs to be more intelligent. Implement a fallback chain:

1. **GitHub API** (if the user has an API key configured): fetch repo metadata (topics, description, language)
2. **Stealth web fetch** (if no API key): silently fetch the public GitHub repo page and parse
   visible metadata (description, topics badges, primary language) from the HTML — no headless
   browser required, plain fetch + HTML parsing is fine
3. **URL pattern heuristics** (last resort): infer category from the repo name/path

Apply the best available strategy per-repo. Store the resolved category and the method used
(for transparency / debugging).

---

## 4. Progress Bar Fix (Bug)
The import progress bar is broken — the percentage counter updates correctly but the visual
bar itself does not move.

- Inspect the progress bar component and fix the binding between the numeric `%` value and
  the bar's visual width/fill
- Likely cause: the CSS width is not reactive to the state value, or there's a missing style
  binding. Fix without changing the existing UX design.

---

## 5. Sync Feature — Footer Behavior
The sync button/indicator in the footer needs to be updated:
- **Remove it** OR **conditionally show it** only when the user has a GitHub API key configured
- If shown, the sync logic must gracefully handle users with no API key by falling back to the
  stealth web fetch method described in task 3
- Do not show a broken or misleading sync status to users who haven't configured an API key

---

## General Constraints
- All background tasks (ZIP, sync, categorization) should use a job queue pattern —
  no blocking the main thread
- Stealth web fetches must include realistic headers (User-Agent, Accept-Language) to avoid
  trivial bot detection
- All new features should degrade gracefully if the user has no GitHub API key set
```

