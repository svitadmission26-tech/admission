<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    // Updated Schema Interface
    export let schema: { 
        layout?: 'tabs' | 'cards' | 'list';
        sections?: { 
            id: string; 
            title: string; 
            layout?: 'column' | 'table'; 
            rowHeaderLabel?: string; 
            showSummaryRow?: boolean;
            summaryRowLabel?: string;
            tableColumns?: { 
                key: string; 
                label: string; 
                type: string; 
                formula?: string;
                is_merit?: boolean;
                default_max_score?: number;
                aggregate?: 'sum' | 'mean' | 'max' | 'min' | 'count';
            }[];
            showWhen?: {
                field: string;
                operator?: 'equals' | 'notEquals' | 'in' | 'contains' | 'notContains';
                equals?: string | string[];
            };
        }[];
        fields: any[];
    } = { fields: [] };
    
    export let studentProfileFields: any[] = []; // Prop passed from parent

    // Ensure defaults
    if (!schema.fields) schema.fields = [];
    if (!schema.sections) schema.sections = [{ id: 'default', title: 'General' }];
    if (!schema.layout) schema.layout = 'cards';

    // Field Config
    let key = '';
    let label = '';
    let type = 'text';
    let col = '12';
    let maxFileSize = 2;
    let required = false;
    let isMerit = false; 
    let maxScore = 100; 
    let columnMaxScores: Record<string, number> = {};
    let dependsOn = '';
    let showWhenField = '';  // The field to depend on
    let showWhenOperator = 'equals';  // equals, notEquals, in
    let showWhenValues = '';  // Comma-separated values for 'in' operator
    let inDatagrid = false;  // Default false - render as regular field above datagrid
    let defaultValue: string | boolean = '';  // Default value for the field
    let sectionId = schema.sections[0]?.id || 'default'; // Default to first section
    $: isTableSection = schema.sections?.find(s => s.id === sectionId)?.layout === 'table';
    
    // Reactive: Get current section's merit columns for table layout
    $: currentSectionMeritColumns = (() => {
        const section = schema.sections?.find(s => s.id === sectionId);
        if (section?.layout === 'table' && section.tableColumns) {
            return section.tableColumns.filter(col => col.is_merit && col.default_max_score);
        }
        return [];
    })();
    
    // Reactive: Initialize columnMaxScores when section changes or when opening modal
    $: if (isTableSection && currentSectionMeritColumns.length > 0 && !showAddFieldModal) {
        // Reset to defaults when section changes (but not when modal is open)
        const defaults: Record<string, number> = {};
        currentSectionMeritColumns.forEach(col => {
            defaults[col.key] = col.default_max_score || 100;
        });
        // Only reset if not already set with actual values
        if (Object.keys(columnMaxScores).length === 0) {
            columnMaxScores = defaults;
        }
    }
    
    // Select Config
    let selectSource = '';
    let staticOptions = '';
    let endpoint = '';
    let valueField = '';
    let labelField = '';
    
    // Profile Linking State
    let linkToProfileField = false;
    let selectedProfileFieldKey = '';

    // Copy From & Transform Config
    let enableCopyFrom = false;
    let copyFromField = '';
    let copyFromLabel = '';
    let transformUppercase = false;

    // Section Config
    let newSectionTitle = '';
    
    // State for editing sections
    let showEditSectionModal = false;
    let editingSection: any = null;
    let editingSectionTitle = '';
    let editingSectionLayout: 'column' | 'table' = 'column';
    let editingSectionRowHeaderLabel = '';
    let editingSectionShowSummaryRow = false;
    let editingSectionSummaryRowLabel = '';
    let editingSectionShowWhenField = '';
    let editingSectionShowWhenOperator = 'equals';
    let editingSectionShowWhenValues = '';

    // State for editing fields
    let isEditing = false;
    let editingIndex = -1;
    let showAddFieldModal = false;
    let showAddSectionModal = false;
    let editingField = null;

    const dispatch = createEventDispatcher();

    function notifyChange() {
        dispatch('change', schema);
    }

    // --- Section Management ---
    function addSection() {
        if (!newSectionTitle) return;
        const id = newSectionTitle.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
        schema.sections = [...(schema.sections || []), { id, title: newSectionTitle, layout: 'column' }];
        newSectionTitle = '';
        showAddSectionModal = false;
        notifyChange();
    }

    function openEditSectionModal(section: any) {
        editingSection = section;
        editingSectionTitle = section.title || '';
        editingSectionLayout = section.layout || 'column';
        editingSectionRowHeaderLabel = section.rowHeaderLabel || '';
        editingSectionShowSummaryRow = !!section.showSummaryRow;
        editingSectionSummaryRowLabel = section.summaryRowLabel || '';
        
        if (section.showWhen) {
            editingSectionShowWhenField = section.showWhen.field || '';
            editingSectionShowWhenOperator = section.showWhen.operator || 'equals';
            if (Array.isArray(section.showWhen.equals)) {
                editingSectionShowWhenValues = section.showWhen.equals.join(', ');
            } else {
                editingSectionShowWhenValues = section.showWhen.equals || '';
            }
        } else {
            editingSectionShowWhenField = '';
            editingSectionShowWhenOperator = 'equals';
            editingSectionShowWhenValues = '';
        }
        
        showEditSectionModal = true;
    }

    function saveSection() {
        if (!editingSection) return;
        
        editingSection.title = editingSectionTitle;
        editingSection.layout = editingSectionLayout;
        if (editingSectionLayout === 'table') {
            editingSection.rowHeaderLabel = editingSectionRowHeaderLabel;
            editingSection.showSummaryRow = editingSectionShowSummaryRow;
            editingSection.summaryRowLabel = editingSectionSummaryRowLabel;
        } else {
            delete editingSection.rowHeaderLabel;
            delete editingSection.showSummaryRow;
            delete editingSection.summaryRowLabel;
        }
        
        if (editingSectionShowWhenField && editingSectionShowWhenField.trim()) {
            if (editingSectionShowWhenOperator === 'in' && editingSectionShowWhenValues) {
                const values = editingSectionShowWhenValues.split(',').map((v: string) => v.trim()).filter(Boolean);
                editingSection.showWhen = {
                    field: editingSectionShowWhenField.trim(),
                    operator: 'in',
                    equals: values
                };
            } else if (editingSectionShowWhenValues) {
                editingSection.showWhen = {
                    field: editingSectionShowWhenField.trim(),
                    operator: editingSectionShowWhenOperator,
                    equals: editingSectionShowWhenValues.trim()
                };
            } else {
                delete editingSection.showWhen;
            }
        } else {
            delete editingSection.showWhen;
        }
        
        schema.sections = [...(schema.sections || [])];
        showEditSectionModal = false;
        notifyChange();
    }

    function removeSection(id: string) {
        if ((schema.sections || []).length <= 1) {
            alert('At least one section is required.');
            return;
        }
        schema.sections = schema.sections?.filter(s => s.id !== id);
        // Move fields from deleted section to the first available section
        const fallbackSectionId = schema.sections?.[0]?.id || 'default';
        schema.fields = schema.fields.map(f => f.sectionId === id ? { ...f, sectionId: fallbackSectionId } : f);
        
        if (sectionId === id) sectionId = fallbackSectionId;
        notifyChange();
    }

    function moveSectionUp(index: number) {
        if (index > 0 && schema.sections) {
            const temp = schema.sections[index];
            schema.sections[index] = schema.sections[index - 1];
            schema.sections[index - 1] = temp;
            notifyChange();
        }
    }

    function moveSectionDown(index: number) {
        if (schema.sections && index < schema.sections.length - 1) {
            const temp = schema.sections[index];
            schema.sections[index] = schema.sections[index + 1];
            schema.sections[index + 1] = temp;
            notifyChange();
        }
    }

    // --- Field Management ---

    function openAddFieldModal() {
        clearInputs();
        // Default to regular field (not in datagrid) for table sections
        if (isTableSection) {
            inDatagrid = false;
        }
        showAddFieldModal = true;
    }

    function saveField() {
        let field;

        if (linkToProfileField) {
            // Logic for Linked Profile Field
            if (!selectedProfileFieldKey) {
                alert('Please select a profile field.');
                return;
            }
            const selectedSpf = studentProfileFields.find(f => f.key === selectedProfileFieldKey);
            if (!selectedSpf) {
                alert('Invalid profile field selected.');
                return;
            }

            field = {
                key: selectedSpf.key,
                label: selectedSpf.label,
                type: selectedSpf.type,
                col: Number(col), // User can still choose column width
                sectionId: sectionId || (schema.sections?.[0]?.id),
                required: selectedSpf.is_required, // Inherit requirement
                transform: selectedSpf.force_uppercase ? 'uppercase' : 'none',
                profileFieldKey: selectedSpf.key,
                // Inherit options if applicable
                dataSource: (selectedSpf.type === 'select' && selectedSpf.options) ? {
                    type: 'static',
                    options: selectedSpf.options.map((o: any) => {
                        if (typeof o === 'string') {
                            const parts = o.split('|');
                            return { value: parts[0]?.trim(), label: (parts[1] || parts[0])?.trim() };
                        }
                        return { value: o, label: o };
                    })
                } : undefined
            };

            // Copy From & Transform (Applicable to linked fields too)
            if (enableCopyFrom && copyFromField && copyFromLabel) {
                field.copyFrom = { field: copyFromField, label: copyFromLabel };
            }
            if (transformUppercase) field.transform = 'uppercase';

        } else {
            // Logic for Custom Field
            if (!key) {
                alert('Key is required');
                return;
            }
            field = constructCustomFieldObject();
        }

        // Check uniqueness (if editing, ignore current index)
        const isDuplicate = schema.fields.some((f, i) => f.key === field.key && (!isEditing || i !== editingIndex));
        if (isDuplicate) {
            alert(`Field key "${field.key}" must be unique. Another field already uses this key.`);
            return;
        }

        if (isEditing && editingIndex !== -1) {
            schema.fields[editingIndex] = field;
            schema.fields = [...schema.fields]; // Force Svelte reactivity with a new array reference
        } else {
            schema.fields = [...schema.fields, field];
        }
        
        isEditing = false;
        editingIndex = -1;
        showAddFieldModal = false;
        notifyChange();
        clearInputs();
    }

    function constructCustomFieldObject() {
        const field: any = {
            key,
            label,
            type,
            col: Number(col),
            sectionId: sectionId || (schema.sections?.[0]?.id),
            profileFieldKey: undefined
        };

        if (type === 'file' || type === 'image' || type === 'document') {
            field.maxFileSize = Number(maxFileSize) || 2;
        }

        if (required) field.required = true;
        if (dependsOn) field.dependsOn = dependsOn;
        if (isMerit) field.is_merit = true;
        if (isMerit && maxScore !== 100) field.max_score = Number(maxScore);

        // Table Section: Save row-specific max score overrides for merit columns
        if (isTableSection && currentSectionMeritColumns.length > 0) {
            const hasOverrides = Object.entries(columnMaxScores).some(([colKey, score]) => {
                const col = currentSectionMeritColumns.find(c => c.key === colKey);
                return score !== (col?.default_max_score || 100);
            });
            if (hasOverrides) {
                field.column_max_scores = { ...columnMaxScores };
            }
        }

        // Table Section: Save inDatagrid (only if explicitly false, otherwise undefined = default true)
        if (isTableSection) {
            field.inDatagrid = inDatagrid;
        }

        // Default Value
        if (defaultValue !== undefined && defaultValue !== '') {
            if (type === 'checkbox') {
                field.defaultValue = Boolean(defaultValue);
            } else {
                field.defaultValue = String(defaultValue);
            }
        }

        if (showWhenField && showWhenField.trim()) {
            if (showWhenOperator === 'in' && showWhenValues) {
                // Multi-value: comma-separated
                const values = showWhenValues.split(',').map(v => v.trim()).filter(Boolean);
                if (values.length > 0) {
                    field.showWhen = { field: showWhenField.trim(), operator: 'in', equals: values };
                }
            } else if ((showWhenOperator === 'notEquals' || showWhenOperator === 'contains' || showWhenOperator === 'notContains') && showWhenValues) {
                field.showWhen = { field: showWhenField.trim(), operator: showWhenOperator, equals: showWhenValues.trim() };
            } else if (showWhenValues) {
                // Default: equals
                field.showWhen = { field: showWhenField.trim(), operator: 'equals', equals: showWhenValues.trim() };
            }
        }

        // SELECT CONFIG
        if (type === 'select' && selectSource) {
            if (selectSource === 'static') {
                field.dataSource = {
                    type: 'static',
                    options: staticOptions
                        .split('\n')
                        .filter(Boolean)
                        .map(line => {
                            const [v, l] = line.split('|');
                            return { value: v.trim(), label: (l || v).trim() };
                        })
                };
            }

            if (selectSource === 'rest') {
                field.dataSource = {
                    type: 'rest',
                    endpoint,
                    valueField,
                    labelField
                };
            }
        }

        // Copy From & Transform
        if (enableCopyFrom && copyFromField && copyFromLabel) {
            field.copyFrom = { field: copyFromField, label: copyFromLabel };
        }
        if (transformUppercase) field.transform = 'uppercase';

        return field;
    }

    function editField(index: number) {
        const field = schema.fields[index];
        
        // Common props
        col = String(field.col || 12);
        sectionId = field.sectionId || schema.sections?.[0]?.id || 'default';
        isEditing = true;
        editingIndex = index;

        if (field.profileFieldKey) {
            linkToProfileField = true;
            selectedProfileFieldKey = field.profileFieldKey;
            // Clear custom inputs to avoid confusion, though they won't be shown
            key = '';
            label = '';
            type = 'text';
        } else {
            linkToProfileField = false;
            selectedProfileFieldKey = '';
            
            // Populate custom inputs
            key = field.key;
            label = field.label;
            type = field.type;
            maxFileSize = field.maxFileSize || 2;
            required = !!field.required;
            isMerit = !!field.is_merit; 
            maxScore = field.max_score || 100;
            dependsOn = field.dependsOn || '';
            
            // Load showWhen with operator support
            if (field.showWhen) {
                showWhenField = field.showWhen.field || '';
                showWhenOperator = field.showWhen.operator || 'equals';
                if (Array.isArray(field.showWhen.equals)) {
                    showWhenValues = field.showWhen.equals.join(', ');
                } else {
                    showWhenValues = field.showWhen.equals || '';
                }
            } else {
                showWhenField = '';
                showWhenOperator = 'equals';
                showWhenValues = '';
            }

            // Load inDatagrid for table sections (default false = regular field)
            inDatagrid = field.inDatagrid === true;

            // Load defaultValue
            if (field.defaultValue !== undefined && field.defaultValue !== null) {
                if (field.type === 'checkbox') {
                    defaultValue = Boolean(field.defaultValue);
                } else {
                    defaultValue = String(field.defaultValue);
                }
            } else {
                defaultValue = '';
            }

            // Load column_max_scores for table sections
            if (isTableSection && currentSectionMeritColumns.length > 0) {
                if (field.column_max_scores) {
                    columnMaxScores = { ...field.column_max_scores };
                } else {
                    // Initialize with defaults
                    const defaults: Record<string, number> = {};
                    currentSectionMeritColumns.forEach(col => {
                        defaults[col.key] = col.default_max_score || 100;
                    });
                    columnMaxScores = defaults;
                }
            }

            // Reset Select Config first
            selectSource = '';
            staticOptions = '';
            endpoint = '';
            valueField = '';
            labelField = '';

            if (field.type === 'select' && field.dataSource) {
                selectSource = field.dataSource.type;
                if (field.dataSource.type === 'static' && field.dataSource.options) {
                    staticOptions = field.dataSource.options.map((o: any) => `${o.value}|${o.label}`).join('\n');
                }
                if (field.dataSource.type === 'rest') {
                    endpoint = field.dataSource.endpoint || '';
                    valueField = field.dataSource.valueField || '';
                    labelField = field.dataSource.labelField || '';
                }
            }
        }

        // Load Copy From & Transform (Both Custom and Linked fields)
        if (field.copyFrom) {
            enableCopyFrom = true;
            copyFromField = field.copyFrom.field;
            copyFromLabel = field.copyFrom.label;
        } else {
            enableCopyFrom = false;
            copyFromField = '';
            copyFromLabel = '';
        }
        transformUppercase = field.transform === 'uppercase';

        showAddFieldModal = true;
    }

    function removeField(index: number) {
        if (!confirm('Delete this field?')) return;
        schema.fields = schema.fields.filter((_, i) => i !== index);
        if (isEditing && editingIndex === index) {
            showAddFieldModal = false;
            clearInputs(); 
        }
        notifyChange();
    }

    function moveFieldUp(globalIndex: number) {
        const field = schema.fields[globalIndex];
        const sectionId = field.sectionId || schema.sections?.[0]?.id;
        
        // Find the index of the previous field in the same section
        let prevIndexInSameSection = -1;
        for (let i = globalIndex - 1; i >= 0; i--) {
            const f = schema.fields[i];
            const fSectionId = f.sectionId || schema.sections?.[0]?.id;
            if (fSectionId === sectionId) {
                prevIndexInSameSection = i;
                break;
            }
        }
        
        if (prevIndexInSameSection !== -1) {
            // Swap
            const temp = schema.fields[globalIndex];
            schema.fields[globalIndex] = schema.fields[prevIndexInSameSection];
            schema.fields[prevIndexInSameSection] = temp;
            notifyChange();
        }
    }

    function moveFieldDown(globalIndex: number) {
        const field = schema.fields[globalIndex];
        const sectionId = field.sectionId || schema.sections?.[0]?.id;
        
        // Find the index of the next field in the same section
        let nextIndexInSameSection = -1;
        for (let i = globalIndex + 1; i < schema.fields.length; i++) {
            const f = schema.fields[i];
            const fSectionId = f.sectionId || schema.sections?.[0]?.id;
            if (fSectionId === sectionId) {
                nextIndexInSameSection = i;
                break;
            }
        }
        
        if (nextIndexInSameSection !== -1) {
            // Swap
            const temp = schema.fields[globalIndex];
            schema.fields[globalIndex] = schema.fields[nextIndexInSameSection];
            schema.fields[nextIndexInSameSection] = temp;
            notifyChange();
        }
    }

    function clearInputs() {
        key = '';
        label = '';
        type = 'text';
        col = '12';
        maxFileSize = 2;
        required = false;
        isMerit = false; 
        maxScore = 100; 
        dependsOn = '';
        showWhenField = '';
        showWhenOperator = 'equals';
        showWhenValues = '';
        inDatagrid = false;
        selectSource = '';
        staticOptions = '';
        endpoint = '';
        valueField = '';
        labelField = '';
        linkToProfileField = false;
        selectedProfileFieldKey = '';
        defaultValue = '';
        enableCopyFrom = false;
        copyFromField = '';
        copyFromLabel = '';
        transformUppercase = false;
        isEditing = false;
        editingIndex = -1;
        editingField = null;
    }

    // Helper to get fields for a section
    $: getFieldsForSection = (sid: string) => schema.fields.filter(f => f.sectionId === sid || (!f.sectionId && sid === schema.sections?.[0]?.id));
</script>

<div class="form-builder">
    <div class="row">
        <!-- Sidebar: Global Settings & Sections -->
        <div class="col-md-4">
            <div class="card mb-3">
                <div class="card-header">Form Layout</div>
                <div class="card-body">
                    <select bind:value={schema.layout} class="form-select" on:change={notifyChange}>
                        <option value="cards">Cards (Vertical Sections)</option>
                        <option value="tabs">Tabs (Horizontal)</option>
                        <option value="list">Simple List (Legacy)</option>
                    </select>
                </div>
            </div>

            <div class="card">
                <div class="card-header">Sections</div>
                <div class="card-body">
                    <div class="input-group mb-3">
                        <input bind:value={newSectionTitle} class="form-control" placeholder="New Section Title" />
                        <button type="button" class="btn btn-outline-primary" on:click={() => showAddSectionModal = true}>Add</button>
                    </div>
                    <ul class="list-group list-group-flush">
                        {#each schema.sections || [] as section, sectionIndex}
                            <li class="list-group-item {sectionIndex % 2 === 0 ? 'bg-light' : ''}">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <span class="fw-semibold">
                                        {section.title}
                                        {#if section.layout === 'table'}
                                            <span class="badge bg-secondary ms-1 small" style="font-size: 0.7rem;">Table</span>
                                        {/if}
                                        {#if section.showWhen && section.showWhen.field}
                                            <span class="badge bg-info ms-1 small" style="font-size: 0.7rem;" title="Shows conditionally when {section.showWhen.field} {section.showWhen.operator || 'equals'} {section.showWhen.equals}"><i class="bi bi-eye-slash-fill"></i> Conditional</span>
                                        {/if}
                                    </span>
                                    <div class="d-flex align-items-center gap-1">
                                        <button type="button" class="btn btn-sm btn-outline-primary" 
                                                on:click={() => openEditSectionModal(section)}
                                                title="Configure Section"><i class="bi bi-gear"></i></button>
                                        <button type="button" class="btn btn-sm btn-outline-secondary" 
                                                on:click={() => moveSectionUp(sectionIndex)}
                                                disabled={sectionIndex === 0}
                                                title="Move Up"><i class="bi bi-arrow-up"></i></button>
                                        <button type="button" class="btn btn-sm btn-outline-secondary" 
                                                on:click={() => moveSectionDown(sectionIndex)}
                                                disabled={sectionIndex === (schema.sections || []).length - 1}
                                                title="Move Down"><i class="bi bi-arrow-down"></i></button>
                                        {#if (schema.sections || []).length > 1}
                                            <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => removeSection(section.id)}>&times;</button>
                                        {/if}
                                    </div>
                                </div>
                                {#if section.layout === 'table'}
                                    <div class="mt-2">
                                        <label class="form-label small fw-bold">Columns</label>
                                        {#each section.tableColumns || [] as col, colIndex}
                                            <div class="border p-2 mb-2 bg-white rounded small">
                                                <div class="d-flex justify-content-between mb-1">
                                                    <strong>Col {colIndex + 1}</strong>
                                                    <button type="button" class="btn btn-sm btn-link text-danger p-0" on:click={() => { if(section.tableColumns) { section.tableColumns.splice(colIndex, 1); section.tableColumns = section.tableColumns; notifyChange(); } }} title="Remove"><i class="bi bi-x-lg"></i></button>
                                                </div>
                                                <input type="text" class="form-control form-control-sm mb-1" bind:value={col.label} placeholder="Label" on:input={notifyChange} />
                                                <input type="text" class="form-control form-control-sm mb-1" bind:value={col.key} placeholder="Key" on:input={notifyChange} />
                                                <select class="form-select form-select-sm mb-1" bind:value={col.type} on:change={notifyChange}>
                                                    <option value="number">Number</option>
                                                    <option value="text">Text</option>
                                                    <option value="calculated">Calculated</option>
                                                </select>
                                                {#if col.type === 'calculated'}
                                                    <input type="text" class="form-control form-control-sm mb-1" bind:value={col.formula} placeholder="E.g. col1 + col2" on:input={notifyChange} />
                                                {/if}
                                                <div class="form-check mt-1">
                                                    <input type="checkbox" class="form-check-input" id="col-merit-{section.id}-{colIndex}" bind:checked={col.is_merit} on:change={notifyChange}>
                                                    <label class="form-check-label small" for="col-merit-{section.id}-{colIndex}">Is Merit Score?</label>
                                                </div>
                                                {#if col.is_merit}
                                                    <input type="number" class="form-control form-control-sm mt-1" bind:value={col.default_max_score} placeholder="Default Max Score (e.g. 100)" on:input={notifyChange} />
                                                {/if}
                                                {#if section.showSummaryRow}
                                                    <select class="form-select form-select-sm mt-2" bind:value={col.aggregate} on:change={notifyChange}>
                                                        <option value="">-- Aggregate --</option>
                                                        <option value="sum">Sum</option>
                                                        <option value="mean">Mean</option>
                                                        <option value="max">Max</option>
                                                        <option value="min">Min</option>
                                                        <option value="count">Count</option>
                                                    </select>
                                                {/if}
                                            </div>
                                        {/each}
                                        <button type="button" class="btn btn-sm btn-outline-secondary w-100" on:click={() => { section.tableColumns = [...(section.tableColumns || []), { key: '', label: '', type: 'number' }]; notifyChange(); }}><i class="bi bi-plus-lg"></i> Add Column</button>
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </div>
            </div>
        </div>

        <!-- Main: Field Editor -->
        <div class="col-md-8">
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span>Fields</span>
                    <button type="button" class="btn btn-primary btn-sm" on:click={openAddFieldModal}>Add Field</button>
                </div>
                <div class="card-body p-0">
                    {#each schema.sections || [] as section}
                        {@const sectionFields = getFieldsForSection(section.id)}
                        <div class="p-2 bg-light border-bottom">
                            <strong>{section.title}</strong>
                        </div>
                        <ul class="list-group list-group-flush mb-3">
                            {#each sectionFields as field, fieldIdx}
                                <li class="list-group-item d-flex justify-content-between align-items-center {fieldIdx % 2 === 0 ? 'bg-light' : ''}">
                                    <div>
                                        {field.label} <small class="text-muted">({field.key})</small>
                                        <span class="badge bg-secondary">{field.type}</span>
                                        {#if field.is_merit}
                                            <span class="badge bg-success ms-1">Merit ({field.max_score || 100})</span>
                                        {/if}
                                        {#if field.profileFieldKey}
                                            <span class="badge bg-info ms-1">Profile</span>
                                        {/if}
                                    </div>
                                    <div>
                                        <button type="button" class="btn btn-sm btn-outline-secondary me-1" 
                                                on:click={() => moveFieldUp(schema.fields.indexOf(field))}
                                                disabled={sectionFields.indexOf(field) === 0}
                                                title="Move Up"><i class="bi bi-arrow-up"></i></button>
                                        <button type="button" class="btn btn-sm btn-outline-secondary me-1" 
                                                on:click={() => moveFieldDown(schema.fields.indexOf(field))}
                                                disabled={sectionFields.indexOf(field) === sectionFields.length - 1}
                                                title="Move Down"><i class="bi bi-arrow-down"></i></button>
                                        <button type="button" class="btn btn-sm btn-outline-primary me-1" on:click={() => editField(schema.fields.indexOf(field))} title="Edit"><i class="bi bi-pencil-square"></i></button>
                                        <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => removeField(schema.fields.indexOf(field))} title="Remove"><i class="bi bi-trash"></i></button>
                                    </div>
                                </li>
                            {/each}
                            {#if sectionFields.length === 0}
                                <li class="list-group-item text-muted small">No fields in this section.</li>
                            {/if}
                        </ul>
                    {/each}
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Add/Edit Field Modal -->
{#if showAddFieldModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{isEditing ? 'Edit' : 'Add'} Field</h5>
                <button type="button" class="btn-close" on:click={() => showAddFieldModal = false}></button>
            </div>
            <div class="modal-body">
                <!-- Profile Link -->
                <div class="mb-3 form-check bg-light p-2 rounded border">
                    <input type="checkbox" id="fb-link-profile" class="form-check-input" bind:checked={linkToProfileField}>
                    <label for="fb-link-profile" class="form-check-label fw-bold">Link to Student Profile Field</label>
                    
                    {#if linkToProfileField}
                        <div class="mt-2">
                            {#if studentProfileFields.length > 0}
                                <select class="form-select" bind:value={selectedProfileFieldKey}>
                                    <option value="">-- Select Field --</option>
                                    {#each studentProfileFields as spf}
                                        <option value={spf.key}>{spf.label} ({spf.type})</option>
                                    {/each}
                                </select>
                            {:else}
                                <div class="alert alert-warning py-1 small mb-0">
                                    No profile fields defined. 
                                    <a href="/admin/profile-schema" target="_blank">Create Schema</a>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div class="mb-2">
                    <label class="form-label">Section</label>
                    <select bind:value={sectionId} class="form-select">
                        {#each schema.sections || [] as section}
                            <option value={section.id}>{section.title}</option>
                        {/each}
                    </select>
                </div>

                <!-- Custom Field Inputs (Hidden if Linked) -->
                {#if !linkToProfileField}
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label">Label</label>
                            <input bind:value={label} class="form-control" placeholder="Label" />
                        </div>
                        <div class="col-6">
                            <label class="form-label">Key</label>
                            <input bind:value={key} class="form-control" placeholder="Key (unique name)" />
                        </div>
                    </div>
                    <div class="mb-2 mt-2">
                        <label class="form-label">Type</label>
                        <select bind:value={type} class="form-select">
                            <option value="text">Text</option>
                            <option value="email">Email</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="textarea">Textarea</option>
                            <option value="select">Select</option>
                            <option value="checkbox">Checkbox</option>
                            <option value="file">File Upload (Any)</option>
                            <option value="image">Document (Photo)</option>
                            <option value="document">Document (Document)</option>
                        </select>
                    </div>
                {/if}
                
                {#if !isTableSection}
                <div class="row g-2 mt-2">
                    <div class="col-6">
                        <label class="form-label">Column Width</label>
                        <select bind:value={col} class="form-select">
                            <option value="12">Full Width</option>
                            <option value="6">Half Width</option>
                            <option value="4">1/3 Width</option>
                            <option value="3">1/4 Width</option>
                        </select>
                    </div>
                </div>
                {/if}

                <!-- Table Section: Row-specific Max Score Overrides for Merit Columns -->
                {#if isTableSection && currentSectionMeritColumns.length > 0}
                    <div class="mt-3 p-2 border rounded bg-light">
                        <h6><i class="bi bi-table me-1"></i>Table Section: Max Score Overrides</h6>
                        <p class="small text-muted mb-2">Override default max scores for this row (field) in the table.</p>
                        {#each currentSectionMeritColumns as col}
                            {@const defaultVal = col.default_max_score || 100}
                            {@const currentVal = columnMaxScores[col.key] ?? defaultVal}
                            <div class="row g-2 mb-2 align-items-center">
                                <div class="col-6">
                                    <label class="form-label small mb-0">
                                        {col.label}
                                        <span class="text-muted">(default: {defaultVal})</span>
                                    </label>
                                </div>
                                <div class="col-6">
                                    <input 
                                        type="number" 
                                        class="form-control form-control-sm" 
                                        bind:value={columnMaxScores[col.key]} 
                                        min="1"
                                        placeholder="Max Score"
                                    />
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}

                {#if !linkToProfileField}
                    {#if type === 'file' || type === 'image' || type === 'document'}
                        <div class="mt-3 p-2 border rounded bg-light">
                            <h6>File Upload Config</h6>
                            <label class="form-label small mb-1">Max File Size (MB)</label>
                            <input 
                                type="number" 
                                class="form-control form-control-sm mb-1" 
                                bind:value={maxFileSize} 
                                min="1" 
                                max="100" 
                                placeholder="2" 
                            />
                            <div class="form-text xx-small text-muted">Specify the maximum file upload size in Megabytes. (default: 2MB)</div>
                        </div>
                    {/if}

                    {#if type === 'select'}
                        <div class="mt-3 p-2 border rounded bg-light">
                            <h6>Select Options Config</h6>
                            <select bind:value={selectSource} class="form-select mb-2">
                                <option value="">-- Select Data Source --</option>
                                <option value="static">Static Options</option>
                                <option value="rest">REST Endpoint</option>
                            </select>

                            {#if selectSource === 'static'}
                                <textarea
                                    bind:value={staticOptions}
                                    class="form-control mb-2"
                                    rows="3"
                                    placeholder="value|label (one per line)"
                                ></textarea>
                            {/if}

                            {#if selectSource === 'rest'}
                                <input bind:value={endpoint} class="form-control mb-2" placeholder="REST Endpoint URL" />
                                <div class="row g-2">
                                    <div class="col-6">
                                        <input bind:value={valueField} class="form-control" placeholder="Value Key" />
                                    </div>
                                    <div class="col-6">
                                        <input bind:value={labelField} class="form-control" placeholder="Label Key" />
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                    
                    <div class="form-check mt-3">
                        <input bind:checked={required} id="req-check" class="form-check-input" type="checkbox">
                        <label for="req-check" class="form-check-label">Required</label>
                    </div>
                    
                    <div class="form-check mt-2">
                        <input bind:checked={isMerit} id="is-merit-check" class="form-check-input" type="checkbox">
                        <label for="is-merit-check" class="form-check-label">Is Merit Field?</label>
                    </div>
                    {#if isMerit}
                        <div class="col-md-6 mt-2">
                            <label for="max-score-input" class="form-label">Max Score</label>
                            <input bind:value={maxScore} id="max-score-input" class="form-control" type="number" min="1">
                        </div>
                    {/if}
                    
<!-- Table Section: Include in Datagrid -->
                    {#if isTableSection}
                        <div class="form-check mt-3">
                            <input bind:checked={inDatagrid} id="in-datagrid-check" class="form-check-input" type="checkbox">
                            <label for="in-datagrid-check" class="form-label">
                                Include in Datagrid (Table Row)
                            </label>
                            <small class="text-muted d-block">Uncheck to render as regular field above the datagrid table</small>
                        </div>
                    {/if}
                    
                    <!-- Default Value -->
                    <div class="mt-3 p-2 border rounded bg-light">
                        <h6><i class="bi bi-cursor-text me-1"></i> Default Value</h6>
                        <p class="small text-muted mb-2">Pre-populate this field with a default value.</p>
                        
                        {#if type === 'select'}
                            <select bind:value={defaultValue} class="form-select">
                                <option value="">-- No Default --</option>
                                {#if selectSource === 'static' && staticOptions}
                                    {#each staticOptions.split('\n').filter(Boolean) as opt}
                                        {@const parts = opt.split('|')}
                                        {@const val = parts[0]?.trim()}
                                        <option value={val}>{parts[1]?.trim() || val}</option>
                                    {/each}
                                {:else}
                                    <option value="">Configure select options above first</option>
                                {/if}
                            </select>
                        {:else if type === 'checkbox'}
                            <div class="form-check">
                                <input bind:checked={defaultValue} id="default-checkbox" class="form-check-input" type="checkbox">
                                <label for="default-checkbox" class="form-check-label">Checked by default</label>
                            </div>
                        {:else if type === 'number'}
                            <input 
                                type="number" 
                                bind:value={defaultValue} 
                                class="form-control" 
                                placeholder="Default number"
                            />
                        {:else if type === 'date'}
                            <input 
                                type="date" 
                                bind:value={defaultValue} 
                                class="form-control" 
                            />
                        {:else}
                            <input 
                                type="text" 
                                bind:value={defaultValue} 
                                class="form-control" 
                                placeholder="Default value"
                            />
                        {/if}
                        
                        {#if defaultValue}
                            <button 
                                type="button" 
                                class="btn btn-link btn-sm text-danger p-0 mt-1" 
                                on:click={() => defaultValue = ''}
                            >Clear Default</button>
                        {/if}
                    </div>
                {/if}

                <!-- Common for both Linked and Custom Fields -->
                <div class="mt-3 p-2 border rounded bg-light">
                    <h6><i class="bi bi-copy me-1"></i> Copy & Transformation</h6>
                    
                    <!-- Transform -->
                    {#if (linkToProfileField ? studentProfileFields.find(f => f.key === selectedProfileFieldKey)?.type : type) === 'text' || 
                         (linkToProfileField ? studentProfileFields.find(f => f.key === selectedProfileFieldKey)?.type : type) === 'textarea'}
                        <div class="form-check mb-2">
                            <input bind:checked={transformUppercase} id="transform-upper" class="form-check-input" type="checkbox">
                            <label for="transform-upper" class="form-check-label fw-bold">Force UPPERCASE</label>
                        </div>
                    {/if}

                    <!-- Copy From -->
                    <div class="form-check">
                        <input bind:checked={enableCopyFrom} id="enable-copy" class="form-check-input" type="checkbox">
                        <label for="enable-copy" class="form-check-label fw-bold">Enable "Copy From" Checkbox</label>
                    </div>
                    
                    {#if enableCopyFrom}
                        <div class="ms-4 mt-2">
                            <label class="small fw-bold">Source Field</label>
                            <select bind:value={copyFromField} class="form-select form-select-sm mb-2">
                                <option value="">-- Select Source Field --</option>
                                {#each schema.fields.filter(f => f.key !== (linkToProfileField ? selectedProfileFieldKey : key)) as sf}
                                    <option value={sf.key}>{sf.label} ({sf.key})</option>
                                {/each}
                            </select>
                            
                            <label class="small fw-bold">Checkbox Label</label>
                            <input bind:value={copyFromLabel} class="form-control form-select-sm" placeholder="e.g. Same as Permanent Address" />
                        </div>
                    {/if}
                </div>

                <div class="mt-3 p-2 border rounded bg-light">
                    <h6><i class="bi bi-eye me-1"></i> Conditional Visibility</h6>
                    <div class="row g-2">
                        <div class="col-md-4">
                            <label class="form-label small">Field to Check</label>
                            <input 
                                type="text" 
                                bind:value={showWhenField} 
                                list="available-fields-list-{sectionId}"
                                class="form-control form-control-sm" 
                                placeholder="Search or type field key..."
                            />
                            <datalist id="available-fields-list-{sectionId}">
                                <!-- System Fields -->
                                <option value="course_id">Course ID (System Field)</option>
                                <option value="course_name">Course Name (System Field)</option>
                                <option value="branch_id">Branch ID (System Field)</option>
                                <option value="branch_name">Branch Name (System Field)</option>
                                <option value="admission_type">Admission Type (System Field)</option>
                                <option value="cycle_id">Cycle (System Field)</option>
                                <option value="form_type">Form Type (System Field)</option>
                                
                                <!-- Form Fields -->
                                {#each schema.fields.filter(f => f.key !== (linkToProfileField ? selectedProfileFieldKey : key)) as field}
                                    <option value={field.key}>{field.label} ({field.key})</option>
                                {/each}
                            </datalist>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small">Operator</label>
                            <select bind:value={showWhenOperator} class="form-select form-select-sm">
                                <option value="equals">Equals</option>
                                <option value="notEquals">Not Equals</option>
                                <option value="in">In (Multiple)</option>
                                <option value="contains">Contains (Partial Match)</option>
                                <option value="notContains">Not Contains</option>
                            </select>
                        </div>
                        <div class="col-md-5">
                            <label class="form-label small">
                                Value {showWhenOperator === 'in' ? '(comma-separated)' : ''}
                            </label>
                            {#if showWhenOperator === 'in'}
                                <input bind:value={showWhenValues} class="form-control form-control-sm" placeholder="science, medical, vocational" />
                            {:else}
                                <input bind:value={showWhenValues} class="form-control form-control-sm" placeholder="value" />
                            {/if}
                        </div>
                    </div>
                    <small class="text-muted">Leave empty to show always</small>
                </div>

            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={() => showAddFieldModal = false}>Cancel</button>
                <button type="button" class="btn btn-primary" on:click={saveField}>Save Field</button>
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Add Section Modal -->
{#if showAddSectionModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-dark">Add Section</h5>
                <button type="button" class="btn-close" on:click={() => showAddSectionModal = false}></button>
            </div>
            <div class="modal-body text-dark">
                <input type="text" class="form-control" placeholder="Section Title" bind:value={newSectionTitle}>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" on:click={addSection}>Add</button>
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Edit Section Modal -->
{#if showEditSectionModal && editingSection}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog modal-lg">
        <div class="modal-content text-dark">
            <div class="modal-header">
                <h5 class="modal-title">Configure Section: {editingSection.title}</h5>
                <button type="button" class="btn-close" on:click={() => showEditSectionModal = false}></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label fw-bold">Section Title</label>
                    <input type="text" class="form-control" bind:value={editingSectionTitle} placeholder="Section Title">
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-bold">Section Layout</label>
                    <select class="form-select" bind:value={editingSectionLayout}>
                        <option value="column">Column Layout (Fields flow in columns)</option>
                        <option value="table">Table Layout (Fields rendered as columns of a single row)</option>
                    </select>
                </div>
                
                {#if editingSectionLayout === 'table'}
                    <div class="mb-3 border p-3 rounded bg-light">
                        <h6 class="fw-bold mb-2">Table Layout Configuration</h6>
                        <div class="mb-2">
                            <label class="form-label small fw-bold">Row Header Label</label>
                            <input type="text" class="form-control form-control-sm" bind:value={editingSectionRowHeaderLabel} placeholder="E.g. Subject Name">
                        </div>
                        <div class="form-check mb-2">
                            <input type="checkbox" class="form-check-input" id="edit-sec-summary" bind:checked={editingSectionShowSummaryRow}>
                            <label class="form-check-label small" for="edit-sec-summary">Show Summary/Total Row?</label>
                        </div>
                        {#if editingSectionShowSummaryRow}
                            <div>
                                <label class="form-label small fw-bold">Summary Row Label</label>
                                <input type="text" class="form-control form-control-sm" bind:value={editingSectionSummaryRowLabel} placeholder="E.g. Total Marks">
                            </div>
                        {/if}
                    </div>
                {/if}
                
                <div class="p-3 border rounded bg-light">
                    <h6 class="fw-bold mb-2"><i class="bi bi-eye me-1"></i> Conditional Visibility</h6>
                    <div class="row g-2">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Field to Check</label>
                            <input 
                                type="text" 
                                bind:value={editingSectionShowWhenField} 
                                list="section-available-fields-list"
                                class="form-control form-control-sm" 
                                placeholder="Search or type field key..."
                            />
                            <datalist id="section-available-fields-list">
                                <!-- System Fields -->
                                <option value="course_id">Course ID (System Field)</option>
                                <option value="course_name">Course Name (System Field)</option>
                                <option value="branch_id">Branch ID (System Field)</option>
                                <option value="branch_name">Branch Name (System Field)</option>
                                <option value="admission_type">Admission Type (System Field)</option>
                                <option value="cycle_id">Cycle (System Field)</option>
                                <option value="form_type">Form Type (System Field)</option>
                                
                                <!-- Form Fields -->
                                {#each schema.fields as field}
                                    <option value={field.key}>{field.label} ({field.key})</option>
                                {/each}
                            </datalist>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small fw-bold">Operator</label>
                            <select bind:value={editingSectionShowWhenOperator} class="form-select form-select-sm">
                                <option value="equals">Equals</option>
                                <option value="notEquals">Not Equals</option>
                                <option value="in">In (Multiple)</option>
                                <option value="contains">Contains (Partial Match)</option>
                                <option value="notContains">Not Contains</option>
                            </select>
                        </div>
                        <div class="col-md-5">
                            <label class="form-label small fw-bold">
                                Value {editingSectionShowWhenOperator === 'in' ? '(comma-separated)' : ''}
                            </label>
                            {#if editingSectionShowWhenOperator === 'in'}
                                <input bind:value={editingSectionShowWhenValues} class="form-control form-control-sm" placeholder="science, medical, vocational" />
                            {:else}
                                <input bind:value={editingSectionShowWhenValues} class="form-control form-control-sm" placeholder="value" />
                            {/if}
                        </div>
                    </div>
                    <small class="text-muted d-block mt-2">Leave "Field to Check" empty to show this section unconditionally.</small>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={() => showEditSectionModal = false}>Cancel</button>
                <button type="button" class="btn btn-primary" on:click={saveSection}>Save Section Settings</button>
            </div>
        </div>
    </div>
</div>
{/if}
