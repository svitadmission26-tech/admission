const fs = require('fs');
let content = fs.readFileSync('src/lib/components/FormBuilder.svelte', 'utf8');

content = content.replace(
    /sections\?: \{ id: string; title: string; layout\?: 'column' \| 'table'; tableHeaderLabel\?: string; tableHeaderValue\?: string \}\[\];/,
    "sections?: { id: string; title: string; layout?: 'column' | 'table'; rowHeaderLabel?: string; tableColumns?: { key: string; label: string; type: string; formula?: string }[] }[];"
);

content = content.replace(
    /\{#if section.layout === 'table'\}([\s\S]*?)\{\/if\}/,
    `{#if section.layout === 'table'}
                                    <div class="mt-2">
                                        <label class="form-label small">Row Header Label</label>
                                        <input type="text" class="form-control form-control-sm mb-2" bind:value={section.rowHeaderLabel} placeholder="E.g. Subject Name" on:input={notifyChange} />
                                        
                                        <label class="form-label small">Columns</label>
                                        {#each section.tableColumns || [] as col, colIndex}
                                            <div class="border p-2 mb-2 bg-white rounded small">
                                                <div class="d-flex justify-content-between mb-1">
                                                    <strong>Col {colIndex + 1}</strong>
                                                    <button type="button" class="btn btn-sm btn-link text-danger p-0" on:click={() => { section.tableColumns.splice(colIndex, 1); section.tableColumns = section.tableColumns; notifyChange(); }}>Remove</button>
                                                </div>
                                                <input type="text" class="form-control form-control-sm mb-1" bind:value={col.label} placeholder="Label" on:input={notifyChange} />
                                                <input type="text" class="form-control form-control-sm mb-1" bind:value={col.key} placeholder="Key" on:input={notifyChange} />
                                                <select class="form-select form-select-sm mb-1" bind:value={col.type} on:change={notifyChange}>
                                                    <option value="number">Number</option>
                                                    <option value="text">Text</option>
                                                    <option value="calculated">Calculated</option>
                                                </select>
                                                {#if col.type === 'calculated'}
                                                    <input type="text" class="form-control form-control-sm" bind:value={col.formula} placeholder="E.g. col1 + col2" on:input={notifyChange} />
                                                {/if}
                                            </div>
                                        {/each}
                                        <button type="button" class="btn btn-sm btn-outline-secondary w-100" on:click={() => { section.tableColumns = [...(section.tableColumns || []), { key: '', label: '', type: 'number' }]; notifyChange(); }}>+ Add Column</button>
                                    </div>
                                {/if}`
);

fs.writeFileSync('src/lib/components/FormBuilder.svelte', content);
