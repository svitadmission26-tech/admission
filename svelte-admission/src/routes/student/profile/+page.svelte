<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    import { PUBLIC_SUPABASE_URL } from '$env/static/public';

    let { data } = $props<{ data: PageData }>();

    // Helper: Initialize profile data with defaults from schema if missing
    function getInitialProfileData() {
        const base = data.profile?.profile_data || {};
        const merged = { ...base };
        
        if (data.schemaFields) {
            data.schemaFields.forEach((field: any) => {
                if (field.default_value !== undefined && field.default_value !== null && field.default_value !== '') {
                    // Only apply if currently empty/missing
                    if (merged[field.key] === undefined || merged[field.key] === null || merged[field.key] === '') {
                        merged[field.key] = field.default_value;
                    }
                }
            });
        }
        return merged;
    }

    let profileData = $state<Record<string, any>>(getInitialProfileData());
    let uploadingFields = $state<Record<string, boolean>>({});
    let isDraft = $state(false);

    async function handleFileUpload(event: Event, fieldKey: string) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            toastStore.error('Invalid file type. Only PDF and Images are allowed.');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toastStore.error('File size exceeds 2MB limit.');
            return;
        }

        uploadingFields[fieldKey] = true;
        const uploadData = new FormData();
        uploadData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: uploadData
            });
            const result = await response.json();

            if (result.success) {
                profileData[fieldKey] = result.path;
                toastStore.success('File uploaded successfully!');
            } else {
                toastStore.error(`Upload failed: ${result.message}`);
            }
        } catch (e) {
            console.error(e);
            toastStore.error('Upload failed due to network error.');
        } finally {
            uploadingFields[fieldKey] = false;
        }
    }

    function setDraft(draft: boolean) {
        isDraft = draft;
    }

    $effect(() => {
        // Automatically uppercase values if force_uppercase is enabled in schema
        const fields = data.schemaFields || [];
        for (const key in profileData) {
            if (typeof profileData[key] === 'string') {
                const field = fields.find((f: any) => f.key === key);
                if (field?.force_uppercase) {
                    const upper = profileData[key].toUpperCase();
                    if (profileData[key] !== upper) {
                        profileData[key] = upper;
                    }
                }
            }
        }
    });
</script>

<div class="container mt-4">
    <div class="row justify-content-center">
        <div class="col-md-8">
            <div class="card shadow-sm mb-4">
                <div class="card-header bg-white d-flex justify-content-between align-items-center">
                    <h4 class="mb-0">My Student Profile</h4>
                    <span class="badge bg-info">{data.profile?.admission_status || 'Applicant'}</span>
                </div>
                <div class="card-body">
                    <!-- System Info -->
                    <div class="row mb-4 bg-light p-3 rounded mx-0">
                        <div class="col-md-6">
                            <label class="small text-muted fw-bold">Full Name</label>
                            <div>{data.user.full_name}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="small text-muted fw-bold">Email</label>
                            <div>{data.user.email}</div>
                        </div>
                        <div class="col-md-6 mt-2">
                            <label class="small text-muted fw-bold">College ID</label>
                            <div class="font-monospace fs-5">{data.profile?.enrollment_number || 'Not Assigned'}</div>
                        </div>
                    </div>

                    <form method="POST" action="?/updateProfile" enctype="multipart/form-data" use:enhance={() => {
                        return async ({ result }) => {
                            if (result.type === 'success') {
                                toastStore.success(isDraft ? 'Profile saved as draft!' : 'Profile submitted successfully!');
                            } else {
                                toastStore.error(result.data?.message || 'Error saving profile.');
                            }
                        };
                    }}>
                        <input type="hidden" name="is_draft" value={isDraft.toString()} />
                        
                        <h5 class="mb-3">Personal Details</h5>
                        <div class="row g-3">
                            {#each data.schemaFields as field}
                                <div class="col-md-6">
                                    <label for={field.key} class="form-label">
                                        {field.label}
                                        {#if field.is_required}<span class="text-danger">*</span>{/if}
                                    </label>

                                    {#if field.type === 'select'}
                                        <select class="form-select" id={field.key} name={field.key} bind:value={profileData[field.key]} required={!isDraft && field.is_required}>
                                            <option value="">-- Select --</option>
                                            {#each field.options || [] as opt}
                                                {@const parts = typeof opt === 'string' ? opt.split('|') : [opt]}
                                                {@const val = parts[0]?.trim()}
                                                {@const label = (parts[1] || parts[0])?.trim()}
                                                <option value={val}>{label}</option>
                                            {/each}
                                        </select>
                                    {:else if field.type === 'textarea'}
                                        <textarea 
                                            class="form-control" 
                                            id={field.key}
                                            name={field.key} 
                                            bind:value={profileData[field.key]} 
                                            required={!isDraft && field.is_required}
                                            style={field.force_uppercase ? 'text-transform: uppercase;' : ''}
                                        ></textarea>
                                    {:else if field.type === 'file' || field.type === 'image'}
                                        <input type="hidden" name={field.key} value={profileData[field.key] ?? ''}>
                                        <div class="input-group">
                                            <input 
                                                type="file" 
                                                class="form-control" 
                                                id={field.key}
                                                accept={field.type === 'image' ? 'image/*' : 'image/*,application/pdf'}
                                                onchange={(e) => handleFileUpload(e, field.key)}
                                                disabled={uploadingFields[field.key]}
                                            >
                                            {#if uploadingFields[field.key]}
                                                <span class="input-group-text"><span class="spinner-border spinner-border-sm" role="status"></span></span>
                                            {/if}
                                        </div>
                                        {#if !isDraft && field.is_required && !profileData[field.key]}
                                            <input type="hidden" required={true} value=""> <!-- Hack for file requirement -->
                                        {/if}
                                        {#if profileData[field.key]}
                                            <div class="mt-2 d-flex flex-column gap-2">
                                                <div class="d-flex gap-2 align-items-center">
                                                    <small class="text-success fw-bold"><i class="bi bi-check-circle-fill"></i> {field.type === 'image' ? 'Photo' : 'File'} uploaded</small>
                                                    <a href="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/{profileData[field.key]}" target="_blank" class="btn btn-sm btn-outline-info">View</a>
                                                </div>
                                                {#if field.type === 'image' || profileData[field.key].match(/\.(jpg|jpeg|png|gif|webp)$/i)}
                                                    <div class="border rounded p-1 bg-light d-inline-block" style="max-width: 150px;">
                                                        <img 
                                                            src="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/{profileData[field.key]}" 
                                                            alt="Profile" 
                                                            class="img-thumbnail"
                                                            style="max-height: 150px; width: 100%; object-fit: cover;"
                                                        />
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    {:else}
                                        <input 
                                            type={field.type} 
                                            class="form-control" 
                                            id={field.key}
                                            name={field.key} 
                                            bind:value={profileData[field.key]}
                                            required={!isDraft && field.is_required}
                                            style={field.force_uppercase ? 'text-transform: uppercase;' : ''}
                                        >
                                    {/if}
                                </div>
                            {:else}
                                <p class="text-muted">No additional profile fields defined by admin.</p>
                            {/each}
                        </div>

                        <div class="mt-4 text-end d-flex justify-content-end gap-2">
                            <button type="submit" class="btn btn-secondary" onclick={() => setDraft(true)}>Save as Draft</button>
                            <button type="submit" class="btn btn-primary" onclick={() => setDraft(false)}>Submit Profile</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
