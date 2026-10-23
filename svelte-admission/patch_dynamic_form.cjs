const fs = require('fs');

let content = fs.readFileSync('src/lib/components/DynamicForm.svelte', 'utf8');

content = content.replace(
    /import \{ PUBLIC_SUPABASE_URL \} from '\$env\/static\/public';/,
    "import { PUBLIC_SUPABASE_URL } from '$env/static/public';\n    import { evaluate } from 'mathjs';"
);

// We need to inject `getCalculatedValue`
const getCalculatedValueCode = `
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
`;

content = content.replace(
    /let dynamicOptions: Record<string, \{ value: string; label: string \}\[\]> = \{\};/,
    getCalculatedValueCode + "\n    let dynamicOptions: Record<string, { value: string; label: string }[]> = {};"
);


// Rewrite the table block
const tableBlockRegex = /\{#if section\.layout === 'table'\}([\s\S]*?)\{:else\}/;

const newTableBlock = `{#if section.layout === 'table'}
        {@const sectionFields = getFieldsForSection(section.id)}
        {@const hasMerit = sectionFields.some(f => f.is_merit)}
        {@const isDatagrid = section.tableColumns && section.tableColumns.length > 0}
        <div class="table-responsive mb-3">
            <table class="table table-bordered align-middle">
                <thead class="table-light">
                    <tr>
                        {#if isDatagrid}
                            <th style="width: 25%">{section.rowHeaderLabel || 'Field Name'}</th>
                            {#each section.tableColumns || [] as col}
                                <th>{col.label}</th>
                            {/each}
                        {:else}
                            <th style="width: 30%">{section.tableHeaderLabel || 'Field Name'}</th>
                            <th>{section.tableHeaderValue || 'Value'}</th>
                            {#if hasMerit}
                                <th style="width: 20%">Max Score</th>
                            {/if}
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each sectionFields as field, fieldIndex}
                        {@const key = getKey(field)}
                        {@const fieldId = \`\${section.id}-\${key}-\${fieldIndex}\`}
                        {#if visibleFields[key]}
                            <tr>
                                <td>
                                    <label for={fieldId} class="form-label mb-0">
                                        {field.label}
                                        {#if field.required}<span class="text-danger">*</span>{/if}
                                    </label>
                                </td>
                                {#if isDatagrid}
                                    {#each section.tableColumns || [] as col, colIndex}
                                        <td>
                                            {#if col.type === 'calculated'}
                                                {@const calcVal = getCalculatedValue(key, col.formula)}
                                                <input type="text" class="form-control bg-light" readonly value={calcVal} />
                                                <!-- Optional: invisible input to sync with form data if required -->
                                                <input type="hidden" name={\`\${key}-\${col.key}\`} value={calcVal} />
                                            {:else}
                                                <input
                                                    type={col.type === 'number' ? 'number' : 'text'}
                                                    class="form-control"
                                                    id={\`\${fieldId}-\${col.key}\`}
                                                    name={\`\${key}-\${col.key}\`}
                                                    bind:value={formData[key][col.key]}
                                                    on:input={() => clearError(key)}
                                                    disabled={readonly}
                                                />
                                            {/if}
                                        </td>
                                    {/each}
                                {:else}
                                    <td>
                                        {#if field.is_merit}
                                            <input
                                                type="number"
                                                class="form-control"
                                                id="{fieldId}-value"
                                                name="{key}-value"
                                                placeholder="Score"
                                                bind:value={formData[key].value}
                                                on:input={() => clearError(key)}
                                                disabled={readonly}
                                            />
                                        {:else}
                                            {@render fieldControl(field, fieldId, key, true)}
                                        {/if}
                                        {#if errors[key]}
                                            <div class="text-danger mt-1">{errors[key]}</div>
                                        {/if}
                                    </td>
                                    {#if hasMerit}
                                        <td>
                                            {#if field.is_merit}
                                                <input
                                                    type="number"
                                                    class="form-control"
                                                    id="{fieldId}-max-score"
                                                    name="{key}-max-score"
                                                    placeholder="Max Score"
                                                    bind:value={formData[key].max_score}
                                                    on:input={() => clearError(key)}
                                                    disabled={readonly}
                                                />
                                            {/if}
                                        </td>
                                    {/if}
                                {/if}
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}`;

content = content.replace(tableBlockRegex, newTableBlock);
fs.writeFileSync('src/lib/components/DynamicForm.svelte', content);
