<script>
    import HelpPage from '$lib/components/HelpPage.svelte';
</script>

<HelpPage title="Configuration Guide">
    <p>This guide provides step-by-step instructions for configuring key system modules.</p>

    <h2>0. Initial Project Setup (For IT/DevOps)</h2>
    <p>If you are deploying this system to a <strong>brand-new Supabase project</strong>, follow these steps to initialize the database and create your first administrator account.</p>
    
    <h4>A. Initialize Database Schema</h4>
    <ol>
        <li>Open your terminal in the project root.</li>
        <li>Locate your new Supabase project's PostgreSQL connection string (found in Supabase Dashboard > Settings > Database > URI).</li>
        <li>Run the master setup script to create all tables, policies, and triggers:
            <pre class="bg-light p-2 border rounded mt-2"><code>node scripts/setup_new_db.js "postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"</code></pre>
        </li>
    </ol>

    <h4>B. Create the First Admin User</h4>
    <p>Once the database is initialized, you need a way to log in. Use the provided utility script to securely create the first system administrator.</p>
    <ol>
        <li>Ensure your <code>.env</code> file contains the URL and Service Role Key for the <em>new</em> project:
            <pre class="bg-light p-2 border rounded mt-2"><code>NEW_PUBLIC_SUPABASE_URL="https://your-new-project.supabase.co"
NEW_SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"</code></pre>
        </li>
        <li>Run the script:
            <pre class="bg-light p-2 border rounded mt-2"><code>node scripts/create_admin_user.js "admin@university.edu" "SecurePassword123!" "Super Admin"</code></pre>
        </li>
        <li>You can now log into the web interface using these credentials.</li>
    </ol>

    <hr />

    <h2>1. University Branding</h2>
    <p>To customize the look and feel of the portal:</p>
    <ol>
        <li>Navigate to <strong>System Settings</strong>.</li>
        <li>Update the <strong>University Name</strong>, <strong>Logo URL</strong>, and <strong>Footer Text</strong>.</li>
        <li>Set the <strong>Contact Information</strong> (Email, Phone) which will be visible on the Student Support page.</li>
        <li>Click <strong>Save Changes</strong>.</li>
    </ol>

    <hr />

    <h2>2. Admission Cycles</h2>
    <p>To open or close admissions:</p>
    <ol>
        <li>Go to <strong>Academic Calendar</strong> or <strong>Admission Cycles</strong>.</li>
        <li>To <strong>Open Admissions</strong>:
            <ul>
                <li>Create a new Cycle or Edit an existing one.</li>
                <li>Set the <strong>Status</strong> to "Active" or "Open".</li>
                <li>Ensure the Start and End dates are valid.</li>
            </ul>
        </li>
        <li>To <strong>Close Admissions</strong>:
            <ul>
                <li>Edit the current cycle.</li>
                <li>Set the <strong>Status</strong> to "Closed".</li>
                <li>Students will no longer be able to submit new applications.</li>
            </ul>
        </li>
    </ol>

    <hr />

    <h2>3. Fee Structures</h2>
    <p>To set up fees for a new academic year:</p>
    <ol>
        <li>Navigate to <strong>Fee Structures</strong>.</li>
        <li>Click <strong>Add Fee Structure</strong>.</li>
        <li>Select the <strong>Admission Cycle</strong> (e.g., 2026-2027) and <strong>Course</strong>.</li>
        <li>Add <strong>Fee Heads</strong> (Tuition, Exam, etc.) and their respective amounts.</li>
        <li>The system automatically calculates the total.</li>
        <li><strong>Save</strong> the structure. It will now apply to all applicants for that course/cycle.</li>
    </ol>

    <hr />

    <h2>4. Report Templates</h2>
    <p>To manage dynamic reports:</p>
    <ol>
        <li>Go to <strong>Report Builder</strong>.</li>
        <li>Click <strong>Create Template</strong>.</li>
        <li>Select the <strong>Data Source</strong> (e.g., Applications, Payments).</li>
        <li>Choose the <strong>Columns</strong> to include in the report.</li>
        <li>Set default <strong>Filters</strong> (e.g., Status = 'Admitted').</li>
        <li>Save the template. It will be available for other users (DEO, College Auth) based on permissions.</li>
    </ol>
</HelpPage>
