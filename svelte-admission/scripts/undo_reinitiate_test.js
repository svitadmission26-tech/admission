#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Target student or receipt to revert
const args = process.argv.slice(2);
const receiptParam = args.find(a => a.startsWith('--receipt='))?.split('=')[1];
const isDryRun = args.includes('--dry-run');

async function revertReinitiation() {
    console.log('====================================================');
    console.log('🔄 REVERT RE-INITIATION TEST SCRIPT');
    console.log('====================================================');

    let paymentQuery = supabase
        .from('payments')
        .select(`
            id,
            application_id,
            amount,
            receipt_number,
            transaction_id,
            reference_no,
            created_at,
            applications (
                id,
                student_id,
                course_id,
                branch_id,
                status,
                users:student_id (
                    full_name,
                    email,
                    student_profiles(enrollment_number, admission_status)
                )
            )
        `);

    if (receiptParam) {
        paymentQuery = paymentQuery.eq('receipt_number', receiptParam);
    } else {
        paymentQuery = paymentQuery.ilike('reference_no', 'Re-initiated%').order('created_at', { ascending: false }).limit(1);
    }

    const { data: paymentRes, error: pErr } = await paymentQuery;
    const payment = Array.isArray(paymentRes) ? paymentRes[0] : paymentRes;

    if (pErr || !payment) {
        console.error(`❌ Payment with receipt "${receiptArg}" not found in database.`);
        return;
    }

    const app = payment.applications;
    const studentUser = app?.users;
    const studentProfile = Array.isArray(studentUser?.student_profiles)
        ? studentUser?.student_profiles[0]
        : studentUser?.student_profiles;

    console.log('📋 Target Record Details:');
    console.log(`   - Student Name:   ${studentUser?.full_name} (${studentUser?.email})`);
    console.log(`   - Application ID: ${app?.id}`);
    console.log(`   - Payment ID:     ${payment.id}`);
    console.log(`   - Receipt Number: ${payment.receipt_number}`);
    console.log(`   - Amount:         ₹${payment.amount}`);
    console.log(`   - Current Status: ${app?.status} (Profile: ${studentProfile?.admission_status}, Enrollment: ${studentProfile?.enrollment_number})\n`);

    // 2. Fetch the transfer history entry to retrieve original branch/course
    const { data: historyList } = await supabase
        .from('student_transfer_history')
        .select('*')
        .eq('application_id', app?.id)
        .order('transferred_at', { ascending: false });

    const latestHistory = historyList?.[0];
    const prevEnrollment = latestHistory?.previous_enrollment_number && latestHistory.previous_enrollment_number !== 'N/A' 
        ? latestHistory.previous_enrollment_number 
        : null;
    const prevCourseId = latestHistory?.previous_course_id || app?.course_id;
    const prevBranchId = latestHistory?.previous_branch_id || '6ddfa420-0c09-41d2-b688-277cd3863f48'; // Original CSD branch

    console.log('⏪ Original State to Restore:');
    console.log(`   - Restore Enrollment ID:   ${prevEnrollment || 'null'}`);
    console.log(`   - Restore Admission Status: Cancelled`);
    console.log(`   - Restore App Status:       cancelled`);
    console.log(`   - Restore Branch ID:        ${prevBranchId}`);
    console.log(`   - Remove Transfer Log ID:   ${latestHistory?.id || 'None'}`);
    console.log(`   - Remove Payment ID:        ${payment.id}`);
    console.log(`   - Remove Fee Receipt:       ${payment.receipt_number}\n`);

    if (isDryRun) {
        console.log('ℹ️ Dry-run mode active. No database modifications were performed.');
        return;
    }

    console.log('⏳ Executing database rollback...');

    // 1. Delete payment record
    const { error: delPayErr } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);
    if (delPayErr) console.warn('⚠️ Warning deleting payment:', delPayErr.message);
    else console.log('   ✅ Deleted re-initiation payment record');

    // 2. Delete fee_receipt record if exists
    const { error: delRecErr } = await supabase
        .from('fee_receipts')
        .delete()
        .eq('receipt_no', payment.receipt_number);
    if (delRecErr) console.warn('⚠️ Warning deleting fee_receipt:', delRecErr.message);
    else console.log('   ✅ Deleted fee receipt entry');

    // 3. Delete transaction record if exists
    if (payment.transaction_id) {
        const { error: delTxErr } = await supabase
            .from('transactions')
            .delete()
            .eq('gateway_transaction_id', payment.transaction_id);
        if (delTxErr) console.warn('⚠️ Warning deleting transaction:', delTxErr.message);
        else console.log('   ✅ Deleted transaction record');
    }

    // 4. Delete transfer history log
    if (latestHistory?.id) {
        const { error: delHistErr } = await supabase
            .from('student_transfer_history')
            .delete()
            .eq('id', latestHistory.id);
        if (delHistErr) console.warn('⚠️ Warning deleting transfer history:', delHistErr.message);
        else console.log('   ✅ Deleted transfer history log');
    }

    // 5. Restore application state
    const { error: updateAppErr } = await supabase
        .from('applications')
        .update({
            branch_id: prevBranchId,
            course_id: prevCourseId,
            status: 'cancelled'
        })
        .eq('id', app?.id);
    if (updateAppErr) console.warn('⚠️ Warning reverting application:', updateAppErr.message);
    else console.log('   ✅ Restored application status to cancelled and original branch');

    // 6. Restore student_profiles state
    const { error: updateProfileErr } = await supabase
        .from('student_profiles')
        .update({
            enrollment_number: prevEnrollment,
            admission_status: 'Cancelled'
        })
        .eq('user_id', app?.student_id);
    if (updateProfileErr) console.warn('⚠️ Warning reverting profile:', updateProfileErr.message);
    else console.log('   ✅ Restored student_profiles enrollment_number and admission_status');

    console.log('\n🎉 Rollback completed successfully! The student record is reset to its clean pre-reinitiation state.\n');
}

revertReinitiation().catch(err => {
    console.error('❌ Unexpected error during rollback:', err);
    process.exit(1);
});
