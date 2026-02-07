# Repo Deployer v2 - Development Todos

## High Priority

### 1. Fix Google/GitHub OAuth Login Integration
**Description:** Google and GitHub authentication flows are broken. Users cannot login using OAuth providers.

**Acceptance Criteria:**
- Google OAuth login works end-to-end
- GitHub OAuth login works end-to-end
- User tokens are properly stored and refreshed
- Login redirects to dashboard on successful authentication
- Error messages display for failed authentication attempts

**Implementation Steps:**
- Check OAuth provider configuration (client IDs, secrets, redirect URLs)
- Verify token storage and retrieval in localStorage
- Debug authentication interceptor in frontend API client
- Validate backend OAuth token validation endpoints
- Update environment variables if needed

---

### 2. Implement Password Reset & Email Confirmation on Registration
**Description:** New user registration should include email confirmation step. Users should be able to reset forgotten passwords via email.

**Acceptance Criteria:**
- Registration sends confirmation email to new users
- Email contains clickable confirmation link
- Confirmed email enables user to login
- Password reset link sent to registered email
- Reset link expires after 24 hours
- User can set new password via reset email

**Implementation Steps:**
- Integrate email service (SendGrid, Mailgun, or similar)
- Create email templates for confirmation and password reset
- Add backend endpoints for email confirmation and password reset
- Create frontend forms for password reset flow
- Add token validation and expiration logic
- Update user registration endpoint to require confirmation

---

### 3. Fix Import File Live UI Update Stopping at 1000 Links
**Description:** When importing bookmark files with 1000+ links, the live progress UI updates freeze or stop updating, causing users to think the process is stuck.

**Acceptance Criteria:**
- Progress bar updates continuously regardless of file size
- UI displays accurate count of processed/total links in real-time
- No freezing or UI lag during large imports
- Progress persists across browser refreshes
- Works with files containing 5000+ links
- Console shows no errors during import

**Implementation Steps:**
- Trace import polling mechanism for bottlenecks
- Verify backend streaming/progress updates are happening
- Check if Redis progress cache is being updated correctly
- Test with large bookmark files (1000+, 5000+ links)
- Optimize batch processing if needed
- Add buffering to prevent UI re-render thrashing

---

## Medium Priority

### 4. Replace Delete Confirmation Alerts with Modal Dialogs
**Description:** Delete operations use browser alerts (alert/confirm). Replace with custom modal dialogs for better UX.

**Acceptance Criteria:**
- All delete operations use custom modal instead of confirm()
- Modal shows what will be deleted and count of affected items
- "Delete" and "Cancel" buttons in modal (red/gray styling)
- Modal is keyboard accessible (Escape to close, Enter to confirm)
- Works for: single repo delete, bulk delete, tag delete
- Modal persists selection until action is taken

**Implementation Steps:**
- Create DeleteConfirmationModal component
- Identify all delete action triggers
- Replace window.confirm() calls with modal opens
- Add confirmation callbacks to modal
- Add keyboard event handlers
- Style modal with Tailwind (red accent for delete)

---

### 5. Consolidate Repository Table Status/Cloned Columns
**Description:** The repository table has two columns (status and cloned) that represent overlapping information. Consolidate or clarify their purposes.

**Current State:**
- `status` column: shows health check status
- `cloned` column: shows if repository is cloned locally

**Possible Solutions:**
- Merge into single "State" column with values: "Not Cloned", "Cloned"
- Keep separate but add tooltips explaining difference
- Show status icon + cloned checkbox in single cell

**Acceptance Criteria:**
- Single source of truth for repository state
- Column header clearly explains what's shown
- Sorting works on combined state
- Mobile display is not cramped
- Users understand the meaning without confusion

**Implementation Steps:**
- Decide on final column design/naming
- Update repository list component
- Modify table header and cell rendering
- Update API response if needed for combined status
- Test sorting and filtering
- Update documentation

---

## Lower Priority - In Progress

### 6. Implement Automatic Metadata/Health Updates via GitHub API
**Description:** Automatically fetch and update repository metadata (stars, description, topics) and health status during background tasks. Currently partially implemented but needs completion.

**Current Implementation:** 
- Health check endpoint exists at POST /api/bulk/health-check
- Redis-backed progress tracking implemented
- GitHub API rate limiting with token support in place
- 150ms delays and 50-repo chunking configured

**Remaining Work:**
- Schedule automatic health checks (daily/weekly)
- Auto-update metadata on import or via scheduler
- Display last-updated timestamps in UI
- Add configuration for update frequency
- Add notifications when major changes detected (repo deleted, stars changed significantly)
- Update frontend to show current health check progress in real-time

**Acceptance Criteria:**
- Automatic health checks run on schedule without manual trigger
- Metadata updates (stars, topics, description) reflect GitHub changes
- Last updated timestamp visible in repository details
- Real-time progress tracking works reliably
- False/incomplete updates are logged and retried
- Performance impact is minimal

**Implementation Steps:**
- Create scheduler service in backend
- Define cron jobs for auto-health-check
- Implement background metadata sync
- Add update timestamps to repository model
- Create UI component for update status
- Add admin panel to configure schedules
- Write comprehensive logging for all updates
- Test with various repository counts (100, 1000, 5000+)