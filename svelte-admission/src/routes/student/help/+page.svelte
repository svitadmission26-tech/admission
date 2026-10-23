<script>
    import HelpPage from '$lib/components/HelpPage.svelte';
</script>

<HelpPage title="Student User Guide">
    <p>This guide provides step-by-step instructions for students using the University Admission System.</p>

    <h2>1. Account Creation and Login</h2>

    <h3>Registration</h3>
    <ol>
        <li>Navigate to the <strong>Home Page</strong>.</li>
        <li>Click on the <strong>Register</strong> button in the top navigation bar.</li>
        <li>Fill in the registration form with your:
            <ul>
                <li>Full Name</li>
                <li>Valid Email Address (this will be your username)</li>
                <li>Mobile Number</li>
                <li>Password</li>
            </ul>
        </li>
        <li>Click <strong>Sign Up</strong>.</li>
        <li>Check your email inbox for a verification link. Click the link to activate your account.</li>
    </ol>

    <h3>Login</h3>
    <ol>
        <li>Click the <strong>Login</strong> button.</li>
        <li>Enter your registered Email and Password.</li>
        <li>Click <strong>Sign In</strong>.</li>
        <li>You will be redirected to your <strong>Student Dashboard</strong>.</li>
    </ol>

    <hr />

    <h2>2. Filling an Application Form</h2>

    <h3>Starting an Application</h3>
    <ol>
        <li>On your <strong>Dashboard</strong>, locate the <strong>Open Admission Cycles</strong> section.</li>
        <li>Find the course/college you wish to apply for.</li>
        <li>Click the <strong>Apply Now</strong> button.</li>
    </ol>

    <h3>Completing the Form</h3>
    <p>The application form is divided into sections. You must complete them in order.</p>

    <h4>Step 1: Personal Details</h4>
    <ol>
        <li>Enter your personal information (Date of Birth, Gender, Category, Address, etc.).</li>
        <li>Ensure all fields marked with a red asterisk (*) are filled.</li>
        <li>Click <strong>Save & Next</strong>.</li>
    </ol>

    <h4>Step 2: Academic History</h4>
    <ol>
        <li>Enter details of your previous qualifications (e.g., 10th, 12th, Bachelor's).</li>
        <li>Enter the marks obtained, total marks, and percentage/CGPA.</li>
        <li>Click <strong>Save & Next</strong>.</li>
    </ol>

    <h4>Step 3: Document Upload</h4>
    <ol>
        <li>You will see a list of required documents (e.g., Photo, Signature, Marksheets).</li>
        <li>Click <strong>Choose File</strong> for each document.</li>
        <li>Select the file from your device (Allowed formats: JPG, PNG, PDF; Max size: 2MB).</li>
        <li>Click <strong>Upload</strong> for each file. A preview or success message will appear.</li>
        <li>Click <strong>Save & Next</strong> once all required documents are uploaded.</li>
    </ol>

    <h4>Step 4: Review and Submit</h4>
    <ol>
        <li>Review all the information you have entered.</li>
        <li>Check the <strong>Declaration</strong> box confirming the details are true.</li>
        <li>Click <strong>Submit Application</strong>.
            <ul>
                <li><em>Warning:</em> Once submitted, you cannot edit the form unless requested by the college.</li>
            </ul>
        </li>
    </ol>

    <hr />

    <h2>3. Post-Submission</h2>

    <h3>Tracking Status</h3>
    <ol>
        <li>Go to your <strong>Dashboard</strong>.</li>
        <li>Look at the <strong>My Applications</strong> section.</li>
        <li>The status will be one of the following:
            <ul>
                <li><strong>Submitted:</strong> Waiting for college verification.</li>
                <li><strong>Under Review:</strong> College is currently checking your details.</li>
                <li><strong>Needs Correction:</strong> See below.</li>
                <li><strong>Approved:</strong> Your application is verified.</li>
                <li><strong>Rejected:</strong> Your application was not accepted.</li>
            </ul>
        </li>
    </ol>

    <h3>Handling Corrections</h3>
    <p>If your status is <strong>Needs Correction</strong>:</p>
    <ol>
        <li>Click on the application to view details.</li>
        <li>Look for the <strong>Remarks</strong> or <strong>Rejection Reason</strong> section (e.g., "12th Marksheet is blurry").</li>
        <li>Go to the <strong>Document Upload</strong> section.</li>
        <li>Re-upload the specific document requested.</li>
        <li>Click <strong>Resubmit</strong>.</li>
    </ol>

    <hr />

    <h2>4. Merit Lists and Admission</h2>
    <ol>
        <li>On the announced date, log in to check the <strong>Merit List</strong>.</li>
        <li>If your name appears in the list, you will see an <strong>Admission Offer</strong>.</li>
        <li>Click <strong>Accept Offer</strong> to proceed.</li>
    </ol>

    <hr />

    <h2>5. Fee Payment</h2>
    <ol>
        <li>After accepting the offer, navigate to the <strong>Payments</strong> section.</li>
        <li>Review the fee breakdown.</li>
        <li>Click <strong>Pay Now</strong> to be redirected to the payment gateway.</li>
        <li>Complete the transaction using Credit Card, Debit Card, or Net Banking.</li>
        <li>Once successful, you can download your <strong>Fee Receipt</strong> and <strong>Admission Letter</strong>.</li>
    </ol>
</HelpPage>