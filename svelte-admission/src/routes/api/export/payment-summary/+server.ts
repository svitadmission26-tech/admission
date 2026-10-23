
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import * as XLSX from 'xlsx';

export const GET: RequestHandler = async ({ url, locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || (userProfile?.role !== 'fee_collector' && userProfile?.role !== 'admin')) {
        return new Response('Unauthorized', { status: 401 });
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const startDate = url.searchParams.get('start_date') || new Date().toISOString().split('T')[0];
    const endDate = url.searchParams.get('end_date') || new Date().toISOString().split('T')[0];
    const courseId = url.searchParams.get('course');

    // 1. Fetch Metadata for Header
    const { data: college } = await supabaseAdmin.from('colleges').select('name').limit(1).single();
    const { data: activeYear } = await supabaseAdmin.from('academic_years').select('name').eq('is_active', true).maybeSingle();
    
    const collegeName = college?.name || 'Sardar Vallabhbhai Patel Institute of Technology';
    const yearName = activeYear?.name || '2025-26';

    // 2. Fetch Payments
    let query = supabaseAdmin
        .from('payments')
        .select(`
            id,
            amount,
            receipt_number,
            payment_date,
            payment_breakdown,
            applications!inner(
                id,
                admission_type,
                student_user:users!student_id(full_name, student_profiles(enrollment_number)),
                courses(name, id)
            )
        `)
        .eq('status', 'completed')
        .eq('payment_type', 'tuition_fee')
        .order('receipt_number', { ascending: true });

    if (startDate) query = query.gte('payment_date', `${startDate}T00:00:00.000Z`);
    if (endDate) query = query.lte('payment_date', `${endDate}T23:59:59.999Z`);
    if (courseId && courseId !== 'all' && courseId !== '') query = query.eq('applications.course_id', courseId);

    const { data: payments, error } = await query;

    if (error) {
        console.error('Export query error:', error);
        return new Response('Error fetching data', { status: 500 });
    }

    // 3. Fetch GeneratedBy info from fee_receipts
    // Since we need it for CollectedBy field
    const receiptNos = payments?.map(p => p.receipt_number).filter(Boolean) || [];
    const { data: receipts } = await supabaseAdmin
        .from('fee_receipts')
        .select('receipt_no, generated_by_user:users!generated_by(email)')
        .in('receipt_no', receiptNos);

    const receiptCollectorMap = new Map();
    receipts?.forEach(r => {
        receiptCollectorMap.set(r.receipt_no, (r as any).generated_by_user?.email || '');
    });

    // 4. Prepare Data for Excel
    const workbook = XLSX.utils.book_new();

    // Group payments by admission type
    const paymentsByAdmissionType: Record<string, any[]> = {};
    payments?.forEach((p: any) => {
        const admissionType = p.applications?.admission_type || 'Regular';
        if (!paymentsByAdmissionType[admissionType]) {
            paymentsByAdmissionType[admissionType] = [];
        }
        paymentsByAdmissionType[admissionType].push(p);
    });

    // Ensure we have at least one sheet if there are no payments
    if (Object.keys(paymentsByAdmissionType).length === 0) {
        paymentsByAdmissionType['Regular'] = [];
    }

    const columnHeaders = [
        'Sr.', 'Rec. Numb', 'Rec. Date', 'College ID', 'Student Name',
        'Cash Amount', 'DD/Cheque Amount', 'Online Amount', 'ACPC Amount', 
        'Advance Amount', 'Freeship Amount', 'Total Amount', 'CollectedBy', 'Comment'
    ];

    for (const [admissionType, typePayments] of Object.entries(paymentsByAdmissionType)) {
        const header1 = [`${collegeName}-${yearName} (${admissionType})`];
        const header2 = [`From Date:${startDate} To Date:${endDate}`];
        const headerEmpty: any[] = [];
        const rows: any[][] = [
            header1,
            header2,
            headerEmpty,
            columnHeaders
        ];

        let totals = {
            cash: 0,
            dd: 0,
            online: 0,
            acpc: 0,
            advance: 0,
            freeship: 0,
            total: 0
        };

        typePayments.forEach((p: any, index: number) => {
            const breakdown = p.payment_breakdown || [];
            const getModeAmt = (modes: string[]) => {
                return breakdown
                    .filter((m: any) => modes.includes(m.mode?.toLowerCase() || ''))
                    .reduce((sum: number, m: any) => sum + (Number(m.amount) || 0), 0);
            };

            const cashAmt = getModeAmt(['cash']);
            const ddAmt = getModeAmt(['dd', 'cheque']);
            const onlineAmt = getModeAmt(['online', 'upi', 'card', 'gateway']);
            const acpcAmt = getModeAmt(['acpc']);
            const advanceAmt = getModeAmt(['advance']);
            const freeshipAmt = getModeAmt(['freeship']);
            const totalAmt = Number(p.amount) || 0;

            totals.cash += cashAmt;
            totals.dd += ddAmt;
            totals.online += onlineAmt;
            totals.acpc += acpcAmt;
            totals.advance += advanceAmt;
            totals.freeship += freeshipAmt;
            totals.total += totalAmt;

            rows.push([
                index + 1,
                p.receipt_number || '',
                p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB').replace(/\//g, '-') : '',
                p.applications?.student_user?.student_profiles?.enrollment_number || '',
                p.applications?.student_user?.full_name || '',
                cashAmt,
                ddAmt,
                onlineAmt,
                acpcAmt,
                advanceAmt,
                freeshipAmt,
                totalAmt,
                receiptCollectorMap.get(p.receipt_number) || '',
                '' // Comment column (empty until remarks column is added to DB)
            ]);
        });

        // Add Totals row
        rows.push([
            '', '', '', '', '',
            totals.cash,
            totals.dd,
            totals.online,
            totals.acpc,
            totals.advance,
            totals.freeship,
            totals.total,
            '', ''
        ]);

        const worksheet = XLSX.utils.aoa_to_sheet(rows);

        // Auto-size columns (rough estimate)
        const maxWidths = columnHeaders.map(() => 15);
        rows.forEach(row => {
            row.forEach((cell, i) => {
                const val = String(cell || '');
                if (val.length > maxWidths[i]) maxWidths[i] = val.length;
            });
        });
        worksheet['!cols'] = maxWidths.map(w => ({ wch: w + 2 }));

        // Sheet names must be <= 31 chars
        const sheetName = admissionType.substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new Response(excelBuffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Payment_Summary_${startDate}_to_${endDate}.xlsx"`
        }
    });
};
