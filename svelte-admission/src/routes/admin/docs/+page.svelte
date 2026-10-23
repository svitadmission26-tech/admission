<script>
    import HelpPage from '$lib/components/HelpPage.svelte';
</script>

<HelpPage title="Admin User Guide">
    <p>This guide is for System Administrators responsible for the overall configuration, user management, and maintenance of the University Admission System.</p>

    <h2>1. User Management</h2>

    <h3>Creating Users</h3>
    <ol>
        <li>Navigate to the <strong>Users</strong> section in the main dashboard.</li>
        <li>Click <strong>Add New User</strong>.</li>
        <li>Enter the user's details:
            <ul>
                <li>Full Name</li>
                <li>Email Address</li>
                <li>Mobile Number (Optional)</li>
                <li><strong>Role:</strong> Select from the dropdown (Admin, University Auth, College Auth, DEO, Fee Collector).</li>
                <li><strong>Affiliation:</strong> Select the college/university the user belongs to (if applicable).</li>
            </ul>
        </li>
        <li>Click <strong>Create User</strong>.
            <ul>
                <li>The user will receive an email with login instructions.</li>
            </ul>
        </li>
    </ol>

    <h3>Managing Permissions</h3>
    <ol>
        <li>Click on the <strong>Roles & Permissions</strong> tab.</li>
        <li>Select a role (e.g., "College Auth").</li>
        <li><strong>Assign Permissions:</strong> Check/uncheck boxes for actions like "View Applications", "Edit Forms", "Generate Reports".</li>
        <li>Click <strong>Save Changes</strong>.</li>
    </ol>

    <hr />

    <h2>2. System Configuration</h2>

    <h3>General Settings</h3>
    <ol>
        <li>Go to the <strong>System Settings</strong> page.</li>
        <li>Configure global parameters:
            <ul>
                <li>System Name & Logo.</li>
                <li>Contact Email & Phone.</li>
                <li>Base URL (e.g., <code>https://admissions.university.edu</code>).</li>
                <li>Time Zone.</li>
            </ul>
        </li>
        <li>Click <strong>Update Settings</strong>.</li>
    </ol>

    <h3>Academic Cycles</h3>
    <ol>
        <li>Navigate to <strong>Academic Calendar</strong>.</li>
        <li>Click <strong>Add New Year</strong>.</li>
        <li>Define the Start and End Dates for the academic session (e.g., July 2026 - June 2027).</li>
        <li>Set the <strong>Current Session</strong> toggle to active.</li>
    </ol>

    <hr />

    <h2>3. Form Builder</h2>

    <h3>Creating Application Forms</h3>
    <ol>
        <li>Go to the <strong>Forms</strong> section.</li>
        <li>Click <strong>Create New Form</strong>.</li>
        <li>Enter a Form Name (e.g., "UG Admission Form 2026").</li>
        <li><strong>Add Sections:</strong> Drag and drop sections (Personal Details, Academic History, Documents).</li>
        <li><strong>Add Fields:</strong> Within each section, add fields:
            <ul>
                <li>Text Input, Dropdown, Checkbox, File Upload.</li>
                <li><strong>Validation:</strong> Mark fields as Required, set min/max lengths.</li>
                <li><strong>Map to Database:</strong> Link fields to database columns (e.g., <code>first_name</code>, <code>dob</code>).</li>
            </ul>
        </li>
        <li>Click <strong>Save Form</strong>.</li>
        <li><strong>Publish:</strong> Make the form active for specific courses.</li>
    </ol>

    <hr />

    <h2>4. Fee Structures</h2>

    <h3>Defining Fees</h3>
    <ol>
        <li>Go to the <strong>Fees</strong> module.</li>
        <li>Click <strong>Add Fee Structure</strong>.</li>
        <li>Select the <strong>Admission Cycle</strong> and <strong>Course</strong>.</li>
        <li><strong>Add Fee Heads:</strong>
            <ul>
                <li>Tuition Fee</li>
                <li>Library Fee</li>
                <li>Exam Fee</li>
                <li>Development Fee</li>
            </ul>
        </li>
        <li>Enter the amount for each head.</li>
        <li><strong>Total Fee:</strong> Automatically calculated.</li>
        <li>Click <strong>Save Fee Structure</strong>.</li>
    </ol>

    <hr />

    <h2>5. Master Data</h2>

    <h3>Universities & Colleges</h3>
    <ol>
        <li>Go to <strong>Master Data > Universities</strong>.
            <ul>
                <li>Add/Edit University details.</li>
            </ul>
        </li>
        <li>Go to <strong>Master Data > Colleges</strong>.
            <ul>
                <li>Add/Edit College details (Name, Code, Address).</li>
                <li>Assign affiliated courses.</li>
            </ul>
        </li>
    </ol>

    <h3>Courses</h3>
    <ol>
        <li>Go to <strong>Master Data > Courses</strong>.
            <ul>
                <li>Add/Edit Course details (Name, Code, Type: UG/PG).</li>
                <li>Link to specific departments.</li>
            </ul>
        </li>
    </ol>

    <hr />

    <h2>6. Audit & Logs</h2>
    <ol>
        <li>Navigate to <strong>System Logs</strong>.</li>
        <li>View activity logs:
            <ul>
                <li>User Login/Logout.</li>
                <li>Data modifications (Create/Update/Delete).</li>
                <li>Error logs.</li>
            </ul>
        </li>
        <li>Filter by Date, User, or Action Type.</li>
    </ol>
</HelpPage>
