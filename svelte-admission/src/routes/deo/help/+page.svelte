<script>
    import HelpPage from '$lib/components/HelpPage.svelte';
</script>

<HelpPage title="Data Entry Operator (DEO) Guide">
    <p>This guide details the process for Data Entry Operators (DEOs) applying on behalf of students.</p>

    <h2>1. Apply on Behalf</h2>

    <h3>Starting an Application</h3>
    <ol>
        <li>Go to the <strong>Applications</strong> tab in the main navigation.</li>
        <li>Click <strong>New Application</strong>.</li>
        <li>Select the <strong>Admission Cycle</strong> and <strong>Course</strong>.</li>
        <li>Enter the Student's Full Name (as per documents).</li>
        <li>Click <strong>Create Draft</strong>.</li>
    </ol>

    <h3>Filling the Application</h3>
    <ol>
        <li><strong>Personal Details:</strong> Enter the student's personal information (DOB, Gender, Category, Address, Mobile).
            <ul>
                <li><em>Note:</em> Ensure the mobile number is correct for notifications.</li>
            </ul>
        </li>
        <li><strong>Academic History:</strong> Enter details of previous qualifications.
            <ul>
                <li>Verify marks against the original marksheets.</li>
            </ul>
        </li>
        <li><strong>Document Upload:</strong>
            <ul>
                <li>Scan the physical documents provided by the student.</li>
                <li>Upload each file (Photo, Signature, Marksheets, etc.).</li>
                <li>Ensure clarity and correct file format.</li>
            </ul>
        </li>
        <li><strong>Review:</strong> Check all entered data with the student present (if possible).</li>
        <li><strong>Submit Application:</strong> Click <strong>Submit</strong>.</li>
    </ol>

    <hr />

    <h2>2. Managing Drafts</h2>
    <p>If an application is incomplete:</p>
    <ol>
        <li>Go to the <strong>My Drafts</strong> tab.</li>
        <li>Find the application by student name or draft ID.</li>
        <li>Click <strong>Resume Application</strong>.</li>
        <li>Complete the missing sections.</li>
        <li><strong>Submit</strong> when ready.</li>
    </ol>

    <hr />

    <h2>3. Search & View</h2>
    <p>To find a previously submitted application:</p>
    <ol>
        <li>Go to the <strong>Search</strong> tab.</li>
        <li>Enter the Student Name or Application ID.</li>
        <li>View the application status (Submitted, Verified, etc.).</li>
        <li><strong>Print Application Form:</strong> Click to generate a PDF for the student's record.</li>
    </ol>

    <hr />

    <h2>4. Reports</h2>
    <ol>
        <li>Go to the <strong>Reports</strong> section.</li>
        <li>View the number of applications submitted by you today/this week.</li>
        <li>Check for any errors or rejections flagged by the system.</li>
    </ol>
</HelpPage>