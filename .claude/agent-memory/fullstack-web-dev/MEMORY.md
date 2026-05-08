# CSU Verification App — Agent Memory

## Stack
- Frontend: Vanilla HTML/CSS/JS, Bootstrap 5.3.2, Bootstrap Icons 1.11.1
- Backend/DB: Supabase (PostgreSQL + Auth + RLS)
- Auth: js/auth.js + js/supabase-config.js
- Deployment: Static files (no build step)

## Color Palette (May 2026 — VIBRANT CSU RED, matched to csucarig.edu.ph student portal)
- Primary: #B5121B (--csu-green kept as variable name, value = vibrant CSU red)
- Dark: #8A0E14 (--csu-green-dark), Light: #D52E37 (--csu-green-light), x-Light: #FBE8EA
- Gold: #FFC72C (--csu-gold), Light gold: #FFDB6E (--csu-gold-light)
- Page bg: #FDF2F3 (--csu-light)
- Admin dark: #1F0508 (--admin-dark), header: #2E0810, accent: #8B1521, surface: #36101A
- All rgba(123,30,43,...) replaced with rgba(163, 22, 33, ...) — strategy: value-swap, not rename
- Iteration history: #7B1E2B (too brownish) → #A31621 (too dark) → #B5121B (matches portal)

## Sidebar + Topbar Chrome (client side)
- Both use SOLID var(--csu-green) — NO gradient (matches csucarig portal aesthetic)
- Sidebar nav text: white at 0.88 alpha (was 0.65 — was designed for dark bg)
- Sidebar hover/active: rgba(0,0,0,0.12)/0.18 (darken instead of brighten — better on red)
- Sidebar dividers: rgba(255,255,255,0.2) (was 0.07 — invisible on bright red)
- If reverting to dark sidebar: use --admin-dark/--admin-header gradient + rgba(255,255,255,X) overlays

## Design Token Strategy
- Keep variable names (--csu-green etc), change only :root values — avoids 200+ selector edits
- Type scale: --text-xs(0.72rem) → --text-3xl(2rem) in :root
- Semantic surface tokens: --surface-page, --surface-card, --surface-input, --text-primary, --text-secondary, --border-default
- Dark mode: [data-theme="dark"] on <html> — set by flash-prevention script in every <head>
- localStorage key: 'csu-theme' ('light' | 'dark')
- Dark mode toggle button: .dark-mode-toggle with .dark-mode-track pill (CSS Section 34)

## File Structure (May 2026)
- index.html — user login/signup (split-panel layout)
- admin-login.html — admin login (dark orb design)
- admin-dashboard.html — admin panel (sidebar layout)
- user-dashboard.html — user portal (sidebar layout, mirrors admin)
- verify.html — public document verification (standalone, no auth)
- js/admin-dashboard.js — all admin logic
- js/user-dashboard.js — all user portal logic
- js/auth.js — auth helpers (requireAuth, getCurrentUser, getUserData, logoutUser)
- js/supabase-config.js — Supabase client init
- css/styles.css — all styles (~8800+ lines, 35+ sections)
- verification-form.html + js/verification-form.js — DELETED (confirmed orphaned May 2026)

## Sidebar Layout (shared admin + user)
- Both use .admin-layout / .admin-sidebar / .admin-main / .admin-topbar CSS classes
- Mobile: .sidebar-open toggled by toggleUserSidebar() / toggleSidebar(); overlay = .sidebar-overlay
- Collapse (desktop): .sidebar-collapsed on .admin-layout
- User sidebar IDs: #userSidebar, #userSidebarOverlay, #nav-overview, #nav-my-requests, #sidebarPendingBadge, #sidebarUserName, #sidebarUserEmail
- Topbar: #topbarDate, #userNavDropdown (avatar chip, onclick=toggleUserDropdown), #userDropdownMenu (style.display controlled), #userNotifDropdown, #notifDropdownPanel (style.display controlled)
- IMPORTANT: avatar dropdown and notif panel use style.display, NOT class toggling — JS reads menu.style.display === "block"

## Database Schema (verification_requests)
id, user_id, student_name, degree_diploma, major_track, student_status,
date_of_graduation, term_started, school_year_started, term_ended,
school_year_ended, school_name, school_address, verifier_name,
verifier_designation, date_of_verification, uploaded_files (jsonb),
status (pending/under_review/verified/not_verified), admin_remarks,
document_assessment (jsonb), verification_code, reviewed_at, created_at, updated_at

## verify.html (public verification page)
- 5 states: idle / loading / not-found / pending / result
- showState() uses explicit 'block' (not '') to avoid CSS .state-pending{display:none} fighting reset
- .state-result has text-align:left override (CSS) — parent .verify-state centers other states
- Supabase query: no status filter — branches on data.status after fetch
- Rate limiting: 5 lookups/min via _lookupTimestamps array
- Dark mode toggle: floating .verify-theme-toggle (top-right fixed)

## Security
- escapeHtml() in every JS file; user text always via .textContent or escapeHtml() before innerHTML
- showAlert() message is trusted HTML — callers pre-escape
- dataset.fileName auto-decoded by browser (no double-escape)

## Key JS Patterns
- navigateUserTo(section): closes dropdown + notif panel + mobile sidebar; sets aria-current
- navigateTo(section): admin equivalent
- nrfHandleSubmit(): new-request inline form submit; all IDs prefixed nrf
- buildStatusBadge(status): handles pending/under_review/verified/not_verified
- toggleTheme() + updateThemeToggleUI(): in admin-dashboard.js, user-dashboard.js, verify.html (inline)
- subscribeToMyRequests(): Supabase Realtime for live status updates (user side)
- subscribeRealtime(): admin Supabase Realtime; shows #liveBadge when SUBSCRIBED

## CSS Sections Reference (styles.css)
- Sections 1–19: auth, admin layout, user portal, button system, new-request form
- Section 34: dark mode toggle (.dark-mode-toggle, .dark-mode-track)
- Section 35: verify.html styles (all inline styles moved here)
- Section 36: .verify-theme-toggle floating button

## Topic files
- [architecture.md](architecture.md) — admin feature inventory (students, records, CSV, reports, chart)
- [xss-security.md](xss-security.md) — full XSS rules

## Active Issues / Notes
- styles.css is 8800+ lines — CSS custom properties keep it maintainable despite size
- setup-tables.sql uses CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS (safe to re-run)
- student_records table: schema Section 11 with RLS (admin all, user read)
- Section 33 CSS uses !important to override multiple earlier dark-header rules
