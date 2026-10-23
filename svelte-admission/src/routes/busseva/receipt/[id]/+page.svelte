<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';

    let { data } = $props<{ data: PageData }>();
    const record = $derived(data.record);
    const userRole = $derived(data.userRole);
    let photoBase64: string | null = null;
    let logoBase64: string | null = null;

    function validateImageBase64(base64Str: string | null): string | null {
        if (!base64Str) return null;
        
        const trimmed = base64Str.trim();
        const match = trimmed.match(/^data:([^;]+);base64,(.*)$/i);
        if (!match) {
            console.error('Invalid data URL format');
            return null;
        }
        
        const base64Data = match[2].trim();
        
        if (base64Data.startsWith('/9j/')) {
            return `data:image/jpeg;base64,${base64Data}`;
        } else if (base64Data.startsWith('iVBORw') || base64Data.startsWith('iVBOR')) {
            return `data:image/png;base64,${base64Data}`;
        }
        
        console.error('Unsupported image format (must be JPEG or PNG magic bytes)');
        return null;
    }

    async function getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
        try {
            const res = await fetch(imageUrl);
            if (!res.ok) {
                console.error('Fetch failed for image URL:', imageUrl);
                return null;
            }
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.addEventListener('load', () => {
                    const result = reader.result as string;
                    resolve(result || null);
                });
                reader.addEventListener('error', () => resolve(null));
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Failed to convert image to base64:', error);
            return null;
        }
    }

    async function loadAssets() {
        if (data.photoUrl) {
            photoBase64 = validateImageBase64(await getBase64ImageFromUrl(data.photoUrl));
        }
        if (data.logoUrl) {
            if (data.logoUrl.startsWith('data:image/')) {
                logoBase64 = validateImageBase64(data.logoUrl);
            } else if (!data.logoUrl.startsWith('data:')) {
                logoBase64 = validateImageBase64(await getBase64ImageFromUrl(data.logoUrl));
            }
        }
    }

    async function printReceipt() {
        try {
            // Dynamic client-side imports to avoid Svelte SSR window exceptions
            const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts.js');
            const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
            const pdfFonts: any = pdfFontsModule.default || pdfFontsModule;
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            const studentName = record.student?.full_name || 'N/A';
            const profileRaw = record.student?.student_profiles;
            const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
            const enrollmentNo = profile?.enrollment_number || record.enrollment_number || 'N/A';
            const activeAppRaw = record.student?.active_app;
            const activeApp = Array.isArray(activeAppRaw) ? activeAppRaw[0] : activeAppRaw;

            const collegeName = 'Shree Ambica Travels-Vasad';
            const branchName = activeApp?.branches?.name || 'N/A';
            const collectorName = record.collector?.full_name || 'N/A';
            const routeName = record.route_name || 'N/A';
            const location = record.location || 'N/A';

            const createReceiptLayout = (title: string, photo: string | null, logo: string | null) => [
                {
                    columns: [
                        // Left Column: Spacer (replaces logo to keep center alignment balanced)
                        {
                            width: 60,
                            text: ''
                        },
                        // Center Column: College Name and details (center-aligned)
                        {
                            width: '*',
                            stack: [
                                { text: collegeName.toUpperCase(), style: 'collegeName', alignment: 'center' },
                                { text: 'BUS SEVA FEE RECEIPT', style: 'receiptTitle', alignment: 'center' },
                                { text: `(${title})`, style: 'receiptSubtitle', alignment: 'center' }
                            ]
                        },
                        // Right Column: Student Photo (Larger)
                        {
                            width: 60,
                            stack: [
                                photo ? {
                                    image: photo,
                                    width: 60,
                                    height: 70,
                                    alignment: 'right'
                                } : {
                                    table: {
                                        widths: [60],
                                        heights: [70],
                                        body: [[{ text: 'NO\nPHOTO', alignment: 'center', fontSize: 7, margin: [0, 22, 0, 0] }]]
                                    },
                                    layout: {
                                        defaultBorder: true
                                    },
                                    alignment: 'right'
                                }
                            ]
                        }
                    ]
                },
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
                            { text: `Route Name: ${routeName}`, alignment: 'right' }
                        ],
                        [
                            { text: `Location/Stop: ${location}` },
                            { text: `Transaction Reference No: ${record.transaction_number}`, bold: true, alignment: 'right' }
                        ],
                        [
                            { text: '' },
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
                    // Center line positioned exactly in the middle of A4 height (841.89 / 2 = 420.94)
                    {
                        canvas: [
                            {
                                type: 'line',
                                x1: 0, y1: 0,
                                x2: 525, y2: 0,
                                lineWidth: 1,
                                dash: { length: 5, space: 3 }
                            }
                        ],
                        absolutePosition: { x: 35, y: 420.94 }
                    },
                    // STUDENT COPY (top half) - symmetrically aligned
                    {
                        stack: createReceiptLayout('STUDENT COPY', photoBase64, logoBase64),
                        absolutePosition: { x: 35, y: 35 }
                    },
                    // OFFICE COPY (bottom half) - symmetrically aligned
                    {
                        stack: createReceiptLayout('OFFICE COPY', photoBase64, logoBase64),
                        absolutePosition: { x: 35, y: 455.94 }
                    }
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

            let printWindow: Window | null = null;
            try {
                printWindow = window.open('', '_blank');
            } catch (e) {
                console.warn('Failed to open print tab:', e);
            }

            if (!printWindow) {
                toastStore.warning('Pop-up blocked. Please click "Print Receipt" manually.');
                return;
            }

            pdfMake.createPdf(docDefinition).print(printWindow);
        } catch (error) {
            console.error('Failed to generate receipt PDF:', error);
        }
    }

    onMount(async () => {
        await loadAssets();
        printReceipt();
    });
</script>

<div class="container text-center mt-5 mb-5">
    <div class="card p-5 shadow-sm mx-auto" style="max-width: 500px;">
        <i class="bi bi-file-earmark-pdf-fill text-danger display-1 mb-3"></i>
        <h3>Generating Printable Receipt</h3>
        <p class="text-muted">A print window should open automatically.</p>
        <button class="btn btn-primary btn-lg mt-3" onclick={printReceipt}>Print Receipt</button>
        <a href="/busseva" class="btn btn-outline-secondary btn-lg mt-2">Back to Search</a>
    </div>

    {#if userRole === 'fee_collector' || userRole === 'deo'}
        <div class="card p-4 shadow-sm mx-auto mt-4 text-start" style="max-width: 500px;">
            <h4 class="mb-3 text-primary"><i class="bi bi-pencil-square me-2"></i>Edit Receipt Details</h4>
            <form method="POST" action="?/updateReceipt" use:enhance={() => {
                return async ({ result }) => {
                    if (result.type === 'success') {
                        toastStore.success('Receipt details updated successfully!');
                        await loadAssets();
                        printReceipt();
                    } else if (result.type === 'failure') {
                        const err = typeof result.data?.error === 'string' ? result.data.error : 'Failed to update details';
                        toastStore.error(err);
                    } else if (result.type === 'error') {
                        toastStore.error('An error occurred while saving.');
                    }
                };
            }} class="needs-validation">
                <div class="mb-3">
                    <label for="receipt_number" class="form-label fw-bold">Receipt Number</label>
                    <input type="text" class="form-control" id="receipt_number" name="receipt_number" value={record.receipt_number} required>
                </div>
                <div class="mb-3">
                    <label for="route_name" class="form-label fw-bold">Route Name</label>
                    <input type="text" class="form-control" id="route_name" name="route_name" value={record.route_name || ''} required>
                </div>
                <div class="mb-3">
                    <label for="location" class="form-label fw-bold">Location / Stop</label>
                    <input type="text" class="form-control" id="location" name="location" value={record.location || ''} required>
                </div>
                <div class="mb-3">
                    <label for="transaction_number" class="form-label fw-bold">Transaction Reference Number</label>
                    <input type="text" class="form-control" id="transaction_number" name="transaction_number" value={record.transaction_number || ''} required>
                </div>
                <div class="mb-3">
                    <label for="total_amount" class="form-label fw-bold">Total Amount (INR)</label>
                    <input type="number" class="form-control" id="total_amount" name="total_amount" value={record.total_amount} required>
                </div>
                <div class="mb-3">
                    <label for="payment_date" class="form-label fw-bold">Payment Date</label>
                    <input type="date" class="form-control" id="payment_date" name="payment_date" value={new Date(record.payment_date).toISOString().split('T')[0]} required>
                </div>
                <button type="submit" class="btn btn-success w-100 btn-lg mt-2">
                    <i class="bi bi-save me-2"></i>Save Details
                </button>
            </form>
        </div>
    {/if}
</div>
