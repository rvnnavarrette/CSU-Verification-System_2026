# Admin Dashboard — Feature Details

## Student Records — Add/Edit/Delete (Mar 2026, Task 2)
- "+ Add Student" green button in Student List toolbar (right of Export CSV)
- Each row in student records table now has an Actions column (8 columns total, was 7)
- Edit button (blue outline .sr-action-btn.btn-edit) → openEditStudentModal(recordId)
- Delete button (red outline .sr-action-btn.btn-delete) → deleteStudentRecord(id)
- openEditStudentModal(recordId): looks up record from allStudentRecords by ID (safe — no inline JSON)
- openAddStudentModal(): resets form, sets title to "Add Student Record", opens modal
- saveStudentRecord(): if srEditId has value → UPDATE, else → INSERT with imported_by = current user.id
- deleteStudentRecord(id): window.confirm → Supabase DELETE → reload + alert
- Modal ID: #studentRecordModal (560px centered), form IDs: srEditId (hidden), srStudentName, srStudentId, srProgram, srStatus (select), srYearLevel, srTerm (select), srSchoolYear
- Save button: #srSaveBtn
- Modal header: green gradient (.modal-header in #studentRecordModal scoped CSS)

## Enrollment Trends PDF Export (Mar 2026, Task 3)
- "Export PDF" button (.btn-export-pdf) added to Report 4 card header
- printEnrollmentChart(): captures canvas.toDataURL('image/png'), rebuilds data from allStudentRecords, opens new window with CSU letterhead + chart img + data table + grand total row
- Print window calls window.print() on load — user saves as PDF from browser dialog
- School year range filter (chartSYFrom/chartSYTo) respected in both chart and PDF data table

## Kebab Dropdown Visibility Fix (Mar 2026, Task 1 CSS)
- Root cause: .card.request-table and .card.admin-table had overflow:hidden → clipped Bootstrap dropdowns
- Fix: CSS Section 46 sets overflow:visible !important on .card.request-table, .card.admin-table, and their .table-responsive children
- Also: .recent-requests-card gets same overflow:visible treatment
- z-index: 9999 !important on .admin-table .dropdown-menu and .recent-requests-card .dropdown-menu
- data-bs-boundary="viewport" added to all kebab toggle buttons (buildMainTableRow + renderRecentRequests)
- Kebab btn: forced 30x30px via !important in Section 46 (overrides Section 18 / Section 31 which also set sizes)
- .admin-row-actions: width 60px, overflow:visible, text-align:center

## CSS Sections Added (Mar 2026)
- Section 46: Kebab/Dropdown overflow fix + kebab button size enforcement
- Section 47: .sr-action-btn (edit/delete buttons in student records), .sr-actions-cell, #studentRecordModal form styles
- Section 48: .btn-export-pdf (red outline PDF button for reports)
- Section 32w z-index updated from 1050 → 9999 !important
