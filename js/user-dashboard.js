// User Dashboard Logic

let currentUser = null;
let allUserRequests = [];

// Supabase Realtime channel reference — kept so we can cleanly
// remove it if initDashboard() is ever called more than once.
let _realtimeChannel = null;

// ================================================================
// NAVBAR NAVIGATION
// ================================================================

/**
 * Navigate between portal sections.
 * Updates the active sidebar link and shows/hides sections.
 * @param {string} section — "overview" | "my-requests"
 */
function navigateUserTo(section) {
    // Hide all sections
    document.querySelectorAll(".user-section").forEach(el => el.classList.add("d-none"));

    // Show target section
    const target = document.getElementById("section-" + section);
    if (target) target.classList.remove("d-none");

    // Update sidebar active state (.user-nav-link covers sidebar links)
    document.querySelectorAll(".user-nav-link[id^='nav-']").forEach(btn => {
        btn.classList.remove("active");
        btn.removeAttribute("aria-current");
    });
    const activeBtn = document.getElementById("nav-" + section);
    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.setAttribute("aria-current", "page");
    }

    // Close topbar dropdown and notification panel if open
    closeUserDropdown();
    const notifPanel = document.getElementById("notifDropdownPanel");
    if (notifPanel) notifPanel.style.display = "none";

    // On mobile: close sidebar after navigation
    const sidebar = document.getElementById("userSidebar");
    if (sidebar && sidebar.classList.contains("sidebar-open")) {
        toggleUserSidebar();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Build 1–2 letter initials for the avatar circle from a display name. */
function computeInitials(name) {
    if (!name || typeof name !== "string") return "U";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Topbar hamburger: full hide/show on desktop, slide-in overlay on mobile. */
function toggleUserSidebar() {
    const layout   = document.querySelector(".admin-layout");
    const sidebar  = document.getElementById("userSidebar");
    const overlay  = document.getElementById("userSidebarOverlay");
    if (!sidebar || !layout) return;

    if (window.innerWidth <= 991) {
        const isOpen = sidebar.classList.toggle("sidebar-open");
        if (overlay) overlay.style.display = isOpen ? "block" : "none";
        return;
    }

    layout.classList.toggle("sidebar-collapsed");
}

/** Legacy alias — kept so any older inline handlers still work. */
function collapseUserSidebar() {
    toggleUserSidebar();
}

/** Close the user avatar dropdown (topbar) */
function closeUserDropdown() {
    const menu = document.getElementById("userDropdownMenu");
    if (menu) menu.style.display = "none";
    const wrap = document.getElementById("userNavDropdown");
    if (wrap) wrap.classList.remove("dropdown-open");
}

/**
 * Open the Help & FAQ modal and close any open dropdowns.
 */
function openHelpModal() {
    closeUserDropdown();
    const modal = new bootstrap.Modal(document.getElementById("helpFaqModal"));
    modal.show();
}

/**
 * Toggle the user avatar dropdown (topbar) open/closed.
 * The dropdown uses inline style display:block/none in the new sidebar layout.
 */
function toggleUserDropdown() {
    const menu = document.getElementById("userDropdownMenu");
    const wrap = document.getElementById("userNavDropdown");
    if (!menu) return;
    const isOpen = menu.style.display === "block";
    menu.style.display = isOpen ? "none" : "block";
    if (wrap) wrap.setAttribute("aria-expanded", String(!isOpen));
}

// Close dropdowns when clicking outside
document.addEventListener("click", function (e) {
    const avatarWrap = document.getElementById("userNavDropdown");
    if (avatarWrap && !avatarWrap.contains(e.target)) {
        const menu = document.getElementById("userDropdownMenu");
        if (menu) menu.style.display = "none";
    }

    const notifWrap = document.getElementById("userNotifDropdown");
    if (notifWrap && !notifWrap.contains(e.target)) {
        notifWrap.classList.remove("notif-open");
        const panel = document.getElementById("notifDropdownPanel");
        if (panel) panel.style.display = "none";
    }
});

/**
 * Set today's date in the topbar.
 */
function setTodayDate() {
    const el = document.getElementById("topbarDate");
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "long",
        day:    "numeric",
        year:   "numeric"
    });
}

/**
 * Determine time-of-day greeting.
 */
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

// ================================================================
// NEW REQUEST MODAL — Inline form
// ================================================================

// Module-scoped state for the inline new-request form
let nrfStudentStatus  = "graduate";
let nrfSelectedFiles  = [];

/**
 * Open the unified inline new-request modal.
 * Resets the form to a clean state every time it is opened.
 */
function openNewRequestModal() {
    nrfResetForm();
    const modal = new bootstrap.Modal(document.getElementById("newRequestModal"));
    modal.show();
}

/**
 * Reset all inline form fields and state to defaults.
 */
function nrfResetForm() {
    // Text inputs
    ["nrfLastName","nrfFirstName","nrfMiddleName","nrfDegreeDiploma",
     "nrfMajorTrack"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const schoolNameEl = document.getElementById("nrfSchoolName");
    if (schoolNameEl) schoolNameEl.value = "CAGAYAN STATE UNIVERSITY - CARIG CAMPUS";
    const schoolAddressEl = document.getElementById("nrfSchoolAddress");
    if (schoolAddressEl) schoolAddressEl.value = "CARIG SUR, TUGUEGARAO CITY";

    // Clear all field errors
    document.querySelectorAll(".nrf-field-error").forEach(el => {
        el.textContent = "";
        el.classList.remove("visible");
    });

    // Student status — default to graduate
    nrfStudentStatus = "graduate";
    const gradBtn     = document.getElementById("nrfGradBtn");
    const undergradBtn = document.getElementById("nrfUndergradBtn");
    const gradFields  = document.getElementById("nrfGraduateFields");
    if (gradBtn)     gradBtn.classList.add("active");
    if (undergradBtn) undergradBtn.classList.remove("active");
    if (gradFields)  gradFields.style.display = "";

    // Graduation date fields
    const dateEl = document.getElementById("nrfDateOfGraduation");
    if (dateEl) dateEl.value = "";
    const unsureEl = document.getElementById("nrfUnsureGradDate");
    if (unsureEl) unsureEl.checked = false;
    const exactGroup = document.getElementById("nrfExactDateGroup");
    const approxGroup = document.getElementById("nrfApproxYearGroup");
    if (exactGroup)  exactGroup.classList.remove("d-none");
    if (approxGroup) approxGroup.classList.add("d-none");
    const approxEl = document.getElementById("nrfApproxGradYear");
    if (approxEl) approxEl.value = "";

    // Dropdowns
    ["nrfTermStarted","nrfTermEnded","nrfSchoolYearStarted","nrfSchoolYearEnded"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    // Populate year dropdowns if not already populated
    nrfPopulateYearDropdowns();

    // File upload
    nrfSelectedFiles = [];
    const fileList = document.getElementById("nrfFileList");
    if (fileList) fileList.innerHTML = "";

    // Submit button
    const submitBtn = document.getElementById("nrfSubmitBtn");
    if (submitBtn) submitBtn.disabled = false;
    const submitText = document.getElementById("nrfSubmitText");
    if (submitText) submitText.textContent = "Submit Request";
    const submitSpinner = document.getElementById("nrfSubmitSpinner");
    if (submitSpinner) submitSpinner.classList.add("d-none");

    // Wire up file upload drag/drop (safe to call multiple times)
    nrfSetupFileUpload();
}

/**
 * Populate school year dropdowns in the new-request modal.
 * Safe to call multiple times — skips if already populated.
 */
function nrfPopulateYearDropdowns() {
    const syStarted = document.getElementById("nrfSchoolYearStarted");
    const syEnded   = document.getElementById("nrfSchoolYearEnded");
    if (!syStarted || syStarted.options.length > 1) return; // already populated

    const currentYear = new Date().getFullYear();
    const options = ['<option value="">Select Year</option>'];
    for (let y = currentYear; y >= 1990; y--) {
        options.push(`<option value="${y}-${y + 1}">${y}-${y + 1}</option>`);
    }
    const html = options.join("");
    syStarted.innerHTML = html;
    syEnded.innerHTML   = html;

    // Approximate grad year dropdown
    const approxEl = document.getElementById("nrfApproxGradYear");
    if (approxEl && approxEl.options.length <= 1) {
        const approxOpts = ['<option value="">Select approximate year</option>'];
        for (let y = currentYear; y >= 1990; y--) {
            approxOpts.push(`<option value="${y}">${y}</option>`);
        }
        approxEl.innerHTML = approxOpts.join("");
    }
}

/**
 * Set the student status toggle in the new-request modal.
 * @param {string} status — "graduate" | "undergraduate"
 */
function nrfSetStatus(status) {
    nrfStudentStatus = status;
    const gradBtn      = document.getElementById("nrfGradBtn");
    const undergradBtn = document.getElementById("nrfUndergradBtn");
    const gradFields   = document.getElementById("nrfGraduateFields");

    const uploadHint = document.getElementById("nrfUploadHint");
    if (status === "graduate") {
        gradBtn.classList.add("active");
        undergradBtn.classList.remove("active");
        gradFields.style.display = "";
        if (uploadHint) uploadHint.textContent = "Upload your TOR, Diploma, or Certificate of Grades if available. Accepted: PDF, JPG, PNG (max 10MB each).";
    } else {
        undergradBtn.classList.add("active");
        gradBtn.classList.remove("active");
        gradFields.style.display = "none";
        if (uploadHint) uploadHint.textContent = "Upload your Certificate of Grades if available. Accepted: PDF, JPG, PNG (max 10MB each).";
        // Clear graduation date fields
        const dateEl   = document.getElementById("nrfDateOfGraduation");
        const approxEl = document.getElementById("nrfApproxGradYear");
        const unsureEl = document.getElementById("nrfUnsureGradDate");
        if (dateEl)   dateEl.value   = "";
        if (approxEl) approxEl.value = "";
        if (unsureEl) unsureEl.checked = false;
        const exactGroup  = document.getElementById("nrfExactDateGroup");
        const approxGroup = document.getElementById("nrfApproxYearGroup");
        if (exactGroup)  exactGroup.classList.remove("d-none");
        if (approxGroup) approxGroup.classList.add("d-none");
    }
}

/**
 * Toggle between exact and approximate graduation date inputs.
 */
function nrfToggleGradDateUnsure() {
    const unsure      = document.getElementById("nrfUnsureGradDate").checked;
    const exactGroup  = document.getElementById("nrfExactDateGroup");
    const approxGroup = document.getElementById("nrfApproxYearGroup");
    const dateEl      = document.getElementById("nrfDateOfGraduation");
    const approxEl    = document.getElementById("nrfApproxGradYear");

    if (unsure) {
        exactGroup.classList.add("d-none");
        approxGroup.classList.remove("d-none");
        if (dateEl) dateEl.value = "";
    } else {
        exactGroup.classList.remove("d-none");
        approxGroup.classList.add("d-none");
        if (approxEl) approxEl.value = "";
    }
}

/**
 * Wire up drag-and-drop and file-input events on the upload area.
 * Idempotent — checks for existing listeners via a data attribute.
 */
function nrfSetupFileUpload() {
    const uploadArea = document.getElementById("nrfFileUploadArea");
    const fileInput  = document.getElementById("nrfFileInput");
    if (!uploadArea || uploadArea.dataset.listenerAttached) return;
    uploadArea.dataset.listenerAttached = "1";

    uploadArea.addEventListener("dragover", e => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
    });
    uploadArea.addEventListener("dragleave", () => {
        uploadArea.classList.remove("dragover");
    });
    uploadArea.addEventListener("drop", e => {
        e.preventDefault();
        uploadArea.classList.remove("dragover");
        nrfAddFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener("change", () => {
        nrfAddFiles(fileInput.files);
        fileInput.value = "";
    });
}

/**
 * Validate and add files to the nrfSelectedFiles array.
 * @param {FileList} files
 */
function nrfAddFiles(files) {
    const allowed = ["application/pdf","image/jpeg","image/png"];
    const maxSize = 10 * 1024 * 1024; // 10 MB

    for (const file of files) {
        if (!allowed.includes(file.type)) {
            showAlert(`"${escapeHtml(file.name)}" is not a supported format. Use PDF, JPG, or PNG.`, "warning");
            continue;
        }
        if (file.size > maxSize) {
            showAlert(`"${escapeHtml(file.name)}" exceeds the 10 MB limit.`, "warning");
            continue;
        }
        nrfSelectedFiles.push(file);
    }
    nrfRenderFileList();
}

/**
 * Render the file list preview inside the modal.
 */
function nrfRenderFileList() {
    const container = document.getElementById("nrfFileList");
    if (!container) return;

    if (nrfSelectedFiles.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = nrfSelectedFiles.map((file, index) => {
        const icon = file.type === "application/pdf"
            ? "bi-file-earmark-pdf text-danger"
            : "bi-file-earmark-image text-primary";
        const size = (file.size / 1024 / 1024).toFixed(2);
        return `
            <div class="d-flex align-items-center justify-content-between p-2 border rounded mb-1" style="font-size:0.82rem;">
                <div class="d-flex align-items-center gap-2 min-width-0">
                    <i class="bi ${icon} flex-shrink-0"></i>
                    <span class="text-truncate">${escapeHtml(file.name)}</span>
                    <small class="text-muted flex-shrink-0">(${size} MB)</small>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger ms-2 flex-shrink-0" onclick="nrfRemoveFile(${index})" style="padding:2px 7px; font-size:0.75rem;">
                    <i class="bi bi-x"></i>
                </button>
            </div>`;
    }).join("");
}

/**
 * Remove a file from the selection by index.
 * @param {number} index
 */
function nrfRemoveFile(index) {
    nrfSelectedFiles.splice(index, 1);
    nrfRenderFileList();
}

/**
 * Show or clear a field-level error beneath an input.
 * @param {string} errorId  — id of the .nrf-field-error element
 * @param {string} message  — error text, or "" to clear
 */
function nrfSetFieldError(errorId, message) {
    const el = document.getElementById(errorId);
    if (!el) return;
    el.textContent = message;
    if (message) el.classList.add("visible");
    else         el.classList.remove("visible");
}

/**
 * Upload files to Supabase Storage and return metadata array.
 * @param {string} requestId
 * @returns {Promise<Array>}
 */
async function nrfUploadFiles(requestId) {
    const uploaded = [];
    const bucket   = "verification-files";

    for (const file of nrfSelectedFiles) {
        const filePath = `verificationFiles/${currentUser.id}/${requestId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from(bucket)
            .upload(filePath, file);

        if (error) throw new Error(`Failed to upload "${file.name}": ${error.message}`);

        const { data: urlData } = supabaseClient.storage
            .from(bucket)
            .getPublicUrl(filePath);

        uploaded.push({ name: file.name, url: urlData.publicUrl, type: file.type });
    }

    return uploaded;
}

/**
 * Validate and submit the inline new-request form.
 * Mirrors the logic in js/verification-form.js handleSubmit().
 */
async function nrfHandleSubmit() {
    // ---- Collect values ----
    const lastName   = (document.getElementById("nrfLastName").value  || "").trim().toUpperCase();
    const firstName  = (document.getElementById("nrfFirstName").value || "").trim().toUpperCase();
    const middleName = (document.getElementById("nrfMiddleName").value || "").trim().toUpperCase();
    const degree     = (document.getElementById("nrfDegreeDiploma").value || "").trim();
    const major      = (document.getElementById("nrfMajorTrack").value  || "").trim();
    const termStarted   = document.getElementById("nrfTermStarted").value;
    const syStarted     = document.getElementById("nrfSchoolYearStarted").value;
    const termEnded     = document.getElementById("nrfTermEnded").value;
    const syEnded       = document.getElementById("nrfSchoolYearEnded").value;
    const schoolName    = (document.getElementById("nrfSchoolName").value    || "").trim().toUpperCase();
    const schoolAddress = (document.getElementById("nrfSchoolAddress").value || "").trim().toUpperCase();

    // ---- Validate required fields ----
    let valid = true;
    const clearAll = () => document.querySelectorAll(".nrf-field-error").forEach(e => { e.textContent = ""; e.classList.remove("visible"); });
    clearAll();

    if (!lastName || !firstName) {
        nrfSetFieldError("nrfLastNameError",  !lastName  ? "Last name is required."  : "");
        nrfSetFieldError("nrfFirstNameError", !firstName ? "First name is required." : "");
        valid = false;
    }
    if (!degree)       { nrfSetFieldError("nrfDegreeError",      "Degree/Diploma is required.");     valid = false; }

    if (!valid) return;

    // ---- Disable submit, show spinner ----
    const submitBtn    = document.getElementById("nrfSubmitBtn");
    const submitText   = document.getElementById("nrfSubmitText");
    const submitSpinner = document.getElementById("nrfSubmitSpinner");
    submitBtn.disabled = true;
    submitText.textContent = "Submitting...";
    submitSpinner.classList.remove("d-none");

    try {
        const requestId = crypto.randomUUID();

        // Upload files (if any)
        const uploadedFiles = nrfSelectedFiles.length > 0
            ? await nrfUploadFiles(requestId)
            : [];

        // Build student name
        const studentName = middleName
            ? `${lastName}, ${firstName} ${middleName}`
            : `${lastName}, ${firstName}`;

        // Resolve graduation date
        let gradDate = null;
        if (nrfStudentStatus === "graduate") {
            const unsure = document.getElementById("nrfUnsureGradDate").checked;
            if (unsure) {
                const approxYear = document.getElementById("nrfApproxGradYear").value;
                gradDate = approxYear ? `Approximate: ${approxYear}` : null;
            } else {
                gradDate = document.getElementById("nrfDateOfGraduation").value || null;
            }
        }

        // Insert into Supabase
        const { error } = await supabaseClient
            .from("verification_requests")
            .insert({
                id:                  requestId,
                user_id:             currentUser.id,
                student_name:        studentName,
                degree_diploma:      degree,
                major_track:         major,
                student_status:      nrfStudentStatus,
                date_of_graduation:  gradDate,
                term_started:        termStarted,
                school_year_started: syStarted,
                term_ended:          termEnded,
                school_year_ended:   syEnded,
                school_name:         schoolName,
                school_address:      schoolAddress,
                uploaded_files:      uploadedFiles,
                status:              "pending",
                admin_remarks:       null
            });

        if (error) throw error;

        // Close the modal
        const modalEl = document.getElementById("newRequestModal");
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();

        showAlert("Verification request submitted successfully!", "success");

        // Reload requests so the table updates
        await loadRequests();

    } catch (error) {
        console.error("Submit error:", error);
        showAlert("Error submitting request: " + escapeHtml(error.message), "danger");
        // Re-enable submit button on error
        submitBtn.disabled = false;
        submitText.textContent = "Submit Request";
        submitSpinner.classList.add("d-none");
    }
}

/**
 * Scroll the page to the status tracker widget.
 * Falls back to navigating to overview if not already there.
 */
function scrollToTracker() {
    // Ensure we're on the overview section
    navigateUserTo("overview");
    // Give the DOM a tick to render the section, then scroll
    setTimeout(() => {
        const tracker = document.getElementById("statusTrackerSection");
        if (tracker) {
            tracker.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, 50);
}

// ================================================================
// INITIALIZE DASHBOARD
// ================================================================

async function initDashboard() {
    try {

        const user = await getCurrentUser();
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentUser = user;
        const userData = await getUserData(user.id);

        if (userData) {
            // Resolve display name — fallback to email prefix if display_name is missing
            const displayName = userData.displayName
                || (user.email ? user.email.split("@")[0] : "Student");

            // Legacy element kept for backward-compatibility with any external references
            const legacyName = document.getElementById("userName");
            if (legacyName) legacyName.textContent = displayName;

            // Topbar elements
            const chipName     = document.getElementById("navbarDropdownName");
            const menuName     = document.getElementById("userDropdownName");
            const menuEmail    = document.getElementById("userDropdownEmail");
            const initialsSm   = document.getElementById("topbarUserInitials");
            const initialsLg   = document.getElementById("topbarUserInitialsLg");
            const emailValue   = userData.email || user.email || "";
            const initials     = computeInitials(displayName);

            if (chipName)   chipName.textContent   = displayName;
            if (menuName)   menuName.textContent   = displayName;
            if (menuEmail)  menuEmail.textContent  = emailValue;
            if (initialsSm) initialsSm.textContent = initials;
            if (initialsLg) initialsLg.textContent = initials;

            // Welcome card — greeting + full name
            const greetingEl = document.getElementById("welcomeGreeting");
            if (greetingEl) greetingEl.textContent = getGreeting() + "!";

            const welcomeEl = document.getElementById("welcomeMessage");
            if (welcomeEl) welcomeEl.textContent = `Welcome back, ${displayName}!`;
        }

        await loadRequests();

        // Open a Supabase Realtime WebSocket so status changes made by
        // the admin (under_review, verified, not_verified) appear instantly
        // without the user needing to refresh the page.
        subscribeToMyRequests();

        showLoading(false);
    } catch (error) {
        console.error("Dashboard init error:", error);
        showLoading(false);
    }
}

// ================================================================
// SKELETON LOADER
// ================================================================

/**
 * Inject pulse skeleton rows into both tables while data loads.
 * Real rows replace them once loadRequests() finishes.
 */
function showSkeletonRows() {
    const skeletonRow = (cols) => `
        <tr class="skeleton-row">
            ${Array.from({ length: cols }, () =>
                `<td><div class="skeleton-cell"></div></td>`
            ).join("")}
        </tr>`;

    // Full requests table (7 columns)
    const fullTbody = document.getElementById("requestsTable");
    if (fullTbody) {
        fullTbody.innerHTML = Array.from({ length: 4 }, () => skeletonRow(7)).join("");
        document.getElementById("requestsTableCard")?.classList.remove("d-none");
    }

    // Recent requests table (5 columns)
    const recentTbody = document.getElementById("recentRequestsTableBody");
    if (recentTbody) {
        recentTbody.innerHTML = Array.from({ length: 3 }, () => skeletonRow(5)).join("");
        document.getElementById("recentTableCard")?.classList.remove("d-none");
    }
}

// ================================================================
// LOAD REQUESTS
// ================================================================

async function loadRequests() {
    // Show skeleton rows while Supabase responds
    showSkeletonRows();

    try {
        const { data, error } = await supabaseClient
            .from('verification_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allUserRequests = data || [];

        let pending = 0, verified = 0, notVerified = 0;

        allUserRequests.forEach((req) => {
            // "pending" stat card includes under_review — both mean
            // the request has not yet received a final decision.
            if (req.status === "pending" || req.status === "under_review") pending++;
            else if (req.status === "verified")     verified++;
            else if (req.status === "not_verified") notVerified++;
        });

        // Update stat cards
        const totalEl = document.getElementById("totalCount");
        if (totalEl) totalEl.textContent = allUserRequests.length;
        document.getElementById("pendingCount").textContent = pending;
        document.getElementById("verifiedCount").textContent = verified;
        document.getElementById("notVerifiedCount").textContent = notVerified;

        // Update quick-action bar badges
        updateQuickBarBadges(pending, verified);

        // Generate notifications for any status changes since last visit
        generateNotifications(allUserRequests);

        // ---- Full Requests section (My Requests) ----
        const tableCard  = document.getElementById("requestsTableCard");
        const emptyState = document.getElementById("emptyState");
        const statsRow   = document.getElementById("statsRow");

        // ---- Overview section elements ----
        const recentTableCard    = document.getElementById("recentTableCard");
        const emptyStateOverview = document.getElementById("emptyStateOverview");

        if (allUserRequests.length === 0) {
            // Hide tables, show empty states
            if (tableCard)  tableCard.classList.add("d-none");
            if (statsRow)   statsRow.classList.add("d-none");
            if (emptyState) emptyState.classList.remove("d-none");

            if (recentTableCard)    recentTableCard.classList.add("d-none");
            if (emptyStateOverview) emptyStateOverview.classList.remove("d-none");

            // Hide status tracker when no requests
            renderStatusTracker(null);
            return;
        }

        // Show tables, hide empty states
        if (tableCard)  tableCard.classList.remove("d-none");
        if (statsRow)   statsRow.classList.remove("d-none");
        if (emptyState) emptyState.classList.add("d-none");

        if (recentTableCard)    recentTableCard.classList.remove("d-none");
        if (emptyStateOverview) emptyStateOverview.classList.add("d-none");

        // Render full requests table — goes through filterRequests() so any
        // active search/filter is preserved when data reloads.
        filterRequests();

        // Render recent requests preview (last 5) for overview section
        const recentBody = document.getElementById("recentRequestsTableBody");
        if (recentBody) {
            const recent5 = allUserRequests.slice(0, 5);
            recentBody.innerHTML = recent5.map((req) => buildRecentTableRow(req)).join("");
        }

        // Render status tracker for the most recent active (pending) request,
        // or fall back to the most recent request of any status.
        const latestActive = allUserRequests.find(r => r.status === "pending")
            || allUserRequests[0];
        renderStatusTracker(latestActive);

    } catch (error) {
        console.error("Error loading requests:", error);
        showAlert("Error loading requests. Please try again. " + escapeHtml(error.message), "danger");
    }
}

// ================================================================
// REALTIME SUBSCRIPTION — live status updates for the user
// ================================================================

/**
 * Open a Supabase Realtime WebSocket channel that listens for UPDATE
 * events on the current user's verification_requests rows.
 *
 * When the admin opens a request (sets it to "under_review") or marks
 * a final decision ("verified" / "not_verified"), the change arrives
 * here instantly — no page refresh needed.
 *
 * Requires: REPLICA IDENTITY FULL on verification_requests (see migration SQL).
 * Requires: currentUser to be set before calling.
 */
function subscribeToMyRequests() {
    if (!currentUser) return;

    // Clean up any existing channel (safety guard against double-init)
    if (_realtimeChannel) {
        supabaseClient.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
    }

    _realtimeChannel = supabaseClient
        .channel("user-my-requests")
        .on(
            "postgres_changes",
            {
                event:  "UPDATE",
                schema: "public",
                table:  "verification_requests",
                filter: `user_id=eq.${currentUser.id}`
            },
            (payload) => {
                handleRealtimeStatusChange(payload.new);
            }
        )
        .subscribe((status) => {
            console.log("[Realtime] user-my-requests:", status);
        });
}

/**
 * Handle a real-time UPDATE event for one of the user's rows.
 * Updates the in-memory cache, re-renders tables and the status
 * tracker, and shows a toast notification when the status changes.
 *
 * @param {object} updatedRow  — full updated row payload from Supabase
 */
function handleRealtimeStatusChange(updatedRow) {
    const index     = allUserRequests.findIndex(r => r.id === updatedRow.id);
    const oldStatus = index !== -1 ? allUserRequests[index].status : null;
    const newStatus = updatedRow.status;

    // Update local cache
    if (index !== -1) {
        allUserRequests[index] = updatedRow;
    } else {
        // Row not in local cache yet — fall back to a full reload
        loadRequests();
        return;
    }

    // Re-render the full My Requests table (respects active search/filter)
    filterRequests();

    // Re-render the recent requests preview (Overview section)
    const recentBody = document.getElementById("recentRequestsTableBody");
    if (recentBody) {
        const recent5 = allUserRequests.slice(0, 5);
        recentBody.innerHTML = recent5.map(r => buildRecentTableRow(r)).join("");
    }

    // Re-render the status tracker — prefer a pending/under_review request
    // so the tracker always shows the request most relevant to the user.
    const latestActive = allUserRequests.find(r => r.status === "pending")
        || allUserRequests.find(r => r.status === "under_review")
        || allUserRequests[0];
    renderStatusTracker(latestActive);

    // Recompute stat card counts
    let pending = 0, verified = 0, notVerified = 0;
    allUserRequests.forEach(r => {
        if (r.status === "pending" || r.status === "under_review") pending++;
        else if (r.status === "verified")     verified++;
        else if (r.status === "not_verified") notVerified++;
    });
    const totalEl = document.getElementById("totalCount");
    if (totalEl) totalEl.textContent = allUserRequests.length;
    document.getElementById("pendingCount").textContent     = pending;
    document.getElementById("verifiedCount").textContent    = verified;
    document.getElementById("notVerifiedCount").textContent = notVerified;
    updateQuickBarBadges(pending, verified);

    // Show a toast notification only when the visible status has changed
    if (oldStatus !== newStatus) {
        showStatusChangeToast(newStatus);
    }
}

/**
 * Display a slim, auto-dismissing toast notification when the user's
 * request status changes via the real-time channel.
 *
 * @param {string} newStatus  — "under_review" | "verified" | "not_verified"
 */
function showStatusChangeToast(newStatus) {
    const configs = {
        under_review: {
            icon:  "bi-search",
            color: "var(--color-info, #3b82f6)",
            text:  "Your request is now being reviewed by the Registrar's Office."
        },
        verified: {
            icon:  "bi-check-circle-fill",
            color: "var(--color-success, #10b981)",
            text:  "Your request has been verified! Check the details below."
        },
        not_verified: {
            icon:  "bi-x-circle-fill",
            color: "var(--color-danger, #ef4444)",
            text:  "Your request could not be verified. See the admin remarks for details."
        }
    };

    const config = configs[newStatus];
    if (!config) return;  // no toast for intermediate/unknown statuses

    const container = document.getElementById("alertContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "alert alert-dismissible fade show d-flex align-items-center gap-2 mb-2";
    toast.style.cssText = [
        "border-left: 4px solid " + config.color,
        "background: #ffffff",
        "box-shadow: 0 4px 20px rgba(0,0,0,0.10)",
        "font-size: 0.875rem",
        "border-radius: 8px"
    ].join("; ");
    toast.innerHTML = `
        <i class="bi ${config.icon} flex-shrink-0" style="color:${config.color}; font-size:1.15rem;"></i>
        <div>
            <strong>Status Update</strong> &mdash; ${config.text}
        </div>
        <button type="button" class="btn-close ms-auto flex-shrink-0" data-bs-dismiss="alert" aria-label="Close"></button>`;
    container.appendChild(toast);

    // Auto-dismiss after 9 seconds
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 9000);
}

// ================================================================
// QUICK ACTION BAR BADGES
// ================================================================

/**
 * Update the sidebar pending badge count.
 * Called after requests are loaded to keep the sidebar badge in sync.
 * @param {number} pending
 * @param {number} verified  (kept for API compatibility, currently unused)
 */
function updateQuickBarBadges(pending, verified) {
    // Sidebar pending badge on "My Requests" nav item
    const sidebarBadge = document.getElementById("sidebarPendingBadge");
    if (sidebarBadge) {
        if (pending > 0) {
            sidebarBadge.textContent = pending;
            sidebarBadge.classList.remove("d-none");
        } else {
            sidebarBadge.classList.add("d-none");
        }
    }

    // Show/hide the new-request CTA banner based on whether there are requests.
    // Keep banner visible when there are no requests (reinforces the call-to-action).
    const ctaBanner = document.getElementById("newRequestCtaBanner");
    if (ctaBanner) {
        // Always visible — it's the primary action prompt on the overview section.
        ctaBanner.classList.remove("d-none");
    }
}

// ================================================================
// STATUS TRACKER WIDGET
// ================================================================

/**
 * Render the status tracker widget for the given request.
 * If req is null (no requests), shows a subtle empty state prompt.
 * @param {object|null} req
 */
function renderStatusTracker(req) {
    const container = document.getElementById("statusTrackerSection");
    if (!container) return;

    if (!req) {
        // No requests yet — show a minimal empty prompt so the section is still visible
        container.innerHTML = `
            <div class="status-tracker-card mb-4">
                <div class="status-tracker-title mb-2">
                    <i class="bi bi-activity"></i> Latest Request Status
                </div>
                <div class="status-tracker-empty">
                    <i class="bi bi-inbox"></i>
                    No active requests. Submit your first request to track its progress here.
                </div>
            </div>`;
        return;
    }

    const submittedDate = req.created_at
        ? new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "";

    // Determine which step is active/done based on status.
    // Steps: Submitted → Under Review → Resolved (Verified / Not Verified)
    //
    // isUnderReview is true when the admin has explicitly set the status to
    // "under_review" (real DB value) OR when a final decision has been made
    // (meaning the review step was passed). The old inference from
    // document_assessment is kept as a graceful fallback for legacy rows
    // that were assessed before the under_review status was introduced.
    const isSubmitted   = true; // always true once a request exists
    const isUnderReview = req.status === "under_review"
        || req.status === "verified"
        || req.status === "not_verified"
        || (req.document_assessment && req.document_assessment.length > 0);
    const isResolved  = req.status === "verified" || req.status === "not_verified";
    const isRejected  = req.status === "not_verified";

    // Build step classes
    const step1Class = isSubmitted ? "done" : "active";
    const step2Class = isUnderReview ? (isResolved ? "done" : "active") : "";
    const step3Class = isResolved ? (isRejected ? "rejected" : "done") : (isUnderReview ? "active" : "");

    // Connector classes (line between steps)
    const conn1Class = isUnderReview ? "done" : "";
    const conn2Class = isResolved ? "done" : "";

    // Step 3 label and icon adapt to final state
    const step3Label = isRejected ? "Not Verified"
        : (req.status === "verified" ? "Verified" : "Decision");
    const step3Icon = isRejected ? "bi-x-circle-fill"
        : (req.status === "verified" ? "bi-check-circle-fill" : "bi-patch-check");

    // Current status badge
    const statusBadge = buildStatusBadge(req.status);

    container.innerHTML = `
        <div class="status-tracker-card mb-4" id="statusTrackerWidget">
            <div class="status-tracker-header">
                <div class="status-tracker-title">
                    <i class="bi bi-activity"></i>
                    Latest Request Status
                </div>
                <span class="status-tracker-meta">${submittedDate ? 'Submitted ' + escapeHtml(submittedDate) : ''}</span>
            </div>

            <!-- Step indicator row -->
            <div class="status-tracker-steps" role="list">
                <!-- Step 1: Submitted -->
                <div class="st-step ${step1Class}" role="listitem" title="Request submitted">
                    <div class="st-step-icon">
                        <i class="bi bi-send-check-fill"></i>
                    </div>
                    <div class="st-step-label">Submitted</div>
                </div>

                <!-- Connector 1 -->
                <div class="st-connector ${conn1Class}"></div>

                <!-- Step 2: Under Review -->
                <div class="st-step ${step2Class}" role="listitem" title="Request under review">
                    <div class="st-step-icon">
                        <i class="bi bi-search"></i>
                    </div>
                    <div class="st-step-label">Under Review</div>
                </div>

                <!-- Connector 2 -->
                <div class="st-connector ${conn2Class}"></div>

                <!-- Step 3: Decision -->
                <div class="st-step ${step3Class}" role="listitem" title="Final decision">
                    <div class="st-step-icon">
                        <i class="bi ${step3Icon}"></i>
                    </div>
                    <div class="st-step-label">${step3Label}</div>
                </div>
            </div>

            <!-- Info chips row -->
            <div class="status-tracker-info">
                <span class="st-info-chip">
                    <i class="bi bi-file-earmark-text"></i>
                    ${escapeHtml(req.degree_diploma || 'Verification Request')}
                </span>
                <span>${statusBadge}</span>
                ${req.admin_remarks ? `
                <span class="st-info-chip" title="Admin remarks">
                    <i class="bi bi-chat-left-text"></i>
                    ${escapeHtml(req.admin_remarks.length > 50 ? req.admin_remarks.substring(0, 50) + '...' : req.admin_remarks)}
                </span>` : ''}
                <button class="btn-link-user ms-auto" onclick="openDetail('${req.id}')" style="font-size:0.78rem;">
                    View Details <i class="bi bi-arrow-right ms-1"></i>
                </button>
            </div>
        </div>`;
}

// ================================================================
// TABLE ROW BUILDERS
// ================================================================

/**
 * Build a full table row (for My Requests section — 7 columns including assessment and action).
 */
function buildFullTableRow(req) {
    const date = req.created_at
        ? new Date(req.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "N/A";

    const statusBadge = buildStatusBadge(req.status);

    // Document assessment badges
    let assessmentHtml = '<span class="text-muted">—</span>';
    if (req.document_assessment && req.document_assessment.length > 0) {
        assessmentHtml = req.document_assessment.map(a => {
            let badgeClass = 'bg-secondary';
            if (a.assessment === 'authentic')  badgeClass = 'bg-success';
            else if (a.assessment === 'tampered')  badgeClass = 'bg-warning text-dark';
            else if (a.assessment === 'fabricated') badgeClass = 'bg-danger';
            return `<div class="mb-1"><span class="badge ${badgeClass}">${capitalize(a.assessment)}</span> <small class="text-muted">${escapeHtml(a.file_name)}</small></div>`;
        }).join('');
    }

    return `
        <tr>
            <td>${date}</td>
            <td class="td-degree-truncate" title="${escapeHtml(req.degree_diploma)}">${escapeHtml(req.degree_diploma)}</td>
            <td>${req.student_status === "graduate" ? "Graduate" : "Undergraduate"}</td>
            <td>${statusBadge}</td>
            <td>${assessmentHtml}</td>
            <td>${req.admin_remarks ? escapeHtml(req.admin_remarks) : '<span class="text-muted">—</span>'}</td>
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="openDetail('${req.id}')" style="font-size:0.75rem; padding: 3px 10px; white-space: nowrap;">
                    <i class="bi bi-eye me-1"></i>View
                </button>
            </td>
        </tr>
    `;
}

/**
 * Build a compact recent-request row (for Overview section — 5 columns with View action).
 */
function buildRecentTableRow(req) {
    const date = req.created_at
        ? new Date(req.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "N/A";

    const statusBadge = buildStatusBadge(req.status);

    return `
        <tr>
            <td>${date}</td>
            <td>${escapeHtml(req.degree_diploma)}</td>
            <td>${req.student_status === "graduate" ? "Graduate" : "Undergraduate"}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="openDetail('${req.id}')" style="font-size:0.75rem; padding: 3px 10px;">
                    <i class="bi bi-eye me-1"></i>View
                </button>
            </td>
        </tr>
    `;
}

/**
 * Return the correct status badge HTML for a given status string.
 * Handles all four possible database values:
 *   pending | under_review | verified | not_verified
 */
function buildStatusBadge(status) {
    if (status === "pending")
        return '<span class="badge badge-pending">Pending</span>';
    if (status === "under_review")
        return '<span class="badge badge-under-review"><i class="bi bi-search me-1"></i>Under Review</span>';
    if (status === "verified")
        return '<span class="badge badge-verified">Verified</span>';
    return '<span class="badge badge-not-verified">Not Verified</span>';
}

// ================================================================
// DETAIL MODAL
// ================================================================

function openDetail(requestId) {
    const req = allUserRequests.find(r => r.id === requestId);
    if (!req) return;

    const modalBody = document.getElementById("detailModalBody");

    // Status badge — delegate to the shared helper so all four statuses
    // (pending, under_review, verified, not_verified) render consistently.
    const statusBadge = buildStatusBadge(req.status);

    // Status timeline
    // "Under Review" step is active when status is under_review, or done when
    // a final decision has been reached. Legacy fallback: non-empty document_assessment.
    const underReviewDone   = req.status === "under_review"
        || req.status === "verified"
        || req.status === "not_verified"
        || (req.document_assessment && req.document_assessment.length > 0);
    const steps = [
        { label: "Submitted",   icon: "bi-send-check", done: true },
        { label: "Under Review", icon: "bi-search",    done: underReviewDone },
        {
            label: req.status === "not_verified" ? "Not Verified" : "Verified",
            icon:  req.status === "not_verified" ? "bi-shield-exclamation" : "bi-check-circle",
            done:  req.status === "verified" || req.status === "not_verified"
        }
    ];

    const timelineHtml = `
        <div class="d-flex align-items-center justify-content-between mb-4 px-2">
            ${steps.map((step, i) => {
                const color = step.done
                    ? (i === 2 && req.status === "not_verified" ? "text-warning" : "text-success")
                    : "text-muted opacity-50";
                const lineStyle = steps[i + 1]?.done ? "height:3px; background:#10b981;" : "height:3px; background:#dee2e6;";
                return `
                    <div class="text-center" style="flex: 0 0 auto;">
                        <i class="bi ${step.icon} fs-4 ${color} d-block mb-1"></i>
                        <small class="${color} fw-semibold">${step.label}</small>
                    </div>
                    ${i < steps.length - 1 ? `<div class="flex-grow-1 mx-2"><div style="${lineStyle}" class="rounded"></div></div>` : ""}
                `;
            }).join("")}
        </div>`;

    // Document assessment section
    let assessmentHtml = "";
    if (req.document_assessment && req.document_assessment.length > 0) {
        assessmentHtml = `
            <hr>
            <h6 class="mb-3"><i class="bi bi-clipboard-check me-1"></i>Document Assessment</h6>
            ${req.document_assessment.map(a => {
                let badgeClass = 'bg-secondary';
                let icon = 'bi-question-circle';
                if (a.assessment === 'authentic') { badgeClass = 'bg-success'; icon = 'bi-check-circle-fill'; }
                else if (a.assessment === 'tampered') { badgeClass = 'bg-warning text-dark'; icon = 'bi-exclamation-triangle-fill'; }
                else if (a.assessment === 'fabricated') { badgeClass = 'bg-danger'; icon = 'bi-x-circle-fill'; }
                return `
                    <div class="d-flex align-items-center mb-2 p-2 border rounded">
                        <i class="bi ${icon} me-2 ${a.assessment === 'authentic' ? 'text-success' : a.assessment === 'tampered' ? 'text-warning' : 'text-danger'}"></i>
                        <span class="me-auto small">${escapeHtml(a.file_name)}</span>
                        <span class="badge ${badgeClass}">${capitalize(a.assessment)}</span>
                    </div>`;
            }).join("")}`;
    }

    // Uploaded files section
    let filesHtml = "";
    if (req.uploaded_files && req.uploaded_files.length > 0) {
        filesHtml = `
            <hr>
            <h6 class="mb-3"><i class="bi bi-paperclip me-1"></i>Uploaded Documents</h6>
            ${req.uploaded_files.map(file => {
                if (file.type && file.type.startsWith("image/")) {
                    return `
                        <div class="mb-3 p-3 border rounded">
                            <strong class="small">${escapeHtml(file.name)}</strong><br>
                            <img src="${file.url}" alt="${escapeHtml(file.name)}" class="img-fluid rounded mt-1" style="max-height: 250px;">
                        </div>`;
                } else {
                    return `
                        <div class="mb-3 p-3 border rounded">
                            <strong class="small">${escapeHtml(file.name)}</strong>
                            <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline-primary ms-2">
                                <i class="bi bi-file-earmark-pdf me-1"></i>Open
                            </a>
                        </div>`;
                }
            }).join("")}`;
    }

    // Admin remarks section — amber styled box
    let remarksHtml = "";
    if (req.admin_remarks) {
        remarksHtml = `
            <hr>
            <div class="detail-remarks-box">
                <div class="detail-remarks-label">
                    <i class="bi bi-chat-square-text-fill me-1"></i>Registrar's Remarks
                </div>
                <p class="mb-0">${escapeHtml(req.admin_remarks)}</p>
            </div>`;
    }

    const submittedDate = req.created_at
        ? new Date(req.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "N/A";

    // Short human-readable ID — first segment of the UUID, uppercased
    const shortId = "REQ-" + req.id.split("-")[0].toUpperCase();

    modalBody.innerHTML = `
        <!-- Request ID + status badge + submission date row -->
        <div class="detail-req-id-row">
            <span class="detail-req-id">
                <i class="bi bi-hash me-1"></i>${shortId}
            </span>
            <div class="d-flex align-items-center gap-2">
                ${statusBadge}
                <span class="detail-submitted-date">
                    <i class="bi bi-calendar3 me-1"></i>${submittedDate}
                </span>
            </div>
        </div>

        <!-- Status Timeline -->
        ${timelineHtml}

        <!-- Request Info -->
        <div class="row">
            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Client Name</span>
                <p class="detail-data-value">${escapeHtml(req.student_name)}</p>
            </div>
            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Client Status</span>
                <p class="detail-data-value">${req.student_status === "graduate" ? "Graduate" : "Undergraduate"}</p>
            </div>

            <!-- Academic divider -->
            <div class="col-12 mb-1"><div class="detail-data-section-label">Academic</div></div>

            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Degree/Diploma</span>
                <p class="detail-data-value">${escapeHtml(req.degree_diploma)}</p>
            </div>
            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Major/Track</span>
                <p class="detail-data-value">${escapeHtml(req.major_track) || '<span class="text-muted">—</span>'}</p>
            </div>
            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Date of Graduation</span>
                <p class="detail-data-value">${escapeHtml(req.date_of_graduation) || '<span class="text-muted">—</span>'}</p>
            </div>

            <!-- Enrollment divider -->
            <div class="col-12 mb-1"><div class="detail-data-section-label">Enrollment Period</div></div>

            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Term &amp; SY Started</span>
                <p class="detail-data-value">${(req.term_started && req.school_year_started) ? escapeHtml(req.term_started) + ' — ' + escapeHtml(req.school_year_started) : '<span class="text-muted">—</span>'}</p>
            </div>
            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Term &amp; SY Ended</span>
                <p class="detail-data-value">${(req.term_ended && req.school_year_ended) ? escapeHtml(req.term_ended) + ' — ' + escapeHtml(req.school_year_ended) : '<span class="text-muted">—</span>'}</p>
            </div>

            <!-- School divider -->
            <div class="col-12 mb-1"><div class="detail-data-section-label">School</div></div>

            <div class="col-md-6 mb-3">
                <span class="detail-data-label">School Name</span>
                <p class="detail-data-value">${escapeHtml(req.school_name)}</p>
            </div>
            <div class="col-md-6 mb-3">
                <span class="detail-data-label">School Address</span>
                <p class="detail-data-value">${escapeHtml(req.school_address)}</p>
            </div>

            ${req.verifier_name ? `
            <div class="col-12 mb-1"><div class="detail-data-section-label">Verification</div></div>
            <div class="col-md-6 mb-3">
                <span class="detail-data-label">Verifier</span>
                <p class="detail-data-value">${escapeHtml(req.verifier_name)} — ${escapeHtml(req.verifier_designation)}</p>
            </div>` : ""}
        </div>

        ${filesHtml}
        ${assessmentHtml}
        ${remarksHtml}
    `;

    // ---- Dynamic footer: action buttons based on request status ----
    const modalFooter = document.getElementById("detailModalFooter");
    if (modalFooter) {
        let actionBtn = "";
        if (req.status === "pending") {
            actionBtn = `
                <button type="button" class="btn-detail-cancel"
                    onclick="cancelRequest('${req.id}')">
                    <i class="bi bi-x-circle me-1"></i>Cancel Request
                </button>`;
        } else if (req.status === "verified") {
            actionBtn = `
                <button type="button" class="btn-detail-download"
                    onclick="downloadCertificate('${req.id}')">
                    <i class="bi bi-download me-1"></i>Download Certificate
                </button>`;
        }
        modalFooter.innerHTML = `
            ${actionBtn}
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
                <i class="bi bi-x-lg me-1"></i>Close
            </button>
        `;
    }

    const modal = new bootstrap.Modal(document.getElementById("detailModal"));
    modal.show();
}

// ================================================================
// NOTIFICATIONS  (localStorage — no DB table needed)
// ================================================================

// localStorage key helpers — scoped per user so multiple accounts on
// the same browser don't share notifications.
const NOTIF_KEY    = () => `csu_notifications_${currentUser?.id  || "guest"}`;
const STATUSES_KEY = () => `csu_prev_statuses_${currentUser?.id || "guest"}`;

/**
 * Compare current request statuses with the previously stored snapshot.
 * Creates a notification for every meaningful status change (→ verified / → not_verified).
 * On first run (no snapshot yet) just saves the baseline — no notifications.
 */
function generateNotifications(requests) {
    const prevRaw = localStorage.getItem(STATUSES_KEY());
    const prevMap = prevRaw ? JSON.parse(prevRaw) : null;

    // Build current status map
    const currMap = {};
    requests.forEach(r => { currMap[r.id] = r.status; });

    if (!prevMap) {
        // First visit — record baseline without alerting
        localStorage.setItem(STATUSES_KEY(), JSON.stringify(currMap));
        renderNotificationDropdown();
        return;
    }

    const notifications = loadNotifications();
    let changed = false;

    requests.forEach(req => {
        const prev = prevMap[req.id];
        const curr = req.status;
        if (prev && prev !== curr) {
            const notif = buildStatusNotification(req, curr);
            if (notif) { notifications.unshift(notif); changed = true; }
        }
    });

    if (changed) saveNotifications(notifications);

    // Always update the baseline to the latest statuses
    localStorage.setItem(STATUSES_KEY(), JSON.stringify(currMap));
    renderNotificationDropdown();
}

/** Build a single notification object for a status change. */
function buildStatusNotification(req, newStatus) {
    const degree = req.degree_diploma || "your request";
    const short  = degree.length > 35 ? degree.slice(0, 35) + "…" : degree;
    const id     = "n_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    if (newStatus === "verified") {
        return {
            id, requestId: req.id, type: "success", read: false,
            title: "Request Verified",
            message: `Your verification request for ${short} has been approved.`,
            created_at: new Date().toISOString()
        };
    }
    if (newStatus === "not_verified") {
        return {
            id, requestId: req.id, type: "danger", read: false,
            title: "Request Not Verified",
            message: `Your verification request for ${short} was not verified. View for details.`,
            created_at: new Date().toISOString()
        };
    }
    return null;
}

function loadNotifications() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY()) || "[]"); }
    catch { return []; }
}
function saveNotifications(list) {
    localStorage.setItem(NOTIF_KEY(), JSON.stringify(list));
}

/** Rebuild the badge count and dropdown panel from localStorage. */
function renderNotificationDropdown() {
    const notifications = loadNotifications();
    const unread = notifications.filter(n => !n.read).length;

    // Update badge
    const badge = document.getElementById("notifBadge");
    if (badge) {
        if (unread > 0) {
            badge.textContent = unread > 9 ? "9+" : unread;
            badge.classList.remove("d-none");
        } else {
            badge.classList.add("d-none");
        }
    }

    // Update panel
    const panel = document.getElementById("notifDropdownPanel");
    if (!panel) return;

    if (notifications.length === 0) {
        panel.innerHTML = `
            <div class="notif-panel-header">
                <span class="notif-panel-title">
                    <i class="bi bi-bell me-1"></i>Notifications
                </span>
            </div>
            <div class="notif-empty">
                <i class="bi bi-bell-slash d-block"></i>
                No notifications yet
            </div>`;
        return;
    }

    const itemsHtml = notifications.map(n => {
        const dotClass  = n.type === "success" ? "notif-dot--success"
                        : n.type === "danger"  ? "notif-dot--danger"
                        : "notif-dot--info";
        const unreadCls = n.read ? "" : "notif-item--unread";
        return `
            <div class="notif-item ${unreadCls}" onclick="handleNotifClick('${n.id}')">
                <div class="notif-dot ${dotClass}"></div>
                <div class="notif-item-body">
                    <div class="notif-item-title">${escapeHtml(n.title)}</div>
                    <div class="notif-item-msg">${escapeHtml(n.message)}</div>
                    <div class="notif-item-time">${formatTimeAgo(n.created_at)}</div>
                </div>
                <button class="notif-dismiss-btn"
                    onclick="event.stopPropagation(); dismissNotification('${n.id}')"
                    title="Dismiss">
                    <i class="bi bi-x"></i>
                </button>
            </div>`;
    }).join("");

    const headerActions = `
        <div class="notif-header-actions">
            ${unread > 0
                ? `<button class="notif-action-btn" onclick="markAllNotificationsRead()">Mark all read</button>`
                : ""}
            <button class="notif-action-btn notif-clear-btn" onclick="clearAllNotifications()">Clear All</button>
        </div>`;

    panel.innerHTML = `
        <div class="notif-panel-header">
            <span class="notif-panel-title">
                <i class="bi bi-bell me-1"></i>Notifications
            </span>
            ${headerActions}
        </div>
        <div class="notif-list">${itemsHtml}</div>`;
}

/** Open / close the notification panel. */
function toggleNotificationDropdown() {
    const panel = document.getElementById("notifDropdownPanel");
    if (!panel) return;
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    // Close avatar dropdown if opening bell
    if (!isOpen) {
        const menu = document.getElementById("userDropdownMenu");
        if (menu) menu.style.display = "none";
    }
}

/** Mark a notification read and open the related request detail. */
function handleNotifClick(notifId) {
    const list  = loadNotifications();
    const notif = list.find(n => n.id === notifId);
    if (!notif) return;

    notif.read = true;
    saveNotifications(list);
    renderNotificationDropdown();

    // Close panel and open the request detail
    const panel = document.getElementById("notifDropdownPanel");
    if (panel) panel.style.display = "none";
    const wrap = document.getElementById("userNotifDropdown");
    if (wrap) wrap.classList.remove("notif-open");
    if (notif.requestId) openDetail(notif.requestId);
}

/** Mark every notification as read. */
function markAllNotificationsRead() {
    saveNotifications(loadNotifications().map(n => ({ ...n, read: true })));
    renderNotificationDropdown();
}

/** Dismiss (delete) a single notification by ID. */
function dismissNotification(notifId) {
    saveNotifications(loadNotifications().filter(n => n.id !== notifId));
    renderNotificationDropdown();
}

/** Clear all notifications. */
function clearAllNotifications() {
    saveNotifications([]);
    renderNotificationDropdown();
}

/** Human-readable relative time (e.g. "3h ago"). */
function formatTimeAgo(isoString) {
    if (!isoString) return "";
    const diff  = Date.now() - new Date(isoString).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  <  1) return "Just now";
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  <  7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ================================================================
// CANCEL REQUEST
// ================================================================

/**
 * Delete a pending request after user confirmation.
 * Only works when status === "pending" (enforced by button visibility).
 * Uses .eq('user_id', ...) as a safety guard so users can only
 * cancel their own records.
 */
async function cancelRequest(requestId) {
    const confirmed = confirm(
        "Cancel this request?\n\nThis will permanently remove the request and cannot be undone."
    );
    if (!confirmed) return;

    try {
        // .select() makes Supabase return the deleted rows so we can detect
        // a silent RLS block (error: null but data is empty).
        const { data: deleted, error } = await supabaseClient
            .from("verification_requests")
            .delete()
            .eq("id", requestId)
            .eq("user_id", currentUser.id) // safety: own records only
            .select();

        if (error) throw error;

        // RLS blocked silently — nothing was deleted
        if (!deleted || deleted.length === 0) {
            throw new Error(
                "Request could not be deleted. Make sure a DELETE policy exists on the " +
                "verification_requests table in Supabase for authenticated users."
            );
        }

        // Close the modal
        const modalEl = document.getElementById("detailModal");
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        showAlert(
            '<i class="bi bi-check-circle-fill me-2"></i>Request cancelled and removed.',
            "success"
        );

        // Reload so counts and tables refresh
        await loadRequests();

    } catch (err) {
        showAlert(
            '<i class="bi bi-exclamation-triangle-fill me-2"></i>Could not cancel request: '
                + escapeHtml(err.message),
            "danger"
        );
    }
}

// ================================================================
// DOWNLOAD / PRINT CERTIFICATE
// ================================================================

/**
 * Open a printable verification certificate in a new tab.
 * Mirrors the admin's printVerificationLetter() but reads from
 * allUserRequests instead of allRequests.
 */
async function downloadCertificate(requestId) {
    const req = allUserRequests.find(r => r.id === requestId);
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

    function textToImg(text, fontFamily, ptSize, color, bold = true) {
        const canvas  = document.createElement('canvas');
        const ctx     = canvas.getContext('2d');
        const pxSize  = ptSize * 2;
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

    const baseUrl = new URL('.', window.location.href).href;
    const [logoB64, rotundaB64] = await Promise.all([
        imgToBase64(baseUrl + 'csu-logo.png'),
        imgToBase64(baseUrl + 'CSU-ROTUNDA.jpg')
    ]);

    const GREEN_CLR   = '#1a5c2a';
    const univNameImg = textToImg('Cagayan State University', 'Old English Text MT', 14, GREEN_CLR);
    const campusImg   = textToImg('CARIG CAMPUS',             'Old English Text MT', 11, '#111111', false);

    const GREEN      = '#1a5c2a';
    const LABEL_BG   = '#f5f5f5';
    const LABEL_CLR  = '#2c4a35';
    const BORDER_CLR = '#888888';
    const P          = [5, 4, 5, 4];

    const lbl = (text, extra = {}) => ({
        text, fontSize: 9, bold: true, color: LABEL_CLR, fillColor: LABEL_BG, margin: P, ...extra
    });
    const val = (text, extra = {}) => ({
        text, fontSize: 9, color: '#111', fillColor: '#ffffff', margin: P, ...extra
    });

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

    const tableBody = [
        [ lbl('Name of Student/Graduate'),       val(studentName,   { bold: true, fontSize: 13 }) ],
        [ lbl('Degree/Diploma Obtained'),         val(degree,        { bold: true }) ],
        [ lbl('Major/Track'),                      val(major) ],
        [ lbl('Date of Graduation'),              val(gradDate,      { bold: true }) ],
        [ lbl('Total Units Earned'),              val(unitsEarned) ],
        [ lbl('Remarks/Award'),                   val(awardRemarks) ],
        [ lbl('Mode of Study'),                   val(modeOfStudy) ],
        [ lbl('Term & School Year\nStarted in CSU', { rowSpan: 2 }), termCell('Term/Semester', termStarted) ],
        [ {},                                        termCell('School Year',   syStarted)   ],
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
            // OFFICE + REF NUMBER
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
            // DETAILS TABLE
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
                            { text: verCode || '—', fontSize: 11, bold: true, color: GREEN_CLR, alignment: 'right', characterSpacing: 2 }
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

// ================================================================
// SEARCH & FILTER
// ================================================================

/**
 * Filter the My Requests table by search term and/or status.
 * Operates on allUserRequests[] (already in memory — no DB call).
 * Called on every keystroke and every status dropdown change.
 */
function filterRequests() {
    const searchTerm  = (document.getElementById("requestSearchInput")?.value  || "").trim().toLowerCase();
    const statusFilter = document.getElementById("requestStatusFilter")?.value || "";

    // Show / hide the ✕ clear button inside the search box
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) clearBtn.classList.toggle("d-none", !searchTerm);

    // If there are no requests at all, leave empty-state handling to loadRequests()
    if (allUserRequests.length === 0) return;

    // AND-filter: both conditions must pass
    const filtered = allUserRequests.filter(req => {
        const degree = (req.degree_diploma || "").toLowerCase();
        const name   = (req.student_name   || "").toLowerCase();
        const matchesSearch = !searchTerm  || degree.includes(searchTerm) || name.includes(searchTerm);
        const matchesStatus = !statusFilter || req.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const tbody        = document.getElementById("requestsTable");
    const tableCard    = document.getElementById("requestsTableCard");
    const emptyState   = document.getElementById("emptyState");
    const emptyFiltered = document.getElementById("emptyStateFiltered");
    const resultCount  = document.getElementById("filterResultCount");

    if (filtered.length === 0) {
        // Requests exist but none match the current filter
        if (tableCard)     tableCard.classList.add("d-none");
        if (emptyState)    emptyState.classList.add("d-none");
        if (emptyFiltered) emptyFiltered.classList.remove("d-none");
        if (resultCount)   resultCount.classList.add("d-none");
    } else {
        if (tableCard)     tableCard.classList.remove("d-none");
        if (emptyState)    emptyState.classList.add("d-none");
        if (emptyFiltered) emptyFiltered.classList.add("d-none");
        if (tbody) tbody.innerHTML = filtered.map(req => buildFullTableRow(req)).join("");

        // Show "Showing X of Y" label only when a filter is active
        if (resultCount) {
            const isFiltered = searchTerm || statusFilter;
            if (isFiltered) {
                const total = allUserRequests.length;
                resultCount.textContent =
                    `Showing ${filtered.length} of ${total} request${total !== 1 ? "s" : ""}`;
                resultCount.classList.remove("d-none");
            } else {
                resultCount.classList.add("d-none");
            }
        }
    }
}

/**
 * Clear the search input and re-run the filter.
 * Called by the ✕ button inside the search box.
 */
function clearSearch() {
    const input = document.getElementById("requestSearchInput");
    if (input) { input.value = ""; input.focus(); }
    filterRequests();
}

/**
 * Reset both search and status filter, then re-render.
 * Called by the "Clear Filters" button in the no-results empty state.
 */
function clearFilters() {
    const input  = document.getElementById("requestSearchInput");
    const select = document.getElementById("requestStatusFilter");
    if (input)  input.value  = "";
    if (select) select.value = "";
    filterRequests();
}

// ================================================================
// UTILITIES
// ================================================================

// Utility: Capitalize first letter
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Utility: Show/Hide Loading
function showLoading(show) {
    const overlay = document.getElementById("loadingOverlay");
    if (show) overlay.classList.remove("d-none");
    else overlay.classList.add("d-none");
}

// Utility: Show Alert — message must be pre-escaped before passing to this function
function showAlert(message, type = "info") {
    const container = document.getElementById("alertContainer");
    const alert = document.createElement("div");
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    // NOTE: message is trusted HTML — callers must escape any user-controlled content
    // before passing it here (e.g., escapeHtml(error.message)).
    alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

// ================================================================
// BOOT
// ================================================================
initDashboard();
