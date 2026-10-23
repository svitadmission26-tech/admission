<script>
    import HelpPage from '$lib/components/HelpPage.svelte';
</script>

<HelpPage title="University Authority Guide">
    <p>This guide is for University-level administrators responsible for the entire admission process across multiple colleges.</p>

    <h2>1. Dashboard Overview</h2>
    <p>After logging in as a <strong>University Authority</strong>, you will see:</p>
    <ul>
        <li><strong>Total Admissions:</strong> Number of successful enrollments across all affiliated colleges.</li>
        <li><strong>Verified Applications:</strong> Number of applications pending approval.</li>
        <li><strong>Merit List Schedule:</strong> Upcoming dates for merit list generation.</li>
        <li><strong>Reports:</strong> Quick links to admission statistics.</li>
    </ul>

    <hr />

    <h2>2. Managing Admissions</h2>

    <h3>Admission Cycles</h3>
    <ol>
        <li>Go to the <strong>Admission Cycles</strong> tab.</li>
        <li>Click <strong>Create New Cycle</strong>.</li>
        <li>Enter the details:
            <ul>
                <li>Academic Year (e.g., 2026-27).</li>
                <li>Start Date: When applications open.</li>
                <li>End Date: When applications close.</li>
            </ul>
        </li>
        <li>Click <strong>Save</strong>.</li>
        <li><strong>Publish Cycle:</strong> Makes the cycle active for students.</li>
    </ol>

    <h3>Course Management</h3>
    <ol>
        <li>Go to the <strong>Courses</strong> tab.</li>
        <li>Click <strong>Add New Course</strong>.</li>
        <li>Enter course details (Name, Code, Intake Capacity, etc.).</li>
        <li>Link the course to specific colleges.</li>
        <li>Click <strong>Save</strong>.</li>
    </ol>

    <hr />

    <h2>3. Merit Rules & Lists (Global)</h2>
    <p>For university-wide merit lists:</p>
    <ol>
        <li>Go to the <strong>Merit Rules</strong> tab.</li>
        <li><strong>Define Formula:</strong> Create a new formula for scoring.
            <ul>
                <li>Select the criteria (e.g., Entrance Marks, HSC Marks).</li>
                <li>Set the weightage for each (e.g., Entrance: 60%, HSC: 40%).</li>
                <li>Save the formula.</li>
            </ul>
        </li>
        <li><strong>Map Formula:</strong> Assign the formula to specific courses/colleges.</li>
    </ol>

    <h3>Generating Merit Lists</h3>
    <ol>
        <li>Go to the <strong>Merit Lists</strong> tab.</li>
        <li>Select the <strong>Admission Cycle</strong> and <strong>Course</strong>.</li>
        <li>Click <strong>Run Merit Generation</strong>.
            <ul>
                <li>The system calculates scores for all verified applications.</li>
                <li>This may take a few minutes depending on the volume.</li>
            </ul>
        </li>
        <li><strong>Review:</strong> Check the top ranks for anomalies.</li>
        <li><strong>Publish:</strong> Click <strong>Publish</strong> to release the list on the student portal.</li>
    </ol>

    <hr />

    <h2>4. Final Approvals</h2>
    <p>For applications requiring university approval:</p>
    <ol>
        <li>Go to the <strong>Approvals</strong> tab.</li>
        <li>Filter for "Pending University Approval".</li>
        <li>Review the application details and documents.</li>
        <li><strong>Approve:</strong> Validate the application for final admission.</li>
        <li><strong>Reject/Return:</strong> Send back to the college for correction.</li>
    </ol>

    <hr />

    <h2>5. Reports</h2>
    <ol>
        <li>Go to the <strong>Reports</strong> section.</li>
        <li>Generate comprehensive reports:
            <ul>
                <li><strong>Admission Summary:</strong> Total applications, verified, admitted.</li>
                <li><strong>College-wise Report:</strong> Admissions per college.</li>
                <li><strong>Category-wise Report:</strong> Break down by reservation category.</li>
                <li><strong>Fee Collection Report:</strong> Total fees collected.</li>
            </ul>
        </li>
        <li>Export data to Excel/PDF.</li>
    </ol>
</HelpPage>