<script lang="ts">
    import SchemaTree from './SchemaTree.svelte'; 

    export let tableName: string;
    export let currentPath: string = ''; // e.g. 'users!student_id'
    export let schema: any[];
    export let selectedColumns: any[] = [];
    export let visitedTables: string[] = []; // Track visited tables to prevent recursion
    export let insertMode = false; // New prop for click-to-insert mode
    export let relationLabel: string = ''; // Relationship label path
    export let onToggle: (path: string, label: string) => void = () => {};
    export let onInsert: (path: string, label: string) => void = () => {};

    $: tableDef = schema.find(t => t.name === tableName);
    
    // UI State for expansion
    let expanded = false;
    let expandedJson: Record<string, boolean> = {};

    function toggleJson(colName: string) {
        expandedJson[colName] = !expandedJson[colName];
    }

    // Build the list of visited tables for children
    $: nextVisited = [...visitedTables, tableName];

    function toggle(path: string, label: string) {
        console.log('[SchemaTree] toggle calling onToggle:', { path, label });
        onToggle(path, label);
    }

    function handleInsert(path: string, label: string) {
        console.log('[SchemaTree] handleInsert calling onInsert:', { path, label });
        onInsert(path, label);
    }
</script>

<div class="ms-2 border-start ps-2 mb-2">
    <div class="d-flex align-items-center mb-1">
        {#if tableDef?.relationships?.some((rel: any) => !nextVisited.includes(rel.targetTable))}
            <button class="btn btn-sm btn-link p-0 me-1 text-decoration-none text-dark" style="font-size: 0.8rem; width: 15px;" on:click|preventDefault={() => expanded = !expanded}>
                {expanded ? '▼' : '▶'}
            </button>
        {:else}
            <span style="width: 15px; display: inline-block;"></span>
        {/if}
        <span class="fw-bold small text-primary">{tableDef?.label || tableName}</span>
    </div>

    <!-- Columns -->
    {#if tableDef}
        {#each tableDef.columns as col}
            {@const fullPath = currentPath ? `${currentPath}.${col.name}` : col.name}
            {@const isJson = col.type === 'json' && col.jsonKeys?.length}
            
            <div class="d-flex align-items-center ms-4 mb-1">
                {#if isJson}
                    <button class="btn btn-sm btn-link p-0 me-1 text-decoration-none text-muted" style="font-size: 0.7rem; width: 12px;" on:click|preventDefault={() => toggleJson(col.name)}>
                        {expandedJson[col.name] ? '▼' : '▶'}
                    </button>
                    <i class="bi bi-folder2-open text-warning me-2" on:click={() => toggleJson(col.name)} style="cursor: pointer;"></i>
                {:else}
                    <span style="width: 12px; display: inline-block;"></span>
                    {#if insertMode}
                        <button class="btn btn-xs btn-outline-primary py-0 px-1 me-2" on:click={() => handleInsert(fullPath, relationLabel ? `${relationLabel} ${col.label}` : col.label)} title="Insert variable">
                            <i class="bi bi-plus-lg"></i>
                        </button>
                    {:else}
                        <input class="form-check-input me-2" type="checkbox" id={fullPath}
                            checked={selectedColumns.some(c => c.path === fullPath)}
                            on:change={() => toggle(fullPath, relationLabel ? `${relationLabel} ${col.label}` : col.label)}
                        >
                    {/if}
                {/if}
                
                <label class="form-check-label small {insertMode ? 'cursor-pointer' : ''} {isJson ? 'fw-bold text-dark' : ''}" 
                    for={isJson ? undefined : fullPath} 
                    on:click={() => {
                        if (isJson) toggleJson(col.name);
                        else if (insertMode) handleInsert(fullPath, relationLabel ? `${relationLabel} ${col.label}` : col.label);
                    }}
                    on:keydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            if (isJson) toggleJson(col.name);
                            else if (insertMode) handleInsert(fullPath, relationLabel ? `${relationLabel} ${col.label}` : col.label);
                        }
                    }}
                >
                    {relationLabel ? `${relationLabel} ${col.label}` : col.label}
                    {#if isJson}<span class="badge bg-light text-dark border ms-1 fw-normal" style="font-size: 0.6rem;">{col.jsonKeys?.length} fields</span>{/if}
                </label>
            </div>

            {#if isJson && expandedJson[col.name]}
                <div class="ms-5 border-start ps-2 my-1">
                    {#each col.jsonKeys as jsonKey}
                        {@const nestedPath = `${fullPath}.${jsonKey.key}`}
                        <div class="d-flex align-items-center mb-1">
                            {#if insertMode}
                                <button class="btn btn-xs btn-outline-info py-0 px-1 me-2" on:click={() => handleInsert(nestedPath, relationLabel ? `${relationLabel} ${col.label} ${jsonKey.label}` : `${col.label} ${jsonKey.label}`)} title="Insert variable">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                            {:else}
                                <input class="form-check-input me-2" type="checkbox" id={nestedPath}
                                    checked={selectedColumns.some(c => c.path === nestedPath)}
                                    on:change={() => toggle(nestedPath, relationLabel ? `${relationLabel} ${col.label} ${jsonKey.label}` : `${col.label} ${jsonKey.label}`)}
                                >
                            {/if}
                            <label class="form-check-label x-small text-muted {insertMode ? 'cursor-pointer' : ''}" for={nestedPath} on:click={() => insertMode && handleInsert(nestedPath, relationLabel ? `${relationLabel} ${col.label} ${jsonKey.label}` : `${col.label} ${jsonKey.label}`)}>
                                {relationLabel ? `${relationLabel} ${col.label} ${jsonKey.label}` : `${col.label} ${jsonKey.label}`}
                            </label>
                        </div>
                    {/each}
                </div>
            {/if}
        {/each}

        <!-- Recursive Relations -->
        {#if expanded}
            {#each tableDef.relationships as rel}
                {#if !visitedTables.includes(rel.targetTable)}
                    {@const nextPath = currentPath 
                        ? `${currentPath}.${rel.targetTable}!${rel.foreignKey}` 
                        : `${rel.targetTable}!${rel.foreignKey}` 
                    }
                    {@const nextRelationLabel = relationLabel ? `${relationLabel} ${rel.label}` : rel.label}
                    <div class="mt-2 ms-3">
                        <small class="text-muted text-uppercase fw-bold" style="font-size: 0.7rem;">via {rel.label}</small>
                        <SchemaTree 
                            tableName={rel.targetTable} 
                            currentPath={nextPath} 
                            {schema} 
                            {selectedColumns} 
                            visitedTables={nextVisited}
                            {insertMode}
                            relationLabel={nextRelationLabel}
                            onToggle={onToggle}
                            onInsert={onInsert}
                        />
                    </div>
                {/if}
            {/each}
        {/if}
    {:else}
        <div class="text-danger small ms-4">Table definition not found: {tableName}</div>
    {/if}
</div>

<style>
    .cursor-pointer {
        cursor: pointer;
    }
    .btn-xs {
        font-size: 0.65rem;
        padding: 0.1rem 0.2rem;
        line-height: 1;
    }
</style>
