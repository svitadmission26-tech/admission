<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { toastStore } from '$lib/stores/toastStore';

    export let data: PageData;

    let isSubmitting = false;
    let editingId: string | null = null;
    let defaultCheckboxValue = false;
    let newField = {
        key: '',
        label: '',
        type: 'text',
        is_required: false,
        force_uppercase: false,
        options: '',
        default_value: ''
    };

    function resetForm() {
        editingId = null;
        newField = { key: '', label: '', type: 'text', is_required: false, force_uppercase: false, options: '', default_value: '' };
        defaultCheckboxValue = false;
    }

    function editField(field: any) {
        editingId = field.id;
        if (field.type === 'checkbox') {
            defaultCheckboxValue = field.default_value === true || field.default_value === 'true' || field.default_value === 'on';
        }
        newField = {
            key: field.key,
            label: field.label,
            type: field.type,
            is_required: field.is_required,
            force_uppercase: field.force_uppercase || false,
            options: field.options ? field.options.join('\n') : '',
            default_value: field.type === 'checkbox' ? '' : (field.default_value || '')
        };
    }

    function handleDefaultValueChange() {
        if (newField.type === 'checkbox') {
            newField.default_value = defaultCheckboxValue ? 'true' : '';
        }
    }
</script>

<div class="container-fluid mt-4">
    <h1 class="mb-4">Student Profile Schema</h1>
    <p class="text-muted">Define the common fields that will be part of every Student's Master Profile.</p>

    <div class="row">
        <!-- Form -->
        <div class="col-md-4">
            <div class="card shadow-sm mb-4">
                <div class="card-header {editingId ? 'bg-warning text-dark' : 'bg-primary text-white'}">
                    {editingId ? 'Edit Field' : 'Add New Field'}
                </div>
                <div class="card-body">
                    <form method="POST" action={editingId ? "?/update" : "?/create"} use:enhance={() => {
                        isSubmitting = true;
                        return async ({ result }) => {
                            isSubmitting = false;
                            if (result.type === 'success') {
                                toastStore.success(editingId ? 'Field updated' : 'Field added');
                                resetForm();
                                await invalidateAll();
                            } else {
                                toastStore.error(result.data?.message || 'Error');
                            }
                        };
                    }}>
                        {#if editingId}
                            <input type="hidden" name="id" value={editingId} />
                        {/if}
                        <div class="mb-3">
                            <label class="form-label">Field Label</label>
                            <input type="text" name="label" class="form-control" bind:value={newField.label} required placeholder="e.g. Date of Birth">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Key (Internal)</label>
                            <input type="text" name="key" class="form-control" bind:value={newField.key} required placeholder="e.g. dob (lowercase)" readonly={!!editingId}>
                            <div class="form-text">Unique identifier. Cannot be changed after creation.</div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Input Type</label>
                            <select name="type" class="form-select" bind:value={newField.type}>
                                <option value="text">Text</option>
                                <option value="number">Number</option>
                                <option value="date">Date</option>
                                <option value="email">Email</option>
                                <option value="textarea">Text Area</option>
                                <option value="select">Dropdown (Select)</option>
                                <option value="checkbox">Checkbox</option>
                                <option value="image">Document (Photo)</option>
                                <option value="document">Document (Document)</option>
                            </select>
                        </div>
                        
                        {#if newField.type === 'select'}
                            <div class="mb-3">
                                <label class="form-label">Options (One per line)</label>
                                <textarea name="options" class="form-control" rows="4" bind:value={newField.options} placeholder="Value|Label (e.g., IN|India)&#10;US|United States"></textarea>
                                <div class="form-text">Format: <code>value|Label</code> or just <code>Label</code></div>
                            </div>
                        {/if}

                        <!-- Default Value -->
                        <div class="p-2 border rounded bg-light mb-3">
                            <label class="form-label"><i class="bi bi-cursor-text me-1"></i> Default Value</label>
                            <p class="small text-muted mb-2">Pre-populate this field with a default value.</p>
                            
                            {#if newField.type === 'select'}
                                <select name="default_value" bind:value={newField.default_value} class="form-select">
                                    <option value="">-- No Default --</option>
                                    {#if newField.options && typeof newField.options === 'string'}
                                        {#each newField.options.split('\n').filter(Boolean) as opt}
                                            {@const parts = opt.split('|')}
                                            {@const val = parts[0]?.trim()}
                                            <option value={val}>{parts[1]?.trim() || val}</option>
                                        {/each}
                                    {:else}
                                        <option value="">Add options above first</option>
                                    {/if}
                                </select>
                            {:else if newField.type === 'checkbox'}
                                <div class="form-check">
                                    <input name="default_value_cb" type="checkbox" bind:checked={defaultCheckboxValue} id="default-checkbox" class="form-check-input" on:change={handleDefaultValueChange}>
                                    <label for="default-checkbox" class="form-check-label">Checked by default</label>
                                </div>
                            {:else if newField.type === 'number'}
                                <input 
                                    type="number" 
                                    bind:value={newField.default_value} 
                                    class="form-control" 
                                    placeholder="Default number"
                                />
                            {:else if newField.type === 'date'}
                                <input 
                                    type="date" 
                                    bind:value={newField.default_value} 
                                    class="form-control" 
                                />
                            {:else}
                                <input 
                                    type="text" 
                                    bind:value={newField.default_value} 
                                    class="form-control" 
                                    placeholder="Default value"
                                />
                            {/if}
                            
                            {#if newField.default_value}
                                <button 
                                    type="button" 
                                    class="btn btn-link btn-sm text-danger p-0 mt-1" 
                                    on:click={() => { newField.default_value = ''; defaultCheckboxValue = false; }}
                                >
                                    Clear default
                                </button>
                            {/if}
                        </div>

                        <div class="form-check mb-1">
                            <input class="form-check-input" type="checkbox" name="is_required" id="req" bind:checked={newField.is_required}>
                            <label class="form-check-label" for="req">Required Field</label>
                        </div>

                        {#if ['text', 'textarea', 'email'].includes(newField.type)}
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" name="force_uppercase" id="force_up" bind:checked={newField.force_uppercase}>
                                <label class="form-check-label" for="force_up">Force Uppercase</label>
                            </div>
                        {:else}
                            <div class="mb-3"></div>
                        {/if}

                        <div class="d-flex gap-2">
                            <button class="btn btn-primary w-100" disabled={isSubmitting}>
                                {editingId ? 'Update Field' : 'Add Field'}
                            </button>
                            {#if editingId}
                                <button type="button" class="btn btn-outline-secondary w-100" on:click={resetForm} disabled={isSubmitting}>
                                    Cancel
                                </button>
                            {/if}
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- List -->
        <div class="col-md-8">
            <div class="card shadow-sm">
                <div class="card-header">Current Schema Fields</div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th>Label</th>
                                    <th>Key</th>
                                    <th>Type</th>
                                    <th>Required</th>
                                    <th>Force Upper</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each data.fields as field}
                                    <tr>
                                        <td>{field.label}</td>
                                        <td><code>{field.key}</code></td>
                                        <td><span class="badge bg-secondary">{field.type}</span></td>
                                        <td>{field.is_required ? 'Yes' : 'No'}</td>
                                        <td>{field.force_uppercase ? 'Yes' : 'No'}</td>
                                        <td>
                                            <div class="d-flex gap-2">
                                                <button class="btn btn-sm btn-outline-primary" title="Edit" on:click={() => editField(field)}>
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                                <form method="POST" action="?/delete" use:enhance={() => {
                                                    return async ({ result }) => {
                                                        if (result.type === 'success') {
                                                            toastStore.success('Field deleted');
                                                            if (editingId === field.id) resetForm();
                                                            await invalidateAll();
                                                        } else {
                                                            toastStore.error('Failed to delete field');
                                                        }
                                                    };
                                                }}>
                                                    <input type="hidden" name="id" value={field.id}>
                                                    <button class="btn btn-sm btn-outline-danger" title="Delete" on:click={(e) => !confirm('Delete this field?') && e.preventDefault()}>
                                                        <i class="bi bi-trash"></i>
                                                    </button>
                                                </form>
                                            </div>
                                        </td>
                                    </tr>
                                {:else}
                                    <tr><td colspan="5" class="text-center py-4">No fields defined yet.</td></tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
