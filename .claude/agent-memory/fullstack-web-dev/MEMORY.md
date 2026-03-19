# CSU Verification App — Agent Memory

## Stack
- Frontend: Vanilla HTML/CSS/JS (no framework), Bootstrap 5.3.2, Bootstrap Icons 1.11.1
- Backend/DB: Supabase (PostgreSQL + Auth + RLS)
- Auth: Supabase Auth via js/auth.js and js/supabase-config.js
- Deployment: Static files (no build step needed)

## Color Scheme (updated Mar 2026 — full design token system in styles.css :root)
- Primary green: #006633 (--csu-green), light: #00884a (--csu-green-light), dark: #004d26 (--csu-green-dark)
- Gold accent: #F5C518 (--csu-gold), bright: #FFD700 (--csu-gold-light)
- Admin dark: #0f1724 (--admin-dark), header: #141d2e, accent: #1a3a6e
- Gray scale: --gray-50 through --gray-900 (Tailwind-style)
- Semantic: --color-success #10b981, --color-warning #f59e0b, --color-danger #ef4444, --color-info #3b82f6
- Typography: Inter (Google Fonts) — all pages, weights 300–900
- All pages have Inter font preconnect + link tag in <head>

## File Structure
- admin-dashboard.html — Admin panel (sidebar layout as of Feb 2025)
- js/admin-dashboard.js — Admin logic (loadAllRequests, renderRequests, openReview, updateStatus, navigateTo, toggleSidebar)
- js/user-dashboard.js — User portal logic
- js/auth.js — Auth helpers (requireAuth, getCurrentUser, getUserData, logoutUser)
- js/supabase-config.js — Supabase client init (exports supabaseClient); old js/firebase-config.js is now a stub comment only
- css/styles.css — All styles (shared + admin sidebar appended at bottom)
- setup-tables.sql — Supabase schema (run in SQL Editor)

## Database Schema (verification_requests)
id, user_id, student_name, degree_diploma, major_track, student_status,
date_of_graduation, term_started, school_year_started, term_ended,
school_year_ended, school_name, school_address, verifier_name,
verifier_designation, date_of_verification, uploaded_files (jsonb),
status (pending/verified/not_verified), admin_remarks, document_assessment (jsonb),
created_at, updated_at

## Admin Dashboard Layout (sidebar design — Mar 2026 polish)
- Sidebar: fixed left 252px, dark gradient (admin-dark → csu-green-dark), gold top border, dot-grid texture (.admin-sidebar-texture div)
- Sections: #section-dashboard (stat cards + recent 5 table) | #section-requests (full table)
- Navigation: navigateTo(section) toggles .d-none on .admin-section divs, updates sidebar-nav-link.active
- Mobile: hamburger button (.sidebar-toggle-btn) calls toggleSidebar(), overlay div closes on click
- Topbar: date shown in #adminTopbarDate (updateTopbarDate()), admin name in #adminName
- Section headers: .admin-section-header > .admin-section-header-inner (flex row with text + .admin-section-header-badge)
- Stat cards: now have explicit .stat-icon-wrap DOM elements (.stat-icon-total/pending/verified/rejected)
- Filter tabs now include icons: bi-grid-3x3-gap-fill / bi-clock / bi-check-circle / bi-x-circle
- Type column uses .type-badge (.type-graduate purple / .type-undergrad blue) instead of plain text
- Review modal: modal-xl, #reviewModalHeader has .review-modal-title-wrap + #reviewModalSubtitle + #reviewModalStatusBadge
- Review modal body: .review-two-panel (grid 1fr 1fr) — left: student info, right: docs + assessment + remarks
- enterEditMode(): replaces entire #modalBody with .review-edit-mode full-width form (not just #reviewViewMode)
- Document cards: .doc-card with .doc-card-header / .doc-card-preview / .doc-card-assess / .doc-assess-label
- Assessment selects: .doc-assessment — colored border when assessed (.doc-assess-authentic/tampered/fabricated)
- Badge pills: .badge-pending/verified/not-verified now have border + lighter bg (not solid fill)

## XSS Security Rules
- ALL user-controlled text must go through escapeHtml() before innerHTML insertion
- Textarea/input values use .value = ... (NOT innerHTML) to avoid double-encoding
- showAlert() message param is trusted HTML — callers must pre-escape error.message
- dataset.fileName returns HTML-decoded value (browser decodes entities automatically)
- Enum values (status, assessment) are safe for innerHTML without escaping

## User Dashboard Layout (sidebar design — Mar 2026 redesign)
- Layout: .user-layout flex container, .user-sidebar (252px fixed, CSU green gradient), .user-main (margin-left 252px)
- Sidebar brand: .user-sidebar-brand-logo (green with gold icon), inherits .sidebar-brand-text/.sidebar-brand-title/.sidebar-brand-sub
- Sidebar nav: reuses .sidebar-nav-link + .sidebar-nav-section-label from Section 10; active = gold left border
- Topbar: .user-topbar (white bg, 1px border-bottom), shows page breadcrumb left + date + avatar right
- Sections: #section-overview (.user-content) | #section-my-requests (.user-content d-none)
- Navigation: navigateUserTo(section) — mirrors admin navigateTo(), toggles d-none on .user-section
- Mobile: toggleUserSidebar() + #userSidebarOverlay (same pattern as admin)
- Welcome card: .user-welcome-card (green gradient, decorative bg, gold CTA button .btn-user-primary)
- Stat cards: .user-stat-card with icon wrap + .border-total/pending/verified/rejected-user modifier classes
- Quick actions: .user-quick-action-card (white card, icon, text, chevron — links to verification-form.html)
- Recent requests: #recentTableCard (5-column table, last 5 requests) on overview; #requestsTableCard (full 6-col) on My Requests
- Empty states: .user-empty-state (dashed border, centered icon/text/CTA) — separate for each section
- CSS: Section 13 (lines ~2225–3035 of styles.css), subsections 13a–13o

## Key Functions
- escapeHtml(text) — defined in both admin-dashboard.js and user-dashboard.js
- navigateTo(section) — admin: switches between dashboard/requests sections
- navigateUserTo(section) — user portal: switches between overview/my-requests
- toggleSidebar() / toggleUserSidebar() — mobile sidebar open/close
- buildFullTableRow(req) / buildRecentTableRow(req) / buildStatusBadge(status) — user table row helpers
- renderRecentRequests() — populates #recentRequestsTable (last 5 from allRequests)
- renderRequests() — populates full #requestsTable with filter/search/sort applied
- onAssessmentChange() — updates banner, enables/disables Verified/Not Verified buttons
- openNewRequestModal() — opens unified inline new-request form modal (no picker step, no redirect)
- nrfHandleSubmit() — validates + submits inline new-request form to Supabase
- nrfResetForm() — resets all inline form fields; called on every modal open
- nrfSetStatus(status) / nrfToggleGradDateUnsure() — status toggle + grad date helpers
- nrfAddFiles(files) / nrfRemoveFile(index) / nrfRenderFileList() — file upload helpers
- nrfUploadFiles(requestId) — uploads files to Supabase Storage, returns metadata array
- renderStatusTracker(req|null) — renders status tracker widget in #statusTrackerSection
- scrollToTracker() — navigates to overview then scrolls to tracker widget
- updateQuickBarBadges(pending, verified) — now only updates sidebar pending badge (quick-bar removed)
- buildMainTableRow(req) — admin table row with kebab dropdown; replaces inline Review button; uses .type-badge
- quickUpdateStatus(id, status) — admin quick status change from kebab menu (no modal)
- batchUpdateStatus(status) — admin bulk status update for checked rows
- updateTopbarDate() — populates #adminTopbarDate with current date on init
- openReview(id) — redesigned two-panel review modal; sets #reviewModalSubtitle + #reviewModalStatusBadge
- enterEditMode(id) — replaces entire #modalBody with .review-edit-mode form (not just #reviewViewMode)
- buildFilesHtml(req) — redesigned doc cards (.doc-card) with preview, assessment select, open-btn
- toggleSelectAll(cb) / onRowCheckboxChange(cb) — admin batch selection handlers
- clearSelection() — clears all checked rows and hides batch toolbar
- debouncedSearch(term) — 150ms debounced wrapper for admin search; toggles clear btn
- clearSearch() — clears admin search input, hides clear btn, resets filter

## Login Page Design (Mar 2026 redesign — modernized)
- index.html: Split-panel layout (.auth-split-layout) — left brand panel (.auth-brand-panel) + right form panel (.auth-form-panel)
- Brand panel: rich green gradient + ::before radial gradients + ::after dot-grid; floating circles with floatY animation
- Form panel: white bg, subtle radial tint ::before, form inner animates in via fadeUp
- Tab switcher uses .auth-tab + sliding .auth-tab-indicator (JS: moveTabIndicator())
- Inputs: .auth-input-wrapper > .auth-input-icon + .auth-input + .auth-pwd-toggle; focus → green border + shadow
- Per-field errors: .auth-field-error.visible; shake animation class .shake on invalid submit
- Password strength bar: .password-strength-bar.visible + .strength-fill (animated width/color)
- Submit button: gradient bg with background-position hover effect + shimmer ::after + translateY(-2px) on hover
- admin-login.html: Deep dark bg with radial gradient orbs + dot-grid ::before + gold scan-line ::after
- 3 glow orbs (.admin-auth-orb-1/2/3) with pulseGlow animation
- Admin card: .admin-auth-card (backdrop-filter: blur(24px), strong box-shadow, slideInUp animation)
- Card has ::before top highlight line, shield badge animates on hover
- Admin inputs: gold focus border/shadow, dark background
- Security notice: left gold border + amber tinted background
- escapeHtml() defined inline in both index.html and admin-login.html (not from auth.js)
- .loading-overlay: dark semi-transparent bg (not white), backdrop-filter blur

## User Dashboard — Quick Features (Mar 2026, updated Mar 2026)
- Quick-action bar (.user-quick-bar) REMOVED — was redundant with sidebar
- Old 3-card Quick Actions (Request Transcript, Diploma Authentication, Enrollment Certificate) REMOVED
- Replaced with single .new-request-cta-banner (CSS Section 20) — left-bordered card, icon + text + gold CTA btn
- .user-welcome-seal div added inside .user-welcome-card — large faded patch-check icon as decorative watermark
- Display name uses displayName fallback: userData.displayName || email.split('@')[0] || 'Student'
- New Request modal: #newRequestModal is now a UNIFIED INLINE FORM (modal-lg, scrollable)
  - Replaced old 3-card doc-type picker entirely — no redirect to verification-form.html
  - Fields: firstName/lastName/middleName, degree/major, student status toggle, grad date, enrollment period, school info, file upload
  - All form IDs prefixed with nrf (e.g. #nrfLastName, #nrfDegreeDiploma, etc.)
  - Submit via nrfHandleSubmit() — inserts to Supabase, calls loadRequests() on success
  - CSS: .nrf-section, .nrf-section-title, .nrf-label, .nrf-input, .nrf-field-error, .nrf-toggle-btn, .nrf-upload-area, .btn-nrf-submit (Section 19)
- Status tracker widget: renders in #statusTrackerSection via renderStatusTracker(req)
- Tracker uses .status-tracker-card > .status-tracker-steps with .st-step + .st-connector
- Step states: .done (green), .active (csu-green border), .rejected (red) — no state = gray
- stat cards in user overview are now clickable (onclick navigates to My Requests)
- Quick actions on overview now all call openNewRequestModal() with no type arg

## Admin Dashboard — Streamlined UX (Mar 2026)
- Filter tabs: .admin-filter-tabs > .admin-filter-tab (replaces old btn-csu filter buttons)
- Tab IDs: tabAll, tabPending, tabVerified, tabNotVerified — active class = tab-all/pending/verified/not-verified
- Batch toolbar: .batch-toolbar (.visible when rows selected) — shows count + Verify/Reject/Clear buttons
- Row checkboxes: .row-cb with data-id attr; master checkbox #selectAll in table thead
- Kebab menus: .kebab-btn + Bootstrap .dropdown-menu with .admin-row-actions wrapper (now circular shape)
- Toolbar: .admin-toolbar (search + date select in one row, flex-wrap)
- Search: #searchInput oninput=debouncedSearch(); #searchClearBtn (×) inside .admin-search-wrapper
  - Search filters by client name only (student_name column); debounced 150ms
  - Empty state shows "No results for 'query'" + "Clear search" button when searchTerm is active
  - Search input now pill-shaped (border-radius: 50px) with focus glow in CSU green
- Sidebar pending badge: #sidebarPendingCount (warning badge, hidden when 0)
- CSS sections 14–17 + 18 (button system) + 19 (inline new-request form) in styles.css

## Button System (Section 18 — Mar 2026)
- @keyframes btnShimmer — shared shimmer sweep on hover for all .btn
- All .btn: border-radius var(--radius-lg), font-weight 600, translateY(-2px) on hover, scale(0.98) on active
- .btn-primary/.btn-success: green gradient 200% with background-position shift
- .btn-danger: deep red gradient
- .btn-warning: amber gradient
- .btn-outline-secondary/primary/danger: border fill on hover
- .kebab-btn: now circle shape (border-radius: 50%, 34x34px), scale on hover
- .btn-batch-verify/reject/clear: shimmer + lift + color-specific shadows
- .admin-filter-tab: lift + shadow on hover/active
- .qab-pill: shimmer + lift + gradient on .qab-pill-primary
- .btn-csu: full gradient shimmer treatment (verification-form.html)
- .btn-user-primary: gold gradient shimmer (user dashboard welcome/section headers)
- .btn-nrf-submit: green gradient + shimmer (new request modal submit)

## CSS Sections (styles.css — 5520+ lines)
- Sections 1–19: existing styles (auth, admin, user portal, button system, new-request form)
- Section 20: .new-request-cta-banner — replaces old 3-card Quick Actions
- Section 21: .user-welcome-seal — decorative CSU seal watermark on welcome card
- Section 22: gold border-top reinforcement on .admin-sidebar + .user-sidebar
- Section 23: admin stat card icon watermarks via ::after pseudo-element (CSS only, decorative)
- Section 24: admin section header h2 i gold + strong gold for welcome name
- Sections 25–30: tracker, table, typography, admin search, card, mobile refinements
- Section 31: Admin full polish refresh — sidebar texture, topbar date, section header badge, stat card icons (.stat-icon-wrap), type badges (.type-badge), badge pill borders, two-panel review modal (.review-two-panel), document cards (.doc-card), edit mode (.review-edit-mode), responsive stacking
- Section 32: Admin Mar 2026 final polish — .admin-topbar-avatar-chip, .stat-card-cta (hover CTA on stat cards), staggered entrance animations (fadeUp on stat cards), .admin-filter-tabs pill-card background, admin-topbar gold bottom border, section header gradient border-image, review modal footer sizing, degree column truncation, dropdown z-index fix

## Admin Dashboard — Mar 2026 Polish (Section 32 additions)
- Topbar now shows admin avatar chip (.admin-topbar-avatar-chip) with gold person-circle icon + name
- Stat cards now show .stat-card-cta ("View All →") text that colors on hover and moves on card hover
- Stat cards animate in with staggered fadeUp delays (0.05s / 0.12s / 0.19s / 0.26s)
- filterRequests() now also sets .stat-active class on matching stat card for visual ring feedback
- navigateTo() clears .stat-active on all stat cards when returning to dashboard
- navigateTo() updates topbar breadcrumb innerHTML to reflect current section
- .admin-filter-tabs now has pill-card background (gray-100 bg + border) — cleaner grouping
- Admin topbar gets gold bottom border (2px solid --csu-gold) to match section headers
- Section header bottom border uses gradient border-image (gold → faded) instead of flat gold
- Degree/Diploma column truncates at 180px with text-overflow: ellipsis

## Admin Dashboard — Display Name (Mar 2026)
- #adminWelcomeName in section header subtitle — populated by initAdminDashboard()
- displayName fallback: userData.displayName || email.split('@')[0] || 'Admin'
- Same fallback pattern used in user-dashboard.js

## Admin Dashboard — Mar 2026 UX Cleanup
- TYPE column removed from requests table (was redundant — single request type). colspan updated to 7 in both HTML + JS empty states.
- Section header redesigned light (Section 33 CSS): white bg, dark text, CSU green h2 icon, gray subtitle, green-to-gold border-image. All dark overrides use !important to defeat earlier gradient rules.

## Admin Dashboard — Mar 2026 Feature Expansion (details in admin-features.md)
- Student Records: Add/Edit/Delete per row; #studentRecordModal; openAddStudentModal/openEditStudentModal/saveStudentRecord/deleteStudentRecord
- Enrollment Trends: printEnrollmentChart() — PDF export via print window with chart image + data table
- Kebab Fix: overflow:visible on .card.request-table/.card.admin-table + z-index:9999 + data-bs-boundary="viewport"
- CSS added: Section 46 (dropdown fix), Section 47 (sr-action-btn), Section 48 (btn-export-pdf)

## Admin Dashboard — Mar 2026 Feature Expansion
- NEW sidebar nav items: Students (bi-people-fill, #nav-students) + Records (bi-database-fill, #nav-records)
- openReview() renamed to openDetail() — openReview() kept as alias for backward compat
- Docs column: .docs-count-badge shows paperclip + file count (not grey dot)
- Recent Requests header: .recent-card-header-light + .btn-link-csu-dark (light/white styling)
- .admin-section-header-badge: display:none !important (Section 34b — ghost badge fully removed)
- Kebab menu now includes Delete action -> deleteRequest(id) -> #deleteConfirmModal -> confirmDelete()
- quickUpdateStatus() shows #quickRemarksVerifierFields (verifier_name + verifier_designation) when marking verified; pre-fills with _adminDisplayName
- quickRemarksConfirm() saves verifier_name, verifier_designation, date_of_verification to Supabase
- Realtime: subscribeRealtime() calls supabaseClient.channel('admin-requests') after loadAllRequests(); shows #liveBadge (.admin-live-badge with pulsing .live-dot) when SUBSCRIBED
- Print letter: printVerificationLetter(id) — window.open() + document.write() + window.print(); shows only when req.status === 'verified'
- Audit log: buildAuditLogHtml(req) — derived from created_at + reviewed_at, collapsible in modal left panel
- Records check: checkStudentInRecords(name) — async Supabase query on student_records, result in #checkRecordsResult
- Students section: loadStudents() fetches public.users where role='user', merges request counts from allRequests cache; renderStudentsTable() with search
- Records section: 3 tabs via switchRecordsTab() — 'student-list' | 'upload-csv' | 'reports'
- CSV upload: parseCsv() → showCsvPreview() → showCsvMapping() → importCsvRecords() (batch 50 rows)
- Reports: renderReport1/2/3() filter allStudentRecords by status/term/sy; exportReport(status)
- Chart.js bar chart: renderEnrollmentChart() — CSU green bars, gold hover, school year range filter
- navigateTo() lazy-loads students + records on first visit; updates #topbarTitle innerHTML
- student_records table: schema.sql Section 11 with RLS (admin all, user read)
- CSS Sections 34-45 added for all new components
- .admin-section-header-badge color changed to rgba(0,102,51,0.06) for visibility on white bg.
- quickUpdateStatus() now opens #quickRemarksModal instead of window.confirm(). State held in _quickRemarksRequestId / _quickRemarksNewStatus. Confirm button color changes green/red per status. Remarks saved to admin_remarks if non-empty.
- quickRemarksConfirm() is the async handler — disables button, saves to Supabase, updates local cache, hides modal.
- exportToCSV() added: respects currentFilter + searchTerm + currentDateRange. Columns: Date Submitted, Student Name, Degree/Diploma, Major/Track, Student Status, School Name, Status, Admin Remarks, Last Updated. Filename: verification-requests-YYYY-MM-DD.csv. Uses Blob + URL.createObjectURL for download.
- Export CSV button (.admin-export-btn) added to admin-toolbar in admin-dashboard.html, next to date range select.
- #quickRemarksModal added to admin-dashboard.html before #reviewModal. Elements: #quickRemarksIcon, #quickRemarksTitle, #quickRemarksDesc, #quickRemarksStatusLabel, #quickRemarksInput, #quickRemarksConfirmBtn, #quickRemarksModalHeader.

## User Dashboard — Mar 2026 UX Cleanup
- Welcome card .user-welcome-cta button (New Request) removed — sidebar nav button is the canonical entry point.
- Section header "New Request" button removed from #section-my-requests header (My Verification Requests).
- Remaining New Request entry points: sidebar nav button + CTA banner (.new-request-cta-banner) + empty state buttons.

## Notes
- setup-tables.sql now uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS (safe to re-run)
- document_assessment JSONB was missing from original schema — added via ALTER TABLE in SQL file
- Future sidebar pages (Analytics, Export, Users, Settings) are commented out as placeholders in admin-dashboard.html
- verification-form.html is still a standalone page for direct URL access — not removed
- .qab-pill / .user-quick-bar CSS still exists in Section 14 — harmless, no longer referenced by HTML
- Section 33 CSS uses !important throughout to override the multiple dark-header rules defined in Sections 10, 24, 31, 32
