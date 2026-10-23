<script>
    import HelpPage from '$lib/components/HelpPage.svelte';
</script>

<HelpPage title="College Authority Guide">
    <p>This guide details the processes for college staff responsible for verifying student applications and managing admissions.</p>

    <h2>1. Dashboard Overview</h2>
    <p>After logging in as a <strong>College Authority</strong>, you will see:</p>
    <ul>
        <li><strong>Total Applications:</strong> Number of applications received for your college.</li>
        <li><strong>Pending Verification:</strong> Applications waiting for review.</li>
        <li><strong>Approved:</strong> Applications that have passed verification.</li>
        <li><strong>Rejected:</strong> Applications deemed ineligible.</li>
    </ul>

    <hr />

    <h2>2. Application Verification</h2>

    <h3>Reviewing Applications</h3>
    <ol>
        <li>Go to the <strong>Applications</strong> tab in the main navigation.</li>
        <li>Use the <strong>Filters</strong> to find "Submitted" or "Pending" applications.</li>
        <li>Click on an application ID to view details.</li>
    </ol>

    <h3>Split-Screen Verification</h3>
    <p>The verification interface shows:</p>
    <ul>
        <li><strong>Left Panel:</strong> Student data (Name, Marks, etc.) entered in the form.</li>
        <li><strong>Right Panel:</strong> Uploaded documents corresponding to that data.</li>
    </ul>
    <ol>
        <li><strong>Personal Details:</strong> Check the student's name, DOB, and category against the uploaded ID proof.</li>
        <li><strong>Academic Details:</strong> Compare the entered marks with the uploaded marksheets.</li>
        <li><strong>Document Actions:</strong>
            <ul>
                <li><strong>Approve:</strong> If the document is clear and matches the data.</li>
                <li><strong>Reject:</strong> If the document is illegible, incorrect, or missing. Select a reason (e.g., "Blurry", "Wrong Year", "Name Mismatch").</li>
            </ul>
        </li>
    </ol>

    <h3>Final Decision</h3>
    <ol>
        <li><strong>Approve Application:</strong> If all documents and data are correct.
            <ul>
                <li>The application moves to the <strong>Approved</strong> list.</li>
            </ul>
        </li>
        <li><strong>Request Correction:</strong> If any document/field was rejected.
            <ul>
                <li>The student will be notified to re-upload.</li>
                <li>The application status changes to <strong>Needs Correction</strong>.</li>
            </ul>
        </li>
        <li><strong>Reject Application:</strong> If the student is ineligible (e.g., marks below cutoff).
            <ul>
                <li>Provide a detailed reason.</li>
                <li>The application status changes to <strong>Rejected</strong>.</li>
            </ul>
        </li>
    </ol>

    <hr />

    <h2>3. Merit List Generation (College Level)</h2>
    <p>If your college manages its own merit lists:</p>
    <ol>
        <li>Go to the <strong>Merit Lists</strong> tab.</li>
        <li>Select the <strong>Admission Cycle</strong> and <strong>Course</strong>.</li>
        <li>Click <strong>Generate Merit List</strong>.
            <ul>
                <li>The system will calculate scores based on defined formulas.</li>
            </ul>
        </li>
        <li><strong>Review:</strong> Check the generated list for accuracy.</li>
        <li><strong>Publish:</strong> Click <strong>Publish</strong> to make the list visible to students.</li>
    </ol>

    <hr />

    <h2>4. Admission Confirmation</h2>
    <p>Once a student accepts an offer and pays fees:</p>
    <ol>
        <li>Go to the <strong>Admissions</strong> tab.</li>
        <li>You will see a list of students with <strong>Provisional Admission</strong>.</li>
        <li>Verify the payment status (usually automated).</li>
        <li>Click <strong>Confirm Admission</strong> to finalize their enrollment.</li>
        <li><strong>Print Admission Letter:</strong> You can download/print the official letter for college records.</li>
    </ol>

    <hr />

    <h2>5. Reports</h2>
    <ol>
        <li>Go to the <strong>Reports</strong> section.</li>
        <li>Select the report type (e.g., "Daily Applications", "Category-wise Admissions").</li>
        <li>Choose the date range.</li>
        <li>Click <strong>Download CSV</strong> or <strong>Print</strong>.</li>
    </ol>
</HelpPage>