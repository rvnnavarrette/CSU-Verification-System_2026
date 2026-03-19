# CSU Registrar Verification System — Demo Guide

A step-by-step walkthrough for demonstrating both the **Client Portal** and the **Admin Dashboard**.

---

## Setup Before the Demo

1. Open a terminal and run:
   ```
   npx serve .
   ```
2. Open two browser tabs:
   - **Tab 1 (Client):** `http://localhost:3000/index.html`
   - **Tab 2 (Admin):** `http://localhost:3000/admin-login.html`

---

## Part 1 — Client Portal

### Step 1: Sign Up as a New Client

1. On `index.html`, click **"Sign Up"** to switch to the registration form.
2. Fill in:
   - **Full Name:** e.g., `Juan Dela Cruz`
   - **Email:** e.g., `juan@example.com`
   - **Password:** e.g., `password123`
3. Click **"Create Account"**.
4. You are automatically signed in and redirected to the **Client Dashboard**.

---

### Step 2: Explore the Client Dashboard

- The **sidebar** shows navigation links: Dashboard, My Requests, and Logout.
- The **stat cards** at the top show counts: Total Requests, Pending, Verified, Not Verified.
- The **Quick Actions bar** lets you jump straight to submitting a new request.

---

### Step 3: Submit a Verification Request

1. Click **"New Request"** (button in the Quick Actions bar or sidebar).
2. The **New Request Modal** opens. Fill in the form:
   - **Client Name:** e.g., `DELA CRUZ, JUAN`
   - **Degree/Diploma:** e.g., `Bachelor of Science in Computer Science`
   - **Major/Track:** e.g., `Software Engineering` *(optional)*
   - **Client Status:** Select **Graduate** or **Undergraduate**
   - **Date of Graduation:** e.g., `March 2025` *(if Graduate)*
   - **Term Started / SY Started:** e.g., `1st Semester / 2021-2022`
   - **Term Ended / SY Ended:** e.g., `2nd Semester / 2024-2025`
   - **School Name / Address:** e.g., `Cagayan State University, Tuguegarao City`
3. Under **Documents**, upload one or more files (PDF, JPG, PNG — max 10 MB each).
   - Graduates: TOR, Diploma, or Certificate of Grades
   - Undergraduates: Certificate of Grades
4. Click **"Submit Request"**.
5. A success message appears and the request is added to the **My Requests** table.

---

### Step 4: Track the Request

1. In the **My Requests** table, find the newly submitted request — its status is **Pending**.
2. Click the **"View"** button on that row.
3. The **Request Detail Modal** opens showing:
   - A **status timeline** (Submitted → Under Review → Decision)
   - All submitted details (Client Name, Degree, Client Status, etc.)
   - Uploaded files with download links
   - Admin remarks *(shown once reviewed)*

---

## Part 2 — Admin Dashboard

### Step 5: Log In as Admin

1. Switch to **Tab 2** (`admin-login.html`).
2. Enter admin credentials:
   - **Email:** `admin@csu.edu.ph`
   - **Password:** *(set during Supabase setup)*
3. Click **"Sign In"** → redirected to the **Admin Dashboard**.

---

### Step 6: Review Pending Requests

1. The **Requests** section opens by default, showing all submissions.
2. Use the **filter tabs** (All / Pending / Verified / Not Verified) to narrow down.
3. Use the **search bar** to look up a client by name.
4. Find the request just submitted by the client.
5. Click the **kebab menu (⋮)** on that row → select **"Update Status"**.

---

### Step 7: Approve or Reject a Request

1. In the **Update Status** modal:
   - Set **Status** to `Verified` or `Not Verified`.
   - Enter **Admin Remarks** (e.g., `"All documents are complete and verified."`)
   - Enter **Document Assessment** (e.g., `"TOR and Diploma match institutional records."`)
2. Click **"Save"**.
3. The row updates instantly — status badge changes to green (Verified) or red (Not Verified).

---

### Step 8: Real-Time Update on Client Side

1. Switch back to **Tab 1** (client dashboard).
2. Without refreshing, the **My Requests** table and **stat cards** automatically update to reflect the new status.
3. Click **"View"** on the request to see the admin's remarks in the detail modal.

---

### Step 9: Export and Print

1. Back in the Admin Dashboard:
   - Click **"Export CSV"** to download all requests as a spreadsheet.
   - Click **"Print Letter"** on any verified request to generate a printable verification letter.

---

## Part 3 — Student Records (Admin)

### Step 10: Import Student Records from CSV

1. In the Admin Dashboard, click the **"Records"** tab in the sidebar.
2. Click **"Import CSV"**.
3. Upload `database/mock-students.csv` (the sample file included in the project).
4. The system parses and inserts all records into the database — graduates, undergraduates, transferees, and dropouts.
5. Use the **filter tabs** and **search bar** to browse records.

---

### Step 11: Add / Edit / Delete a Record Manually

1. Click **"Add Record"** to manually enter a student.
2. Click the **edit icon (✏)** on any row to update their info.
3. Click the **delete icon (🗑)** and confirm to remove a record.
4. All changes sync to Supabase in real time.

---

### Step 12: Export Records

- Click **"Export CSV"** in the Records section to download the full student records list.

---

## Part 4 — Reports (Admin)

### Step 13: View Enrollment Reports

1. Click the **"Reports"** tab in the Admin sidebar.
2. View auto-generated report cards:
   - **Transferees** — count and list
   - **Dropouts** — count and list
   - **Graduates** — count and list
3. Scroll down to the **Enrollment Trends** bar chart (Chart.js), grouped by school year.
4. Click **"Print Chart"** to export the chart as a printable page.

---

## Demo Summary

| Step | Who   | Action                          | Result                              |
|------|-------|---------------------------------|-------------------------------------|
| 1    | Client| Sign up & log in                | Redirected to Client Dashboard      |
| 2    | Client| Submit verification request     | Request appears as Pending          |
| 3    | Admin | Log in to Admin Dashboard       | Sees all pending requests           |
| 4    | Admin | Update request status           | Status changes to Verified/Rejected |
| 5    | Client| Dashboard auto-updates          | Sees verified status + remarks      |
| 6    | Admin | Import CSV student records      | Records appear in Records tab       |
| 7    | Admin | View Reports & Enrollment Chart | Charts and counts rendered          |
| 8    | Admin | Export CSV / Print Letter       | File downloaded / print dialog      |

---

*System built with HTML · CSS · Bootstrap 5 · JavaScript · Supabase (PostgreSQL + Auth + Storage + Realtime)*
