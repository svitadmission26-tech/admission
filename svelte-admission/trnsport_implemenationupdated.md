# Implementation Plan - Bus Seva Fees Module Integration

This document outlines the design and implementation steps for integrating the Bus Seva Fees module into `admissionapp_v1`. It is designed to be easily executable by any coding agent without causing conflicts with the existing codebase.

---

## 1. Overview & Conflict Prevention Guidelines

### Conflict Avoidance Principles
1. **Isolated Namespaces:** All new database tables are prefixed with `busseva_` to prevent any collisions with existing tables (like `fees` or `payments`).
2. **Dedicated Routes:** All frontend fee collection workflows are placed inside the `/busseva` route branch. Administrative configurations are under `/admin/busseva`.
3. **No Admission Flow Intrusion:** The bus seva fee data structures do not intercept or modify the core admission payment tables, ensuring that existing admission triggers and application flows are entirely unaffected.
4. **Shared Environment Variables:** Supabase client initialization utilizes the existing private/public static environment variables (`PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) rather than defining new keys.
5. **No Modifications to Core Shared Components:** Avoid modifying base components, layout templates, or shared utilities to eliminate merge conflicts.

---

## 2. Proposed Changes

### Component A: Database Migration Layer

Creates the necessary tables, unique constraints, foreign keys, and Row Level Security (RLS) policies.

#### [NEW] [busseva_fees_setup.sql](file:///workspaces/admissionapp_v1/supabase/migrations/busseva_fees_setup.sql)
```sql
-- 1. Setup Academic Year-wise QR Configs (Managed by Admin)
CREATE TABLE IF NOT EXISTS public.busseva_qr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE UNIQUE,
    upi_id TEXT,
    merchant_name TEXT,
    qr_image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Setup Academic Year-wise Receipt Sequences
CREATE TABLE IF NOT EXISTS public.busseva_receipt_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE UNIQUE,
    current_sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Setup Bus Seva Fees Transactions
CREATE TABLE IF NOT EXISTS public.busseva_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL CONSTRAINT fk_busseva_fees_student REFERENCES public.users(id) ON DELETE CASCADE,
    enrollment_number TEXT NOT NULL,
    academic_year_id UUID NOT NULL CONSTRAINT fk_busseva_fees_year REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    college_id UUID NOT NULL CONSTRAINT fk_busseva_fees_college REFERENCES public.colleges(id) ON DELETE RESTRICT,
    total_amount NUMERIC NOT NULL CHECK (total_amount > 0),
    receipt_number TEXT NOT NULL UNIQUE,
    transaction_number TEXT NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    collected_by UUID NOT NULL CONSTRAINT fk_busseva_fees_collector REFERENCES public.users(id) ON DELETE RESTRICT
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_busseva_fees_student ON public.busseva_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_busseva_fees_enrollment ON public.busseva_fees(enrollment_number);
CREATE INDEX IF NOT EXISTS idx_busseva_fees_college ON public.busseva_fees(college_id);
CREATE INDEX IF NOT EXISTS idx_busseva_fees_receipt ON public.busseva_fees(receipt_number);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.busseva_qr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busseva_receipt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busseva_fees ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Fixed to use public.users table instead of non-existing user_profiles)
-- QR Configs: All authenticated users can read; only administrators can modify
DROP POLICY IF EXISTS "Allow authenticated read for busseva_qr_configs" ON public.busseva_qr_configs;
CREATE POLICY "Allow authenticated read for busseva_qr_configs" ON public.busseva_qr_configs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admin to manage busseva_qr_configs" ON public.busseva_qr_configs;
CREATE POLICY "Allow admin to manage busseva_qr_configs" ON public.busseva_qr_configs
    FOR ALL TO authenticated USING (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    ));

-- Receipt Sequences: Only fee_collector and deo can manage
DROP POLICY IF EXISTS "Allow collectors to manage sequences" ON public.busseva_receipt_sequences;
CREATE POLICY "Allow collectors to manage sequences" ON public.busseva_receipt_sequences
    FOR ALL TO authenticated USING (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('fee_collector', 'deo')
    ));

-- Bus Seva Fees: Students read own; collectors and deo read all and insert
DROP POLICY IF EXISTS "Allow read own or collector read all for busseva_fees" ON public.busseva_fees;
CREATE POLICY "Allow read own or collector read all for busseva_fees" ON public.busseva_fees
    FOR SELECT TO authenticated USING (auth.uid() = student_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('fee_collector', 'deo')
    ));

DROP POLICY IF EXISTS "Allow collectors to insert busseva_fees" ON public.busseva_fees;
CREATE POLICY "Allow collectors to insert busseva_fees" ON public.busseva_fees
    FOR INSERT TO authenticated WITH CHECK (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('fee_collector', 'deo')
    ));
```

---

### Component B: SvelteKit Application Routes

Creates the endpoints for student search, payment collection, printable PDF receipt rendering, admin QR configurations, and reports.

#### [NEW] [src/routes/busseva/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/busseva/%2Bpage.server.ts)
Restricts search route to `fee_collector` and `deo` roles. Performs fuzzy lookups against enrollment numbers or names, joining relations properly and applying college filters.
```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile, supabase }, url }) => {
    const session = await getSession();
    if (!session || !userProfile || !['fee_collector', 'deo'].includes(userProfile.role)) {
        throw redirect(303, '/login');
    }

    const search = url.searchParams.get('q') || '';
    if (!search) return { students: [] };

    // Search query joining users (for name) and applications (for course/branch/college details)
    let query = supabase
        .from('student_profiles')
        .select(`
            user_id,
            enrollment_number,
            admission_status,
            users!inner (
                id,
                full_name,
                email
            ),
            applications:applications!student_profiles_active_application_id_fkey!inner (
                id,
                courses!inner (
                    name,
                    college_id,
                    colleges ( name )
                ),
                branches ( name )
            )
        `)
        .not('enrollment_number', 'is', null)
        .or(`enrollment_number.ilike.%${search}%,full_name.ilike.%${search}%`, { foreignTable: 'users' })
        .limit(15);

    // Apply role-based college filtering
    if (userProfile.college_id) {
        query = query.eq('applications.courses.college_id', userProfile.college_id);
    }

    const { data: students, error } = await query;
    if (error) {
        console.error('Error searching students for bus seva fee:', error.message);
        return { students: [] };
    }

    return { students: students || [] };
};
```

#### [NEW] [src/routes/busseva/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/busseva/%2Bpage.svelte)
Implements the lookup interface in Svelte 5 Runes.
```html
<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    
    let { data } = $props<{ data: { students: any[] } }>();
    let searchQuery = $state($page.url.searchParams.get('q') || '');

    function handleSearch() {
        const url = new URL(window.location.href);
        if (searchQuery.trim()) {
            url.searchParams.set('q', searchQuery.trim());
        } else {
            url.searchParams.delete('q');
        }
        goto(url.toString());
    }
</script>

<div class="container mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Bus Seva Fees Module</h2>
        <div>
            {#if $page.data.userProfile?.role === 'fee_collector'}
                <a href="/busseva/reports" class="btn btn-outline-primary me-2">Reports & Exports</a>
            {/if}
            {#if $page.data.userProfile?.role === 'admin'}
                <a href="/admin/busseva" class="btn btn-outline-danger">QR Configuration</a>
            {/if}
        </div>
    </div>

    <div class="card p-4 shadow-sm mb-4">
        <h5>Student Lookup</h5>
        <div class="input-group">
            <input 
                type="text" 
                bind:value={searchQuery} 
                class="form-control" 
                placeholder="Enter Enrollment ID or Student Name" 
                onkeydown={(e) => e.key === 'Enter' && handleSearch()} 
            />
            <button class="btn btn-primary" onclick={handleSearch}>Search</button>
        </div>
    </div>

    {#if data.students && data.students.length > 0}
        <div class="table-responsive bg-white rounded shadow-sm">
            <table class="table align-middle mb-0">
                <thead>
                    <tr>
                        <th>Enrollment No</th>
                        <th>Name</th>
                        <th>College</th>
                        <th>Branch</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.students as student}
                        <tr>
                            <td>{student.enrollment_number}</td>
                            <td>{student.users?.full_name}</td>
                            <td>{student.applications?.courses?.colleges?.name}</td>
                            <td>{student.applications?.branches?.name || 'General'}</td>
                            <td class="text-end">
                                <a href="/busseva/collect/{student.user_id}" class="btn btn-sm btn-success">Collect Fee</a>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else if searchQuery}
        <div class="alert alert-secondary">No matching student found.</div>
    {/if}
</div>
```

---

#### [NEW] [src/routes/busseva/collect/[student_id]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/busseva/collect/[student_id]/%2Bpage.server.ts)
Performs sequence generation and inserts payment records.
```typescript
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

async function generateReceiptNumber(supabaseAdmin: any, academicYearId: string): Promise<string> {
    const { data: yearData } = await supabaseAdmin
        .from('academic_years')
        .select('name, short_code')
        .eq('id', academicYearId)
        .single();
        
    const yearShortCode = yearData?.short_code || yearData?.name.replace(/[^0-9]/g, '') || '2425';
    
    let { data: seqRecord } = await supabaseAdmin
        .from('busseva_receipt_sequences')
        .select('id, current_sequence')
        .eq('academic_year_id', academicYearId)
        .maybeSingle();

    if (!seqRecord) {
        const { data: newSeq } = await supabaseAdmin
            .from('busseva_receipt_sequences')
            .insert({ academic_year_id: academicYearId, current_sequence: 0 })
            .select()
            .single();
        seqRecord = newSeq;
    }

    const nextSeq = (seqRecord?.current_sequence || 0) + 1;
    
    await supabaseAdmin
        .from('busseva_receipt_sequences')
        .update({ current_sequence: nextSeq })
        .eq('id', seqRecord.id);

    const padSeq = nextSeq.toString().padStart(5, '0');
    return `TR${yearShortCode}${padSeq}`;
}

export const load: PageServerLoad = async ({ params, locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile || !['fee_collector', 'deo'].includes(userProfile.role)) {
        throw redirect(303, '/login');
    }

    const { data: studentProfile, error: studentError } = await supabase
        .from('student_profiles')
        .select(`
            user_id,
            enrollment_number,
            users!inner (
                full_name,
                email
            ),
            applications!inner (
                id,
                courses!inner (
                    name,
                    college_id,
                    colleges ( name )
                ),
                branches ( name )
            )
        `)
        .eq('user_id', params.student_id)
        .single();

    if (studentError || !studentProfile) {
        throw redirect(303, '/busseva?error=Student+not+found');
    }

    // Role-based college security check
    if (userProfile.college_id && studentProfile.applications?.courses?.college_id !== userProfile.college_id) {
        throw redirect(303, '/busseva?error=Unauthorized');
    }

    const { data: activeYear } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('is_active', true)
        .single();

    const { data: qrConfig } = await supabase
        .from('busseva_qr_configs')
        .select('qr_image_url')
        .eq('academic_year_id', activeYear?.id)
        .maybeSingle();

    return { studentProfile, activeYear, qrConfig };
};

export const actions: Actions = {
    default: async ({ request, params, locals: { supabase, userProfile } }) => {
        if (!userProfile || !['fee_collector', 'deo'].includes(userProfile.role)) {
            return fail(403, { message: 'Unauthorized action.' });
        }

        const formData = await request.formData();
        const transactionNumber = formData.get('transaction_number') as string;
        const paidAmount = Number(formData.get('paid_amount'));
        const academicYearId = formData.get('academic_year_id') as string;
        const enrollmentNumber = formData.get('enrollment_number') as string;
        const collegeId = formData.get('college_id') as string;

        if (!transactionNumber || transactionNumber.trim() === '') {
            return fail(400, { message: 'Transaction ID is required.' });
        }
        if (isNaN(paidAmount) || paidAmount <= 0) {
            return fail(400, { message: 'Please enter a valid paid amount.' });
        }
        if (!collegeId) {
            return fail(400, { message: 'College ID is required.' });
        }

        // Bypassing RLS for sequences and insert via admin client
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const receiptNumber = await generateReceiptNumber(supabaseAdmin, academicYearId);

        const { data: record, error } = await supabaseAdmin
            .from('busseva_fees')
            .insert({
                student_id: params.student_id,
                enrollment_number: enrollmentNumber,
                academic_year_id: academicYearId,
                college_id: collegeId,
                total_amount: paidAmount,
                receipt_number: receiptNumber,
                transaction_number: transactionNumber.trim(),
                collected_by: userProfile.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error inserting bus seva fee record:', error.message);
            return fail(500, { message: 'Failed to record payment.' });
        }

        throw redirect(303, `/busseva/receipt/${record.id}`);
    }
};
```

#### [NEW] [src/routes/busseva/collect/[student_id]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/busseva/collect/[student_id]/%2Bpage.svelte)
Renders info details, configuration-driven static QR code, and amount input in Svelte 5 Runes.
```html
<script lang="ts">
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    
    let { data, form } = $props<{ data: any, form: any }>();
    let loading = $state(false);

    $effect(() => {
        if (form?.message) {
            toastStore.error(form.message);
        }
    });
</script>

<div class="container mt-4" style="max-width: 600px;">
    <h2>Record Bus Seva Fee</h2>
    <a href="/busseva" class="btn btn-sm btn-outline-secondary mb-3">Back to Search</a>

    <div class="card p-4 shadow-sm mb-4">
        <h5>Student Information</h5>
        <div class="row">
            <div class="col-sm-6"><p class="mb-1 text-muted small">Name</p><p class="fw-bold">{data.studentProfile.users?.full_name}</p></div>
            <div class="col-sm-6"><p class="mb-1 text-muted small">Enrollment Number</p><p class="fw-bold">{data.studentProfile.enrollment_number}</p></div>
            <div class="col-sm-6"><p class="mb-1 text-muted small">College</p><p class="fw-bold">{data.studentProfile.applications?.courses?.colleges?.name || 'N/A'}</p></div>
            <div class="col-sm-6"><p class="mb-1 text-muted small">Branch</p><p class="fw-bold">{data.studentProfile.applications?.branches?.name || 'N/A'}</p></div>
        </div>
    </div>

    <div class="card p-4 shadow-sm">
        <div class="text-center mb-4 bg-light p-3 rounded">
            <h6 class="text-uppercase tracking-wide text-secondary mb-2">Scan QR Code to Pay ({data.activeYear.name})</h6>
            {#if data.qrConfig?.qr_image_url}
                <img src={data.qrConfig.qr_image_url} alt="Payment QR Code" class="img-fluid border rounded" style="max-height: 250px;" />
            {:else}
                <div class="alert alert-warning py-2 mb-0">No payment QR code configured for this year.</div>
            {/if}
        </div>

        <form method="POST" use:enhance={() => { loading = true; return ({ update }) => { loading = false; update(); }; }}>
            <input type="hidden" name="academic_year_id" value={data.activeYear.id} />
            <input type="hidden" name="enrollment_number" value={data.studentProfile.enrollment_number} />
            <input type="hidden" name="college_id" value={data.studentProfile.applications?.courses?.college_id} />

            <div class="mb-3">
                <label for="paid_amount" class="form-label font-semibold">Amount Paid (INR)</label>
                <input type="number" name="paid_amount" id="paid_amount" class="form-control" placeholder="e.g. 5000" required min="1" />
            </div>

            <div class="mb-3">
                <label for="transaction_number" class="form-label font-semibold">Transaction ID / Reference Number</label>
                <input type="text" name="transaction_number" id="transaction_number" class="form-control" placeholder="UPI Ref / Bank Txn ID" required />
            </div>

            <button type="submit" class="btn btn-success w-100 py-2 fs-5" disabled={loading}>
                {loading ? 'Recording...' : 'Submit & Print Receipt'}
            </button>
        </form>
    </div>
</div>
```

---

#### [NEW] [src/routes/busseva/receipt/[id]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/busseva/receipt/[id]/%2Bpage.server.ts)
Loads details of a saved bus seva fee payment. Securely verifies permissions before loading.
```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile) {
        throw redirect(303, '/login');
    }

    const { data: record, error } = await supabase
        .from('busseva_fees')
        .select(`
            *,
            student:users!fk_busseva_fees_student (
                full_name,
                email,
                student_profiles (
                    enrollment_number,
                    active_app:applications (
                        courses (
                            name,
                            colleges ( name )
                        ),
                        branches ( name )
                    )
                )
            ),
            collector:users!fk_busseva_fees_collector (
                full_name
            )
        `)
        .eq('id', params.id)
        .single();

    if (error || !record) {
        throw redirect(303, '/busseva?error=Receipt+not+found');
    }

    // Role security check: allowed for collectors, DEOs, or the student themselves
    if (userProfile.role !== 'fee_collector' && userProfile.role !== 'deo' && userProfile.id !== record.student_id) {
        throw redirect(303, '/login');
    }

    // College restriction security check
    if (['fee_collector', 'deo'].includes(userProfile.role) && userProfile.college_id && record.college_id !== userProfile.college_id) {
        throw redirect(303, '/busseva?error=Unauthorized');
    }

    return { record };
};
```

#### [NEW] [src/routes/busseva/receipt/[id]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/busseva/receipt/[id]/%2Bpage.svelte)
Generates A4 landscape or single-page dual copy (Student & Office copy) using client-side `pdfmake` to bypass SSR errors.
```html
<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();
    const record = data.record;

    async function printReceipt() {
        try {
            // Dynamic client-side imports to avoid Svelte SSR window exceptions
            const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts.js');
            const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
            const pdfFonts: any = pdfFontsModule.default || pdfFontsModule;
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            const studentName = record.student?.full_name || 'N/A';
            const enrollmentNo = record.student?.student_profiles?.enrollment_number || record.enrollment_number || 'N/A';
            const activeApp = record.student?.student_profiles?.active_app;
            const collegeName = activeApp?.courses?.colleges?.name || 'Sardar Vallabhbhai Patel Institute of Technology';
            const branchName = activeApp?.branches?.name || 'N/A';
            const collectorName = record.collector?.full_name || 'N/A';

            const createReceiptLayout = (title: string) => [
                { text: collegeName.toUpperCase(), style: 'collegeName', alignment: 'center' },
                { text: 'BUS SEVA FEE RECEIPT', style: 'receiptTitle', alignment: 'center' },
                { text: `(${title})`, style: 'receiptSubtitle', alignment: 'center' },
                { margin: [0, 10, 0, 10], table: {
                    widths: ['*', '*'],
                    body: [
                        [
                            { text: `Receipt No: ${record.receipt_number}`, bold: true },
                            { text: `Date: ${new Date(record.payment_date).toLocaleDateString('en-GB')}`, alignment: 'right' }
                        ],
                        [
                            { text: `Enrollment No: ${enrollmentNo}` },
                            { text: `Student Name: ${studentName}`, alignment: 'right' }
                        ],
                        [
                            { text: `Branch: ${branchName}` },
                            { text: `Transaction Reference No: ${record.transaction_number}`, bold: true, alignment: 'right' }
                        ],
                        [
                            { text: 'Particulars: Bus Seva Fee Collection' },
                            { text: `TOTAL AMOUNT: INR ${record.total_amount.toLocaleString('en-IN')}`, bold: true, alignment: 'right' }
                        ]
                    ]
                }, layout: 'noBorders' },
                { margin: [0, 15, 0, 0], columns: [
                    { text: `Collected By: ${collectorName}`, style: 'signaturePart' },
                    { text: 'Authorized Signature: _________________', style: 'signaturePart', alignment: 'right' }
                ] }
            ];

            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [35, 35, 35, 35],
                content: [
                    ...createReceiptLayout('STUDENT COPY'),
                    {
                        margin: [0, 35, 0, 35],
                        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 1, dash: { length: 5, space: 3 } }]
                    },
                    ...createReceiptLayout('OFFICE COPY')
                ],
                styles: {
                    collegeName: { fontSize: 12, bold: true },
                    receiptTitle: { fontSize: 10, bold: true, margin: [0, 2, 0, 0] },
                    receiptSubtitle: { fontSize: 8, italic: true },
                    signaturePart: { fontSize: 8, margin: [0, 5, 0, 0] }
                },
                defaultStyle: {
                    fontSize: 9
                }
            };

            pdfMake.createPdf(docDefinition).print();
        } catch (error) {
            console.error('Failed to generate receipt PDF:', error);
        }
    }

    onMount(() => {
        printReceipt();
    });
</script>

<div class="container text-center mt-5">
    <div class="card p-5 shadow-sm mx-auto" style="max-width: 500px;">
        <i class="bi bi-file-earmark-pdf-fill text-danger display-1 mb-3"></i>
        <h3>Generating Printable Receipt</h3>
        <p class="text-muted">A print window should open automatically.</p>
        <button class="btn btn-primary btn-lg mt-3" onclick={printReceipt}>Print Receipt</button>
        <a href="/busseva" class="btn btn-outline-secondary btn-lg mt-2">Back to Search</a>
    </div>
</div>
```

---

### Component C: Administrator QR Configurations

#### [NEW] [src/routes/admin/busseva/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/admin/busseva/%2Bpage.server.ts)
Secures configurations and updates to the `admin` role.
```typescript
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile || userProfile.role !== 'admin') {
        throw redirect(303, '/login');
    }

    const { data: years } = await supabase.from('academic_years').select('id, name');
    const { data: configs } = await supabase.from('busseva_qr_configs').select(`
        id, upi_id, merchant_name, qr_image_url, academic_year_id,
        academic_years ( name )
    `);

    return { years: years || [], configs: configs || [] };
};

export const actions: Actions = {
    saveConfig: async ({ request, locals: { supabase, userProfile } }) => {
        if (!userProfile || userProfile.role !== 'admin') {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const yearId = formData.get('academic_year_id') as string;
        const upiId = formData.get('upi_id') as string;
        const merchantName = formData.get('merchant_name') as string;
        const qrImageUrl = formData.get('qr_image_url') as string;

        if (!yearId || !qrImageUrl) {
            return fail(400, { message: 'Academic Year and QR Image are required.' });
        }

        const { error } = await supabase
            .from('busseva_qr_configs')
            .upsert({
                academic_year_id: yearId,
                upi_id: upiId || null,
                merchant_name: merchantName || null,
                qr_image_url: qrImageUrl
            }, { onConflict: 'academic_year_id' });

        if (error) {
            console.error('Error saving QR configuration:', error.message);
            return fail(500, { message: 'Failed to save configuration.' });
        }
        return { success: true };
    }
};
```

#### [NEW] [src/routes/admin/busseva/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/admin/busseva/%2Bpage.svelte)
Provides the setting panel, supporting both file upload (via existing `/api/upload` endpoint) and direct URL inputs.
```html
<script lang="ts">
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    
    let { data, form } = $props<{ data: any, form: any }>();
    let selectedYearId = $state(data.years[0]?.id || '');
    let upiId = $state('');
    let merchantName = $state('');
    let qrImageUrl = $state('');
    let uploading = $state(false);

    $effect(() => {
        if (form?.success) {
            toastStore.success('Configuration saved successfully!');
            upiId = '';
            merchantName = '';
            qrImageUrl = '';
        }
    });

    async function handleFileUpload(e: Event) {
        const target = e.target as HTMLInputElement;
        if (!target.files || target.files.length === 0) return;

        const file = target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        uploading = true;
        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (result.success) {
                qrImageUrl = result.url;
                toastStore.success('QR Code image uploaded successfully!');
            } else {
                toastStore.error(result.message || 'Upload failed');
            }
        } catch (err) {
            console.error('File upload exception:', err);
            toastStore.error('An error occurred during file upload.');
        } finally {
            uploading = false;
        }
    }
</script>

<div class="container mt-4">
    <h2>Admin Bus Seva QR Configuration</h2>
    <a href="/busseva" class="btn btn-sm btn-outline-secondary mb-3">Back to Bus Seva Dashboard</a>

    <div class="row g-4">
        <div class="col-md-5">
            <div class="card p-4 shadow-sm">
                <h5>Add / Update QR Image Config</h5>
                <form method="POST" action="?/saveConfig" use:enhance>
                    <div class="mb-3">
                        <label for="year" class="form-label">Academic Year</label>
                        <select name="academic_year_id" id="year" class="form-select" bind:value={selectedYearId}>
                            {#each data.years as y}
                                <option value={y.id}>{y.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="upi" class="form-label">UPI ID (Optional)</label>
                        <input type="text" name="upi_id" id="upi" class="form-control" bind:value={upiId} placeholder="merchant@upi" />
                    </div>
                    <div class="mb-3">
                        <label for="mname" class="form-label">Merchant Name (Optional)</label>
                        <input type="text" name="merchant_name" id="mname" class="form-control" bind:value={merchantName} placeholder="E.g. SVPIT Bus Seva Account" />
                    </div>
                    <div class="mb-3">
                        <label for="qrFile" class="form-label">Upload QR Code Image</label>
                        <input type="file" id="qrFile" class="form-control" accept="image/*" onchange={handleFileUpload} />
                        {#if uploading}
                            <div class="text-muted small mt-1">Uploading image to storage...</div>
                        {/if}
                    </div>
                    <div class="mb-3">
                        <label for="qr" class="form-label">QR Image URL (Auto-filled on upload)</label>
                        <input type="text" name="qr_image_url" id="qr" class="form-control" bind:value={qrImageUrl} required placeholder="Storage bucket path or URL" readonly={uploading} />
                    </div>
                    <button type="submit" class="btn btn-primary w-100" disabled={uploading}>Save Configuration</button>
                </form>
            </div>
        </div>

        <div class="col-md-7">
            <div class="card p-4 shadow-sm">
                <h5>Configured Years</h5>
                <div class="table-responsive">
                    <table class="table align-middle">
                        <thead>
                            <tr>
                                <th>Year</th>
                                <th>UPI ID</th>
                                <th>QR Image Preview</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.configs as c}
                                <tr>
                                    <td>{c.academic_years?.name}</td>
                                    <td>{c.upi_id || 'N/A'}</td>
                                    <td>
                                        <a href={c.qr_image_url} target="_blank" rel="noreferrer">
                                            <img src={c.qr_image_url} alt="QR code preview" style="max-height: 50px;" class="border rounded" />
                                        </a>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
```

---

### Component D: Collector Reports

#### [NEW] [src/routes/busseva/reports/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/busseva/reports/%2Bpage.server.ts)
Allows only the `fee_collector` role to browse all entries. Applies college filtering on the query.
```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile || userProfile.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    let query = supabase
        .from('busseva_fees')
        .select(`
            id, 
            receipt_number, 
            transaction_number, 
            total_amount, 
            payment_date,
            student:users!fk_busseva_fees_student (
                full_name,
                email,
                student_profiles (
                    enrollment_number
                )
            ),
            academic_years ( name ),
            collector:users!fk_busseva_fees_collector ( email )
        `)
        .order('payment_date', { ascending: false });

    // College restriction filtering
    if (userProfile.college_id) {
        query = query.eq('college_id', userProfile.college_id);
    }

    const { data: payments, error } = await query;
    if (error) {
        console.error('Error fetching bus seva payments:', error.message);
    }

    return { payments: payments || [] };
};
```

#### [NEW] [src/routes/busseva/reports/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/busseva/reports/%2Bpage.svelte)
Lists transaction payments and exports them to an Excel file using the already-installed `xlsx` package. Uses Svelte 5 Runes.
```html
<script lang="ts">
    import * as XLSX from 'xlsx';
    
    let { data } = $props<{ data: { payments: any[] } }>();

    function exportToExcel() {
        const tableData = data.payments.map((p: any) => ({
            'Receipt No': p.receipt_number,
            'Enrollment No': p.student?.student_profiles?.enrollment_number || 'N/A',
            'Student Name': p.student?.full_name || 'N/A',
            'Academic Year': p.academic_years?.name,
            'Amount (INR)': p.total_amount,
            'Transaction ID': p.transaction_number,
            'Payment Date': new Date(p.payment_date).toLocaleDateString('en-GB'),
            'Collected By': p.collector?.email || 'N/A'
        }));

        const worksheet = XLSX.utils.json_to_sheet(tableData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Bus Seva Payments');
        XLSX.writeFile(workbook, 'Bus_Seva_Payments_Report.xlsx');
    }
</script>

<div class="container mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Bus Seva Payments Report</h2>
        <div>
            <a href="/busseva" class="btn btn-outline-secondary me-2">Back to Search</a>
            <button class="btn btn-success" onclick={exportToExcel}>Export Excel</button>
        </div>
    </div>

    <div class="table-responsive bg-white rounded shadow-sm">
        <table class="table align-middle mb-0">
            <thead>
                <tr>
                    <th>Receipt No</th>
                    <th>Enrollment No</th>
                    <th>Student Name</th>
                    <th>Year</th>
                    <th>Amount</th>
                    <th>Transaction ID</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                {#each data.payments as p}
                    <tr>
                        <td class="fw-bold">{p.receipt_number}</td>
                        <td>{p.student?.student_profiles?.enrollment_number || 'N/A'}</td>
                        <td>{p.student?.full_name || 'N/A'}</td>
                        <td>{p.academic_years?.name}</td>
                        <td>INR {p.total_amount.toLocaleString('en-IN')}</td>
                        <td class="text-monospace">{p.transaction_number}</td>
                        <td>{new Date(p.payment_date).toLocaleDateString('en-GB')}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>
```

---

### Component E: Sidebar Navigation Link Addition

To make the Bus Seva module accessible from the sidebar, safe insertions should be made to `src/lib/config/navigation.ts`.

#### [MODIFY] [navigation.ts](file:///workspaces/admissionapp_v1/src/lib/config/navigation.ts)

Add the following items inside the navigation configuration mapping:

1. **For `admin` role:**
```typescript
{
  title: "Bus Seva QR Config",
  href: "/admin/busseva",
  icon: "bi-qr-code",
}
```

2. **For `deo` role:**
```typescript
{
  title: "Bus Seva Fees",
  href: "/busseva",
  icon: "bi-bus-front",
}
```

3. **For `fee_collector` role:**
```typescript
{
  title: "Bus Seva Fees",
  href: "/busseva",
  icon: "bi-bus-front",
}
```

---

## 3. Verification Flow

1. **Run Migration:** Execute the SQL script `supabase/migrations/busseva_fees_setup.sql` in the Supabase editor.
2. **Admin Configuration:** Log in as an administrator, click "Bus Seva QR Config" in the sidebar (or go to `/admin/busseva`), upload a QR code image for the active academic year, and save.
3. **Search & Autofill:** Log in as a `deo` or `fee_collector`, navigate to `/busseva`, enter a student's enrollment number. Verify that Svelte resolves the student's name, college, and branch details, and displays the static QR code configured for the academic year.
4. **Collection Submit:** Verify payment on the student's phone, input the Transaction ID and amount, and click submit. Verify it updates sequence counts, records the database entries, and redirects to `/busseva/receipt/[id]`.
5. **Print Layout:** Verify that the receipt print layout renders student and office copies correctly separated by a dotted divider.
6. **Excel Report:** Log in as a `fee_collector`, click "Reports & Exports" in `/busseva` (or `/busseva/reports`), verify the table contents, and export it to Excel using "Export Excel".
