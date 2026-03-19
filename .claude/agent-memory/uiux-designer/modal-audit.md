# Modal Audit — New Request Form + Request Details
## Session 3 — CSU Verification App

### Files Reviewed
- `user-dashboard.html` (lines 610–774) — New Request Modal HTML
- `user-dashboard.html` (lines 425–442) — Detail Modal shell
- `js/user-dashboard.js` (lines 1117–1316) — Detail Modal dynamic renderer
- `css/styles.css` (Section 19: lines 4741–4856) — .nrf-* classes
- `css/styles.css` (Section 54: lines 7746–7841) — .detail-* classes

### Key Findings

#### New Request Modal — What Works
- `.nrf-section-title` (all-caps green label + bottom border) is clean and professional
- Toggle buttons for Client Status have good hover/active states
- Field-level error messages (`.nrf-field-error`) with fadeIn animation
- Submit button shimmer hover effect is polished
- Focus ring using CSU green box-shadow is correct

#### New Request Modal — Issues Found
1. School Info section has readonly inputs with no visual distinction from editable fields
2. Enrollment Period has 4 selects with no visual grouping between "Started" and "Ended" pairs
3. Date of Graduation input has `max-width: 240px` inline style — should be a class
4. "I'm not sure" checkbox label uses inline font-size style
5. No required field legend or asterisk explanation anywhere in the modal
6. Modal footer Cancel button uses Bootstrap default gray (no brand alignment)
7. Modal body padding uses inline style `padding: 24px 28px 8px` — should be in CSS

#### Request Details Modal — What Works
- `.detail-req-id` badge (green pill) is clean and distinctive
- `.detail-remarks-box` (amber with left border) is excellent — strong visual pattern
- `.btn-detail-cancel` (red outlined) and `.btn-detail-download` (green filled) are well styled
- Status stepper concept is correct

#### Request Details Modal — Issues Found
1. Status stepper uses pure Bootstrap utility classes inline in JS — fragile, no semantic structure
2. Data grid uses `<strong class="text-muted small">` + `<p>` — no dedicated CSS class, hard to maintain
3. "Submitted" date appears TWICE (once in the ID row, once in the data grid) — redundant
4. No visual grouping between data categories (Personal vs Academic vs Enrollment vs School)
5. "Term & SY Started" and "Term & SY Ended" labels are cryptic — could be "Enrollment Started" and "Enrollment Ended"
6. Status badge floats in a grid cell with no label emphasis — should be more prominent
7. No empty/null state handling for Major/Track — shows empty string if not set
