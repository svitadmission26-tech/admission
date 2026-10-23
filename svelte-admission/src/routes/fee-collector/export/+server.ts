import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ url, locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || (userProfile?.role !== 'fee_collector' && userProfile?.role !== 'admin')) {
        return new Response('Unauthorized', { status: 401 });
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const statusFilter = url.searchParams.get('status');
    const courseFilter = url.searchParams.get('course');
    const branchFilter = url.searchParams.get('branch');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const fieldsParam = url.searchParams.get('fields');

    // Base Selection
    let selectString = `
        id,
        amount,
        status,
        payment_date,
        transaction_id,
        applications (
            id,
            status,
            admission_type,
            student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
            courses(name, code, colleges(name)),
            branches(name),
            account_admissions(admission_number)
        )
    `;

    // Adjust for filtering
    if (courseFilter || branchFilter) {
        selectString = `
            id,
            amount,
            status,
            payment_date,
            transaction_id,
            applications!inner (
                id,
                status,
                course_id,
                branch_id,
                admission_type,
                student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
                courses(name, code, colleges(name)),
                branches(name),
                account_admissions(admission_number)
            )
        `;
    }

    let query = supabaseAdmin
        .from('payments')
        .select(selectString)
        .eq('payment_type', 'tuition_fee')
        .order('payment_date', { ascending: false });

    if (statusFilter) query = query.eq('status', statusFilter);
    if (startDate) query = query.gte('payment_date', startDate);
    if (endDate) query = query.lte('payment_date', endDate + 'T23:59:59');
    if (courseFilter) query = query.eq('applications.course_id', courseFilter);
    if (branchFilter) query = query.eq('applications.branch_id', branchFilter);

    const { data: payments, error } = await query;

    if (error) {
        console.error('Export query error:', error);
        return new Response('Error fetching data', { status: 500 });
    }

    // Define Field Mappings
    const fieldMap: Record<string, { label: string, getValue: (p: any) => string }> = {
        'transaction_id': { label: 'Transaction ID', getValue: p => p.transaction_id || '' },
        'payment_date': { label: 'Payment Date', getValue: p => p.payment_date ? new Date(p.payment_date).toISOString().split('T')[0] : '' },
        'amount': { label: 'Amount', getValue: p => p.amount?.toString() || '0' },
        'status': { label: 'Payment Status', getValue: p => p.status || '' },
        'student_name': { label: 'Student Name', getValue: p => `"${p.applications?.student_user?.full_name || ''}"` },
        'admission_no': { 
            label: 'Admission Number', 
            getValue: p => {
                const aa = p.applications?.account_admissions;
                // Handle both array (1:N) and object (1:1) responses
                if (Array.isArray(aa)) return aa[0]?.admission_number || '';
                return aa?.admission_number || '';
            }
        },
        'course': { label: 'Course', getValue: p => `"${p.applications?.courses?.name || ''}"` },
        'branch': { label: 'Branch', getValue: p => p.applications?.branches?.name || '' },
        'college': { label: 'College', getValue: p => `"${p.applications?.courses?.colleges?.name || ''}"` },
        'enrollment_number': { label: 'College ID', getValue: p => p.applications?.student_user?.student_profiles?.enrollment_number || '' },
        'admission_type': { label: 'Admission Type', getValue: p => p.applications?.admission_type || 'Regular' },
        'application_id': { label: 'Application ID', getValue: p => p.applications?.id || '' }
    };

    // Determine columns to export
    let selectedKeys = Object.keys(fieldMap);
    if (fieldsParam) {
        const requestedKeys = fieldsParam.split(',');
        selectedKeys = requestedKeys.filter(k => fieldMap[k]);
        if (selectedKeys.length === 0) selectedKeys = Object.keys(fieldMap);
    }

    const headers = selectedKeys.map(k => fieldMap[k].label);
    const csvRows = [headers.join(',')];

    payments?.forEach((p: any) => {
        const row = selectedKeys.map(k => {
            return fieldMap[k].getValue(p);
        });
        csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    return new Response(csvContent, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="fees_report_${new Date().toISOString().split('T')[0]}.csv"`
        }
    });
};
