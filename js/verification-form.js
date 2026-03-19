// Verification Form Logic

let currentUser = null;
let studentStatus = "graduate";
let selectedFiles = [];

// Initialize form
async function initForm() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentUser = user;

        populateYearDropdowns();
        populateApproxGradYears();
        setupFileUpload();
        showLoading(false);
    } catch (error) {
        console.error("Form init error:", error);
        showLoading(false);
    }
}

// Populate school year dropdowns
function populateYearDropdowns() {
    const currentYear = new Date().getFullYear();
    const startYear = 1990;
    const yearOptions = [];

    for (let y = currentYear; y >= startYear; y--) {
        yearOptions.push(`<option value="${y}-${y + 1}">${y}-${y + 1}</option>`);
    }

    const optionsHtml = '<option value="">Select Year</option>' + yearOptions.join("");
    document.getElementById("schoolYearStarted").innerHTML = optionsHtml;
    document.getElementById("schoolYearEnded").innerHTML = optionsHtml;
}

// Populate approximate graduation year dropdown
function populateApproxGradYears() {
    const currentYear = new Date().getFullYear();
    const startYear = 1990;
    const options = ['<option value="">Select approximate year</option>'];
    for (let y = currentYear; y >= startYear; y--) {
        options.push(`<option value="${y}">${y}</option>`);
    }
    document.getElementById("approxGradYear").innerHTML = options.join("");
}

// Toggle "unsure of graduation date" checkbox
function toggleGradDateUnsure() {
    const unsure = document.getElementById("unsureGradDate").checked;
    const exactGroup = document.getElementById("exactDateGroup");
    const approxGroup = document.getElementById("approxYearGroup");

    if (unsure) {
        exactGroup.classList.add("d-none");
        approxGroup.classList.remove("d-none");
        document.getElementById("dateOfGraduation").value = "";
    } else {
        exactGroup.classList.remove("d-none");
        approxGroup.classList.add("d-none");
        document.getElementById("approxGradYear").value = "";
    }
}

// Toggle student status
function setStudentStatus(status) {
    studentStatus = status;
    const gradBtn = document.getElementById("graduateBtn");
    const undergradBtn = document.getElementById("undergraduateBtn");
    const gradFields = document.getElementById("graduateFields");

    if (status === "graduate") {
        gradBtn.classList.add("active");
        undergradBtn.classList.remove("active");
        gradFields.style.display = "block";
        document.getElementById("uploadInstructions").textContent =
            "Upload your TOR, Diploma, or Certificate of Grades if available. Accepted formats: PDF, JPG, PNG (max 10MB each).";
    } else {
        undergradBtn.classList.add("active");
        gradBtn.classList.remove("active");
        gradFields.style.display = "none";
        document.getElementById("dateOfGraduation").value = "";
        document.getElementById("approxGradYear").value = "";
        document.getElementById("unsureGradDate").checked = false;
        document.getElementById("exactDateGroup").classList.remove("d-none");
        document.getElementById("approxYearGroup").classList.add("d-none");
        document.getElementById("uploadInstructions").textContent =
            "Upload your Certificate of Grades if available. Accepted formats: PDF, JPG, PNG (max 10MB each).";
    }
}

// File Upload Setup
function setupFileUpload() {
    const uploadArea = document.getElementById("fileUploadArea");
    const fileInput = document.getElementById("fileInput");

    // Drag and drop
    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
    });

    uploadArea.addEventListener("dragleave", () => {
        uploadArea.classList.remove("dragover");
    });

    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("dragover");
        addFiles(e.dataTransfer.files);
    });

    // File input change
    fileInput.addEventListener("change", () => {
        addFiles(fileInput.files);
        fileInput.value = "";
    });
}

// Add files to selection
function addFiles(files) {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    const maxSize = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
            showAlert(`"${file.name}" is not a supported format. Use PDF, JPG, or PNG.`, "warning");
            continue;
        }
        if (file.size > maxSize) {
            showAlert(`"${file.name}" exceeds 10MB limit.`, "warning");
            continue;
        }
        selectedFiles.push(file);
    }

    renderFileList();
}

// Render selected files
function renderFileList() {
    const container = document.getElementById("fileList");

    if (selectedFiles.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = selectedFiles.map((file, index) => {
        const icon = file.type === "application/pdf" ? "bi-file-earmark-pdf text-danger" : "bi-file-earmark-image text-primary";
        const size = (file.size / 1024 / 1024).toFixed(2);
        return `
            <div class="d-flex align-items-center justify-content-between p-2 border rounded mb-2">
                <div>
                    <i class="bi ${icon} me-2"></i>
                    <span>${escapeHtml(file.name)}</span>
                    <small class="text-muted ms-2">(${size} MB)</small>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeFile(${index})">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        `;
    }).join("");
}

// Remove file
function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
}

// Upload files to Supabase Storage
async function uploadFiles(requestId) {
    const uploadedFiles = [];
    const bucket = 'verification-files';

    for (const file of selectedFiles) {
        const filePath = `verificationFiles/${currentUser.id}/${requestId}/${Date.now()}_${file.name}`;

        const { data, error } = await supabaseClient.storage
            .from(bucket)
            .upload(filePath, file);

        if (error) {
            throw new Error(`Failed to upload "${file.name}": ${error.message}`);
        }

        const { data: urlData } = supabaseClient.storage
            .from(bucket)
            .getPublicUrl(filePath);

        uploadedFiles.push({
            name: file.name,
            url: urlData.publicUrl,
            type: file.type
        });
    }

    return uploadedFiles;
}

// Handle form submit
async function handleSubmit(e) {
    e.preventDefault();

    const lastName = document.getElementById("lastName").value.trim().toUpperCase();
    const firstName = document.getElementById("firstName").value.trim().toUpperCase();
    const middleName = document.getElementById("middleName").value.trim().toUpperCase();

    if (!lastName || !firstName) {
        showAlert("Please fill in all required fields.", "danger");
        return;
    }

    showLoading(true);
    document.getElementById("submitBtn").disabled = true;

    try {
        // Generate a unique request ID
        const requestId = crypto.randomUUID();

        // Upload files (if any)
        const uploadedFiles = selectedFiles.length > 0 ? await uploadFiles(requestId) : [];

        // Build student name
        const studentName = middleName
            ? `${lastName}, ${firstName} ${middleName}`
            : `${lastName}, ${firstName}`;

        // Resolve graduation date: exact date, approximate year, or null
        let gradDate = null;
        if (studentStatus === "graduate") {
            const unsure = document.getElementById("unsureGradDate").checked;
            if (unsure) {
                const approxYear = document.getElementById("approxGradYear").value;
                gradDate = approxYear ? `Approximate: ${approxYear}` : null;
            } else {
                gradDate = document.getElementById("dateOfGraduation").value || null;
            }
        }

        // Save to Supabase database
        const { error } = await supabaseClient
            .from('verification_requests')
            .insert({
                id: requestId,
                user_id: currentUser.id,
                student_name: studentName,
                degree_diploma: document.getElementById("degreeDiploma").value.trim(),
                major_track: document.getElementById("majorTrack").value.trim(),
                student_status: studentStatus,
                date_of_graduation: gradDate,
                term_started: document.getElementById("termStarted").value,
                school_year_started: document.getElementById("schoolYearStarted").value,
                term_ended: document.getElementById("termEnded").value,
                school_year_ended: document.getElementById("schoolYearEnded").value,
                school_name: document.getElementById("schoolName").value.trim().toUpperCase(),
                school_address: document.getElementById("schoolAddress").value.trim().toUpperCase(),
                uploaded_files: uploadedFiles,
                status: "pending",
                admin_remarks: null
            });

        if (error) throw error;

        showLoading(false);
        showAlert("Verification request submitted successfully!", "success");

        // Redirect to dashboard after a short delay
        setTimeout(() => {
            window.location.href = "user-dashboard.html";
        }, 1500);

    } catch (error) {
        console.error("Submit error:", error);
        showLoading(false);
        document.getElementById("submitBtn").disabled = false;
        showAlert("Error submitting request: " + error.message, "danger");
    }
}

// Utility: Escape HTML
function escapeHtml(text) {
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

// Utility: Show Alert
function showAlert(message, type = "info") {
    const container = document.getElementById("alertContainer");
    const alert = document.createElement("div");
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

// Run on page load
initForm();
