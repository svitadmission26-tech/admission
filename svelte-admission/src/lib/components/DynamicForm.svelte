<script lang="ts">
    import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { PUBLIC_SUPABASE_URL } from '$env/static/public';
    import { evaluate } from 'mathjs';

    // Flexible Schema Interface
    interface FormField {
        key: string; // or name
        name?: string;
        label: string;
        type: string;
        required?: boolean;
        col?: number;
        sectionId?: string;
        is_merit?: boolean; // Legacy/List: For merit calculation
        max_score?: number; // Legacy/List: Max score for merit field
        // Default Value
        defaultValue?: string | number | boolean; // Admin-defined default value
        // Select specific
        options?: string[]; // Legacy
        dataSource?: {
            type: 'static' | 'rest';
            options?: { value: string; label: string }[];
            endpoint?: string;
            valueField?: string;
            labelField?: string;
        };
        // Logic
        dependsOn?: string;
        showWhen?: { 
            field: string; 
            operator?: 'equals' | 'notEquals' | 'in' | 'contains' | 'notContains';
            equals?: string | string[];  // string[] for 'in' operator
        };
        // Datagrid/Table specific
        column_max_scores?: Record<string, number>;
        inDatagrid?: boolean; // true = datagrid row, false = regular field (default true for table sections)
        // Copy From & Transform
        copyFrom?: {
            field: string;
            label: string;
        };
        transform?: 'uppercase' | 'none';
        maxFileSize?: number;
    }

    interface TableColumn {
        key: string;
        label: string;
        type: 'number' | 'text' | 'calculated';
        formula?: string;
        is_merit?: boolean;
        default_max_score?: number;
        aggregate?: 'sum' | 'mean' | 'max' | 'min' | 'count';
    }

    interface FormSection {
        id: string;
        title: string;
        layout?: 'column' | 'table';
        rowHeaderLabel?: string;
        tableColumns?: TableColumn[];
        showSummaryRow?: boolean;
        summaryRowLabel?: string;
        showWhen?: { 
            field: string; 
            operator?: 'equals' | 'notEquals' | 'in' | 'contains' | 'notContains';
            equals?: string | string[];  // string[] for 'in' operator
        };
    }

    interface FormSchema {
        layout?: 'tabs' | 'cards' | 'list';
        sections?: FormSection[];
        fields: FormField[];
    }

    let { schema = { fields: [] }, formData = $bindable({}), readonly = false }: { schema: FormSchema; formData: Record<string, any>; readonly?: boolean } = $props();

    let errors = $state<Record<string, string>>({});
    let uploadingFields = $state<Record<string, boolean>>({});
    let showPreviews = $state<Record<string, boolean>>({});
    let loadingOptions = $state<Record<string, boolean>>({});
    let activeTabId = $state('');
    let dynamicOptions = $state<Record<string, { value: string; label: string }[]>>({});
    let componentId = Math.random().toString(36).substring(7);
    
    // Internal initialization flags
    let initialized = $state(false);
    let defaultsInitialized = $state(false);

    // Compute field key helper
    const getKey = (f: FormField) => f.key || f.name || '';
    
    // Track rendered keys to prevent duplicates in the UI
    let renderedKeys = new Set<string>();
    function shouldRender(field: FormField): boolean {
        const key = getKey(field);
        if (renderedKeys.has(key)) return false;
        renderedKeys.add(key);
        return true;
    }

    // Reset rendered keys before each render cycle
    // Note: In Svelte 5 snippets, we might need a better way, but for now we'll reset in the main render
    
    // Visibility is computed reactively based on formData changes
    // We'll compute it inline in templates using checkVisibility function
    
    // Helper to check if a section is visible
    function isSectionVisible(section: FormSection): boolean {
        if (!section.showWhen) return true;
        return checkVisibility(section.showWhen, formData);
    }
    
    // Helper to check if a field is visible - uses formData directly
    function isFieldVisible(field: FormField): boolean {
        if (field.showWhen && !checkVisibility(field.showWhen, formData)) return false;
        if (field.sectionId) {
            const section = normalizedSchema.sections.find(s => s.id === field.sectionId);
            if (section && !isSectionVisible(section)) return false;
        }
        return true;
    }
    
    onMount(() => {
        console.debug(`[DynamicForm ${componentId}] Mounted with ${schema.fields?.length || 0} fields`);
        return () => {
            console.debug(`[DynamicForm ${componentId}] Destroyed`);
        };
    });

    // Normalize Schema
    let normalizedSchema = $derived.by(() => {
        const layout = schema.layout || 'list';
        const sections = (schema.sections && schema.sections.length > 0) 
            ? schema.sections 
            : [{ id: 'default', title: 'General', layout: 'column' as const }];
        
        // Filter out duplicate fields (keep first one)
        const seenKeys = new Set<string>();
        const uniqueFields = (schema.fields || []).filter(f => {
            const key = f.key || f.name || '';
            if (!key) return true;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        });

        return {
            layout,
            sections,
            fields: uniqueFields
        };
    });

    let visibleSections = $derived(
        normalizedSchema.sections.filter(section => isSectionVisible(section))
    );

    $effect(() => {
        if (visibleSections.length > 0) {
            if (!activeTabId || !visibleSections.some(s => s.id === activeTabId)) {
                activeTabId = visibleSections[0].id;
            }
        } else {
            activeTabId = '';
        }
    });

    $effect(() => {
        if (normalizedSchema.fields?.length > 0) {
            console.debug(`[DynamicForm ${componentId}] Schema updated: ${normalizedSchema.fields.length} fields`);
            // Check for duplicate keys in the schema
            const fieldKeys = normalizedSchema.fields.map(f => getKey(f));
            const duplicateKeys = fieldKeys.filter((key, index) => fieldKeys.indexOf(key) !== index);
            if (duplicateKeys.length > 0) {
                console.warn(`[DynamicForm ${componentId}] WARNING - Duplicate field keys found:`, [...new Set(duplicateKeys)]);
            }
        }
    });

    // Reactivity for initializing formData for merit fields and datagrid
    $effect(() => {
        // Only run once per schema
        if (!initialized && normalizedSchema.fields.length > 0) {
            initialized = true;
            console.log('[DynamicForm] Initializing formData');
            
            let newFormData = { ...formData };
            let changed = false;
            normalizedSchema.fields.forEach(field => {
                const key = getKey(field);
                const section = normalizedSchema.sections.find(s => s.id === field.sectionId) || normalizedSchema.sections[0];
                const sectionHasTable = section.layout === 'table' && section.tableColumns && section.tableColumns.length > 0;
                const isDatagridField = sectionHasTable && field.inDatagrid === true;

                // Handle DATAGRID fields (inDatagrid === true)
                if (isDatagridField) {
                     if (typeof newFormData[key] !== 'object' || newFormData[key] === null) {
                         const existingValue = newFormData[key];
                         newFormData[key] = {};
                         if (existingValue !== undefined && existingValue !== null && section.tableColumns) {
                             const targetCol = section.tableColumns[0]?.key;
                             if (targetCol) newFormData[key][targetCol] = existingValue;
                         }
                         changed = true;
                     }
                     
                     section.tableColumns?.forEach(col => {
                         if (col.is_merit) {
                             const existingColVal = newFormData[key]?.[col.key];
                             if (existingColVal && typeof existingColVal === 'object' && 'value' in existingColVal) {
                                 if (existingColVal.max_score === undefined) {
                                     existingColVal.max_score = field.column_max_scores?.[col.key] ?? col.default_max_score ?? 100;
                                 }
                             } else if (existingColVal !== undefined && existingColVal !== null) {
                                 newFormData[key][col.key] = {
                                     value: existingColVal,
                                     max_score: field.column_max_scores?.[col.key] ?? col.default_max_score ?? 100
                                 };
                                 changed = true;
                             }
                         }
                     });
                } else if (field.is_merit && !sectionHasTable) {
                    const currentVal = newFormData[key];
                    if (typeof currentVal !== 'object' || currentVal === null || !('value' in currentVal)) {
                        const existingValue = currentVal;
                        newFormData[key] = {
                            value: existingValue !== undefined ? existingValue : undefined,
                            max_score: field.max_score !== undefined ? field.max_score : 100
                        };
                        changed = true;
                    }
                }
            });
            
            if (changed) formData = newFormData;
        }
    });

    // Initialize DEFAULT VALUES
    $effect(() => {
        if (!defaultsInitialized && initialized && normalizedSchema.fields.length > 0) {
            defaultsInitialized = true;
            
            let newFormData = { ...formData };
            let changed = false;
            
            normalizedSchema.fields.forEach(field => {
                const key = getKey(field);
                if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
                    const currentValue = newFormData[key];
                    const isEmpty = currentValue === undefined || currentValue === null || currentValue === '';
                    
                    if (isEmpty) {
                        if (field.is_merit) {
                            if (!newFormData[key] || typeof newFormData[key] !== 'object') {
                                newFormData[key] = { value: '', max_score: field.max_score ?? 100 };
                            }
                            if (newFormData[key].value === undefined || newFormData[key].value === null || newFormData[key].value === '') {
                                newFormData[key].value = field.defaultValue;
                                changed = true;
                            }
                        } else {
                            newFormData[key] = field.defaultValue;
                            changed = true;
                        }
                    }
                }
            });
            
            if (changed) formData = newFormData;
        }
    });

    // Handle transformations (e.g. UPPERCASE) on the data
    $effect(() => {
        let newFormData = { ...formData };
        let changed = false;

        normalizedSchema.fields.forEach(field => {
            const key = getKey(field);
            if (field.transform === 'uppercase' && typeof newFormData[key] === 'string') {
                const upper = newFormData[key].toUpperCase();
                if (newFormData[key] !== upper) {
                    newFormData[key] = upper;
                    changed = true;
                }
            } else if (field.transform === 'uppercase' && field.is_merit && typeof newFormData[key]?.value === 'string') {
                const upper = newFormData[key].value.toUpperCase();
                if (newFormData[key].value !== upper) {
                    newFormData[key].value = upper;
                    changed = true;
                }
            } else if (field.transform === 'uppercase' && typeof newFormData[key] === 'object' && newFormData[key] !== null) {
                // Handle Datagrid rows
                const rowObj = newFormData[key];
                for (const colKey in rowObj) {
                    if (typeof rowObj[colKey] === 'string') {
                        const upper = rowObj[colKey].toUpperCase();
                        if (rowObj[colKey] !== upper) {
                            rowObj[colKey] = upper;
                            changed = true;
                        }
                    } else if (typeof rowObj[colKey]?.value === 'string') {
                        const upper = rowObj[colKey].value.toUpperCase();
                        if (rowObj[colKey].value !== upper) {
                            rowObj[colKey].value = upper;
                            changed = true;
                        }
                    }
                }
            }
        });

        if (changed) {
            formData = newFormData;
        }
    });

    // Handled reactively by the visibleSections effect above

    // Helper to get fields for a section
    function getFieldsForSection(sectionId: string) {
        return normalizedSchema.fields.filter(f => 
            f.sectionId === sectionId || 
            (!f.sectionId && sectionId === normalizedSchema.sections[0].id)
        );
    }

    // Helper to resolve nested object paths (e.g. 'physics.theory_score')
    function resolvePath(obj: any, path: string) {
        return path.split('.').reduce((o, p) => o ? o[p] : undefined, obj);
    }

    // Helper to check visibility based on showWhen condition
    function checkVisibility(showWhen: NonNullable<FormField['showWhen']>, formData: Record<string, any>): boolean {
        const parentVal = resolvePath(formData, showWhen.field);
        
        // Extract the actual value if it's a merit object
        const checkValue = (parentVal && typeof parentVal === 'object' && 'value' in parentVal) 
            ? parentVal.value 
            : parentVal;
        
        const { operator = 'equals', equals } = showWhen;
        
        const valStr = String(checkValue || '').toLowerCase();
        const equalsStr = String(equals || '').toLowerCase();

        if (operator === 'in' && Array.isArray(equals)) {
            return equals.map(v => String(v).toLowerCase()).includes(valStr);
        }
        if (operator === 'contains') {
            return valStr.includes(equalsStr);
        }
        if (operator === 'notContains') {
            return !valStr.includes(equalsStr);
        }
        if (operator === 'notEquals') {
            return valStr !== equalsStr;
        }
        // Default: equals
        return valStr === equalsStr;
    }

    // Track formData changes for visibility and dependent selects
    let lastDependentValues = $state<Record<string, any>>({});
    
    $effect(() => {
        // Access formData to create dependency for visibility calculations
        const currentData = formData;
        
        // Also update dependent selects when parent fields change
        schema.fields.forEach(field => {
            if (field.type === 'select' && field.dataSource?.type === 'rest' && field.dependsOn) {
                const parentVal = currentData[field.dependsOn];
                const key = getKey(field);
                
                // Only load if the parent value has actually changed to avoid infinite loops or unnecessary resets
                if (parentVal !== lastDependentValues[key]) {
                    lastDependentValues[key] = parentVal;
                    if (parentVal) {
                        loadDynamicOptions(field, parentVal);
                    } else {
                        dynamicOptions[key] = [];
                        // Clear the value if the parent is cleared
                        if (formData[key]) formData[key] = '';
                    }
                }
            }
        });
    });

    onMount(() => {
        // Load initial options for REST fields without dependencies
        schema.fields.forEach(field => {
            if (field.type === 'select' && field.dataSource?.type === 'rest' && !field.dependsOn) {
                loadDynamicOptions(field);
            }
        });
    });

    async function loadDynamicOptions(field: FormField, parentValue?: string) {
        if (!browser) return; // Prevent server-side fetch
        if (!field.dataSource?.endpoint) return;
        
        const key = getKey(field);
        loadingOptions[key] = true; 
        
        let url = field.dataSource.endpoint;
        if (field.dependsOn && parentValue) {
            url = url.replace(`{${field.dependsOn}}`, parentValue);
        }

        try {
            const res = await fetch(url);
            const data = await res.json();
            const valueKey = field.dataSource.valueField || 'id';
            const labelKey = field.dataSource.labelField || 'name';
            
            dynamicOptions[key] = data.map((item: any) => ({
                value: item[valueKey],
                label: item[labelKey]
            }));
        } catch (e) {
            console.error(`Failed to load options for ${key}`, e);
        } finally {
            loadingOptions[key] = false; 
        }
    }

    function getOptions(field: FormField) {
        const key = getKey(field);
        
        if (dynamicOptions[key]?.length > 0) return dynamicOptions[key];
        
        if (field.dataSource?.options && Array.isArray(field.dataSource.options) && field.dataSource.options.length > 0) {
            return field.dataSource.options;
        }
        
        if (field.options && Array.isArray(field.options) && field.options.length > 0) {
            return field.options.map(o => {
                if (typeof o === 'string') {
                    const parts = o.split('|');
                    const val = parts[0]?.trim();
                    const label = (parts[1] || parts[0])?.trim();
                    return { value: val, label: label };
                }
                if (typeof o === 'object' && o !== null) {
                    return { value: String((o as any).value ?? o), label: String(((o as any).label || ((o as any).value ?? o))) };
                }
                return { value: String(o), label: String(o) };
            });
        }

        return [];
    }

    export function validate() {
        let isValid = true;
        errors = {}; // Reset errors
        normalizedSchema.fields.forEach(field => {
            const key = getKey(field);
            // Only validate visible fields
            if (isFieldVisible(field) && field.required) {
                const section = normalizedSchema.sections.find(s => s.id === field.sectionId) || normalizedSchema.sections[0];
                const isTableLayout = section.layout === 'table' && section.tableColumns && section.tableColumns.length > 0;
                const isDatagridField = isTableLayout && field.inDatagrid === true;

                if (isDatagridField) {
                    // For datagrid fields, we check each column (except calculated ones)
                    section.tableColumns?.forEach(col => {
                        if (col.type === 'calculated') return;
                        
                        const cellVal = col.is_merit 
                            ? formData[key]?.[col.key]?.value 
                            : formData[key]?.[col.key];
                            
                        if (cellVal === undefined || cellVal === null || cellVal === '') {
                            // If any column is missing, the row is invalid
                            errors[key] = `${field.label} is required`;
                            isValid = false;
                        }
                    });
                } else if (field.is_merit) {
                    if (formData[key] === undefined || formData[key] === null || formData[key].value === undefined || formData[key].value === null || formData[key].value === '') {
                        errors[key] = `${field.label} is required`;
                        isValid = false;
                    }
                } else {
                    if (!formData[key]) {
                        errors[key] = `${field.label} is required`;
                        isValid = false;
                    }
                }
            }
        });
        
        // If validation fails, try to switch to the tab containing the first error (optional UX enhancement)
        if (!isValid && normalizedSchema.layout === 'tabs') {
            const firstErrorKey = Object.keys(errors)[0];
            const errorField = normalizedSchema.fields.find(f => getKey(f) === firstErrorKey);
            if (errorField && errorField.sectionId) {
                activeTabId = errorField.sectionId;
            }
        }

        return isValid;
    }
    
    function clearError(fieldName: string) {
        if (errors[fieldName]) {
            const newErrors = { ...errors };
            delete newErrors[fieldName];
            errors = newErrors;
        }
    }

    async function handleFileDelete(fieldName: string) {
        if (!confirm('Are you sure you want to remove this file?')) return;
        
        const filePath = formData[fieldName];
        if (!filePath) return;

        uploadingFields[fieldName] = true; // Use loading state

        try {
            const response = await fetch('/api/upload', {
                method: 'DELETE',
                body: JSON.stringify({ path: filePath }),
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();

            if (result.success) {
                delete formData[fieldName];
                formData = { ...formData }; // Trigger reactivity
                clearError(fieldName);
            } else {
                errors[fieldName] = `Delete failed: ${result.message}`;
            }
        } catch (e) {
            console.error(e);
            errors[fieldName] = 'Delete failed due to network error.';
        } finally {
            uploadingFields[fieldName] = false;
        }
    }

    async function handleFileUpload(event: Event, fieldName: string) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        // Find field definition in schema to check specific type
        const field = normalizedSchema.fields.find(f => getKey(f) === fieldName);
        
        if (field?.type === 'image') {
            if (!file.type.startsWith('image/')) {
                errors[fieldName] = 'Invalid file type. Only Images are allowed for this field.';
                return;
            }
        } else if (field?.type === 'document') {
            if (file.type !== 'application/pdf') {
                errors[fieldName] = 'Invalid file type. Only PDF documents are allowed for this field.';
                return;
            }
        } else if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
             errors[fieldName] = 'Invalid file type. Only PDF and Images are allowed.';
             return;
        }

        const limitMb = field?.maxFileSize || 2;
        if (file.size > limitMb * 1024 * 1024) { 
            errors[fieldName] = `File size exceeds ${limitMb}MB limit.`;
            return;
        }

        // Check for existing file and delete it first
        if (formData[fieldName]) {
             try {
                await fetch('/api/upload', {
                    method: 'DELETE',
                    body: JSON.stringify({ path: formData[fieldName] }),
                    headers: { 'Content-Type': 'application/json' }
                });
                // We ignore errors here (e.g. if file didn't exist) to allow upload to proceed
             } catch (e) {
                 console.warn('Failed to delete old file before replacement', e);
             }
        }

        uploadingFields[fieldName] = true;
        const data = new FormData();
        data.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: data
            });
            const result = await response.json();

            if (result.success) {
                formData[fieldName] = result.path; 
                clearError(fieldName);
            } else {
                errors[fieldName] = `Upload failed: ${result.message}`;
            }
        } catch (e) {
            console.error(e);
            errors[fieldName] = 'Upload failed due to network error.';
        } finally {
            uploadingFields[fieldName] = false;
        }
    }

    function getCalculatedValue(rowKey: string, formula?: string) {
        if (!formula || !formData[rowKey]) return '';
        try {
            const scope = { ...formData[rowKey] };
            // Convert strings to numbers for evaluation if possible
            for (const k in scope) {
                if (typeof scope[k] === 'string' && !isNaN(Number(scope[k]))) {
                    scope[k] = Number(scope[k]);
                }
            }
            const result = evaluate(formula, scope);
            // Optional: update formData reactively if needed
            // if (formData[rowKey][colKey] !== result) formData[rowKey][colKey] = result;
            return result;
        } catch (e) {
            return '';
        }
    }
</script>

{#snippet fieldControl(field: FormField, fieldId: string, key: string, hideLabel: boolean = false)}
    <!-- Copy From Feature -->
    {#if field.copyFrom && !readonly}
        <div class="form-check mb-1">
            <input 
                type="checkbox" 
                class="form-check-input" 
                id="{fieldId}-copy"
                onchange={(e) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    if (checked) {
                        const sourceVal = formData[field.copyFrom!.field];
                        // Handle merit objects vs regular strings
                        if (typeof sourceVal === 'object' && sourceVal !== null && 'value' in sourceVal) {
                            if (field.is_merit) {
                                formData[key] = JSON.parse(JSON.stringify(sourceVal));
                            } else {
                                formData[key] = sourceVal.value;
                            }
                        } else {
                            if (field.is_merit) {
                                formData[key] = { value: sourceVal, max_score: field.max_score || 100 };
                            } else {
                                formData[key] = sourceVal;
                            }
                        }
                    }
                }}
            />
            <label class="form-check-label small text-muted" for="{fieldId}-copy">
                {field.copyFrom.label}
            </label>
        </div>
    {/if}

    {#if field.is_merit}
        <div class="row g-2">
            <div class="col-md-6">
                <input
                    type="number"
                    step="any"
                    class="form-control"
                    id={fieldId}
                    name="{key}-value"
                    placeholder="Score"
                    value={formData[key]?.value ?? ''}
                    oninput={(e) => {
                        let val = (e.target as HTMLInputElement).value;
                        if (field.transform === 'uppercase') val = val.toUpperCase();
                        if (!formData[key]) formData[key] = { value: '', max_score: field.max_score ?? 100 };
                        formData[key].value = val;
                        clearError(key);
                    }}
                    style={field.transform === 'uppercase' ? 'text-transform: uppercase' : ''}
                    disabled={readonly}
                />
            </div>
            <div class="col-md-6">
                <input
                    type="number"
                    step="any"
                    class="form-control"
                    id="{fieldId}-max-score"
                    name="{key}-max-score"
                    placeholder="Max Score"
                    value={formData[key]?.max_score ?? 100}
                    oninput={(e) => {
                        const val = (e.target as HTMLInputElement).value;
                        if (!formData[key]) formData[key] = { value: '', max_score: 100 };
                        formData[key].max_score = parseFloat(val) || 100;
                        clearError(key);
                    }}
                    disabled={readonly}
                />
            </div>
        </div>
    {:else if field.type === 'text' || field.type === 'email' || field.type === 'number' || field.type === 'date'}
        <input
            type={field.type}
            step={field.type === 'number' ? 'any' : undefined}
            class="form-control"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            oninput={(e) => {
                if (field.transform === 'uppercase') {
                    formData[key] = (e.target as HTMLInputElement).value.toUpperCase();
                }
                clearError(key);
            }}
            style={field.transform === 'uppercase' ? 'text-transform: uppercase' : ''}
            disabled={readonly}
        />
    {:else if field.type === 'textarea'}
        <textarea
            class="form-control"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            oninput={(e) => {
                if (field.transform === 'uppercase') {
                    formData[key] = (e.target as HTMLTextAreaElement).value.toUpperCase();
                }
                clearError(key);
            }}
            style={field.transform === 'uppercase' ? 'text-transform: uppercase' : ''}
            disabled={readonly}
        ></textarea>
    {:else if field.type === 'select'}
        <select
            class="form-select"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            onchange={() => clearError(key)}
            disabled={readonly || loadingOptions[key] || (!!field.dependsOn && !formData[field.dependsOn])}
        >
            <option value="">
                {loadingOptions[key] ? 'Loading...' : `-- Select ${field.label} --`}
            </option>
            {#each getOptions(field) as option}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>
    {:else if field.type === 'checkbox'}
        <div class="form-check">
            <input
                type="checkbox"
                class="form-check-input"
                id={fieldId}
                name={key}
                bind:checked={formData[key]}
                onchange={() => clearError(key)}
                disabled={readonly}
            />
            {#if !hideLabel}
                <label class="form-check-label" for={fieldId}>{field.label}</label>
            {/if}
        </div>
    {:else if field.type === 'file' || field.type === 'image' || field.type === 'document'}
        <div class="input-group">
            <input
                type="file"
                class="form-control"
                id={fieldId}
                name={key}
                accept={field.type === 'image' ? 'image/*' : field.type === 'document' ? 'application/pdf' : 'image/*,application/pdf'}
                onchange={(e) => handleFileUpload(e, key)}
                disabled={readonly || uploadingFields[key]}
            />
            {#if uploadingFields[key]}
                <span class="input-group-text">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    Uploading...
                </span>
            {/if}
        </div>
        <div class="form-text">
            Max size: {field.maxFileSize || 2}MB. 
            {#if field.type === 'image'}
                Allowed: Images (JPG, PNG, etc).
            {:else if field.type === 'document'}
                Allowed: PDF only.
            {:else}
                Allowed: PDF, Images.
            {/if}
        </div>
        {#if formData[key]}
            <div class="mt-2 d-flex flex-column gap-2">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <small class="text-success fw-bold"><i class="bi bi-check-circle-fill"></i> File uploaded</small>
                    <a 
                        href="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/{formData[key]}" 
                        target="_blank" 
                        class="btn btn-sm btn-outline-info"
                    >
                        <i class="bi bi-eye"></i> View
                    </a>
                    
                    {#if field.type === 'image' || field.type === 'file'}
                        <button 
                            type="button" 
                            class="btn btn-sm btn-outline-secondary"
                            onclick={() => showPreviews[key] = !showPreviews[key]}
                        >
                            <i class="bi {showPreviews[key] ? 'bi-eye-slash' : 'bi-image'}"></i> 
                            {showPreviews[key] ? 'Hide' : 'Preview'}
                        </button>
                    {/if}

                    {#if !readonly}
                        <button 
                            type="button" 
                            class="btn btn-sm btn-outline-danger" 
                            onclick={() => handleFileDelete(key)}
                        >
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    {/if}
                </div>

                {#if showPreviews[key]}
                    <div class="mt-1 border rounded p-1 bg-light d-inline-block" style="max-width: fit-content;">
                        <img 
                            src="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/{formData[key]}" 
                            alt="Preview" 
                            class="img-thumbnail" 
                            style="max-height: 200px; max-width: 100%; object-fit: contain;"
                            onerror={(e) => {
                                (e.target as HTMLImageElement).src = 'https://placehold.co/200x200?text=Preview+Not+Available';
                                (e.target as HTMLImageElement).onerror = null;
                            }}
                        />
                    </div>
                {/if}
            </div>
        {:else if uploadingFields[key]}
            <div class="mt-1">
                <small class="text-info">Uploading...</small>
            </div>
        {/if}
    {:else}
        <p class="text-danger">Unsupported field type: {field.type}</p>
    {/if}
{/snippet}

{#snippet sectionContent(section: FormSection)}
    {@const sectionFields = getFieldsForSection(section.id)}
    {@const isTableLayout = section.layout === 'table' && section.tableColumns && section.tableColumns.length > 0}
    {@const regularFields = isTableLayout ? sectionFields.filter(f => !f.inDatagrid) : sectionFields}
    {@const datagridFields = isTableLayout ? sectionFields.filter(f => f.inDatagrid) : []}
    
    <!-- Regular Fields -->
    {#if regularFields.length > 0}
        <div class="row mb-3">
            {#each regularFields as field, fieldIndex (getKey(field) + '-' + fieldIndex)}
                {@const key = getKey(field)}
                {@const fieldId = `reg-${section.id}-${key}-${fieldIndex}`}
                {#if isFieldVisible(field)}
                    <div class="{`col-md-${field.col || 12}`} mb-2">
                        <label for={fieldId} class="form-label">
                            {field.label}
                            {#if field.required}<span class="text-danger">*</span>{/if}
                        </label>
                        {@render fieldControl(field, fieldId, key, false)}
                        {#if errors[key]}
                            <div class="text-danger mt-1">{errors[key]}</div>
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}
    
    <!-- Datagrid Table (only for table layout) -->
    {#if isTableLayout && datagridFields.length > 0}
        <div class="table-responsive mb-3">
            <table class="table table-bordered align-middle">
                <thead class="table-light">
                    <tr>
                        <th style="width: 25%">{section.rowHeaderLabel || 'Field Name'}</th>
                        {#each section.tableColumns || [] as col (col.key)}
                            <th>{col.label}</th>
                            {#if col.is_merit}
                                <th style="width: 15%; min-width: 100px;">{col.label} Max</th>
                            {/if}
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each datagridFields as field, fieldIndex (getKey(field) + '-' + fieldIndex)}
                        {@const key = getKey(field)}
                        {@const fieldId = `dg-${section.id}-${key}-${fieldIndex}`}
                        {#if isFieldVisible(field)}
                            <tr>
                                <td>
                                    <label for={fieldId} class="form-label mb-0 fw-semibold">
                                        {field.label}
                                        {#if field.required}<span class="text-danger">*</span>{/if}
                                    </label>
                                </td>
                                {#each section.tableColumns || [] as col, colIndex (col.key)}
                                    {@const cellId = colIndex === 0 ? fieldId : `${fieldId}-${col.key}`}
                                    {@const maxScoreId = `${fieldId}-${col.key}-max`}
                                    <td>
                                        {#if col.type === 'calculated'}
                                            {@const calcVal = getCalculatedValue(key, col.formula)}
                                            <input type="text" class="form-control bg-light" id={cellId} readonly value={calcVal} />
                                            <input type="hidden" name={`${key}-${col.key}`} value={calcVal} />
                                        {:else}
                                            <input
                                                type={col.type === 'number' ? 'number' : 'text'}
                                                step={col.type === 'number' ? 'any' : undefined}
                                                class="form-control"
                                                id={cellId}
                                                name={`${key}-${col.key}`}
                                                value={col.is_merit ? formData[key]?.[col.key]?.value : formData[key]?.[col.key]}
                                                oninput={(e) => {
                                                    let targetValue = (e.target as HTMLInputElement).value;
                                                    if (field.transform === 'uppercase') targetValue = targetValue.toUpperCase();
                                                    
                                                    if (col.is_merit) {
                                                        if (!formData[key]) formData[key] = {};
                                                        if (!formData[key][col.key]) formData[key][col.key] = {};
                                                        formData[key][col.key].value = targetValue;
                                                    } else {
                                                        if (!formData[key]) formData[key] = {};
                                                        formData[key][col.key] = targetValue;
                                                    }
                                                    clearError(key);
                                                }}
                                                style={field.transform === 'uppercase' ? 'text-transform: uppercase' : ''}
                                                disabled={readonly}
                                            />
                                        {/if}
                                    </td>
                                    {#if col.is_merit}
                                        <td>
                                            <input
                                                type="number"
                                                step="any"
                                                class="form-control"
                                                id={maxScoreId}
                                                name={`${key}-${col.key}-max`}
                                                value={formData[key]?.[col.key]?.max_score ?? field.column_max_scores?.[col.key] ?? col.default_max_score ?? 100}
                                                min="1"
                                                oninput={(e) => {
                                                    const targetValue = (e.target as HTMLInputElement).value;
                                                    if (!formData[key]) formData[key] = {};
                                                    if (!formData[key][col.key]) formData[key][col.key] = {};
                                                    formData[key][col.key].max_score = parseFloat(targetValue) || 100;
                                                }}
                                                disabled={readonly}
                                            />
                                        </td>
                                    {/if}
                                {/each}
                            </tr>
                        {/if}
                    {/each}
                </tbody>
                <!-- Summary Row -->
                {#if isTableLayout && section.showSummaryRow && datagridFields.length > 0}
                    <tfoot class="table-light">
                        <tr>
                            <td><strong>{section.summaryRowLabel || 'Total'}</strong></td>
                            {#each section.tableColumns || [] as col (col.key)}
                                <td>
                                    {#if col.aggregate}
                                        {@const values = datagridFields.map(f => {
                                            const fkey = getKey(f);
                                            const val = formData[fkey]?.[col.key]?.value ?? formData[fkey]?.[col.key];
                                            return val ? Number(val) : 0;
                                        }).filter(v => !isNaN(v))}
                                        <strong>
                                        {#if col.aggregate === 'sum'}
                                            {values.reduce((a, b) => a + b, 0)}
                                        {:else if col.aggregate === 'mean'}
                                            {values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : 0}
                                        {:else if col.aggregate === 'max'}
                                            {Math.max(...values)}
                                        {:else if col.aggregate === 'min'}
                                            {Math.min(...values)}
                                        {:else if col.aggregate === 'count'}
                                            {values.length}
                                        {/if}
                                        </strong>
                                        {#if col.is_merit && values.length > 0}
                                            {@const maxScores = datagridFields.map(f => {
                                                const fkey = getKey(f);
                                                const ms = formData[fkey]?.[col.key]?.max_score ?? 
                                                         f.column_max_scores?.[col.key] ?? 
                                                         col.default_max_score ?? 100;
                                                return ms ? Number(ms) : 0;
                                            }).filter(v => !isNaN(v) && v > 0)}
                                            {@const totalMax = maxScores.reduce((a, b) => a + b, 0)}
                                            {@const percentage = ((values.reduce((a, b) => a + b, 0) / totalMax) * 100).toFixed(1)}
                                            <small class="text-muted d-block">
                                                Max: {totalMax} | {percentage}%
                                            </small>
                                        {/if}
                                    {:else}
                                        -
                                    {/if}
                                </td>
                                {#if col.is_merit}
                                    <td></td>
                                {/if}
                            {/each}
                        </tr>
                    </tfoot>
                {/if}
            </table>
        </div>
    {/if}
{/snippet}

<div class="dynamic-form-container">
    {#if true}
        {#if normalizedSchema.layout === 'tabs'}
            <ul class="nav nav-tabs mb-3">
                {#each visibleSections as section (section.id)}
                    <li class="nav-item">
                        <button 
                            class="nav-link {activeTabId === section.id ? 'active' : ''}"
                            onclick={() => activeTabId = section.id}
                            type="button"
                        >
                            {section.title}
                        </button>
                    </li>
                {/each}
            </ul>
            
            <div class="tab-content border p-3 border-top-0 rounded-bottom bg-white">
                {#each visibleSections as section (section.id)}
                    <div class="tab-pane fade {activeTabId === section.id ? 'show active' : ''}" style="display: {activeTabId === section.id ? 'block' : 'none'}">
                        {@render sectionContent(section)}
                    </div>
                {/each}
            </div>

        {:else if normalizedSchema.layout === 'cards'}
            {#each visibleSections as section (section.id)}
                <div class="card mb-4 shadow-sm">
                    <div class="card-header bg-light">
                        <h5 class="mb-0 text-primary">{section.title}</h5>
                    </div>
                    <div class="card-body">
                        {@render sectionContent(section)}
                    </div>
                </div>
            {/each}

        {:else}
            <!-- List Layout (Legacy) -->
            <div class="row">
                {#each normalizedSchema.fields as field, fieldIndex (getKey(field) + '-' + fieldIndex)}
                    {@const key = getKey(field)}
                    {@const fieldId = `list-${key}-${fieldIndex}`} 
                    {#if isFieldVisible(field)}
                        <div class="{`col-md-${field.col || 12}`} mb-3">
                            <label for={fieldId} class="form-label">
                                {field.label}
                                {#if field.required}<span class="text-danger">*</span>{/if}
                            </label>
                            {@render fieldControl(field, fieldId, key, false)}
                            {#if errors[key]}
                                <div class="text-danger mt-1">{errors[key]}</div>
                            {/if}
                        </div>
                    {/if}
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    /* Add any specific styles for dynamic forms here */
    .nav-tabs .nav-link {
        cursor: pointer;
    }
</style>