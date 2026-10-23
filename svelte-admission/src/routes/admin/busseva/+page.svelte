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
