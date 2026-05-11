// Admin Dashboard Logic — CSU Registrar Verification System
// Parts covered: All existing features + Students section + Records section +
//   real-time updates, print letter, audit log, verifier fields, delete, CSV import.

let allRequests   = [];
let currentFilter = "all";
let currentDateRange = "all";
let currentReviewId  = null;
let searchTerm      = "";
let filterByUserId  = null;   // set by viewStudentRequests(); cleared on manual search
let sortColumn    = "date";
let sortDirection = "desc";

// Batch selection
let selectedIds = new Set();

// Students section
let allStudents      = [];
let studentSearchTerm = "";

// Student Records section
let allStudentRecords   = [];
let srSearchTerm        = "";
let _srSearchTimer      = null;

// CSV import state
let csvParsedRows   = [];    // all parsed data rows (objects)
let csvHeaders      = [];    // raw header names from CSV
let csvMappedFields = {};    // { dbField: csvHeader }

// Chart.js instance (enrollment trends)
let enrollmentChartInstance = null;

// Admin display name (stored at init for verifier pre-fill)
let _adminDisplayName = "Admin";

// Admin user ID (stored at init for audit log inserts)
let _adminUserId = null;

// Fixed verifier info — appears on all verification letters
const VERIFIER_NAME        = "PROF. EDISON D. BRAVO, DIT";
const VERIFIER_DESIGNATION = "Campus Registrar";

// Delete flow
let _deleteRequestId = null;
let _deleteStudentRecordId = null;

async function initAdminDashboard() {
    try {
        // Restore sidebar collapsed state
        if (localStorage.getItem("adminSidebarCollapsed") === "1") {
            document.querySelector(".admin-layout")?.classList.add("sidebar-collapsed");
        }

        const { user } = await requireAuth("admin");
        _adminUserId = user.id;
        const userData = await getUserData(user.id);

        if (userData) {
            // Resolve display name — fallback to email prefix if display_name is missing
            const displayName = userData.displayName
                || (user.email ? user.email.split("@")[0] : "Admin");

            _adminDisplayName = displayName;

            document.getElementById("adminName").textContent        = displayName;
            document.getElementById("sidebarAdminName").textContent = displayName;
            document.getElementById("sidebarAdminEmail").textContent = user.email || "";
            // Welcome name in dashboard section header
            const welcomeName = document.getElementById("adminWelcomeName");
            if (welcomeName) welcomeName.textContent = displayName;
        }

        // Populate topbar date
        updateTopbarDate();

        await loadAllRequests();

        // Subscribe to realtime updates on verification_requests
        subscribeRealtime();

        // Show last import history strip if available
        renderImportHistory();

        showLoading(false);
    } catch (error) {
        console.error("Admin dashboard init error:", error);
    }
}

/**
 * Render the current date in the topbar date element.
 * Format: "Tue, Mar 3, 2026"
 */
function updateTopbarDate() {
    const el = document.getElementById("adminTopbarDate");
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString("en-US", {
        weekday: "short",
        year:    "numeric",
        month:   "short",
        day:     "numeric"
    });
}

function subscribeRealtime() {
    supabaseClient
        .channel("admin-requests")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "verification_requests" },
            () => {
                loadAllRequests();
            }
        )
        .subscribe((status) => {
            // Show / hide the live badge depending on connection state
            const badge = document.getElementById("liveBadge");
            if (badge) {
                if (status === "SUBSCRIBED") {
                    badge.style.display = "inline-flex";
                } else {
                    badge.style.display = "none";
                }
            }
        });
}

/**
 * Silently set a request's status to "under_review" when the admin
 * opens the review modal. Only fires when the current status is
 * "pending" — will not overwrite a final decision.
 *
 * The update goes straight to Supabase; the admin's own realtime
 * subscription (subscribeRealtime) will then call loadAllRequests()
 * so the table reflects the change automatically.
 *
 * @param {string} requestId
 */
async function markUnderReview(requestId) {
    const req = allRequests.find(r => r.id === requestId);
    // Guard: only update if currently pending
    if (!req || req.status !== "pending") return;

    const { error } = await supabaseClient
        .from("verification_requests")
        .update({ status: "under_review", updated_at: new Date().toISOString() })
        .eq("id", requestId);

    if (error) {
        // Non-blocking — log and continue; the modal still opens
        console.warn("[markUnderReview] Could not update status:", error.message);
        return;
    }

    // Optimistically update local cache so the modal header badge
    // reflects "Under Review" without waiting for the realtime round-trip.
    req.status = "under_review";
}

/**
 * Insert a row into the audit_log table. Non-blocking — failures
 * are logged to the console but never surface as UI errors.
 *
 * @param {string} requestId
 * @param {string} action        - e.g. 'status_changed', 'assessment_updated'
 * @param {object} oldValue      - snapshot of old values
 * @param {object} newValue      - snapshot of new values
 * @param {string} [note]        - optional human-readable note
 */
async function insertAuditLog(requestId, action, oldValue, newValue, note = null) {
    if (!_adminUserId) return;
    try {
        const { error } = await supabaseClient.from("audit_log").insert({
            request_id:  requestId,
            changed_by:  _adminUserId,
            action,
            old_value:   oldValue  || null,
            new_value:   newValue  || null,
            note:        note      || null
        });
        if (error) console.warn("[audit_log] Insert failed:", error.message);
    } catch (err) {
        console.warn("[audit_log] Unexpected error:", err);
    }
}

async function loadAllRequests() {
    try {
        const { data, error } = await supabaseClient
            .from("verification_requests")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        allRequests = data || [];
        updateCounts();
        renderRequests();
        renderRecentRequests();
        // Keep Students section in sync — re-derive counts when requests change
        if (allStudents.length > 0) loadStudents();
    } catch (error) {
        console.error("Error loading requests:", error);
        showAlert("Error loading requests: " + escapeHtml(error.message), "danger");
    }
}

function updateCounts() {
    const dateFiltered = getDateFilteredRequests();
    const total        = dateFiltered.length;
    // "pending" stat card includes both pending and under_review —
    // both represent requests that have not yet received a final decision.
    const pending      = dateFiltered.filter(r => r.status === "pending" || r.status === "under_review").length;
    const underReview  = dateFiltered.filter(r => r.status === "under_review").length;
    const verified     = dateFiltered.filter(r => r.status === "verified").length;
    const notVerified  = dateFiltered.filter(r => r.status === "not_verified").length;

    // Tab counts — "pending" tab shows pending + under_review combined
    document.getElementById("countAll").textContent        = total;
    document.getElementById("countPending").textContent    = pending;
    document.getElementById("countVerified").textContent   = verified;
    document.getElementById("countNotVerified").textContent = notVerified;

    // Dashboard stat cards
    document.getElementById("statTotal").textContent       = total;
    document.getElementById("statPending").textContent     = pending;
    document.getElementById("statVerified").textContent    = verified;
    document.getElementById("statNotVerified").textContent = notVerified;

    // Sidebar pending badge — shows combined pending + under_review count
    const sidebarBadge = document.getElementById("sidebarPendingCount");
    if (sidebarBadge) {
        if (pending > 0) {
            sidebarBadge.textContent = pending;
            sidebarBadge.classList.remove("d-none");
        } else {
            sidebarBadge.classList.add("d-none");
        }
    }
}

function filterByDate(range) {
    currentDateRange = range;

    const label = document.getElementById("dateRangeLabel");
    if (range === "all") {
        label.textContent = "";
    } else {
        const { start, end } = getDateRange(range);
        const fmt = { month: "short", day: "numeric", year: "numeric" };
        label.textContent = `${start.toLocaleDateString("en-US", fmt)} — ${end.toLocaleDateString("en-US", fmt)}`;
    }

    clearSelection();
    updateCounts();
    renderRequests();
    renderRecentRequests();
}

function getDateRange(range) {
    const now = new Date();
    let start, end;

    if (range === "week") {
        const day = now.getDay();
        start = new Date(now);
        start.setDate(now.getDate() - day);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else if (range === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (range === "year") {
        start = new Date(now.getFullYear(), 0, 1);
        end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }

    return { start, end };
}

function getDateFilteredRequests() {
    if (currentDateRange === "all") return allRequests;
    const { start, end } = getDateRange(currentDateRange);
    return allRequests.filter(r => {
        if (!r.created_at) return false;
        const d = new Date(r.created_at);
        return d >= start && d <= end;
    });
}

let _searchDebounceTimer = null;

/**
 * Debounced wrapper around searchRequests.
 * Fires searchRequests() 150 ms after the user stops typing.
 */
function debouncedSearch(term) {
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) {
        if (term.trim().length > 0) {
            clearBtn.classList.add("visible");
        } else {
            clearBtn.classList.remove("visible");
        }
    }

    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
        searchRequests(term);
    }, 150);
}

function clearSearch() {
    const input = document.getElementById("searchInput");
    if (input) input.value = "";
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) clearBtn.classList.remove("visible");
    searchRequests("");
    if (input) input.focus();
}

function searchRequests(term) {
    filterByUserId = null;   // manual search overrides the student-view filter
    searchTerm = term.trim().toLowerCase();
    clearSelection();
    renderRequests();
}

function sortRequests(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
        sortColumn    = column;
        sortDirection = "asc";
    }

    document.querySelectorAll(".sort-arrow").forEach(arrow => {
        arrow.classList.remove("active");
        arrow.innerHTML = '<i class="bi bi-chevron-up"></i>';
    });

    const activeArrow = document.getElementById("sortArrow" + capitalize(column));
    if (activeArrow) {
        activeArrow.classList.add("active");
        activeArrow.innerHTML = sortDirection === "asc" ? '<i class="bi bi-chevron-up"></i>' : '<i class="bi bi-chevron-down"></i>';
    }

    renderRequests();
}

/**
 * Set the active filter tab and re-render.
 * @param {string} status — "all" | "pending" | "verified" | "not_verified"
 */
function filterRequests(status) {
    currentFilter = status;
    clearSelection();

    document.querySelectorAll(".admin-filter-tab").forEach(tab => {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
    });

    const tabMap = {
        all:          "tabAll",
        pending:      "tabPending",
        verified:     "tabVerified",
        not_verified: "tabNotVerified"
    };
    const activeTab = document.getElementById(tabMap[status] || "tabAll");
    if (activeTab) {
        activeTab.classList.add("active");
        activeTab.setAttribute("aria-selected", "true");
    }

    // Highlight matching stat card
    document.querySelectorAll(".admin-stat-card").forEach(card => {
        card.classList.remove("stat-active");
    });
    const statCardMap = {
        all:          ".border-total",
        pending:      ".border-pending",
        verified:     ".border-verified",
        not_verified: ".border-not-verified"
    };
    if (status !== "all") {
        const activeCard = document.querySelector(`.admin-stat-card${statCardMap[status]}`);
        if (activeCard) activeCard.classList.add("stat-active");
    }

    renderRequests();
}

function toggleSelectAll(masterCheckbox) {
    const rowCheckboxes = document.querySelectorAll(".row-cb");
    rowCheckboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const id = cb.dataset.id;
        if (masterCheckbox.checked) {
            selectedIds.add(id);
            cb.closest("tr").classList.add("row-selected");
        } else {
            selectedIds.delete(id);
            cb.closest("tr").classList.remove("row-selected");
        }
    });
    updateBatchToolbar();
}

function onRowCheckboxChange(checkbox) {
    const id  = checkbox.dataset.id;
    const row = checkbox.closest("tr");
    if (checkbox.checked) {
        selectedIds.add(id);
        row.classList.add("row-selected");
    } else {
        selectedIds.delete(id);
        row.classList.remove("row-selected");
    }
    updateBatchToolbar();
    syncSelectAllCheckbox();
}

function syncSelectAllCheckbox() {
    const selectAll    = document.getElementById("selectAll");
    const rowCbs       = document.querySelectorAll(".row-cb");
    const checkedCount = document.querySelectorAll(".row-cb:checked").length;
    if (!selectAll || rowCbs.length === 0) return;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < rowCbs.length;
    selectAll.checked       = checkedCount === rowCbs.length && rowCbs.length > 0;
}

function updateBatchToolbar() {
    const toolbar    = document.getElementById("batchToolbar");
    const countLabel = document.getElementById("batchCount");
    if (!toolbar) return;
    const count = selectedIds.size;
    countLabel.textContent = count;
    if (count > 0) {
        toolbar.classList.add("visible");
    } else {
        toolbar.classList.remove("visible");
    }
}

function clearSelection() {
    selectedIds.clear();
    document.querySelectorAll(".row-cb").forEach(cb => {
        cb.checked = false;
        const row = cb.closest("tr");
        if (row) row.classList.remove("row-selected");
    });
    const selectAll = document.getElementById("selectAll");
    if (selectAll) {
        selectAll.checked       = false;
        selectAll.indeterminate = false;
    }
    updateBatchToolbar();
}

async function batchUpdateStatus(newStatus) {
    if (selectedIds.size === 0) return;

    const label = newStatus === "verified" ? "Verified" : "Not Verified";
    const confirmed = window.confirm(
        `Mark ${selectedIds.size} selected request(s) as "${label}"?\n\nThis will overwrite their current status.`
    );
    if (!confirmed) return;

    const ids = Array.from(selectedIds);

    try {
        for (const id of ids) {
            const req = allRequests.find(r => r.id === id);
            const oldStatus = req ? req.status : null;

            const { error } = await supabaseClient
                .from("verification_requests")
                .update({
                    status:     newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id);
            if (error) throw error;

            // Audit log — non-blocking
            insertAuditLog(
                id,
                "status_changed",
                { status: oldStatus },
                { status: newStatus },
                `Batch marked as "${newStatus}" by ${_adminDisplayName}`
            );

            if (req) req.status = newStatus;
        }

        clearSelection();
        updateCounts();
        renderRequests();
        renderRecentRequests();

        showAlert(`${ids.length} request(s) marked as "${label}" successfully.`, "success");
    } catch (error) {
        console.error("Batch update error:", error);
        showAlert("Error during batch update: " + escapeHtml(error.message), "danger");
    }
}

function renderRequests() {
    const dateFiltered = getDateFilteredRequests();

    // "pending" filter tab shows both pending and under_review rows —
    // under_review is an in-progress state, not a final decision.
    let filtered;
    if (currentFilter === "all") {
        filtered = [...dateFiltered];
    } else if (currentFilter === "pending") {
        filtered = dateFiltered.filter(r => r.status === "pending" || r.status === "under_review");
    } else {
        filtered = dateFiltered.filter(r => r.status === currentFilter);
    }

    // If coming from "View" on the Students page, filter by user ID (exact, reliable).
    // Otherwise fall back to text search. rawSearchTerm drives the empty-state message below.
    let rawSearchTerm = null;
    if (filterByUserId) {
        filtered = filtered.filter(r => r.user_id === filterByUserId);
    } else if (searchTerm) {
        rawSearchTerm = searchTerm;
        filtered = filtered.filter(r =>
            (r.student_name && r.student_name.toLowerCase().includes(searchTerm))
        );
    }

    // Sort
    filtered.sort((a, b) => {
        let valA, valB;
        if (sortColumn === "date") {
            valA = a.created_at || "";
            valB = b.created_at || "";
        } else if (sortColumn === "student_name") {
            valA = (a.student_name || "").toLowerCase();
            valB = (b.student_name || "").toLowerCase();
        } else if (sortColumn === "status") {
            valA = a.status || "";
            valB = b.status || "";
        }
        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ?  1 : -1;
        return 0;
    });

    const tableBody = document.getElementById("requestsTable");

    if (filtered.length === 0) {
        const noResultsMsg = rawSearchTerm
            ? `<i class="bi bi-search fs-3 d-block mb-2 opacity-50"></i>
               No results for <strong>&ldquo;${escapeHtml(rawSearchTerm)}&rdquo;</strong>
               <div class="mt-2" style="font-size:0.82rem;">
                   <button class="btn btn-sm btn-outline-secondary" onclick="clearSearch()" style="border-radius:50px; font-size:0.78rem;">
                       <i class="bi bi-x me-1"></i>Clear search
                   </button>
               </div>`
            : `<i class="bi bi-inbox fs-3 d-block mb-2"></i>No requests found.`;

        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-muted">${noResultsMsg}</td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map(req => buildMainTableRow(req)).join("");

    selectedIds.forEach(id => {
        const cb = tableBody.querySelector(`.row-cb[data-id="${id}"]`);
        if (cb) {
            cb.checked = true;
            cb.closest("tr").classList.add("row-selected");
        }
    });
    syncSelectAllCheckbox();
}

/**
 * Build a single row for the main requests table.
 * 1a: Kebab dropdown includes View Details, Mark Verified, Mark Not Verified, divider, Delete.
 * 1b: Docs column shows file count badge (not grey dot).
 */
function buildMainTableRow(req) {
    const date = req.created_at
        ? new Date(req.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "N/A";

    let statusBadge = "";
    if (req.status === "pending")            statusBadge = '<span class="badge badge-pending">Pending</span>';
    else if (req.status === "under_review")  statusBadge = '<span class="badge badge-under-review"><i class="bi bi-search me-1"></i>Under Review</span>';
    else if (req.status === "verified")      statusBadge = '<span class="badge badge-verified">Verified</span>';
    else                                     statusBadge = '<span class="badge badge-not-verified">Not Verified</span>';

    // 1b: File count badge
    const fileCount  = (req.uploaded_files && Array.isArray(req.uploaded_files)) ? req.uploaded_files.length : 0;
    const docsBadge  = fileCount > 0
        ? `<span class="docs-count-badge"><i class="bi bi-paperclip"></i> ${fileCount}</span>`
        : `<span class="text-muted" style="font-size:0.8rem;">—</span>`;

    const dropdownId = "actions-" + req.id;

    return `
        <tr onclick="openDetail('${req.id}')" style="cursor:pointer;">
            <td class="cb-col" onclick="event.stopPropagation()">
                <input
                    type="checkbox"
                    class="row-cb"
                    data-id="${req.id}"
                    onchange="onRowCheckboxChange(this)"
                    title="Select this row"
                >
            </td>
            <td>${date}</td>
            <td>${escapeHtml(req.student_name)}</td>
            <td>${escapeHtml(req.degree_diploma || "—")}</td>
            <td>${statusBadge}</td>
            <td>${docsBadge}</td>
            <td class="admin-row-actions" onclick="event.stopPropagation()">
                <div class="dropdown">
                    <button
                        class="kebab-btn"
                        id="${dropdownId}"
                        data-bs-toggle="dropdown"
                        data-bs-boundary="viewport"
                        aria-expanded="false"
                        aria-label="Actions for ${escapeHtml(req.student_name)}"
                        title="Actions"
                    >
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="${dropdownId}">
                        <li>
                            <button class="dropdown-item" onclick="openDetail('${req.id}')">
                                <i class="bi bi-eye me-2"></i>View Details
                            </button>
                        </li>
                        <li><hr class="dropdown-divider"></li>
                        <li>
                            <button class="dropdown-item item-verify" onclick="quickUpdateStatus('${req.id}', 'verified')">
                                <i class="bi bi-check-circle me-2"></i>Mark Verified
                            </button>
                        </li>
                        <li>
                            <button class="dropdown-item item-reject" onclick="quickUpdateStatus('${req.id}', 'not_verified')">
                                <i class="bi bi-x-circle me-2"></i>Mark Not Verified
                            </button>
                        </li>
                        <li><hr class="dropdown-divider"></li>
                        <li>
                            <button class="dropdown-item text-danger" onclick="deleteRequest('${req.id}')">
                                <i class="bi bi-trash3 me-2"></i>Delete
                            </button>
                        </li>
                    </ul>
                </div>
            </td>
        </tr>`;
}

function renderRecentRequests() {
    const tbody  = document.getElementById("recentRequestsTable");
    if (!tbody) return;

    const recent = [...allRequests].slice(0, 5);

    if (recent.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-3 text-muted">
                    <i class="bi bi-inbox fs-4 d-block mb-1"></i>
                    No requests yet.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = recent.map(req => {
        const date = req.created_at
            ? new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "N/A";

        let statusBadge = "";
        if (req.status === "pending")            statusBadge = '<span class="badge badge-pending">Pending</span>';
        else if (req.status === "under_review")  statusBadge = '<span class="badge badge-under-review"><i class="bi bi-search me-1"></i>Under Review</span>';
        else if (req.status === "verified")      statusBadge = '<span class="badge badge-verified">Verified</span>';
        else                                     statusBadge = '<span class="badge badge-not-verified">Not Verified</span>';

        const dropdownId = "recent-actions-" + req.id;

        return `
            <tr style="cursor:pointer;" onclick="openDetail('${req.id}')">
                <td>${date}</td>
                <td>${escapeHtml(req.student_name)}</td>
                <td>${escapeHtml(req.degree_diploma || "—")}</td>
                <td>${statusBadge}</td>
                <td class="admin-row-actions" onclick="event.stopPropagation()">
                    <div class="dropdown">
                        <button class="kebab-btn" id="${dropdownId}" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" title="Actions">
                            <i class="bi bi-three-dots-vertical"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="${dropdownId}">
                            <li>
                                <button class="dropdown-item" onclick="openDetail('${req.id}')">
                                    <i class="bi bi-eye me-2"></i>View Details
                                </button>
                            </li>
                            <li><hr class="dropdown-divider"></li>
                            <li>
                                <button class="dropdown-item item-verify" onclick="quickUpdateStatus('${req.id}', 'verified')">
                                    <i class="bi bi-check-circle me-2"></i>Mark Verified
                                </button>
                            </li>
                            <li>
                                <button class="dropdown-item item-reject" onclick="quickUpdateStatus('${req.id}', 'not_verified')">
                                    <i class="bi bi-x-circle me-2"></i>Mark Not Verified
                                </button>
                            </li>
                            <li><hr class="dropdown-divider"></li>
                            <li>
                                <button class="dropdown-item text-danger" onclick="deleteRequest('${req.id}')">
                                    <i class="bi bi-trash3 me-2"></i>Delete
                                </button>
                            </li>
                        </ul>
                    </div>
                </td>
            </tr>`;
    }).join("");
}

// QUICK STATUS UPDATE (from kebab menu — uses remarks modal)
// Part 2c: Verifier name + designation fields shown when status = 'verified'
let _quickRemarksRequestId = null;
let _quickRemarksNewStatus  = null;

/** Open the quick-remarks modal to confirm a status change from the kebab menu. */
function quickUpdateStatus(requestId, newStatus) {
    const req = allRequests.find(r => r.id === requestId);
    if (!req) return;

    _quickRemarksRequestId = requestId;
    _quickRemarksNewStatus  = newStatus;

    const label      = newStatus === "verified" ? "Verified" : "Not Verified";
    const isVerified = newStatus === "verified";

    const iconEl       = document.getElementById("quickRemarksIcon");
    const titleEl      = document.getElementById("quickRemarksTitle");
    const descEl       = document.getElementById("quickRemarksDesc");
    const statusLbl    = document.getElementById("quickRemarksStatusLabel");
    const confirmBtn   = document.getElementById("quickRemarksConfirmBtn");
    const headerEl     = document.getElementById("quickRemarksModalHeader");
    const inputEl      = document.getElementById("quickRemarksInput");
    const verifierFields = document.getElementById("quickRemarksVerifierFields");
    const verifierName   = document.getElementById("quickVerifierName");
    const verifierDesig  = document.getElementById("quickVerifierDesignation");

    if (iconEl)    iconEl.className   = isVerified ? "bi bi-check-circle me-2" : "bi bi-x-circle me-2";
    if (titleEl)   titleEl.textContent = isVerified ? "Mark as Verified" : "Mark as Not Verified";
    if (statusLbl) statusLbl.textContent = label;
    if (descEl)    descEl.querySelector("strong").textContent = label;
    if (confirmBtn) {
        confirmBtn.className   = isVerified ? "btn btn-success btn-sm" : "btn btn-danger btn-sm";
        confirmBtn.textContent = `Confirm — ${label}`;
    }
    if (headerEl) {
        headerEl.style.borderBottom = isVerified
            ? "2px solid var(--color-success)"
            : "2px solid var(--color-danger)";
        headerEl.style.background = isVerified
            ? "rgba(16,185,129,0.07)"
            : "rgba(239,68,68,0.07)";
    }
    if (inputEl) inputEl.value = "";

    // Show verifier fields only when marking as verified
    if (verifierFields) {
        if (isVerified) {
            verifierFields.classList.remove("d-none");
            // Pre-fill with fixed verifier info — read-only, cannot be changed per request
            if (verifierName)  { verifierName.value  = VERIFIER_NAME;        verifierName.readOnly  = true; }
            if (verifierDesig) { verifierDesig.value = VERIFIER_DESIGNATION;  verifierDesig.readOnly = true; }
        } else {
            verifierFields.classList.add("d-none");
            if (verifierName)  verifierName.value  = "";
            if (verifierDesig) verifierDesig.value = "";
        }
    }

    const modal = new bootstrap.Modal(document.getElementById("quickRemarksModal"));
    modal.show();
}

/** Confirm handler — saves status + optional remarks + verifier info to Supabase. */
async function quickRemarksConfirm() {
    const requestId = _quickRemarksRequestId;
    const newStatus  = _quickRemarksNewStatus;
    if (!requestId || !newStatus) return;

    const remarks    = (document.getElementById("quickRemarksInput").value || "").trim();
    const req        = allRequests.find(r => r.id === requestId);
    if (!req) return;

    const isVerified = newStatus === "verified";

    const confirmBtn = document.getElementById("quickRemarksConfirmBtn");
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
    }

    try {
        const updatePayload = {
            status:     newStatus,
            updated_at: new Date().toISOString()
        };

        if (remarks) updatePayload.admin_remarks = remarks;

        // Save verifier name + designation when marking as verified
        if (isVerified) {
            const verifierName  = (document.getElementById("quickVerifierName").value || "").trim();
            const verifierDesig = (document.getElementById("quickVerifierDesignation").value || "").trim();
            if (verifierName)  updatePayload.verifier_name        = verifierName;
            if (verifierDesig) updatePayload.verifier_designation = verifierDesig;
            updatePayload.date_of_verification = new Date().toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric"
            });
        }

        const oldStatus = req.status;

        const { error } = await supabaseClient
            .from("verification_requests")
            .update(updatePayload)
            .eq("id", requestId);

        if (error) throw error;

        // Audit log — non-blocking
        insertAuditLog(
            requestId,
            "status_changed",
            { status: oldStatus },
            { status: newStatus, admin_remarks: remarks || null },
            `Quick-updated to "${newStatus}" by ${_adminDisplayName}`
        );

        // Update local cache
        req.status = newStatus;
        if (remarks) req.admin_remarks = remarks;
        if (isVerified) {
            req.verifier_name        = updatePayload.verifier_name        || req.verifier_name;
            req.verifier_designation = updatePayload.verifier_designation || req.verifier_designation;
            req.date_of_verification = updatePayload.date_of_verification;
        }

        const modalEl = document.getElementById("quickRemarksModal");
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();

        updateCounts();
        renderRequests();
        renderRecentRequests();

        const label = newStatus === "verified" ? "Verified" : "Not Verified";
        showAlert(`Request marked as "${label}" successfully.`, "success");
    } catch (error) {
        console.error("Quick update error:", error);
        showAlert("Error updating status: " + escapeHtml(error.message), "danger");
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            const label = newStatus === "verified" ? "Verified" : "Not Verified";
            confirmBtn.textContent = `Confirm — ${label}`;
        }
        _quickRemarksRequestId = null;
        _quickRemarksNewStatus  = null;
    }
}

function deleteRequest(requestId) {
    _deleteRequestId = requestId;
    const req = allRequests.find(r => r.id === requestId);
    const targetEl = document.getElementById("deleteConfirmTarget");
    if (targetEl && req) {
        targetEl.textContent = `"${req.student_name || "Unknown"}" — ${req.degree_diploma || ""}`;
    }
    const modal = new bootstrap.Modal(document.getElementById("deleteConfirmModal"));
    modal.show();
}

async function confirmDelete() {
    const requestId = _deleteRequestId;
    if (!requestId) return;

    const btn = document.getElementById("btnConfirmDelete");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Deleting...';
    }

    try {
        const { error } = await supabaseClient
            .from("verification_requests")
            .delete()
            .eq("id", requestId);

        if (error) throw error;

        // Remove from local cache
        allRequests = allRequests.filter(r => r.id !== requestId);

        const modalEl = document.getElementById("deleteConfirmModal");
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();

        updateCounts();
        renderRequests();
        renderRecentRequests();

        showAlert("Request deleted successfully.", "success");
    } catch (error) {
        console.error("Delete error:", error);
        showAlert("Error deleting request: " + escapeHtml(error.message), "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3 me-1"></i>Yes, Delete';
        }
        _deleteRequestId = null;
    }
}

function exportToCSV() {
    const dateFiltered = getDateFilteredRequests();
    let filtered;
    if (currentFilter === "all") {
        filtered = [...dateFiltered];
    } else if (currentFilter === "pending") {
        filtered = dateFiltered.filter(r => r.status === "pending" || r.status === "under_review");
    } else {
        filtered = dateFiltered.filter(r => r.status === currentFilter);
    }

    if (searchTerm) {
        filtered = filtered.filter(r =>
            (r.student_name && r.student_name.toLowerCase().includes(searchTerm))
        );
    }

    if (filtered.length === 0) {
        showAlert("No requests to export for the current filter.", "warning");
        return;
    }

    const headers = [
        "Date Submitted", "Student Name", "Degree / Diploma", "Major / Track",
        "Student Status", "School Name", "Status", "Admin Remarks", "Last Updated"
    ];

    function csvCell(val) {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    }

    const rows = filtered.map(req => {
        const submittedDate = req.created_at
            ? new Date(req.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
            : "";
        const updatedDate = req.updated_at
            ? new Date(req.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
            : "";
        const statusLabel  = req.status === "verified" ? "Verified"
            : req.status === "not_verified" ? "Not Verified" : "Pending";
        const studentType  = req.student_status === "graduate" ? "Graduate" : "Undergraduate";

        return [
            csvCell(submittedDate),
            csvCell(req.student_name),
            csvCell(req.degree_diploma),
            csvCell(req.major_track),
            csvCell(studentType),
            csvCell(req.school_name),
            csvCell(statusLabel),
            csvCell(req.admin_remarks),
            csvCell(updatedDate)
        ].join(",");
    });

    const csvContent = [headers.map(h => csvCell(h)).join(","), ...rows].join("\n");
    const today      = new Date().toISOString().slice(0, 10);
    const filename   = `verification-requests-${today}.csv`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showAlert(`Exported ${filtered.length} record(s) to <strong>${filename}</strong>.`, "success");
}

/**
 * Build the files section for the detail modal.
 * Each file shows: icon, name, View button, Download link.
 */
function buildFilesHtml(req) {
    const hasFiles = req.uploaded_files && req.uploaded_files.length > 0;
    if (!hasFiles) {
        return `
            <div class="doc-empty-state">
                <i class="bi bi-file-earmark-x"></i>
                <p>No files uploaded for this request.</p>
            </div>`;
    }

    const assessments = req.document_assessment || [];
    return req.uploaded_files.map((file, idx) => {
        const existing     = assessments.find(a => a.file_name === file.name);
        const currentValue = existing ? existing.assessment : "";

        const assessBadgeClass = currentValue === "authentic"  ? "doc-assess-authentic"
                               : currentValue === "tampered"   ? "doc-assess-tampered"
                               : currentValue === "fabricated" ? "doc-assess-fabricated"
                               : "";

        const assessmentSelect = `
            <select class="form-select form-select-sm doc-assessment ${assessBadgeClass}" data-file-name="${escapeHtml(file.name)}" onchange="onAssessmentChange()" aria-label="Assessment for ${escapeHtml(file.name)}">
                <option value="" ${!currentValue ? "selected" : ""}>-- Select Assessment --</option>
                <option value="authentic"  ${currentValue === "authentic"  ? "selected" : ""}>Authentic</option>
                <option value="tampered"   ${currentValue === "tampered"   ? "selected" : ""}>Tampered</option>
                <option value="fabricated" ${currentValue === "fabricated" ? "selected" : ""}>Fabricated</option>
            </select>`;

        const isImage    = file.type && file.type.startsWith("image/");
        const isPdf      = file.type && file.type.includes("pdf");
        const fileNum    = `File ${idx + 1}`;
        const iconClass  = isPdf ? "bi-file-earmark-pdf text-danger" : isImage ? "bi-image text-primary" : "bi-file-earmark";

        return `
            <div class="doc-card mb-3">
                <div class="doc-card-header">
                    <div class="doc-card-icon">
                        <i class="bi ${iconClass}"></i>
                    </div>
                    <div class="doc-card-meta">
                        <div class="doc-card-name">${escapeHtml(file.name)}</div>
                        <div class="doc-card-num">${fileNum}</div>
                    </div>
                    <div class="d-flex gap-1">
                        <a href="${file.url}" target="_blank" rel="noopener noreferrer"
                           class="btn btn-sm btn-outline-primary doc-open-btn" title="View file in new tab"
                           onclick="event.stopPropagation()">
                            <i class="bi bi-eye me-1"></i>View
                        </a>
                        <a href="${file.url}" download="${escapeHtml(file.name)}"
                           class="btn btn-sm btn-outline-secondary doc-open-btn" title="Download file"
                           onclick="event.stopPropagation()">
                            <i class="bi bi-download"></i>
                        </a>
                    </div>
                </div>
                ${isImage ? `<div class="doc-card-preview"><img src="${file.url}" alt="${escapeHtml(file.name)}" class="img-fluid rounded" style="max-height:200px;width:100%;object-fit:cover;"></div>` : ""}
                <div class="doc-card-assess">
                    <label class="doc-assess-label">Assessment</label>
                    ${assessmentSelect}
                </div>
            </div>`;
    }).join("");
}

/**
 * Build the audit / history section (Part 2f).
 * Derived from created_at + reviewed_at fields — no separate table needed.
 */
function buildAuditLogHtml(req) {
    const events = [];

    if (req.created_at) {
        const d = new Date(req.created_at);
        events.push({
            icon:  "bi-send-fill",
            color: "text-primary",
            label: "Submitted",
            desc:  "Request submitted by student.",
            time:  d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
        });
    }

    if (req.reviewed_at) {
        const d     = new Date(req.reviewed_at);
        const isVer = req.status === "verified";
        events.push({
            icon:  isVer ? "bi-check-circle-fill" : "bi-x-circle-fill",
            color: isVer ? "text-success" : "text-danger",
            label: isVer ? "Verified" : "Marked Not Verified",
            desc:  req.admin_remarks ? `Remarks: ${escapeHtml(req.admin_remarks)}` : "No remarks added.",
            time:  d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
        });
    } else if (req.status === "pending") {
        events.push({
            icon:  "bi-clock-fill",
            color: "text-warning",
            label: "Awaiting Review",
            desc:  "Request is pending admin review.",
            time:  ""
        });
    }

    if (events.length === 0) {
        return `<p class="text-muted mb-0" style="font-size:0.83rem;">No history available.</p>`;
    }

    return `
        <div class="audit-log">
            ${events.map((ev, i) => `
                <div class="audit-log-item ${i < events.length - 1 ? "audit-log-item--connected" : ""}">
                    <div class="audit-log-dot ${ev.color}">
                        <i class="bi ${ev.icon}"></i>
                    </div>
                    <div class="audit-log-content">
                        <div class="audit-log-label">${ev.label}</div>
                        <div class="audit-log-desc">${ev.desc}</div>
                        ${ev.time ? `<div class="audit-log-time">${ev.time}</div>` : ""}
                    </div>
                </div>
            `).join("")}
        </div>`;
}

/** Build "Check in Records" result for the detail modal (Part 3b). */
async function checkStudentInRecords(studentName, requestId) {
    const resultEl = document.getElementById("checkRecordsResult");
    if (!resultEl) return;

    // Look up the originating request for comparison
    const req = allRequests.find(r => r.id === requestId) || null;

    // Case-insensitive, word-based name search
    function nameSearch(records, query) {
        const needle = query.trim().toLowerCase();
        const words  = needle.split(/[\s,]+/).filter(Boolean);
        return records.filter(r => {
            if (!r.student_name) return false;
            const hay = r.student_name.trim().toLowerCase();
            return hay.includes(needle) || words.every(w => hay.includes(w));
        }).slice(0, 5);
    }

    // Build comparison card for one matched record
    function buildComparisonCard(r) {
        function cmpRow(label, reqVal, recVal, compare) {
            const reqText = escapeHtml(reqVal || "—");
            const recText = escapeHtml(recVal || "—");
            let icon = "";
            if (compare && reqVal && recVal) {
                const match = reqVal.trim().toLowerCase() === recVal.trim().toLowerCase();
                icon = match
                    ? `<i class="bi bi-check-circle-fill text-success ms-1" title="Match"></i>`
                    : `<i class="bi bi-exclamation-circle-fill text-danger ms-1" title="Mismatch"></i>`;
            }
            return `
                <tr style="font-size:0.78rem;">
                    <td style="color:var(--gray-500);white-space:nowrap;padding:3px 8px;">${label}</td>
                    <td style="padding:3px 8px;">${reqVal ? reqText : '<span class="text-muted">—</span>'}</td>
                    <td style="padding:3px 8px;">${recText}${icon}</td>
                </tr>`;
        }

        // Normalize student_type vs status for comparison
        const reqType = (req?.student_type || "").trim().toLowerCase();
        const recStatus = (r.status || "").trim().toLowerCase();

        const rows = [
            cmpRow("Program / Course",
                req?.degree_diploma || null,
                r.program || null,
                false   // display only — abbreviations differ too much for auto-compare
            ),
            cmpRow("Student Type / Status",
                req?.student_type || null,
                r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : null,
                true    // auto-compare
            ),
            cmpRow("School Year",
                req?.school_year_ended || req?.school_year_started || null,
                r.school_year || null,
                true    // auto-compare
            ),
            cmpRow("Term",
                req?.term_ended || req?.term_started || null,
                r.term || null,
                true    // auto-compare
            ),
        ].join("");

        return `
            <div style="border:1px solid var(--gray-200);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:6px;">
                <div style="background:var(--gray-50);padding:5px 8px;font-size:0.78rem;font-weight:600;color:var(--gray-700);display:flex;justify-content:space-between;align-items:center;">
                    <span><i class="bi bi-person-badge me-1"></i>${escapeHtml(r.student_name || "—")}</span>
                    <span style="color:var(--gray-400);font-weight:400;">ID: ${escapeHtml(r.student_id || "—")}</span>
                </div>
                <table class="w-100" style="border-collapse:collapse;">
                    <thead>
                        <tr style="font-size:0.72rem;color:var(--gray-400);background:var(--gray-50);border-top:1px solid var(--gray-100);">
                            <th style="padding:2px 8px;font-weight:600;">FIELD</th>
                            <th style="padding:2px 8px;font-weight:600;">REQUEST SAYS</th>
                            <th style="padding:2px 8px;font-weight:600;">RECORD HAS</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    function renderCheckResults(matched) {
        if (matched.length === 0) {
            resultEl.innerHTML = `
                <div class="check-records-badge check-records-nomatch">
                    <i class="bi bi-x-circle-fill me-1"></i>
                    No match found in student records for "<strong>${escapeHtml(studentName)}</strong>".
                </div>`;
            return;
        }
        const cards = matched.map(buildComparisonCard).join("");
        resultEl.innerHTML = `
            <div class="check-records-badge check-records-match mb-2">
                <i class="bi bi-check-circle-fill me-1"></i>
                ${matched.length} name match(es) found — verify the details below.
            </div>
            ${cards}`;
    }

    // Search in-memory if records are loaded; otherwise query DB
    if (allStudentRecords.length > 0) {
        renderCheckResults(nameSearch(allStudentRecords, studentName));
        return;
    }

    resultEl.innerHTML = `<span class="text-muted" style="font-size:0.82rem;"><span class="spinner-border spinner-border-sm me-1"></span>Searching records...</span>`;
    try {
        const { data, error } = await supabaseClient
            .from("student_records")
            .select("*")
            .ilike("student_name", `%${studentName}%`)
            .limit(5);
        if (error) throw error;
        renderCheckResults(data || []);
    } catch (err) {
        resultEl.innerHTML = `<span class="text-danger" style="font-size:0.82rem;"><i class="bi bi-exclamation-triangle me-1"></i>Error: ${escapeHtml(err.message)}</span>`;
    }
}

/**
 * Open the detail modal for a given request ID.
 * Renamed from openReview() — openReview() remains as alias.
 */
function openDetail(requestId) {
    const req = allRequests.find(r => r.id === requestId);
    if (!req) return;

    currentReviewId = requestId;

    // Signal to the user's real-time subscription that this request
    // is being actively reviewed. markUnderReview() is a no-op if
    // the request is already under_review, verified, or not_verified.
    markUnderReview(requestId);

    const modalBody   = document.getElementById("modalBody");
    const modalFooter = document.getElementById("modalFooter");

    // Update modal header
    const subtitle      = document.getElementById("reviewModalSubtitle");
    const statusBadgeEl = document.getElementById("reviewModalStatusBadge");
    if (subtitle)      subtitle.textContent = req.student_name || "Unknown Student";
    if (statusBadgeEl) {
        if (req.status === "verified")
            statusBadgeEl.innerHTML = '<span class="badge badge-verified fs-6"><i class="bi bi-check-circle me-1"></i>Verified</span>';
        else if (req.status === "not_verified")
            statusBadgeEl.innerHTML = '<span class="badge badge-not-verified fs-6"><i class="bi bi-x-circle me-1"></i>Not Verified</span>';
        else if (req.status === "under_review")
            statusBadgeEl.innerHTML = '<span class="badge badge-under-review fs-6"><i class="bi bi-search me-1"></i>Under Review</span>';
        else
            statusBadgeEl.innerHTML = '<span class="badge badge-pending fs-6"><i class="bi bi-clock me-1"></i>Pending</span>';
    }

    const filesHtml    = buildFilesHtml(req);
    const auditLogHtml = buildAuditLogHtml(req);

    const submittedDate = req.created_at
        ? new Date(req.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "N/A";

    const statusType = req.student_status === "graduate" ? "Graduate" : "Undergraduate";

    modalBody.innerHTML = `
        <div id="reviewViewMode" class="review-two-panel">

            <!-- LEFT PANEL: Student & Academic Details -->
            <div class="review-panel-left">

                <div class="review-panel-section">
                    <div class="review-panel-section-title">
                        <i class="bi bi-person-badge me-2"></i>Student Information
                    </div>
                    <div class="review-info-grid">
                        <div class="review-info-item">
                            <span class="review-info-label">Full Name</span>
                            <span class="review-info-value">${escapeHtml(req.student_name)}</span>
                        </div>
                        <div class="review-info-item">
                            <span class="review-info-label">Student Type</span>
                            <span class="review-info-value">${statusType}</span>
                        </div>
                        <div class="review-info-item">
                            <span class="review-info-label">Degree/Diploma</span>
                            <span class="review-info-value">${escapeHtml(req.degree_diploma || "—")}</span>
                        </div>
                        <div class="review-info-item">
                            <span class="review-info-label">Major/Track</span>
                            <span class="review-info-value">${escapeHtml(req.major_track || "—")}</span>
                        </div>
                        ${req.date_of_graduation ? `
                        <div class="review-info-item">
                            <span class="review-info-label">Date of Graduation</span>
                            <span class="review-info-value">${escapeHtml(req.date_of_graduation)}</span>
                        </div>` : ""}
                        ${req.units_earned ? `
                        <div class="review-info-item">
                            <span class="review-info-label">Total Units Earned</span>
                            <span class="review-info-value">${escapeHtml(req.units_earned)}</span>
                        </div>` : ""}
                        ${req.award_remarks ? `
                        <div class="review-info-item">
                            <span class="review-info-label">Remarks / Award</span>
                            <span class="review-info-value">${escapeHtml(req.award_remarks)}</span>
                        </div>` : ""}
                        ${req.mode_of_study ? `
                        <div class="review-info-item">
                            <span class="review-info-label">Mode of Study</span>
                            <span class="review-info-value">${escapeHtml(req.mode_of_study)}</span>
                        </div>` : ""}
                    </div>
                </div>

                <div class="review-panel-section">
                    <div class="review-panel-section-title">
                        <i class="bi bi-calendar3 me-2"></i>Enrollment Period
                    </div>
                    <div class="review-info-grid">
                        <div class="review-info-item">
                            <span class="review-info-label">Term Started</span>
                            <span class="review-info-value">${escapeHtml(req.term_started || "—")} — ${escapeHtml(req.school_year_started || "—")}</span>
                        </div>
                        <div class="review-info-item">
                            <span class="review-info-label">Term Ended</span>
                            <span class="review-info-value">${escapeHtml(req.term_ended || "—")} — ${escapeHtml(req.school_year_ended || "—")}</span>
                        </div>
                    </div>
                </div>

                <div class="review-panel-section">
                    <div class="review-panel-section-title">
                        <i class="bi bi-building me-2"></i>Requesting Institution
                    </div>
                    <div class="review-info-grid">
                        <div class="review-info-item review-info-item--full">
                            <span class="review-info-label">School Name</span>
                            <span class="review-info-value">${escapeHtml(req.school_name || "—")}</span>
                        </div>
                        <div class="review-info-item review-info-item--full">
                            <span class="review-info-label">School Address</span>
                            <span class="review-info-value">${escapeHtml(req.school_address || "—")}</span>
                        </div>
                        ${req.verifier_name ? `
                        <div class="review-info-item">
                            <span class="review-info-label">Verifier Name</span>
                            <span class="review-info-value">${escapeHtml(req.verifier_name)}</span>
                        </div>
                        <div class="review-info-item">
                            <span class="review-info-label">Designation</span>
                            <span class="review-info-value">${escapeHtml(req.verifier_designation || "—")}</span>
                        </div>` : ""}
                        ${req.date_of_verification ? `
                        <div class="review-info-item">
                            <span class="review-info-label">Date of Verification</span>
                            <span class="review-info-value">${escapeHtml(req.date_of_verification)}</span>
                        </div>` : ""}
                    </div>
                </div>

                <!-- Check in Student Records (Part 3b) -->
                <div class="review-panel-section">
                    <div class="review-panel-section-title">
                        <i class="bi bi-database me-2"></i>Records Check
                    </div>
                    <button class="btn btn-sm btn-outline-secondary" style="font-size:0.82rem; font-weight:600; border-radius:var(--radius-sm);"
                            data-student-name="${escapeHtml(req.student_name)}"
                            data-request-id="${escapeHtml(req.id)}"
                            onclick="checkStudentInRecords(this.dataset.studentName, this.dataset.requestId)">
                        <i class="bi bi-search me-1"></i>Check in Records
                    </button>
                    <div id="checkRecordsResult" class="mt-2"></div>
                </div>

                <div class="review-meta-strip">
                    <span><i class="bi bi-calendar-event me-1 text-muted"></i>Submitted: ${submittedDate}</span>
                    <span><i class="bi bi-hash me-1 text-muted"></i><span style="font-size:0.7rem;color:var(--gray-400);">${escapeHtml(req.id)}</span></span>
                </div>

                <!-- Audit Log / History (Part 2f) — collapsible -->
                <div class="mt-3">
                    <button class="btn btn-sm btn-outline-secondary w-100" type="button"
                            data-bs-toggle="collapse" data-bs-target="#auditLogCollapse"
                            aria-expanded="false" style="font-size:0.8rem; font-weight:600;">
                        <i class="bi bi-clock-history me-1"></i>View History
                    </button>
                    <div class="collapse mt-2" id="auditLogCollapse">
                        ${auditLogHtml}
                    </div>
                </div>

            </div>
            <!-- /LEFT PANEL -->

            <!-- RIGHT PANEL: Documents + Assessment + Remarks -->
            <div class="review-panel-right">

                <div class="review-panel-section">
                    <div class="review-panel-section-title">
                        <i class="bi bi-paperclip me-2"></i>Uploaded Documents
                        <span class="ms-2 text-muted" style="font-size:0.75rem; font-weight:400; text-transform:none; letter-spacing:0;">
                            ${req.uploaded_files ? req.uploaded_files.length : 0} file(s)
                        </span>
                    </div>
                    ${filesHtml}
                </div>

                <!-- Assessment status banner -->
                <div id="assessmentBanner" class="alert d-none mt-3 mb-0"></div>

                <!-- Certificate Details (admin-filled) -->
                <div class="review-panel-section mt-3">
                    <div class="review-panel-section-title">
                        <i class="bi bi-award me-2"></i>Certificate Details
                    </div>
                    <div class="row g-2">
                        <div class="col-12">
                            <label class="form-label nrf-label">Total Units Earned</label>
                            <input type="text" class="form-control nrf-input" id="certUnitsEarned" placeholder="e.g. 148 or ---">
                        </div>
                        <div class="col-12">
                            <label class="form-label nrf-label">Remarks / Award</label>
                            <input type="text" class="form-control nrf-input" id="certAwardRemarks" placeholder='e.g. Graduate, Cum Laude, With Honors'>
                        </div>
                        <div class="col-12">
                            <label class="form-label nrf-label">Mode of Study</label>
                            <select class="form-select nrf-input" id="certModeOfStudy">
                                <option value="">— Select —</option>
                                <option value="FACE-to-FACE - FULLTIME">FACE-to-FACE - FULLTIME</option>
                                <option value="FACE-to-FACE - PART-TIME">FACE-to-FACE - PART-TIME</option>
                                <option value="ONLINE">ONLINE</option>
                                <option value="MODULAR">MODULAR</option>
                                <option value="BLENDED">BLENDED</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="review-panel-section mt-3">
                    <div class="review-panel-section-title">
                        <i class="bi bi-chat-left-text me-2"></i>Admin Remarks
                    </div>
                    <textarea class="form-control review-remarks-input" id="adminRemarks" rows="3" placeholder="Add optional remarks about this request..."></textarea>
                </div>

            </div>
            <!-- /RIGHT PANEL -->

        </div>
    `;

    // Safely set textarea value to prevent XSS
    document.getElementById("adminRemarks").value = req.admin_remarks || "";

    // Pre-fill certificate detail fields
    document.getElementById("certUnitsEarned").value  = req.units_earned  || "";
    document.getElementById("certAwardRemarks").value = req.award_remarks || "";
    const modeEl = document.getElementById("certModeOfStudy");
    if (modeEl) {
        modeEl.value = req.mode_of_study || "";
        if (!modeEl.value && req.mode_of_study) {
            const opt = document.createElement("option");
            opt.value = req.mode_of_study;
            opt.textContent = req.mode_of_study;
            opt.selected = true;
            modeEl.appendChild(opt);
        }
    }

    // Build modal footer
    let statusHtml = "";
    if (req.status !== "pending") {
        const currentBadge = req.status === "verified"
            ? '<span class="badge badge-verified"><i class="bi bi-check-circle me-1"></i>Verified</span>'
            : '<span class="badge badge-not-verified"><i class="bi bi-x-circle me-1"></i>Not Verified</span>';
        statusHtml = `<span class="me-auto small text-muted d-flex align-items-center gap-2">Current status: ${currentBadge}</span>`;
    } else {
        statusHtml = `<span class="me-auto small text-muted d-flex align-items-center gap-2">
            <span class="badge badge-pending"><i class="bi bi-clock me-1"></i>Pending</span> Awaiting review
        </span>`;
    }

    // Print Letter button — only visible when status is verified (Part 2e)
    const printBtn = req.status === "verified"
        ? `<button class="btn btn-outline-secondary btn-sm" onclick="printVerificationLetter('${req.id}')">
               <i class="bi bi-printer me-1"></i>Print Letter
           </button>`
        : "";

    modalFooter.innerHTML = `
        ${statusHtml}
        ${printBtn}
        <button class="btn btn-outline-secondary btn-sm" onclick="enterEditMode('${req.id}')">
            <i class="bi bi-pencil-square me-1"></i>Edit Details
        </button>
        <button class="btn btn-danger btn-sm" id="btnNotVerified" onclick="updateStatus('${req.id}', 'not_verified')">
            <i class="bi bi-x-circle me-1"></i>Not Verified
        </button>
        <button class="btn btn-success btn-sm" id="btnVerified" onclick="updateStatus('${req.id}', 'verified')">
            <i class="bi bi-check-circle me-1"></i>Mark Verified
        </button>
    `;

    onAssessmentChange();

    const modal = new bootstrap.Modal(document.getElementById("reviewModal"));
    modal.show();
}

// Alias so existing kebab references still work
function openReview(requestId) {
    openDetail(requestId);
}

async function printVerificationLetter(requestId) {
    const req = allRequests.find(r => r.id === requestId);
    if (!req) return;

    const today         = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const verifierName  = req.verifier_name        || "Campus Registrar";
    const verifierDesig = req.verifier_designation || "Campus Registrar";
    const verifiedDate  = req.date_of_verification || today;
    const studentName   = req.student_name         || "N/A";
    const degree        = req.degree_diploma        || "---";
    const major         = req.major_track           || "---";
    const gradDate      = req.date_of_graduation    || "---";
    const unitsEarned   = req.units_earned          || "---";
    const awardRemarks  = req.award_remarks         || "---";
    const modeOfStudy   = req.mode_of_study         || "---";
    const termStarted   = req.term_started          || "---";
    const syStarted     = req.school_year_started   || "---";
    const termEnded     = req.term_ended            || "---";
    const syEnded       = req.school_year_ended     || "---";
    const schoolName    = req.school_name           || "---";
    const schoolAddress = req.school_address        || "---";
    const verCode       = req.verification_code || null;
    const shortId       = verCode || ("REG-" + req.id.split("-")[0].toUpperCase());

    async function imgToBase64(url) {
        try {
            const res  = await fetch(url);
            const blob = await res.blob();
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch { return null; }
    }

    const baseUrl = new URL('.', window.location.href).href;
    const [logoB64, rotundaB64] = await Promise.all([
        imgToBase64(baseUrl + 'csu-logo.png'),
        imgToBase64(baseUrl + 'CSU-ROTUNDA.jpg')
    ]);

    // Render a text string using a system font via Canvas2D → base64 PNG
    // This lets us use "Old English Text MT" (installed on Windows) in the PDF header
    function textToImg(text, fontFamily, ptSize, color, bold = true) {
        const canvas  = document.createElement('canvas');
        const ctx     = canvas.getContext('2d');
        const pxSize  = ptSize * 2;                     // 2× for crisp output
        const weight  = bold ? 'bold' : 'normal';
        const fontStr = `${weight} ${pxSize}px "${fontFamily}", "Times New Roman", serif`;
        ctx.font      = fontStr;
        const w       = Math.ceil(ctx.measureText(text).width) + 10;
        const h       = Math.ceil(pxSize * 1.45);
        canvas.width  = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.font         = fontStr;
        ctx.fillStyle    = color;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 5, h / 2);
        return { dataUrl: canvas.toDataURL('image/png'), width: w / 2, height: h / 2 };
    }

    const GREEN_CLR    = '#1a5c2a';
    const univNameImg  = textToImg('Cagayan State University', 'Old English Text MT', 14, GREEN_CLR);
    const campusImg    = textToImg('CARIG CAMPUS',             'Old English Text MT', 11, '#111111', false);

    const GREEN      = '#1a5c2a';
    const LABEL_BG   = '#f5f5f5';
    const LABEL_CLR  = '#2c4a35';
    const BORDER_CLR = '#888888';
    const P          = [5, 4, 5, 4]; // [left, top, right, bottom] cell padding

    // Regular label cell (full label column width)
    const lbl = (text, extra = {}) => ({
        text, fontSize: 9, bold: true, color: LABEL_CLR,
        fillColor: LABEL_BG, margin: P, ...extra
    });

    // Regular value cell
    const val = (text, extra = {}) => ({
        text, fontSize: 9, color: '#111',
        fillColor: '#ffffff', margin: P, ...extra
    });

    // Nested term-row table: shows sub-label | sub-value inside the value column
    // Outer borders suppressed — outer table provides them; only middle vLine shown
    const termCell = (subLabel, subValue) => ({
        table: {
            widths: [68, '*'],
            body: [[
                { text: subLabel, fontSize: 8.5, bold: true, color: LABEL_CLR, fillColor: LABEL_BG },
                { text: subValue, fontSize: 9,   color: '#111',                fillColor: '#ffffff' }
            ]]
        },
        layout: {
            hLineWidth:    () => 0,
            vLineWidth:    (i) => i === 1 ? 0.5 : 0,
            hLineColor:    () => BORDER_CLR,
            vLineColor:    () => BORDER_CLR,
            paddingLeft:   () => 5,
            paddingRight:  () => 5,
            paddingTop:    () => 4,
            paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 0]
    });

    // Outer table uses 2 columns: [label | value]
    // Term rows: label uses rowSpan:2, value column holds a nested termCell table
    const tableBody = [
        [ lbl('Name of Student/Graduate'),       val(studentName,   { bold: true, fontSize: 13 }) ],
        [ lbl('Degree/Diploma Obtained'),         val(degree,        { bold: true }) ],
        [ lbl('Major/Track'),                      val(major) ],
        [ lbl('Date of Graduation'),              val(gradDate,      { bold: true }) ],
        [ lbl('Total Units Earned'),              val(unitsEarned) ],
        [ lbl('Remarks/Award'),                   val(awardRemarks) ],
        [ lbl('Mode of Study'),                   val(modeOfStudy) ],
        // Term Started — group label spans 2 rows, nested table on right
        [ lbl('Term & School Year\nStarted in CSU', { rowSpan: 2 }), termCell('Term/Semester', termStarted) ],
        [ {},                                        termCell('School Year',   syStarted)   ],
        // Term Ended — group label spans 2 rows
        [ lbl('Term & School Year\nEnded in CSU',   { rowSpan: 2 }), termCell('Term/Semester', termEnded)   ],
        [ {},                                        termCell('School Year',   syEnded)     ],
        [ lbl('School Name'),                     val(schoolName,    { bold: true }) ],
        [ lbl('School Address'),                  val(schoolAddress, { bold: true }) ],
        [ lbl("Verifier's Name and Designation"), val(verifierName + '\n' + verifierDesig, { bold: true }) ],
        [ lbl('Date of Verification'),            val(verifiedDate,  { bold: true }) ],
    ];

    const docDefinition = {
        pageSize:    'A4',
        pageMargins: [40, 40, 40, 72],

        footer: function(currentPage, pageCount, pageSize) {
            const lineW = (pageSize ? pageSize.width : 595) - 80;
            return {
                stack: [
                    {
                        canvas: [{ type: 'line', x1: 0, y1: 0, x2: lineW, y2: 0, lineWidth: 1.5, lineColor: '#222' }],
                        margin: [40, 0, 40, 5]
                    },
                    {
                        columns: [
                            {
                                stack: [
                                    { text: 'csucarigregistrar@csu.edu.ph', fontSize: 7.5, color: '#333', decoration: 'underline' },
                                    { text: "CSU Carig Registrar's Office",  fontSize: 7.5, color: '#333' }
                                ],
                                width: '*'
                            },
                            {
                                stack: [
                                    { text: '395-2782 loc 071/006', fontSize: 7.5, color: '#333', alignment: 'center' },
                                    { text: 'www.csucarig.edu.ph',  fontSize: 7.5, color: '#333', alignment: 'center', decoration: 'underline' }
                                ],
                                width: '*'
                            },
                            rotundaB64
                                ? { image: rotundaB64, width: 65, height: 44, alignment: 'right' }
                                : { text: '', width: 65 }
                        ],
                        margin: [40, 0, 40, 0]
                    }
                ]
            };
        },

        content: [

            // LETTERHEAD
            {
                columns: [
                    logoB64
                        ? { image: logoB64, width: 65, height: 65 }
                        : { text: '', width: 65 },
                    {
                        stack: [
                            { text: 'Republic of the Philippines', fontSize: 8, color: '#555', alignment: 'center' },
                            { image: univNameImg.dataUrl, width: univNameImg.width, height: univNameImg.height, alignment: 'center', margin: [0, 2, 0, 0] },
                            { image: campusImg.dataUrl,   width: campusImg.width,   height: campusImg.height,   alignment: 'center', margin: [0, 1, 0, 0] },
                            { text: 'Carig Sur, Tuguegarao City',  fontSize: 8, color: '#666', alignment: 'center', margin: [0, 2, 0, 0] }
                        ],
                        margin: [10, 3, 0, 0]
                    }
                ],
                margin: [0, 0, 0, 6]
            },

            // THICK GREEN DIVIDER
            {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2.5, lineColor: GREEN }],
                margin: [0, 0, 0, 4]
            },

            // OFFICE LABEL + REFERENCE NUMBER (bordered box)
            {
                table: {
                    widths: ['*', 'auto'],
                    body: [[
                        {
                            text: [
                                { text: 'O', fontSize: 11, bold: true },
                                { text: 'FFICE ', fontSize: 9, bold: false, italics: true },
                                { text: 'of the ', fontSize: 9, italics: true },
                                { text: 'C', fontSize: 11, bold: true },
                                { text: 'AMPUS ', fontSize: 9, bold: false, italics: true },
                                { text: 'R', fontSize: 11, bold: true },
                                { text: 'EGISTRAR', fontSize: 9, bold: false, italics: true }
                            ],
                            color: '#111',
                            border: [false, false, false, false],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            text: shortId,
                            fontSize: 8, bold: true, color: '#222',
                            border: [true, true, true, true],
                            margin: [6, 3, 6, 3],
                            alignment: 'center'
                        }
                    ]]
                },
                layout: {
                    hLineColor: () => '#333',
                    vLineColor: () => '#333',
                    hLineWidth: () => 1,
                    vLineWidth: () => 1,
                },
                margin: [0, 0, 0, 3]
            },

            // THIN DIVIDER
            {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.75, lineColor: '#888' }],
                margin: [0, 0, 0, 12]
            },

            // CERTIFICATION TITLE
            {
                text: 'C E R T I F I C A T I O N',
                fontSize: 16, bold: true, alignment: 'center',
                decoration: 'underline', color: '#111',
                margin: [0, 0, 0, 14]
            },

            // BODY TEXT
            { text: 'TO WHOM IT MAY CONCERN:', bold: true, fontSize: 10, margin: [0, 0, 0, 8] },
            {
                text: '          THIS IS TO CERTIFY that based on our official records, the information provided below is accurate and true to the best of our knowledge.',
                fontSize: 10, alignment: 'justify', margin: [0, 0, 0, 12]
            },

            // DETAILS TABLE — 2-column outer, nested tables for term rows
            {
                table: {
                    widths: [220, '*'],
                    body: tableBody
                },
                layout: {
                    hLineWidth:    () => 0.5,
                    vLineWidth:    () => 0.5,
                    hLineColor:    () => BORDER_CLR,
                    vLineColor:    () => BORDER_CLR,
                    paddingLeft:   () => 0,
                    paddingRight:  () => 0,
                    paddingTop:    () => 0,
                    paddingBottom: () => 0,
                }
            },

            // VERIFICATION CODE STAMP
            {
                columns: [
                    {
                        stack: [
                            {
                                text: 'This document has been officially verified by the CSU Registrar\'s Office.',
                                fontSize: 7.5, italics: true, color: '#555'
                            }
                        ],
                        width: '*'
                    },
                    {
                        stack: [
                            { text: 'Verification Code', fontSize: 7, color: '#777', alignment: 'right' },
                            { text: verCode || '—', fontSize: 11, bold: true, color: GREEN, alignment: 'right', characterSpacing: 2 }
                        ],
                        width: 'auto'
                    }
                ],
                margin: [0, 10, 0, 0]
            }

        ]
    };

    pdfMake.createPdf(docDefinition).open();
}

function enterEditMode(requestId) {
    const req        = allRequests.find(r => r.id === requestId);
    if (!req) return;

    const modalBody   = document.getElementById("modalBody");
    const modalFooter = document.getElementById("modalFooter");

    modalBody.innerHTML = `
        <div class="review-edit-mode" id="reviewViewMode">
            <div class="alert alert-warning py-2 mb-3" style="border-radius:var(--radius-sm);font-size:0.85rem;">
                <i class="bi bi-pencil me-1"></i><strong>Edit Mode</strong> — Modify the details below and click Save Changes.
            </div>
            <div class="row g-3">
                <div class="col-md-6">
                    <label class="form-label nrf-label">Student Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control nrf-input" id="editStudentName">
                </div>
                <div class="col-md-6">
                    <label class="form-label nrf-label">Student Status</label>
                    <select class="form-select nrf-input" id="editStudentStatus">
                        <option value="graduate"      ${req.student_status === "graduate"      ? "selected" : ""}>Graduate</option>
                        <option value="undergraduate" ${req.student_status === "undergraduate" ? "selected" : ""}>Undergraduate</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label class="form-label nrf-label">Degree/Diploma <span class="text-danger">*</span></label>
                    <input type="text" class="form-control nrf-input" id="editDegree">
                </div>
                <div class="col-md-6">
                    <label class="form-label nrf-label">Major/Track</label>
                    <input type="text" class="form-control nrf-input" id="editMajor">
                </div>
                <div class="col-md-6">
                    <label class="form-label nrf-label">Date of Graduation</label>
                    <input type="text" class="form-control nrf-input" id="editGradDate" placeholder="Leave blank if not applicable">
                </div>
                <div class="col-md-3">
                    <label class="form-label nrf-label">Term Started</label>
                    <input type="text" class="form-control nrf-input" id="editTermStarted">
                </div>
                <div class="col-md-3">
                    <label class="form-label nrf-label">School Year Started</label>
                    <input type="text" class="form-control nrf-input" id="editSYStarted">
                </div>
                <div class="col-md-3">
                    <label class="form-label nrf-label">Term Ended</label>
                    <input type="text" class="form-control nrf-input" id="editTermEnded">
                </div>
                <div class="col-md-3">
                    <label class="form-label nrf-label">School Year Ended</label>
                    <input type="text" class="form-control nrf-input" id="editSYEnded">
                </div>
                <div class="col-md-6">
                    <label class="form-label nrf-label">School Name</label>
                    <input type="text" class="form-control nrf-input" id="editSchoolName">
                </div>
                <div class="col-md-6">
                    <label class="form-label nrf-label">School Address</label>
                    <input type="text" class="form-control nrf-input" id="editSchoolAddress">
                </div>
                <div class="col-12"><hr class="my-1"><p class="text-muted mb-1" style="font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">Certificate Details</p></div>
                <div class="col-md-4">
                    <label class="form-label nrf-label">Total Units Earned</label>
                    <input type="text" class="form-control nrf-input" id="editUnitsEarned" placeholder="e.g. 148 or ---">
                </div>
                <div class="col-md-4">
                    <label class="form-label nrf-label">Remarks / Award</label>
                    <input type="text" class="form-control nrf-input" id="editAwardRemarks" placeholder='e.g. Graduate, Cum Laude'>
                </div>
                <div class="col-md-4">
                    <label class="form-label nrf-label">Mode of Study</label>
                    <select class="form-select nrf-input" id="editModeOfStudy">
                        <option value="">— Select —</option>
                        <option value="FACE-to-FACE - FULLTIME">FACE-to-FACE - FULLTIME</option>
                        <option value="FACE-to-FACE - PART-TIME">FACE-to-FACE - PART-TIME</option>
                        <option value="ONLINE">ONLINE</option>
                        <option value="MODULAR">MODULAR</option>
                        <option value="BLENDED">BLENDED</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    document.getElementById("editStudentName").value    = req.student_name        || "";
    document.getElementById("editDegree").value         = req.degree_diploma       || "";
    document.getElementById("editMajor").value          = req.major_track          || "";
    document.getElementById("editGradDate").value       = req.date_of_graduation   || "";
    document.getElementById("editTermStarted").value    = req.term_started         || "";
    document.getElementById("editSYStarted").value      = req.school_year_started  || "";
    document.getElementById("editTermEnded").value      = req.term_ended           || "";
    document.getElementById("editSYEnded").value        = req.school_year_ended    || "";
    document.getElementById("editSchoolName").value     = req.school_name          || "";
    document.getElementById("editSchoolAddress").value  = req.school_address       || "";
    document.getElementById("editUnitsEarned").value    = req.units_earned         || "";
    document.getElementById("editAwardRemarks").value   = req.award_remarks        || "";
    document.getElementById("editModeOfStudy").value    = req.mode_of_study        || "";

    modalFooter.innerHTML = `
        <button class="btn btn-outline-secondary btn-sm me-auto" onclick="cancelEditMode('${req.id}')">
            <i class="bi bi-x-lg me-1"></i>Cancel
        </button>
        <button class="btn btn-primary btn-sm" id="btnSaveDetails" onclick="saveDetails('${req.id}')">
            <i class="bi bi-check-lg me-1"></i>Save Changes
        </button>
    `;
}

function cancelEditMode(requestId) {
    openDetail(requestId);
}

async function saveDetails(requestId) {
    const btn = document.getElementById("btnSaveDetails");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    const updates = {
        student_name:        document.getElementById("editStudentName").value.trim(),
        student_status:      document.getElementById("editStudentStatus").value,
        degree_diploma:      document.getElementById("editDegree").value.trim(),
        major_track:         document.getElementById("editMajor").value.trim(),
        date_of_graduation:  document.getElementById("editGradDate").value.trim()      || null,
        term_started:        document.getElementById("editTermStarted").value.trim(),
        school_year_started: document.getElementById("editSYStarted").value.trim(),
        term_ended:          document.getElementById("editTermEnded").value.trim(),
        school_year_ended:   document.getElementById("editSYEnded").value.trim(),
        school_name:         document.getElementById("editSchoolName").value.trim(),
        school_address:      document.getElementById("editSchoolAddress").value.trim(),
        units_earned:        document.getElementById("editUnitsEarned").value.trim()   || null,
        award_remarks:       document.getElementById("editAwardRemarks").value.trim()  || null,
        mode_of_study:       document.getElementById("editModeOfStudy").value.trim()   || null,
        updated_at:          new Date().toISOString()
    };

    if (!updates.student_name || !updates.degree_diploma) {
        showAlert("Student Name and Degree/Diploma are required.", "danger");
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Save Changes';
        return;
    }

    try {
        const { error } = await supabaseClient
            .from("verification_requests")
            .update(updates)
            .eq("id", requestId);

        if (error) throw error;

        const req = allRequests.find(r => r.id === requestId);
        if (req) Object.assign(req, updates);

        showAlert("Details updated successfully.", "success");
        renderRequests();
        renderRecentRequests();
        openDetail(requestId);
    } catch (error) {
        console.error("Error saving details:", error);
        showAlert("Error saving details: " + escapeHtml(error.message), "danger");
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Save Changes';
    }
}

function onAssessmentChange() {
    const selects       = document.querySelectorAll(".doc-assessment");
    const btnVerified   = document.getElementById("btnVerified");
    const btnNotVerified = document.getElementById("btnNotVerified");
    const banner        = document.getElementById("assessmentBanner");
    const remarksField  = document.getElementById("adminRemarks");

    if (selects.length === 0) {
        if (btnVerified)    btnVerified.disabled    = false;
        if (btnNotVerified) btnNotVerified.disabled = false;
        if (banner)         banner.classList.add("d-none");
        return;
    }

    const values        = Array.from(selects).map(s => s.value);
    const allAssessed   = values.every(v => v !== "");
    const hasTampered   = values.includes("tampered");
    const hasFabricated = values.includes("fabricated");
    const allAuthentic  = allAssessed && !hasTampered && !hasFabricated;
    const hasProblematic = hasTampered || hasFabricated;

    selects.forEach(select => {
        const card = select.closest(".doc-card");
        if (!card) return;
        card.classList.remove("border-success", "border-danger", "border-warning");
        if (select.value === "authentic")   card.classList.add("border-success");
        else if (select.value === "tampered")   card.classList.add("border-warning");
        else if (select.value === "fabricated") card.classList.add("border-danger");
    });

    if (!allAssessed) {
        if (btnVerified)    btnVerified.disabled    = true;
        if (btnNotVerified) btnNotVerified.disabled = true;
        const assessed = values.filter(v => v !== "").length;
        banner.className = "alert alert-info mt-3 mb-0";
        banner.innerHTML = `<i class="bi bi-info-circle me-2"></i>Please assess all documents before proceeding. (${assessed}/${selects.length} assessed)`;
        banner.classList.remove("d-none");
    } else if (hasProblematic) {
        if (btnVerified)    btnVerified.disabled    = true;
        if (btnNotVerified) btnNotVerified.disabled = false;
        const issues = [];
        if (hasTampered)   issues.push("tampered");
        if (hasFabricated) issues.push("fabricated");
        banner.className = "alert alert-danger mt-3 mb-0";
        banner.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i>Documents flagged as <strong>${escapeHtml(issues.join(" and "))}</strong>. This request can only be marked as <strong>Not Verified</strong>.`;
        banner.classList.remove("d-none");
        if (remarksField && !remarksField.value.trim()) {
            const flagged = Array.from(selects)
                .filter(s => s.value === "tampered" || s.value === "fabricated")
                .map(s => `${s.dataset.fileName} (${s.value})`)
                .join(", ");
            remarksField.value = `Document(s) flagged: ${flagged}`;
        }
    } else if (allAuthentic) {
        if (btnVerified)    btnVerified.disabled    = false;
        if (btnNotVerified) btnNotVerified.disabled = false;
        banner.className = "alert alert-success mt-3 mb-0";
        banner.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i>All documents assessed as <strong>authentic</strong>. Ready for verification.`;
        banner.classList.remove("d-none");
    }
}

function collectAssessments() {
    const selects     = document.querySelectorAll(".doc-assessment");
    const assessments = [];
    selects.forEach(select => {
        if (select.value) {
            assessments.push({
                file_name:  select.dataset.fileName,
                assessment: select.value
            });
        }
    });
    return assessments;
}

async function updateStatus(requestId, newStatus) {
    const remarks      = document.getElementById("adminRemarks").value.trim();
    const assessments  = collectAssessments();
    const unitsEarned  = (document.getElementById("certUnitsEarned")?.value  || "").trim();
    const awardRemarks = (document.getElementById("certAwardRemarks")?.value || "").trim();
    const modeOfStudy  = (document.getElementById("certModeOfStudy")?.value  || "").trim();

    try {
        const payload = {
            status:              newStatus,
            admin_remarks:       remarks      || null,
            units_earned:        unitsEarned  || null,
            award_remarks:       awardRemarks || null,
            mode_of_study:       modeOfStudy  || null,
            document_assessment: assessments.length > 0 ? assessments : null,
            updated_at:          new Date().toISOString()
        };

        // When verifying from the review modal, also save verifier date
        if (newStatus === "verified") {
            payload.date_of_verification = new Date().toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric"
            });
        }

        const req = allRequests.find(r => r.id === requestId);
        const oldStatus = req ? req.status : null;

        const { error } = await supabaseClient
            .from("verification_requests")
            .update(payload)
            .eq("id", requestId);

        if (error) throw error;

        // Audit log — non-blocking
        insertAuditLog(
            requestId,
            "status_changed",
            { status: oldStatus },
            { status: newStatus, admin_remarks: payload.admin_remarks || null },
            `Marked as "${newStatus}" by ${_adminDisplayName}`
        );

        if (req) {
            req.status              = newStatus;
            req.admin_remarks       = remarks      || null;
            req.units_earned        = unitsEarned  || null;
            req.award_remarks       = awardRemarks || null;
            req.mode_of_study       = modeOfStudy  || null;
            req.document_assessment = assessments.length > 0 ? assessments : null;
            if (newStatus === "verified") req.date_of_verification = payload.date_of_verification;
        }

        const modal = bootstrap.Modal.getInstance(document.getElementById("reviewModal"));
        modal.hide();

        updateCounts();
        renderRequests();
        renderRecentRequests();

        const statusLabel = newStatus === "verified" ? "Verified" : "Not Verified";
        showAlert(`Request marked as "${statusLabel}" successfully.`, "success");
    } catch (error) {
        console.error("Error updating status:", error);
        showAlert("Error updating status: " + escapeHtml(error.message), "danger");
    }
}

let _studentsDebounceTimer = null;

function debouncedStudentSearch(term) {
    const clearBtn = document.getElementById("studentsClearBtn");
    if (clearBtn) {
        clearBtn.classList.toggle("visible", term.trim().length > 0);
    }
    clearTimeout(_studentsDebounceTimer);
    _studentsDebounceTimer = setTimeout(() => {
        studentSearchTerm = term.trim().toLowerCase();
        renderStudentsTable();
    }, 150);
}

function clearStudentSearch() {
    const input = document.getElementById("studentsSearchInput");
    if (input) input.value = "";
    const clearBtn = document.getElementById("studentsClearBtn");
    if (clearBtn) clearBtn.classList.remove("visible");
    studentSearchTerm = "";
    renderStudentsTable();
    if (input) input.focus();
}

async function loadStudents() {
    const tbody = document.getElementById("studentsTable");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted">
        <span class="spinner-border spinner-border-sm me-2"></span>Loading students...
    </td></tr>`;

    try {
        // Load all users with role = 'user'
        const { data: users, error: usersError } = await supabaseClient
            .from("users")
            .select("id, email, display_name, created_at")
            .eq("role", "user")
            .order("created_at", { ascending: false });

        if (usersError) throw usersError;

        // For each user, count their requests from allRequests (already loaded)
        allStudents = (users || []).map(u => {
            const userReqs    = allRequests.filter(r => r.user_id === u.id);
            const totalReqs   = userReqs.length;
            const pendingReqs     = userReqs.filter(r => r.status === "pending" || r.status === "under_review").length;
            const verifiedReqs    = userReqs.filter(r => r.status === "verified").length;
            const notVerifiedReqs = userReqs.filter(r => r.status === "not_verified").length;
            return { ...u, totalReqs, pendingReqs, verifiedReqs, notVerifiedReqs };
        });

        renderStudentsTable();
    } catch (error) {
        console.error("Error loading students:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle me-2"></i>Error: ${escapeHtml(error.message)}
        </td></tr>`;
    }
}

function renderStudentsTable() {
    const tbody = document.getElementById("studentsTable");
    if (!tbody) return;

    let filtered = [...allStudents];

    if (studentSearchTerm) {
        filtered = filtered.filter(u =>
            (u.display_name && u.display_name.toLowerCase().includes(studentSearchTerm)) ||
            (u.email && u.email.toLowerCase().includes(studentSearchTerm))
        );
    }

    if (filtered.length === 0) {
        const msg = studentSearchTerm
            ? `<i class="bi bi-search fs-3 d-block mb-2 opacity-50"></i>No students found for "<strong>${escapeHtml(studentSearchTerm)}</strong>".`
            : `<i class="bi bi-people fs-3 d-block mb-2 opacity-50"></i>No registered students yet.`;
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const joinedDate = u.created_at
            ? new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "N/A";
        const safeName = escapeHtml(u.display_name || "");
        return `
            <tr style="cursor:pointer;" title="Click to view requests for ${safeName}"
                data-user-id="${escapeHtml(u.id)}" data-display-name="${safeName}"
                onclick="viewStudentRequests(this.dataset.userId, this.dataset.displayName)">
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <div class="student-avatar-mini">
                            <i class="bi bi-person-circle"></i>
                        </div>
                        <span style="font-weight:600;">${safeName || "—"}</span>
                    </div>
                </td>
                <td style="color:var(--gray-600); font-size:0.875rem;">${escapeHtml(u.email)}</td>
                <td class="text-center"><span class="fw-600" style="font-weight:600;">${u.totalReqs}</span></td>
                <td class="text-center">
                    ${u.pendingReqs > 0
                        ? `<span class="badge badge-pending" style="font-size:0.72rem;">${u.pendingReqs}</span>`
                        : `<span class="text-muted" style="font-size:0.82rem;">—</span>`}
                </td>
                <td class="text-center">
                    ${u.verifiedReqs > 0
                        ? `<span class="badge badge-verified" style="font-size:0.72rem;">${u.verifiedReqs}</span>`
                        : `<span class="text-muted" style="font-size:0.82rem;">—</span>`}
                </td>
                <td class="text-center">
                    ${u.notVerifiedReqs > 0
                        ? `<span class="badge badge-not-verified" style="font-size:0.72rem;">${u.notVerifiedReqs}</span>`
                        : `<span class="text-muted" style="font-size:0.82rem;">—</span>`}
                </td>
                <td style="font-size:0.875rem; color:var(--gray-500);">${joinedDate}</td>
                <td class="text-end" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-outline-secondary" style="font-size:0.75rem; padding:2px 10px; border-radius:50px;"
                        data-user-id="${escapeHtml(u.id)}" data-display-name="${safeName}"
                        onclick="viewStudentRequests(this.dataset.userId, this.dataset.displayName)">
                        View <i class="bi bi-arrow-right ms-1"></i>
                    </button>
                </td>
            </tr>`;
    }).join("");
}

function viewStudentRequests(userId, displayName) {
    filterByUserId = userId;
    searchTerm = "";
    navigateTo("requests");
    const input = document.getElementById("searchInput");
    if (input) input.value = displayName || "";
    renderRequests();
}

function exportStudentsCSV() {
    if (allStudents.length === 0) {
        showAlert("No students to export.", "warning");
        return;
    }
    function csvCell(val) {
        const str = String(val ?? "").replace(/"/g, '""');
        return `"${str}"`;
    }
    const headers = ["Name", "Email", "Total Requests", "Pending", "Verified", "Not Verified", "Joined Date"];
    const rows = allStudents.map(u => [
        csvCell(u.display_name),
        csvCell(u.email),
        csvCell(u.totalReqs),
        csvCell(u.pendingReqs),
        csvCell(u.verifiedReqs),
        csvCell(u.notVerifiedReqs),
        csvCell(u.created_at ? new Date(u.created_at).toLocaleDateString() : "")
    ].join(","));
    const csv  = [headers.map(h => csvCell(h)).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert("Students exported to CSV.", "success");
}

async function loadStudentRecords() {
    try {
        const { data, error } = await supabaseClient
            .from("student_records")
            .select("*")
            .order("student_name", { ascending: true });

        if (error) throw error;
        allStudentRecords = data || [];
        renderStudentRecords();
        populateReportFilters();
        populateSrSchoolYearFilter();
    } catch (error) {
        console.error("Error loading student records:", error);
        allStudentRecords = [];
        showAlert("Error loading student records: " + escapeHtml(error.message), "danger");
    }
}

function debouncedSrSearch(term) {
    const clearBtn = document.getElementById("srClearBtn");
    if (clearBtn) clearBtn.classList.toggle("visible", term.trim().length > 0);
    clearTimeout(_srSearchTimer);
    _srSearchTimer = setTimeout(() => {
        srSearchTerm = term.trim().toLowerCase();
        renderStudentRecords();
    }, 150);
}

function clearSrSearch() {
    const input = document.getElementById("srSearchInput");
    if (input) input.value = "";
    const clearBtn = document.getElementById("srClearBtn");
    if (clearBtn) clearBtn.classList.remove("visible");
    srSearchTerm = "";
    renderStudentRecords();
    if (input) input.focus();
}

function renderStudentRecords() {
    const tbody      = document.getElementById("srTableBody");
    const footer     = document.getElementById("srTableFooter");
    const countLabel = document.getElementById("srRecordCount");
    if (!tbody) return;

    const statusFilter   = (document.getElementById("srStatusFilter")   || {}).value || "";
    const remarksFilter  = (document.getElementById("srRemarksFilter")  || {}).value || "";
    const schoolYearFilter = (document.getElementById("srSchoolYearFilter") || {}).value || "";

    let filtered = [...allStudentRecords];

    if (srSearchTerm) {
        filtered = filtered.filter(r =>
            (r.student_name && r.student_name.toLowerCase().includes(srSearchTerm)) ||
            (r.student_id   && r.student_id.toLowerCase().includes(srSearchTerm))
        );
    }
    if (statusFilter) {
        filtered = filtered.filter(r => r.status === statusFilter);
    }
    if (remarksFilter) {
        filtered = filtered.filter(r => (r.remarks || "").toLowerCase() === remarksFilter.toLowerCase());
    }
    if (schoolYearFilter) {
        filtered = filtered.filter(r =>
            r.school_year_ended === schoolYearFilter ||
            r.school_year       === schoolYearFilter
        );
    }

    if (filtered.length === 0) {
        const msg = srSearchTerm || statusFilter
            ? `<i class="bi bi-search fs-3 d-block mb-2 opacity-50"></i>No records match the current filter.`
            : `<i class="bi bi-database fs-3 d-block mb-2 opacity-50"></i>No student records yet. Upload a CSV to get started.`;
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">${msg}</td></tr>`;
        if (footer)     footer.style.display = "none";
        return;
    }

    const remarksStyles = {
        "cum laude":       "background:#fef3c7;color:#92400e;border:1px solid #fde68a;",
        "magna cum laude": "background:#ddd6fe;color:#5b21b6;border:1px solid #c4b5fd;",
        "summa cum laude": "background:#fce7f3;color:#9d174d;border:1px solid #fbcfe8;",
        "with honors":     "background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;",
        "with high honors":"background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;",
        "graduate":        "background:rgba(163, 22, 33,0.10);color:var(--csu-green);"
    };

    tbody.innerHTML = filtered.map(r => {
        const remarksKey = (r.remarks || "").toLowerCase();
        const remarksStyle = remarksStyles[remarksKey] || "background:var(--gray-100);color:var(--gray-600);";
        const remarksBadge = r.remarks
            ? `<span class="badge" style="${remarksStyle} font-weight:600; font-size:0.72rem; text-transform:capitalize;">${escapeHtml(r.remarks)}</span>`
            : `<span style="color:var(--gray-400); font-size:0.82rem;">—</span>`;

        // Show last name bold + first name below when split columns available
        const namePrimary   = r.last_name  || r.student_name || "—";
        const nameSecondary = r.first_name || "";
        const nameCell = `<div style="font-weight:600; font-size:0.88rem; line-height:1.3;">${escapeHtml(namePrimary)}</div>${nameSecondary ? `<div style="font-size:0.78rem; color:var(--gray-500);">${escapeHtml(nameSecondary)}</div>` : ""}`;

        return `
        <tr>
            <td>${nameCell}</td>
            <td style="font-size:0.85rem; color:var(--gray-600); white-space:nowrap;">${escapeHtml(r.student_id || "—")}</td>
            <td style="font-size:0.85rem;">${escapeHtml(r.program || "—")}</td>
            <td style="font-size:0.85rem; color:var(--gray-600);">${escapeHtml(r.major || "—")}</td>
            <td>${remarksBadge}</td>
            <td style="font-size:0.85rem; white-space:nowrap; color:var(--gray-600);">${escapeHtml(r.date_of_graduation || "—")}</td>
            <td class="sr-actions-cell">
                <button
                    class="sr-action-btn btn-edit me-1"
                    title="Edit record"
                    onclick="openEditStudentModal('${r.id}')"
                >
                    <i class="bi bi-pencil-fill"></i>
                </button>
                <button
                    class="sr-action-btn btn-delete"
                    title="Delete record"
                    onclick="deleteStudentRecord('${r.id}')"
                >
                    <i class="bi bi-trash3-fill"></i>
                </button>
            </td>
        </tr>`;
    }).join("");

    if (footer)     { footer.style.removeProperty("display"); }
    if (countLabel) countLabel.textContent = `${filtered.length} record(s)`;
}

function exportStudentRecordsCSV() {
    if (allStudentRecords.length === 0) {
        showAlert("No student records to export.", "warning");
        return;
    }
    function csvCell(val) {
        const str = String(val ?? "").replace(/"/g, '""');
        return `"${str}"`;
    }
    const headers = ["Student Name", "Student ID", "Program", "Status", "Year Level", "Term", "School Year"];
    const rows = allStudentRecords.map(r => [
        csvCell(r.student_name), csvCell(r.student_id), csvCell(r.program),
        csvCell(r.status), csvCell(r.year_level), csvCell(r.term), csvCell(r.school_year)
    ].join(","));
    const csv  = [headers.map(h => csvCell(h)).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-records-${new Date().toISOString().slice(0, 10)}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert("Student records exported.", "success");
}

/**
 * Open the student record modal in "Add" mode.
 * Clears all form fields and resets the hidden ID input.
 */
function openAddStudentModal() {
    // Reset form fields
    document.getElementById("srModalTitle").textContent = "Add Student Record";
    document.getElementById("srEditId").value           = "";
    document.getElementById("srStudentName").value      = "";
    document.getElementById("srStudentId").value        = "";
    document.getElementById("srProgram").value          = "";
    document.getElementById("srStatus").value           = "";
    document.getElementById("srYearLevel").value        = "";
    document.getElementById("srTerm").value             = "";
    document.getElementById("srSchoolYear").value       = "";

    const modal = new bootstrap.Modal(document.getElementById("studentRecordModal"));
    modal.show();
}

/**
 * Open the student record modal in "Edit" mode.
 * Looks up the record from allStudentRecords by ID (safe — avoids inline JSON in onclick).
 * @param {string} recordId — UUID of the student_records row
 */
function openEditStudentModal(recordId) {
    const record = allStudentRecords.find(r => r.id === recordId);
    if (!record) {
        showAlert("Record not found — please refresh the page.", "danger");
        return;
    }

    document.getElementById("srModalTitle").textContent = "Edit Student Record";
    document.getElementById("srEditId").value           = record.id          || "";
    document.getElementById("srStudentName").value      = record.student_name || "";
    document.getElementById("srStudentId").value        = record.student_id   || "";
    document.getElementById("srProgram").value          = record.program      || "";
    document.getElementById("srStatus").value           = record.status       || "";
    document.getElementById("srYearLevel").value        = record.year_level   || "";
    document.getElementById("srTerm").value             = record.term         || "";
    document.getElementById("srSchoolYear").value       = record.school_year  || "";

    const modal = new bootstrap.Modal(document.getElementById("studentRecordModal"));
    modal.show();
}

/**
 * Save (insert or update) a student record.
 * Reads form values; if srEditId is set → UPDATE, otherwise → INSERT.
 */
async function saveStudentRecord() {
    const editId      = (document.getElementById("srEditId").value || "").trim();
    const studentName = (document.getElementById("srStudentName").value || "").trim();
    const studentId   = (document.getElementById("srStudentId").value || "").trim();
    const program     = (document.getElementById("srProgram").value || "").trim();
    const status      = (document.getElementById("srStatus").value || "").trim();
    const yearLevel   = (document.getElementById("srYearLevel").value || "").trim();
    const term        = (document.getElementById("srTerm").value || "").trim();
    const schoolYear  = (document.getElementById("srSchoolYear").value || "").trim();

    if (!studentName) {
        showAlert("Student Name is required.", "danger");
        return;
    }

    const saveBtn = document.getElementById("srSaveBtn");
    if (saveBtn) {
        saveBtn.disabled    = true;
        saveBtn.innerHTML   = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
    }

    try {
        const payload = {
            student_name: studentName || null,
            student_id:   studentId   || null,
            program:      program     || null,
            status:       status      || null,
            year_level:   yearLevel   || null,
            term:         term        || null,
            school_year:  schoolYear  || null
        };

        if (editId) {
            // UPDATE existing record
            const { error } = await supabaseClient
                .from("student_records")
                .update(payload)
                .eq("id", editId);
            if (error) throw error;
        } else {
            // INSERT new record — include imported_by (current admin)
            const { data: { user } } = await supabaseClient.auth.getUser();
            payload.imported_by = user ? user.id : null;

            const { error } = await supabaseClient
                .from("student_records")
                .insert(payload);
            if (error) throw error;
        }

        // Close modal
        const modalEl = document.getElementById("studentRecordModal");
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();

        // Reload and re-render records
        await loadStudentRecords();

        const action = editId ? "updated" : "added";
        showAlert(`Student record <strong>${escapeHtml(studentName)}</strong> ${action} successfully.`, "success");
    } catch (error) {
        console.error("Error saving student record:", error);
        showAlert("Error saving record: " + escapeHtml(error.message), "danger");
    } finally {
        if (saveBtn) {
            saveBtn.disabled  = false;
            saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Save Record';
        }
    }
}

/**
 * Delete a student record after user confirmation.
 * @param {string} id — UUID of the student_records row
 */
function deleteStudentRecord(id) {
    _deleteStudentRecordId = id;
    const rec = allStudentRecords.find(r => r.id === id);
    const targetEl = document.getElementById("deleteStudentRecordTarget");
    if (targetEl && rec) {
        targetEl.textContent = `"${rec.student_name || "Unknown"}" — ID: ${rec.student_id || "—"}`;
    }
    const modal = new bootstrap.Modal(document.getElementById("deleteStudentRecordModal"));
    modal.show();
}

async function confirmDeleteStudentRecord() {
    const id = _deleteStudentRecordId;
    if (!id) return;

    const btn = document.getElementById("btnConfirmDeleteStudentRecord");
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Deleting...'; }

    try {
        const { error } = await supabaseClient
            .from("student_records")
            .delete()
            .eq("id", id);

        if (error) throw error;

        allStudentRecords = allStudentRecords.filter(r => r.id !== id);
        renderStudentRecords();
        populateReportFilters();

        const modalEl = document.getElementById("deleteStudentRecordModal");
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();

        showAlert("Student record deleted successfully.", "success");
    } catch (error) {
        console.error("Error deleting student record:", error);
        showAlert("Error deleting record: " + escapeHtml(error.message), "danger");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-trash3 me-1"></i>Yes, Delete'; }
        _deleteStudentRecordId = null;
    }
}

function switchRecordsTab(tabName) {
    const tabs = ["student-list", "upload-csv", "reports"];
    tabs.forEach(t => {
        const panel = document.getElementById("recordsTab-" + t);
        const btn   = document.getElementById("rtab" + t.split("-").map(w => capitalize(w)).join(""));
        if (panel) panel.classList.toggle("d-none", t !== tabName);
        if (btn)   btn.classList.toggle("active",   t === tabName);
    });

    // Lazy-load data when switching to reports
    if (tabName === "reports") {
        renderReport1();
        renderReport2();
        renderReport3();
        renderEnrollmentChart();
    }
}

function saveImportHistory(imported, skipped, adminEmail) {
    const record = {
        date:    new Date().toISOString(),
        imported,
        skipped,
        admin:   adminEmail || "admin"
    };
    localStorage.setItem("lastCsvImport", JSON.stringify(record));
    renderImportHistory();
}

function renderImportHistory() {
    const strip = document.getElementById("importHistoryStrip");
    if (!strip) return;
    const raw = localStorage.getItem("lastCsvImport");
    if (!raw) { strip.classList.add("d-none"); return; }
    try {
        const { date, imported, skipped, admin } = JSON.parse(raw);
        const d = new Date(date);
        const fmt = d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
        strip.innerHTML = `<i class="bi bi-clock-history me-1"></i><strong>Last import:</strong> ${escapeHtml(fmt)} — ${imported} record${imported !== 1 ? "s" : ""} added, ${skipped} skipped — by ${escapeHtml(admin)}`;
        strip.classList.remove("d-none");
    } catch { strip.classList.add("d-none"); }
}

function downloadCsvTemplate() {
    const header = `ID,Lastname,Firstname & MiddleName,Course,Major,Date of Graduation,Units Earned,Remarks,Term Started in CSU,School Year Started in CSU,Term Ended in CSU,School Year Ended in CSU,Date of Verification`;
    const ex1    = `2019-00101,DELA CRUZ,JUAN PEDRO M.,Bachelor of Science in Information Technology,Web Development,April 05 2023,148,Cum Laude,1st Semester,2019-2020,2nd Semester,2022-2023,March 05 2026`;
    const ex2    = `2019-00102,REYES,MARIA CLAIRE B.,Bachelor of Science in Nursing,---,April 05 2023,148,Graduate,1st Semester,2019-2020,2nd Semester,2022-2023,March 05 2026`;
    const csv    = [header, ex1, ex2].join("\n");
    const blob   = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href       = url;
    a.download   = "CSU-student-records-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function csvDragOver(e) {
    e.preventDefault();
    document.getElementById("csvDropArea").classList.add("drag-over");
}
function csvDragLeave(e) {
    document.getElementById("csvDropArea").classList.remove("drag-over");
}
function csvDrop(e) {
    e.preventDefault();
    document.getElementById("csvDropArea").classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleCsvFile(file);
}

function handleCsvFile(file) {
    if (!file || !file.name.toLowerCase().endsWith(".csv")) {
        showAlert("Please upload a valid .csv file.", "warning");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        parseCsv(text);
    };
    reader.readAsText(file);
}

/**
 * Parse CSV text into headers + data rows.
 * Handles quoted fields and commas within quotes.
 */
function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
        showAlert("CSV must have at least a header row and one data row.", "warning");
        return;
    }

    function parseLine(line) {
        const result = [];
        let cur   = "";
        let inQ   = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === "," && !inQ) {
                result.push(cur.trim());
                cur = "";
            } else {
                cur += ch;
            }
        }
        result.push(cur.trim());
        return result;
    }

    csvHeaders  = parseLine(lines[0]);
    csvParsedRows = lines.slice(1).map(l => {
        const vals = parseLine(l);
        const obj  = {};
        csvHeaders.forEach((h, i) => { obj[h] = vals[i] || ""; });
        return obj;
    });

    // Show preview table (first 10 rows)
    showCsvPreview();
    // Show column mapping panel
    showCsvMapping();
}

function showCsvPreview() {
    const previewSection = document.getElementById("csvPreviewSection");
    const previewHead    = document.getElementById("csvPreviewHead");
    const previewBody    = document.getElementById("csvPreviewBody");
    const totalLabel     = document.getElementById("csvTotalRowsLabel");

    if (!previewSection) return;
    previewSection.classList.remove("d-none");

    if (totalLabel) totalLabel.textContent = `${csvParsedRows.length} total rows`;

    previewHead.innerHTML = `<tr><th class="csv-row-num">#</th>${csvHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;

    const preview = csvParsedRows.slice(0, 10);
    previewBody.innerHTML = preview.map((row, i) =>
        `<tr><td class="csv-row-num">${i + 2}</td>${csvHeaders.map(h => `<td>${escapeHtml(row[h] || "")}</td>`).join("")}</tr>`
    ).join("");
}

function showCsvMapping() {
    const panel = document.getElementById("csvMappingPanel");
    const fields = document.getElementById("csvMappingFields");
    if (!panel || !fields) return;
    panel.style.display = "";

    // DB fields to map
    const dbFields = [
        { key: "student_name",         label: "Student Name (single column)",           required: false },
        { key: "last_name",            label: "Last Name (separate column)",             required: false },
        { key: "first_name",           label: "First Name + Middle (separate column)",   required: false },
        { key: "student_id",           label: "Student ID",                              required: false },
        { key: "program",              label: "Program / Course",                        required: false },
        { key: "major",                label: "Major",                                   required: false },
        { key: "status",               label: "Status (graduate/undergraduate/transferee/dropout)", required: false },
        { key: "date_of_graduation",   label: "Date of Graduation",                      required: false },
        { key: "units_earned",         label: "Units Earned",                            required: false },
        { key: "remarks",              label: "Remarks / Award",                         required: false },
        { key: "year_level",           label: "Year Level",                              required: false },
        { key: "term_started",         label: "Term Started in CSU",                     required: false },
        { key: "school_year_started",  label: "School Year Started in CSU",              required: false },
        { key: "term_ended",           label: "Term Ended in CSU",                       required: false },
        { key: "school_year_ended",    label: "School Year Ended in CSU",                required: false },
        { key: "term",                 label: "Term (generic / legacy)",                 required: false },
        { key: "school_year",          label: "School Year (generic / legacy)",          required: false },
        { key: "date_of_verification", label: "Date of Verification",                    required: false }
    ];

    // Known aliases for the official CSU CSV format — maps DB keys to official CSV header names
    const KNOWN_ALIASES = {
        last_name:            ["Lastname", "Last Name", "LASTNAME"],
        first_name:           ["Firstname & MiddleName", "Firstname & Middle Name", "First Name & Middle Name"],
        student_id:           ["ID", "Student ID", "StudentID"],
        program:              ["Course", "Program", "Degree"],
        major:                ["Major", "Major/Track"],
        date_of_graduation:   ["Date of Graduation", "Graduation Date"],
        units_earned:         ["Units Earned", "Units"],
        remarks:              ["Remarks", "Award", "Remarks / Award"],
        term_started:         ["Term Started in CSU", "Term Started"],
        school_year_started:  ["School Year Started in CSU", "School Year Started", "SY Started"],
        term_ended:           ["Term Ended in CSU", "Term Ended"],
        school_year_ended:    ["School Year Ended in CSU", "School Year Ended", "SY Ended"],
        date_of_verification: ["Date of Verification", "Verification Date"]
    };

    // Auto-detect: check aliases first, then fall back to name similarity
    function autoDetect(dbKey) {
        const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        // 1. Check known aliases (exact match)
        const aliases = KNOWN_ALIASES[dbKey] || [];
        for (const alias of aliases) {
            const found = csvHeaders.find(h => h.trim() === alias);
            if (found) return found;
        }
        // 2. Fallback: normalized similarity
        const normalized = normalize(dbKey);
        return csvHeaders.find(h => normalize(h) === normalized) ||
               csvHeaders.find(h => normalize(h).includes(normalized)) || "";
    }

    // Show a hint when both last_name and first_name are auto-detected (name split mode)
    const hasLastCol  = !!autoDetect("last_name");
    const hasFirstCol = !!autoDetect("first_name");
    const showSplitHint = hasLastCol && hasFirstCol;

    const splitHintHtml = showSplitHint
        ? `<div class="alert alert-info py-2 px-3 mb-3" style="font-size:0.8rem;">
               <i class="bi bi-info-circle me-1"></i>
               <strong>Split name columns detected.</strong> Last Name and First Name columns will be combined into Student Name automatically. Leave "Student Name (single column)" as <em>-- Skip --</em>.
           </div>`
        : "";

    fields.innerHTML = splitHintHtml + dbFields.map(f => {
        const detected = autoDetect(f.key);
        return `
            <div class="row g-1 mb-2 align-items-center">
                <div class="col-5">
                    <label class="form-label mb-0" style="font-size:0.82rem; font-weight:600;">${escapeHtml(f.label)} ${f.required ? '<span class="text-danger">*</span>' : ''}</label>
                </div>
                <div class="col-7">
                    <select class="form-select form-select-sm" id="map_${f.key}" onchange="runCsvValidation()">
                        <option value="">-- Skip --</option>
                        ${csvHeaders.map(h => `<option value="${escapeHtml(h)}" ${h === detected ? "selected" : ""}>${escapeHtml(h)}</option>`).join("")}
                    </select>
                </div>
            </div>`;
    }).join("");

    // Run initial validation after mapping is rendered
    setTimeout(runCsvValidation, 0);
}

/**
 * Run a validation pass over csvParsedRows and render a summary card
 * inside #csvValidationCard (inside the mapping panel).
 */
function runCsvValidation() {
    const card = document.getElementById("csvValidationCard");
    if (!card || csvParsedRows.length === 0) return;

    const statusValues = ["graduate", "undergraduate", "transferee", "dropout"];
    const idPattern    = /^\d{4}-\d{5}$/;
    const syPattern    = /^\d{4}-\d{4}$/;

    let ready   = 0;
    const warns = [];
    const errs  = [];

    // Collect current mappings at validation time
    const getMap = (key) => {
        const el = document.getElementById("map_" + key);
        return el ? el.value : "";
    };

    csvParsedRows.forEach((row, i) => {
        const rowNum = i + 2; // 1-indexed, row 1 is header
        const lnCol  = getMap("last_name");
        const fnCol  = getMap("first_name");
        const snCol  = getMap("student_name");
        const idCol  = getMap("student_id");
        const stCol  = getMap("status");
        const syCol  = getMap("school_year_started") || getMap("school_year_ended");
        const uCol   = getMap("units_earned");

        const name = snCol ? (row[snCol] || "").trim()
            : [lnCol ? (row[lnCol] || "").trim() : "", fnCol ? (row[fnCol] || "").trim() : ""].filter(Boolean).join(", ");

        if (!name) {
            errs.push(`Row ${rowNum} — Student name is blank. Row will be skipped.`);
            return;
        }

        const sid = idCol ? (row[idCol] || "").trim() : "";
        if (sid && !idPattern.test(sid)) {
            warns.push(`Row ${rowNum} — Student ID "${escapeHtml(sid)}" does not match expected format YYYY-NNNNN.`);
        }

        const st = stCol ? (row[stCol] || "").trim().toLowerCase() : "";
        if (stCol && st && !statusValues.includes(st)) {
            warns.push(`Row ${rowNum} — Status "${escapeHtml(row[stCol] || "")}" is not a valid value. Will be stored as empty.`);
        }

        const sy = syCol ? (row[syCol] || "").trim() : "";
        if (syCol && sy && sy !== "---" && !syPattern.test(sy)) {
            warns.push(`Row ${rowNum} — School Year "${escapeHtml(sy)}" does not match expected format YYYY-YYYY.`);
        }

        const units = uCol ? (row[uCol] || "").trim() : "";
        if (uCol && units && units !== "---" && isNaN(parseInt(units, 10))) {
            warns.push(`Row ${rowNum} — Units Earned "${escapeHtml(units)}" is not a number.`);
        }

        ready++;
    });

    const warnLines = warns.slice(0, 5).map(w => `<div class="csv-val-detail">· ${w}</div>`).join("");
    const warnMore  = warns.length > 5 ? `<div class="csv-val-detail">· ...and ${warns.length - 5} more warning(s).</div>` : "";
    const errLines  = errs.slice(0, 5).map(e => `<div class="csv-val-detail">· ${e}</div>`).join("");
    const errMore   = errs.length > 5 ? `<div class="csv-val-detail">· ...and ${errs.length - 5} more error(s).</div>` : "";

    card.innerHTML = `
        <div class="csv-validation-card mb-3">
            <div style="font-weight:700; font-size:0.83rem; margin-bottom:8px;">Validation Summary</div>
            <div class="csv-val-row">
                <div class="csv-val-dot csv-val-dot--ok"></div>
                <div>${ready} row${ready !== 1 ? "s" : ""} ready to import</div>
            </div>
            ${warns.length > 0 ? `<div class="csv-val-row">
                <div class="csv-val-dot csv-val-dot--warn"></div>
                <div>${warns.length} row${warns.length !== 1 ? "s" : ""} with warnings (will still be imported)</div>
            </div>${warnLines}${warnMore}` : ""}
            ${errs.length > 0 ? `<div class="csv-val-row">
                <div class="csv-val-dot csv-val-dot--error"></div>
                <div>${errs.length} row${errs.length !== 1 ? "s" : ""} with errors (will be skipped)</div>
            </div>${errLines}${errMore}` : ""}
        </div>`;
    card.classList.remove("d-none");
}

function resetCsvUpload() {
    csvParsedRows  = [];
    csvHeaders     = [];
    csvMappedFields = {};

    const fileInput = document.getElementById("csvFileInput");
    if (fileInput) fileInput.value = "";

    const previewSection = document.getElementById("csvPreviewSection");
    if (previewSection) previewSection.classList.add("d-none");

    const mappingPanel = document.getElementById("csvMappingPanel");
    if (mappingPanel) mappingPanel.style.display = "none";

    const progress = document.getElementById("csvImportProgress");
    if (progress) progress.classList.add("d-none");
}

function toggleReplaceAllBtn() {
    const input = document.getElementById("replaceAllConfirmInput");
    const btn   = document.getElementById("btnConfirmReplaceAll");
    if (btn) btn.disabled = !input || input.value !== "DELETE";
}

async function importCsvRecords() {
    const replaceAll = document.getElementById("replaceAllRecords").checked;

    if (replaceAll) {
        // Show count of records to be deleted
        const countLabel = document.getElementById("replaceAllCountLabel");
        if (countLabel) countLabel.textContent = allStudentRecords.length > 0 ? `all ${allStudentRecords.length}` : "all";
        // Reset the input
        const confirmInput = document.getElementById("replaceAllConfirmInput");
        if (confirmInput) confirmInput.value = "";
        const btn = document.getElementById("btnConfirmReplaceAll");
        if (btn) btn.disabled = true;
        // Show confirmation modal — actual import runs via proceedImport()
        const modal = new bootstrap.Modal(document.getElementById("replaceAllConfirmModal"));
        modal.show();
        return;
    }

    await proceedImport();
}

async function proceedImport() {
    // Dismiss confirmation modal if open
    const modalEl = document.getElementById("replaceAllConfirmModal");
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    // Collect mapping
    const fieldKeys = [
        "student_name", "last_name", "first_name",
        "student_id", "program", "major", "status",
        "date_of_graduation", "units_earned", "remarks", "year_level",
        "term_started", "school_year_started", "term_ended", "school_year_ended",
        "term", "school_year", "date_of_verification"
    ];
    csvMappedFields = {};
    fieldKeys.forEach(key => {
        const el = document.getElementById("map_" + key);
        if (el && el.value) csvMappedFields[key] = el.value;
    });

    if (!csvMappedFields.student_name && !csvMappedFields.last_name && !csvMappedFields.first_name) {
        showAlert("Please map either the <strong>Student Name</strong> column, or both <strong>Last Name</strong> and <strong>First Name</strong> columns before importing.", "danger");
        return;
    }

    if (csvParsedRows.length === 0) {
        showAlert("No data rows found in the CSV.", "warning");
        return;
    }

    const replaceAll = document.getElementById("replaceAllRecords").checked;

    const btn = document.getElementById("btnImportRecords");
    const progressSection = document.getElementById("csvImportProgress");
    const progressBar     = document.getElementById("csvProgressBar");
    const progressLabel   = document.getElementById("csvProgressLabel");

    if (btn) btn.disabled = true;
    if (progressSection) progressSection.classList.remove("d-none");

    try {
        // Get current user ID for imported_by
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (replaceAll) {
            if (progressLabel) progressLabel.textContent = "Deleting existing records...";
            const { error: delError } = await supabaseClient
                .from("student_records")
                .delete()
                .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
            if (delError) throw delError;
        }

        const total = csvParsedRows.length;
        let imported = 0;
        let skippedNoName = 0;
        let skippedDuplicate = 0;

        // Build a Set of existing student_id values for duplicate detection.
        // Only used when NOT replacing all records and student_id column is mapped.
        const existingIds = (!replaceAll && csvMappedFields.student_id)
            ? new Set(allStudentRecords.map(r => r.student_id).filter(Boolean).map(id => id.trim().toLowerCase()))
            : null;

        // Batch insert in chunks of 50
        const BATCH_SIZE = 50;
        const statusValues = ["graduate", "undergraduate", "transferee", "dropout"];

        for (let i = 0; i < csvParsedRows.length; i += BATCH_SIZE) {
            const chunk = csvParsedRows.slice(i, i + BATCH_SIZE);

            const allMapped = chunk.map(row => {
                const rawStatus = (row[csvMappedFields.status] || "").trim().toLowerCase();
                const status    = statusValues.includes(rawStatus) ? rawStatus : null;

                // Normalize a cell value: trim, convert sentinels to null, strip "Major in" prefix
                const col = (key) => {
                    if (!csvMappedFields[key]) return null;
                    let val = (row[csvMappedFields[key]] || "").trim();
                    if (val === "" || val === "---" || val === "N/A" || val === "n/a") return null;
                    if (key === "major") val = val.replace(/^major in\s+/i, "").trim();
                    return val || null;
                };

                // Compose student_name from separate last_name + first_name columns when mapped
                let studentName = null;
                if (csvMappedFields.student_name) {
                    studentName = (row[csvMappedFields.student_name] || "").trim() || null;
                } else if (csvMappedFields.last_name || csvMappedFields.first_name) {
                    const ln = (row[csvMappedFields.last_name]  || "").trim();
                    const fn = (row[csvMappedFields.first_name] || "").trim();
                    studentName = [ln, fn].filter(Boolean).join(", ") || null;
                }

                // Parse units_earned as integer
                const rawUnits = col("units_earned");
                const unitsInt = rawUnits !== null ? parseInt(rawUnits, 10) : null;

                return {
                    student_name:         studentName,
                    last_name:            col("last_name"),
                    first_name:           col("first_name"),
                    student_id:           col("student_id"),
                    program:              col("program"),
                    major:                col("major"),
                    status:               status,
                    date_of_graduation:   col("date_of_graduation"),
                    units_earned:         isNaN(unitsInt) ? null : unitsInt,
                    remarks:              col("remarks"),
                    year_level:           col("year_level"),
                    term_started:         col("term_started"),
                    school_year_started:  col("school_year_started"),
                    term_ended:           col("term_ended"),
                    school_year_ended:    col("school_year_ended"),
                    term:                 col("term"),
                    school_year:          col("school_year"),
                    date_of_verification: col("date_of_verification"),
                    imported_by:          user ? user.id : null
                };
            });

            // Count and remove rows with no name
            skippedNoName += allMapped.filter(r => !r.student_name).length;
            const withNames = allMapped.filter(r => r.student_name);

            // Deduplicate by student_id against existing records and within the CSV itself
            let toInsert = withNames;
            if (existingIds) {
                toInsert = withNames.filter(r => {
                    if (!r.student_id) return true; // no ID to check — allow
                    if (existingIds.has(r.student_id.toLowerCase())) {
                        skippedDuplicate++;
                        return false;
                    }
                    // Add to set so duplicates within the CSV itself are also caught
                    existingIds.add(r.student_id.toLowerCase());
                    return true;
                });
            }

            if (toInsert.length > 0) {
                const { error: insertError } = await supabaseClient
                    .from("student_records")
                    .insert(toInsert);
                if (insertError) throw insertError;
                imported += toInsert.length;
            }

            const processed = i + chunk.length;
            const pct = Math.round((processed / total) * 100);
            if (progressBar)  progressBar.style.width = pct + "%";
            if (progressLabel) progressLabel.textContent = `Importing ${imported} of ${total} records...`;
        }

        // Reload student records
        await loadStudentRecords();

        // Build detailed result message
        let resultMsg = `<strong>${imported}</strong> record${imported !== 1 ? "s" : ""} imported successfully.`;
        if (skippedDuplicate > 0) resultMsg += ` <strong>${skippedDuplicate}</strong> skipped — duplicate Student ID.`;
        if (skippedNoName    > 0) resultMsg += ` <strong>${skippedNoName}</strong> skipped — missing name.`;
        showAlert(resultMsg, imported > 0 ? "success" : "warning");

        // Save import history
        saveImportHistory(imported, skippedDuplicate + skippedNoName, user ? user.email : "admin");

        resetCsvUpload();
        switchRecordsTab("student-list");

    } catch (error) {
        console.error("Import error:", error);
        showAlert("Import failed: " + escapeHtml(error.message), "danger");
    } finally {
        if (btn) btn.disabled = false;
        if (progressSection) progressSection.classList.add("d-none");
    }
}

function populateSrSchoolYearFilter() {
    const el = document.getElementById("srSchoolYearFilter");
    if (!el) return;
    const current = el.value;
    // Collect unique school years from school_year_ended (primary) or school_year (legacy)
    const years = [...new Set(
        allStudentRecords.map(r => r.school_year_ended || r.school_year).filter(Boolean)
    )].sort().reverse();
    el.innerHTML = `<option value="">All School Years</option>` +
        years.map(y => `<option value="${escapeHtml(y)}"${y === current ? " selected" : ""}>${escapeHtml(y)}</option>`).join("");
}

function populateReportFilters() {
    // Collect unique school years
    const schoolYears = [...new Set(allStudentRecords.map(r => r.school_year).filter(Boolean))].sort().reverse();

    function populateSelect(id, years) {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        const opts = ["<option value=''>All School Years</option>", ...years.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`)];
        el.innerHTML = opts.join("");
        if (years.includes(current)) el.value = current;
    }

    populateSelect("rpt1SY", schoolYears);
    populateSelect("rpt2SY", schoolYears);
    populateSelect("rpt3SY", schoolYears);
    populateSelect("chartSYFrom", schoolYears.slice().reverse());
    populateSelect("chartSYTo",  schoolYears);
}

function getFilteredByStatus(status, term, sy) {
    return allStudentRecords.filter(r => {
        if (r.status !== status) return false;
        if (term && r.term !== term) return false;
        if (sy   && r.school_year !== sy) return false;
        return true;
    });
}

function renderReport1() {
    const term = (document.getElementById("rpt1Term") || {}).value || "";
    const sy   = (document.getElementById("rpt1SY")   || {}).value || "";
    const data = getFilteredByStatus("transferee", term, sy);
    const tbody = document.getElementById("rpt1Body");
    if (!tbody) return;
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4"><i class="bi bi-inbox me-2"></i>No transferees found for the selected filter.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(r => `
        <tr>
            <td>${escapeHtml(r.student_name || "—")}</td>
            <td>${escapeHtml(r.program || "—")}</td>
            <td>${escapeHtml(r.term || "—")}</td>
            <td>${escapeHtml(r.school_year || "—")}</td>
        </tr>`).join("");
}

function renderReport2() {
    const term = (document.getElementById("rpt2Term") || {}).value || "";
    const sy   = (document.getElementById("rpt2SY")   || {}).value || "";
    const data = getFilteredByStatus("dropout", term, sy);
    const tbody = document.getElementById("rpt2Body");
    if (!tbody) return;
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4"><i class="bi bi-inbox me-2"></i>No dropouts found for the selected filter.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(r => `
        <tr>
            <td>${escapeHtml(r.student_name || "—")}</td>
            <td>${escapeHtml(r.program || "—")}</td>
            <td>${escapeHtml(r.term || "—")}</td>
            <td>${escapeHtml(r.school_year || "—")}</td>
        </tr>`).join("");
}

function renderReport3() {
    const sy   = (document.getElementById("rpt3SY") || {}).value || "";
    const data = getFilteredByStatus("graduate", "", sy);
    const tbody = document.getElementById("rpt3Body");
    if (!tbody) return;
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4"><i class="bi bi-inbox me-2"></i>No graduates found for the selected filter.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(r => `
        <tr>
            <td>${escapeHtml(r.student_name || "—")}</td>
            <td>${escapeHtml(r.program || "—")}</td>
            <td>${escapeHtml(r.school_year || "—")}</td>
        </tr>`).join("");
}

/**
 * Export a filtered report to CSV.
 * @param {"transferee"|"dropout"|"graduate"} status
 */
function exportReport(status) {
    let term = "", sy = "";
    if (status === "transferee") {
        term = (document.getElementById("rpt1Term") || {}).value || "";
        sy   = (document.getElementById("rpt1SY")   || {}).value || "";
    } else if (status === "dropout") {
        term = (document.getElementById("rpt2Term") || {}).value || "";
        sy   = (document.getElementById("rpt2SY")   || {}).value || "";
    } else if (status === "graduate") {
        sy   = (document.getElementById("rpt3SY") || {}).value || "";
    }

    const data = getFilteredByStatus(status, term, sy);
    if (data.length === 0) {
        showAlert("No data to export for the current filter.", "warning");
        return;
    }

    function csvCell(val) {
        const str = String(val ?? "").replace(/"/g, '""');
        return `"${str}"`;
    }

    const includesTerm = status !== "graduate";
    const headers = includesTerm
        ? ["Student Name", "Program", "Term", "School Year"]
        : ["Student Name", "Program", "School Year"];

    const rows = data.map(r => {
        const base = [csvCell(r.student_name), csvCell(r.program)];
        if (includesTerm) base.push(csvCell(r.term));
        base.push(csvCell(r.school_year));
        return base.join(",");
    });

    const csv  = [headers.map(h => csvCell(h)).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${status}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert(`Exported ${data.length} record(s).`, "success");
}

/** Render enrollment trend bar chart using Chart.js (Part 3d — Report 4). */
function renderEnrollmentChart() {
    const fromSY = (document.getElementById("chartSYFrom") || {}).value || "";
    const toSY   = (document.getElementById("chartSYTo")   || {}).value || "";

    // Collect all unique school years sorted ascending
    let schoolYears = [...new Set(allStudentRecords.map(r => r.school_year).filter(Boolean))].sort();

    // Apply range filter
    if (fromSY) schoolYears = schoolYears.filter(y => y >= fromSY);
    if (toSY)   schoolYears = schoolYears.filter(y => y <= toSY);

    const terms = ["1st Semester", "2nd Semester", "Summer"];

    // Build labels: "1st Sem YYYY-YYYY"
    const labels = [];
    const counts = [];

    schoolYears.forEach(sy => {
        terms.forEach(term => {
            const count = allStudentRecords.filter(r => r.school_year === sy && r.term === term).length;
            if (count > 0) {
                const shortTerm = term === "1st Semester" ? "1st Sem" : term === "2nd Semester" ? "2nd Sem" : "Summer";
                labels.push(`${shortTerm} ${sy}`);
                counts.push(count);
            }
        });
    });

    const noDataEl = document.getElementById("chartNoData");
    const canvas   = document.getElementById("enrollmentChart");

    if (labels.length === 0) {
        if (noDataEl) noDataEl.style.display = "";
        if (canvas)   canvas.style.display   = "none";
        return;
    }

    if (noDataEl) noDataEl.style.display = "none";
    if (canvas)   canvas.style.display   = "";

    // Destroy previous chart instance if it exists
    if (enrollmentChartInstance) {
        enrollmentChartInstance.destroy();
        enrollmentChartInstance = null;
    }

    const ctx = canvas.getContext("2d");
    enrollmentChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Number of Students",
                data:  counts,
                backgroundColor: "rgba(163, 22, 33, 0.78)",
                borderColor:     "#A31621",
                borderWidth:     1.5,
                borderRadius:    6,
                hoverBackgroundColor: "#FFC72C"
            }]
        },
        options: {
            responsive:          true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y} student(s)`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0, font: { family: "Inter", size: 12 } },
                    grid:  { color: "rgba(0,0,0,0.05)" }
                },
                x: {
                    ticks: { font: { family: "Inter", size: 11 }, maxRotation: 45 },
                    grid:  { display: false }
                }
            }
        }
    });
}

/**
 * Export the Enrollment Trends chart as a PDF via the browser print dialog.
 * Steps:
 *  1. Capture the Chart.js canvas as a base64 PNG image.
 *  2. Build a table of the raw data (school year × term × count).
 *  3. Open a new window with a CSU letterhead, the chart image, and the data table.
 *  4. Call window.print() — the user can then "Save as PDF" from the dialog.
 */
function printEnrollmentChart() {
    const canvas = document.getElementById("enrollmentChart");
    if (!canvas || (canvas.style.display === "none")) {
        showAlert("No chart data to export. Please load student records first.", "warning");
        return;
    }

    // Capture chart as PNG data URL
    const imgDataUrl = canvas.toDataURL("image/png");

    // Rebuild the chart data labels + counts for the data table
    const fromSY = (document.getElementById("chartSYFrom") || {}).value || "";
    const toSY   = (document.getElementById("chartSYTo")   || {}).value || "";

    let schoolYears = [...new Set(allStudentRecords.map(r => r.school_year).filter(Boolean))].sort();
    if (fromSY) schoolYears = schoolYears.filter(y => y >= fromSY);
    if (toSY)   schoolYears = schoolYears.filter(y => y <= toSY);

    const terms = ["1st Semester", "2nd Semester", "Summer"];

    const tableRows = [];
    let grandTotal = 0;
    schoolYears.forEach(sy => {
        terms.forEach(term => {
            const count = allStudentRecords.filter(r => r.school_year === sy && r.term === term).length;
            if (count > 0) {
                tableRows.push({ sy, term, count });
                grandTotal += count;
            }
        });
    });

    if (tableRows.length === 0) {
        showAlert("No data available to export.", "warning");
        return;
    }

    const today = new Date().toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric"
    });

    const rangeLabel = fromSY || toSY
        ? `${fromSY || "All"} to ${toSY || "All"}`
        : "All School Years";

    const dataTableHtml = tableRows.map(row => `
        <tr>
            <td>${row.sy}</td>
            <td>${row.term}</td>
            <td style="text-align:right; font-weight:600;">${row.count}</td>
        </tr>`).join("");

    const printWindow = window.open("", "_blank", "width=900,height=750");
    if (!printWindow) {
        showAlert("Pop-up blocked. Please allow pop-ups to export the PDF.", "warning");
        return;
    }

    printWindow.document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Enrollment Trends Report — CSU</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12pt;
            color: #111;
            background: #fff;
            padding: 50px 60px;
            max-width: 900px;
            margin: 0 auto;
            line-height: 1.6;
        }
        .letterhead {
            text-align: center;
            border-bottom: 3px double #A31621;
            padding-bottom: 16px;
            margin-bottom: 24px;
        }
        .letterhead .univ-name {
            font-size: 15pt;
            font-weight: bold;
            color: #A31621;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .letterhead .office-name {
            font-size: 11pt;
            color: #333;
            margin-top: 3px;
        }
        .letterhead .address {
            font-size: 9pt;
            color: #666;
            margin-top: 2px;
        }
        .report-title {
            font-size: 13pt;
            font-weight: 700;
            color: #A31621;
            text-align: center;
            margin-bottom: 4px;
        }
        .report-meta {
            font-size: 9pt;
            color: #666;
            text-align: center;
            margin-bottom: 20px;
        }
        .chart-section {
            width: 100%;
            margin-bottom: 24px;
            text-align: center;
        }
        .chart-section img {
            width: 100%;
            max-width: 780px;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
        }
        .section-heading {
            font-size: 10pt;
            font-weight: 700;
            color: #6B0E16;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #A31621;
            padding-bottom: 4px;
            margin-bottom: 10px;
            margin-top: 24px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
        }
        thead tr {
            background: #6B0E16;
            color: #fff;
        }
        thead th {
            padding: 7px 14px;
            text-align: left;
            font-weight: 600;
        }
        thead th:last-child { text-align: right; }
        tbody tr:nth-child(even) { background: #faf0f1; }
        tbody td {
            padding: 6px 14px;
            border-bottom: 1px solid #e5e7eb;
        }
        tfoot tr {
            background: #FAE8EA;
            font-weight: 700;
        }
        tfoot td {
            padding: 7px 14px;
            border-top: 2px solid #A31621;
        }
        tfoot td:last-child { text-align: right; }
        .footer-note {
            margin-top: 28px;
            font-size: 8pt;
            color: #999;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            padding-top: 8px;
        }
        @page { size: A4; margin: 0; }
        @media print {
            body { padding: 14mm 18mm; }
        }
    </style>
</head>
<body>
    <!-- CSU Letterhead -->
    <div class="letterhead">
        <div class="univ-name">Cagayan State University</div>
        <div class="office-name">Office of the University Registrar</div>
        <div class="address">Carig Sur, Tuguegarao City, Cagayan 3500 &nbsp;|&nbsp; registrar@csu.edu.ph</div>
    </div>

    <!-- Report Title -->
    <div class="report-title">Enrollment Trends per Semester</div>
    <div class="report-meta">
        School Year Range: ${rangeLabel} &nbsp;&bull;&nbsp; Generated: ${today}
    </div>

    <!-- Chart Image -->
    <div class="chart-section">
        <img src="${imgDataUrl}" alt="Enrollment Trends Chart">
    </div>

    <!-- Raw Data Table -->
    <div class="section-heading">Enrollment Data</div>
    <table>
        <thead>
            <tr>
                <th>School Year</th>
                <th>Term</th>
                <th style="text-align:right;">Students Enrolled</th>
            </tr>
        </thead>
        <tbody>
            ${dataTableHtml}
        </tbody>
        <tfoot>
            <tr>
                <td colspan="2">Grand Total</td>
                <td>${grandTotal}</td>
            </tr>
        </tfoot>
    </table>

    <div class="footer-note">
        Generated by CSU Registrar Verification System &nbsp;&bull;&nbsp; ${today}
    </div>

    <script>
        window.onload = function() { window.print(); };
    <\/script>
</body>
</html>`);

    printWindow.document.close();
}

function navigateTo(section) {
    document.querySelectorAll(".admin-section").forEach(el => el.classList.add("d-none"));

    const target = document.getElementById("section-" + section);
    if (target) target.classList.remove("d-none");

    document.querySelectorAll(".sidebar-nav-link").forEach(link => link.classList.remove("active"));
    const activeLink = document.getElementById("nav-" + section);
    if (activeLink) activeLink.classList.add("active");

    // When navigating back to dashboard, clear stat-active ring
    if (section === "dashboard") {
        document.querySelectorAll(".admin-stat-card").forEach(card => {
            card.classList.remove("stat-active");
        });
    }

    // Lazy-load data for sections
    if (section === "students" && allStudents.length === 0) {
        loadStudents();
    }
    if (section === "records" && allStudentRecords.length === 0) {
        loadStudentRecords();
    }

    // Update topbar breadcrumb title
    const topbarTitle = document.getElementById("topbarTitle");
    if (topbarTitle) {
        const titleMap = {
            dashboard: '<i class="bi bi-shield-lock-fill me-2"></i>CSU — Registrar Admin Panel',
            students:  '<i class="bi bi-people-fill me-2"></i>Registered Users',
            requests:  '<i class="bi bi-file-earmark-text me-2"></i>Verification Requests',
            records:   '<i class="bi bi-database-fill me-2"></i>Student Records'
        };
        topbarTitle.innerHTML = titleMap[section] || titleMap.dashboard;
    }

    // Close sidebar on mobile after navigation
    const sidebar = document.getElementById("adminSidebar");
    if (window.innerWidth < 992 && sidebar) {
        sidebar.classList.remove("sidebar-open");
        document.getElementById("sidebarOverlay").classList.remove("active");
    }
}

function toggleSidebar() {
    // On desktop, the topbar hamburger also collapses/expands the sidebar
    if (window.innerWidth >= 992) {
        collapseSidebar();
        return;
    }
    // Mobile: slide in/out
    const sidebar = document.getElementById("adminSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (!sidebar) return;
    sidebar.classList.toggle("sidebar-open");
    overlay.classList.toggle("active");
}

function collapseSidebar() {
    const layout = document.querySelector(".admin-layout");
    if (!layout) return;
    const isCollapsed = layout.classList.toggle("sidebar-collapsed");
    localStorage.setItem("adminSidebarCollapsed", isCollapsed ? "1" : "0");
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// XSS-safe HTML escape — ALL user-controlled text must pass through this
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Show / Hide Loading overlay
function showLoading(show) {
    const overlay = document.getElementById("loadingOverlay");
    if (show) overlay.classList.remove("d-none");
    else       overlay.classList.add("d-none");
}

// Show alert — message is trusted HTML; callers must pre-escape user-controlled content
function showAlert(message, type = "info") {
    const container = document.getElementById("alertContainer");
    const alert     = document.createElement("div");
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

initAdminDashboard();
