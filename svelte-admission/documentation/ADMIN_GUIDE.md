# Admin User Guide 

This guide is for System Administrators responsible for the overall configuration, user management, and maintenance of the University Admission System.

## 0. Initial Project Setup (For IT/DevOps)

If you are deploying this system to a **brand-new Supabase project**, follow these steps to initialize the database and create your first administrator account.

### A. Initialize Database Schema
1. Open your terminal in the project root.
2. Locate your new Supabase project's PostgreSQL connection string (found in Supabase Dashboard > Settings > Database > URI).
3. Run the master setup script to create all tables, policies, and triggers:
   ```bash
   node scripts/setup_new_db.js "postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
   ```

### B. Create the First Admin User
Once the database is initialized, you need a way to log in. Use the provided utility script to securely create the first system administrator.

1. Ensure your `.env` file contains the URL and Service Role Key for the *new* project:
   `NEW_PUBLIC_SUPABASE_URL="https://your-new-project.supabase.co"`
   `NEW_SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"`
2. Run the script:
   ```bash
   node scripts/create_admin_user.js "admin@university.edu" "SecurePassword123!" "Super Admin"
   ```
3. You can now log into the web interface using these credentials.

---

## 1. User Management

### Creating Users
1.  Navigate to the **Users** section in the main dashboard.
2.  Click **Add New User**.
3.  Enter the user's details:
    *   Full Name
    *   Email Address
    *   Mobile Number (Optional)
    *   **Role:** Select from the dropdown (Admin, University Auth, College Auth, DEO, Fee Collector).
    *   **Affiliation:** Select the college/university the user belongs to (if applicable).
4.  Click **Create User**.
    *   The user will receive an email with login instructions.

### Managing Permissions
1.  Click on the **Roles & Permissions** tab.
2.  Select a role (e.g., "College Auth").
3.  **Assign Permissions:** Check/uncheck boxes for actions like "View Applications", "Edit Forms", "Generate Reports".
4.  Click **Save Changes**.

---

## 2. System Configuration

### General Settings
1.  Go to the **System Settings** page.
2.  Configure global parameters:
    *   System Name & Logo.
    *   Contact Email & Phone.
    *   Base URL (e.g., `https://admissions.university.edu`).
    *   Time Zone.
3.  Click **Update Settings**.

### Academic Cycles
1.  Navigate to **Academic Calendar**.
2.  Click **Add New Year**.
3.  Define the Start and End Dates for the academic session (e.g., July 2026 - June 2027).
4.  Set the **Current Session** toggle to active.

---

## 3. Form Builder

### Creating Application Forms
1.  Go to the **Forms** section.
2.  Click **Create New Form**.
3.  Enter a Form Name (e.g., "UG Admission Form 2026").
4.  **Add Sections:** Drag and drop sections (Personal Details, Academic History, Documents).
5.  **Add Fields:** Within each section, add fields:
    *   Text Input, Dropdown, Checkbox, File Upload.
    *   **Validation:** Mark fields as Required, set min/max lengths.
    *   **Map to Database:** Link fields to database columns (e.g., `first_name`, `dob`).
6.  Click **Save Form**.
7.  **Publish:** Make the form active for specific courses.

### Datagrid Column Mapping & Merit Scores
When using the **Table Layout** for a form section:
1.  **Configure Columns:** You can define columns like "Theory" or "Practical".
2.  **Merit Columns:** Check "Is Merit Score?" on a column to designate it for merit calculation. You must also set a default "Max Score" for that column.
3.  **Row Configuration:** When you add a subject (row) to the table, it will automatically use the default max scores defined by the merit columns.
4.  **Row-Specific Max Scores:** If a specific subject has a different maximum score than the default, you can override the max score for that specific row/column intersection.
5.  **Merit Calculations:** Merit Formulas will use the flattened keys from the datagrid (e.g., `subject_theory_score`) for calculations.

---

## 4. Fee Structures

### Defining Fees
1.  Go to the **Fees** module.
2.  Click **Add Fee Structure**.
3.  Select the **Admission Cycle** and **Course**.
4.  **Add Fee Heads:**
    *   Tuition Fee
    *   Library Fee
    *   Exam Fee
    *   Development Fee
5.  Enter the amount for each head.
6.  **Total Fee:** Automatically calculated.
7.  Click **Save Fee Structure**.

---

## 5. Master Data

### Universities & Colleges
1.  Go to **Master Data > Universities**.
    *   Add/Edit University details.
2.  Go to **Master Data > Colleges**.
    *   Add/Edit College details (Name, Code, Address).
    *   Assign affiliated courses.

### Courses
1.  Go to **Master Data > Courses**.
    *   Add/Edit Course details (Name, Code, Type: UG/PG).
    *   Link to specific departments.

---

## 6. Audit & Logs

1.  Navigate to **System Logs**.
2.  View activity logs:
    *   User Login/Logout.
    *   Data modifications (Create/Update/Delete).
    *   Error logs.
3.  Filter by Date, User, or Action Type.
