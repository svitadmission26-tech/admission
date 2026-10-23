<script lang="ts">
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import FormBuilder from '$lib/components/FormBuilder.svelte';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    let inquiryForms = $state<any[]>([]);
    let studentProfileFields = $state<any[]>([]);
    let academicYears = $state<any[]>([]);
    let courses = $state<any[]>([]);
    
    let isEditing = $state(false);
    let currentFormId = $state<string | null>(null);
    
    let formName = $state('');
    let formSlug = $state('');
    let formDescription = $state('');
    let selectedAcademicYearId = $state('');
    let formIsActive = $state(true);
    let formSchema = $state<any>({ fields: [], sections: [{ id: 'default', title: 'General' }] });

    onMount(async () => {
        await loadData();
    });

    async function loadData() {
        startLoading();
        const [formsRes, profileFieldsRes, coursesRes, yearsRes] = await Promise.all([
            supabase.from('inquiry_forms').select('*, academic_year:academic_years(name)').order('created_at', { ascending: false }),
            supabase.from('student_profile_fields').select('*').order('label'),
            supabase.from('courses').select('id, name, college_id, colleges(name)'),
            supabase.from('academic_years').select('id, name').eq('is_active', true)
        ]);

        if (formsRes.data) inquiryForms = formsRes.data;
        if (profileFieldsRes.data) studentProfileFields = profileFieldsRes.data;
        if (coursesRes.data) courses = coursesRes.data;
        if (yearsRes.data) academicYears = yearsRes.data;
        stopLoading();
    }

    function resetForm() {
        isEditing = false;
        currentFormId = null;
        formName = '';
        formSlug = '';
        formDescription = '';
        selectedAcademicYearId = '';
        formIsActive = true;
        formSchema = { fields: [], sections: [{ id: 'default', title: 'General' }] };
    }

    function editForm(form: any) {
        isEditing = true;
        currentFormId = form.id;
        formName = form.name;
        formSlug = form.slug;
        formDescription = form.description || '';
        selectedAcademicYearId = form.academic_year_id || '';
        formIsActive = form.is_active;
        formSchema = form.schema_json;
        window.scrollTo(0, 0);
    }

    async function saveForm() {
        if (!formName || !formSlug) {
            alert('Name and Slug are required');
            return;
        }

        startLoading();
        const payload = {
            name: formName,
            slug: formSlug.toLowerCase().replace(/\s+/g, '-'),
            description: formDescription,
            academic_year_id: selectedAcademicYearId || null,
            is_active: formIsActive,
            schema_json: formSchema
        };

        let res;
        if (isEditing && currentFormId) {
            res = await supabase.from('inquiry_forms').update(payload).eq('id', currentFormId);
        } else {
            res = await supabase.from('inquiry_forms').insert(payload);
        }

        if (res.error) {
            alert('Error saving form: ' + res.error.message);
        } else {
            resetForm();
            await loadData();
        }
        stopLoading();
    }

    async function deleteForm(id: string) {
        if (!confirm('Are you sure you want to delete this form?')) return;
        startLoading();
        const { error } = await supabase.from('inquiry_forms').delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        else await loadData();
        stopLoading();
    }

    function generateSlug() {
        if (!isEditing) {
            formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
    }
</script>

<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Inquiry Forms Management</h1>
        {#if isEditing}
            <button class="btn btn-secondary" onclick={resetForm}>Cancel Editing</button>
        {/if}
    </div>

    <div class="row">
        <!-- Editor Column -->
        <div class="col-lg-8">
            <div class="card mb-4 shadow-sm">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">{isEditing ? 'Edit' : 'Create New'} Inquiry Form</h5>
                </div>
                <div class="card-body">
                    <div class="row g-3 mb-4">
                        <div class="col-md-5">
                            <label class="form-label fw-bold">Form Name</label>
                            <input type="text" class="form-control" bind:value={formName} oninput={generateSlug} placeholder="e.g. Engineering Inquiry 2026" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-bold">Academic Year</label>
                            <select class="form-select" bind:value={selectedAcademicYearId}>
                                <option value="">-- No Specific Year --</option>
                                {#each academicYears as year}
                                    <option value={year.id}>{year.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label fw-bold">URL Slug</label>
                            <div class="input-group">
                                <span class="input-group-text small">/inquiry/</span>
                                <input type="text" class="form-control" bind:value={formSlug} placeholder="slug-name" />
                            </div>
                        </div>
                        <div class="col-md-3 d-flex align-items-end">
                            <div class="form-check form-switch mb-2">
                                <input class="form-check-input" type="checkbox" id="isActive" bind:checked={formIsActive}>
                                <label class="form-check-label" for="isActive">Is Active</label>
                            </div>
                        </div>
                        <div class="col-12">
                            <label class="form-label fw-bold">Description (Optional)</label>
                            <textarea class="form-control" bind:value={formDescription} rows="2"></textarea>
                        </div>
                    </div>

                    <hr />
                    <h5 class="mb-3">Form Structure</h5>
                    <FormBuilder bind:schema={formSchema} {studentProfileFields} on:change={() => {}} />

                    <div class="mt-4 d-grid">
                        <button class="btn btn-success btn-lg" onclick={saveForm}>
                            <i class="bi bi-save me-2"></i>
                            {isEditing ? 'Update Inquiry Form' : 'Create Inquiry Form'}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- List Column -->
        <div class="col-lg-4">
            <div class="card shadow-sm">
                <div class="card-header bg-dark text-white">
                    <h5 class="mb-0">Existing Forms</h5>
                </div>
                <div class="list-group list-group-flush">
                    {#each inquiryForms as form}
                        <div class="list-group-item p-3">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 class="mb-1">{form.name}</h6>
                                    <p class="text-muted small mb-2">Slug: <code>{form.slug}</code></p>
                                    <span class="badge {form.is_active ? 'bg-success' : 'bg-secondary'} mb-2">
                                        {form.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-primary" onclick={() => editForm(form)} title="Edit">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <a href="/inquiry/{form.slug}" target="_blank" class="btn btn-outline-info" title="View Public Form">
                                        <i class="bi bi-eye"></i>
                                    </a>
                                    <button class="btn btn-outline-danger" onclick={() => deleteForm(form.id)} title="Delete">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="small text-muted mt-2">
                                <i class="bi bi-file-earmark-text me-1"></i> {form.schema_json.fields.length} Fields
                            </div>
                        </div>
                    {:else}
                        <div class="p-4 text-center text-muted">No forms created yet.</div>
                    {/each}
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    :global(.modal-backdrop) {
        display: none;
    }
</style>
