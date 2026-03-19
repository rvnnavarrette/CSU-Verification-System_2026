# UI/UX Designer Agent Memory — CSU Verification App

## Project Identity
- **Project**: CSU (Cagayan State University) Registrar's Office Document Verification System
- **Campus**: Carig Campus
- **Audience**: Students, supervisors, admins, registrar staff
- **Purpose**: Submit verification requests, track status, receive digital confirmations

## Design System (Established Session 1)

### Color Palette
| Role | Hex |
|---|---|
| Primary Brand (CSU Green) | `#1B5E20` |
| Primary Hover | `#145214` |
| Primary Light | `#2E7D32` |
| Primary Subtle | `#E8F5E9` |
| Accent Gold/Yellow | `#F9A825` |
| Dark Hero Overlay | `#0D1117` |
| Heading Text | `#1A1A2E` |
| Body Text | `#374151` |
| Muted Text | `#64748B` |
| Faint Text / Footer | `#94A3B8` |
| Page Background | `#F8FAFC` |
| Card Background | `#FFFFFF` |
| Border | `#E2E8F0` |
| Error | `#DC2626` |
| Success | `#16A34A` |

### Typography
- **Font family**: Inter (Google Fonts) throughout entire app
- **Heading**: 700 weight
- **Subheading**: 600 weight
- **Body**: 400 weight
- **Labels**: 500 weight, 13px
- **Footer**: 400 weight, 11-12px, color `#94A3B8`

### Spacing Base Unit
- Base: 8px grid system
- Card horizontal padding: 48px desktop, 32px tablet
- Form max-width: 400px, centered

### Shadows
- Card: `0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)`
- Button: `0 2px 8px rgba(27, 94, 32, 0.35)`

### Border Radii
- Inputs: 8px
- Buttons: 8px
- Cards: 12px

### Focus States (all interactive elements)
```css
:focus-visible {
  outline: 2px solid #2E7D32;
  outline-offset: 2px;
}
```

## Pages Designed So Far
- [x] **Login Page** — Audit provided (Session 1). See `login-page-audit.md` for detail.

## Key UX Decisions
1. Hero panel should NOT contain CTA buttons on the login page — replace with trust strip
2. Use full-bleed white right panel OR card with proper shadow — avoid card-on-gray-background
3. Tab toggles (Sign In / Create Account) use underline style, not box style
4. Hero photo overlay: gradient from dark to brand green (`135deg`)
5. "Admin access" should be an outlined secondary button, not a plain text link
6. All input focus rings must use brand green, not browser-default blue

## User's Tech Stack (Confirmed Session 2)
- Plain HTML + Bootstrap 5.3.2 + Bootstrap Icons 1.11.1
- Google Fonts: Inter
- Vanilla JavaScript
- Supabase backend
- Chart.js for enrollment bar chart

## Actual Project CSS Tokens (from styles.css)
- CSU Green: `#006633` (--csu-green), Dark: `#004d26`, Light: `#00884a`, XLight: `#e6f4ed`
- Gold: `#F5C518` (--csu-gold), Gold Light: `#FFD700`
- Admin Dark BG: `#0f1724` (--admin-dark), Header: `#141d2e`
- Gray scale: --gray-50 to --gray-900 (standard Tailwind values)
- Semantic: success `#10b981`, warning `#f59e0b`, danger `#ef4444`, info `#3b82f6`
- Radii: sm=8px, md=12px, lg=16px, xl=20px, 2xl=28px

## Pages Designed So Far
- [x] **Login Page** — Audit provided (Session 1). See `login-page-audit.md` for detail.
- [x] **Admin Dashboard** — Full UI/UX audit provided (Session 2). See `admin-dashboard-audit.md`.

## Key UX Decisions
1. Hero panel should NOT contain CTA buttons on the login page — replace with trust strip
2. Use full-bleed white right panel OR card with proper shadow — avoid card-on-gray-background
3. Tab toggles (Sign In / Create Account) use underline style, not box style
4. Hero photo overlay: gradient from dark to brand green (`135deg`)
5. "Admin access" should be an outlined secondary button, not a plain text link
6. All input focus rings must use brand green, not browser-default blue
7. Admin section headers redesigned from dark gradient to white (Section 33 in CSS) — keep this
8. Stat cards use left-border color + icon wrap + large count number — established pattern
9. Print preview uses 'Segoe UI' fallback — should be upgraded and needs CSU seal logo image

## Pages Designed So Far (continued)
- [x] **New Verification Request Modal** — Audit provided (Session 3). See `modal-audit.md`.
- [x] **Request Details Modal** — Audit provided (Session 3). See `modal-audit.md`.

## Key Modal Patterns (Session 3)
- NRF modal uses `.nrf-section` / `.nrf-section-title` (uppercase green label + bottom border) — solid pattern
- Detail modal body is 100% dynamically rendered via JS (`openDetail()` in user-dashboard.js)
- Status stepper uses inline Bootstrap utility classes (d-flex, text-success, text-muted) — no dedicated CSS class
- School Info section has readonly pre-filled fields — visually should be styled differently from editable inputs
- "Client Status" label text is inconsistent: form uses "Client Status", detail modal also uses "Client Status" — keep consistent
- Detail modal data grid uses Bootstrap .row / .col-md-6 with `<strong class="text-muted small">` labels + `<p>` values — functional but visually weak
- Enrollment Period in the form has 4 selects (term + year, started + ended) — could benefit from visual "period range" grouping hint

## Files to Reference
- `login-page-audit.md` — full detailed audit of login page (Session 1)
- `admin-dashboard-audit.md` — full UI/UX audit of admin panel (Session 2)
- `modal-audit.md` — full audit of New Request + Request Details modals (Session 3)
