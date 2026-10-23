<script>
    import HelpPage from '$lib/components/HelpPage.svelte';
</script>

<HelpPage title="Fee Collector Guide">
    <p>This guide is for staff responsible for collecting admission fees and issuing receipts.</p>

    <h2>1. Dashboard Overview</h2>
    <p>After logging in as a <strong>Fee Collector</strong>, you will see:</p>
    <ul>
        <li><strong>Today's Collection:</strong> Total amount collected today.</li>
        <li><strong>Pending Payments:</strong> Number of students who have not yet paid.</li>
        <li><strong>Cleared Payments:</strong> Number of students with successful transactions.</li>
    </ul>

    <hr />

    <h2>2. Fee Collection</h2>

    <h3>Searching for a Student</h3>
    <ol>
        <li>Go to the <strong>Fee Collection</strong> tab.</li>
        <li>Enter the <strong>Application ID</strong>, <strong>Student Name</strong>, or <strong>Mobile Number</strong> in the search bar.</li>
        <li>Click <strong>Search</strong>.</li>
        <li>Select the student from the results.</li>
    </ol>

    <h3>Verifying Payment Details</h3>
    <ol>
        <li>Check the <strong>Fee Structure</strong> displayed.
            <ul>
                <li>Tuition Fee, Exam Fee, etc.</li>
                <li>Total Amount Due.</li>
            </ul>
        </li>
        <li><strong>Payment Mode:</strong> Select the method used by the student (Cash, Cheque, DD, Online Transfer).</li>
        <li><strong>Transaction Details:</strong> Enter the Cheque/DD Number, Bank Name, Date.</li>
    </ol>

    <h3>Processing Payment</h3>
    <ol>
        <li>Click <strong>Collect Fee</strong>.</li>
        <li>Confirm the amount received.</li>
        <li>The system will generate a <strong>Receipt Number</strong>.</li>
        <li><strong>Print Receipt:</strong> Click to print immediately or download as PDF.</li>
    </ol>

    <hr />

    <h2>3. Reconciliation</h2>

    <h3>Daily Closing</h3>
    <ol>
        <li>Go to the <strong>Reports</strong> section.</li>
        <li>Select <strong>Daily Collection Report</strong>.</li>
        <li>Check the total cash/cheque collected against physical cash.</li>
        <li><strong>Submit Closing:</strong> Enter the closing balance and submit for verification.</li>
    </ol>

    <h3>Search Transactions</h3>
    <ol>
        <li>Go to <strong>Transaction History</strong>.</li>
        <li>Filter by Date, Payment Mode, or Student.</li>
        <li>View details of past transactions.</li>
        <li><strong>Reprint Receipt:</strong> If a student requests a duplicate receipt.</li>
    </ol>

    <hr />

    <h2>4. Troubleshooting</h2>
    <ul>
        <li><strong>Payment Mismatch:</strong> If the system shows "Pending" but the student claims to have paid online.
            <ul>
                <li>Check the <strong>Transaction ID</strong> provided by the student.</li>
                <li>Verify with the bank portal.</li>
                <li>Update status manually if confirmed.</li>
            </ul>
        </li>
        <li><strong>Refunds:</strong> For cancelled admissions.
            <ul>
                <li>Go to the student's payment record.</li>
                <li>Click <strong>Initiate Refund</strong>.</li>
                <li>Enter reason and amount.</li>
                <li>Submit for approval.</li>
            </ul>
        </li>
    </ul>
</HelpPage>