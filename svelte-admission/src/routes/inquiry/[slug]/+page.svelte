<script lang="ts">
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import DynamicForm from '$lib/components/DynamicForm.svelte';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    let { data, form } = $props<{ data: any, form: any }>();

    let inquiryData = $state<Record<string, any>>({});
    let preferences = $state<any[]>([{ course_id: '', branch_id: '' }]);
    
    let submitted = $state(false);
    let clientError = $state('');

    // Derived: available branches for a choice
    function getBranchesForCourse(courseId: string) {
        return data.branches.filter((b: any) => b.course_id === courseId);
    }

    function addPreference() {
        preferences = [...preferences, { course_id: '', branch_id: '' }];
        clientError = '';
    }

    function removePreference(index: number) {
        preferences = preferences.filter((_, i) => i !== index);
    }

    function movePreference(index: number, direction: 'up' | 'down') {
        const newPrefs = [...preferences];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex >= 0 && targetIndex < newPrefs.length) {
            const temp = newPrefs[index];
            newPrefs[index] = newPrefs[targetIndex];
            newPrefs[targetIndex] = temp;
            preferences = newPrefs;
        }
    }

    $effect(() => {
        // Automatically uppercase all text values for data integrity (except emails and select/radio options)
        const fields = data.form.schema_json.fields || [];
        for (const key in inquiryData) {
            if (typeof inquiryData[key] === 'string' && !key.toLowerCase().includes('email')) {
                // Find field type to avoid breaking selects/radios
                const field = fields.find((f: any) => (f.key === key || f.name === key));
                if (field && (field.type === 'select' || field.type === 'radio' || field.type === 'checkbox')) continue;

                const upper = inquiryData[key].toUpperCase();
                if (inquiryData[key] !== upper) {
                    inquiryData[key] = upper;
                }
            }
        }
    });

    $effect(() => {
        if (form?.success) {
            submitted = true;
            window.scrollTo(0, 0);
            
            // Auto redirect after 3 seconds
            setTimeout(() => {
                goto('/');
            }, 3000);
        }
    });
</script>

<div class="bg-light min-vh-100 py-4 py-md-5">
    <div class="container-fluid px-3 px-md-5">
        <div class="row justify-content-center">
            <div class="col-12" style="max-width: 1600px;">
                <div class="card shadow-lg border-0 rounded-4 overflow-hidden">
                    <div class="card-header bg-primary text-white p-4 text-center">
                        <h2 class="mb-1">{data.form.name}</h2>
                        {#if data.form.description}
                            <p class="mb-0 opacity-75">{data.form.description}</p>
                        {/if}
                    </div>
                    
                    <div class="card-body p-4 p-md-5 bg-white">
                        {#if submitted}
                            <div class="text-center py-5">
                                <div class="display-1 text-success mb-4">
                                    <i class="bi bi-check-circle-fill"></i>
                                </div>
                                <h3 class="fw-bold">Thank You!</h3>
                                <p class="lead text-muted">Your inquiry has been submitted successfully. Our team will contact you soon.</p>
                                <div class="mt-4">
                                    <p class="small text-muted mb-3">Redirecting you back to the home page...</p>
                                    <a href="/" class="btn btn-primary px-4">
                                        <i class="bi bi-house-door me-2"></i> Return to Home
                                    </a>
                                </div>
                            </div>
                        {:else}
                            <form method="POST" enctype="multipart/form-data" use:enhance={({ cancel }) => {
                                clientError = '';
                                if (preferences.filter(p => p.course_id).length === 0) {
                                    clientError = 'At least one Course Preference is required.';
                                    window.scrollTo(0, document.body.scrollHeight);
                                    cancel();
                                    return;
                                }

                                startLoading();
                                return async ({ update }) => {
                                    await update();
                                    stopLoading();
                                };
                            }}>
                                <div class="alert alert-info small mb-4">
                                    <i class="bi bi-info-circle me-2"></i> Please provide your details so we can assist you better.
                                </div>

                                <!-- Dynamic Custom Fields (Now contains everything) -->
                                <DynamicForm schema={data.form.schema_json} bind:formData={inquiryData} />
                                <input type="hidden" name="inquiry_data" value={JSON.stringify(inquiryData)} />

                                <hr class="my-4 opacity-10" />

                                <!-- Course/Branch Priorities -->
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h4 class="mb-0 text-primary">Course Preferences <span class="text-danger">*</span></h4>
                                    <button type="button" class="btn btn-sm btn-outline-primary" onclick={addPreference}>
                                        <i class="bi bi-plus-lg me-1"></i> Add Choice
                                    </button>
                                </div>
                                <p class="text-muted small mb-3">Select the courses you are interested in, in order of your preference. At least one choice is mandatory.</p>

                                {#if preferences.length === 0}
                                    <div class="text-center py-4 bg-light rounded-3 border border-danger border-dashed mb-4">
                                        <p class="text-danger mb-0">No preferences added. At least one course selection is required to submit.</p>
                                        <button type="button" class="btn btn-sm btn-primary mt-2" onclick={addPreference}>
                                            Add Your First Choice
                                        </button>
                                    </div>
                                {:else}
                                    <div class="preference-list mb-4">
                                        {#each preferences as pref, i}
                                            <div class="card mb-3 border-start border-primary border-4 shadow-sm">
                                                <div class="card-body p-3">
                                                    <div class="d-flex align-items-center mb-2">
                                                        <span class="badge bg-primary me-2">Choice #{i + 1}</span>
                                                        <div class="ms-auto btn-group btn-group-sm">
                                                            <button type="button" class="btn btn-light" onclick={() => movePreference(i, 'up')} disabled={i === 0}>
                                                                <i class="bi bi-chevron-up"></i>
                                                            </button>
                                                            <button type="button" class="btn btn-light" onclick={() => movePreference(i, 'down')} disabled={i === preferences.length - 1}>
                                                                <i class="bi bi-chevron-down"></i>
                                                            </button>
                                                            <button type="button" class="btn btn-outline-danger" onclick={() => removePreference(i)}>
                                                                <i class="bi bi-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div class="row g-2">
                                                        <div class="col-md-6">
                                                            <select class="form-select" bind:value={pref.course_id} required>
                                                                <option value="">-- Select Course --</option>
                                                                {#each data.courses as course}
                                                                    <option value={course.id}>{course.name} ({course.colleges?.name})</option>
                                                                {/each}
                                                            </select>
                                                        </div>
                                                        <div class="col-md-6">
                                                            <select class="form-select" bind:value={pref.branch_id} disabled={!pref.course_id}>
                                                                <option value="">-- Select Branch (Optional) --</option>
                                                                {#each getBranchesForCourse(pref.course_id) as branch}
                                                                    <option value={branch.id}>{branch.name}</option>
                                                                {/each}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                                <input type="hidden" name="preferences" value={JSON.stringify(preferences)} />

                                <div class="d-grid mt-5">
                                    <button type="submit" class="btn btn-primary btn-lg py-3 fw-bold shadow">
                                        Submit Inquiry
                                    </button>
                                </div>

                                {#if form?.message || clientError}
                                    <div class="alert alert-danger mt-3">{form?.message || clientError}</div>
                                {/if}
                            </form>
                        {/if}
                    </div>
                </div>
                
                <div class="text-center mt-4 text-muted small">
                    <p>&copy; {new Date().getFullYear()} University Admission Portal. All rights reserved.</p>
                </div>
            </div>
        </div>
    </div>
</div>

<style lang="scss">
    .card {
        transition: transform 0.2s;
    }
    .border-dashed {
        border-style: dashed !important;
    }
    .form-control-lg, .form-select-lg {
        font-size: 1rem;
    }
    
    :global(input[type="text"]), 
    :global(textarea) {
        text-transform: uppercase;
    }

    :global(input[type="email"]) { 
        text-transform: none; 
    }

    .preference-list {
        max-height: 500px;
        overflow-y: auto;
        padding-right: 5px;
        &::-webkit-scrollbar {
            width: 5px;
        }
        &::-webkit-scrollbar-thumb {
            background: #ccc;
            border-radius: 10px;
        }
    }
</style>
