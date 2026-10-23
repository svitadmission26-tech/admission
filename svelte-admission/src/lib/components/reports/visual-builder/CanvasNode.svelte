<script lang="ts">
    let { 
        node = $bindable(), 
        onSelect = (id: string, e?: MouseEvent) => {},
        onDrop = () => {},
        selectedIds = [] as string[],
        zoom = 1,
        onUpdateNode = () => {},
        onStartAction = (id: string, type: 'move' | 'resize', e: MouseEvent, dir?: string) => {},
        onCancelAction = () => {},
        isDragging = false
    } = $props();

    let isSelected = $derived(selectedIds.includes(node.id));

    let isOver = $state(false);

    // Determine the HTML tag based on node type
    let tag = $derived(
        node.type === 'tableRow' ? 'tr' : 
        node.type === 'tableCell' ? 'td' : 
        'div'
    );

    function handleMouseDown(e: MouseEvent) {
        // If a child already handled this, stop immediately
        if ((e as any)._selectionHandled) return;

        const target = e.target as HTMLElement;
        
        // Handle selection: Deepest component wins
        // Stop propagation immediately to prevent parent containers from catching this
        e.stopPropagation();
        (e as any)._selectionHandled = true;
        onSelect(node.id, e);

        // If it's a resize handle, start resize and stop
        if (target.classList.contains('resize-handle')) {
            e.preventDefault(); // Prevent native drag
            onStartAction(node.id, 'resize', e, target.dataset.dir);
            return;
        }

        // Handle movement: Only for absolute-positioned components at the root
        // and only if clicking the body/label, not a sub-component
        if (node.x !== undefined) {
            onStartAction(node.id, 'move', e);
        }
    }

    function handleDragStart(e: DragEvent) {
        // Cancel custom move if native drag starts
        onCancelAction();

        if (!e.dataTransfer) return;
        e.dataTransfer.setData('nodeId', node.id);
        e.dataTransfer.effectAllowed = 'move';
        
        // Add a class for visual feedback
        const target = e.currentTarget as HTMLElement;
        target.classList.add('dragging-native');
    }

    function handleDragEnd(e: DragEvent) {
        const target = e.currentTarget as HTMLElement;
        target.classList.remove('dragging-native');
        onCancelAction(); // Ensure everything is cleared
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        isOver = true;
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
    }

    function handleDragLeave() {
        isOver = false;
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        isOver = false;
        
        const type = e.dataTransfer?.getData('componentType');
        const nodeId = e.dataTransfer?.getData('nodeId');
        const variablePath = e.dataTransfer?.getData('variablePath');
        const variableLabel = e.dataTransfer?.getData('variableLabel');
        
        if (nodeId && nodeId !== node.id) {
            // Re-parenting existing node
            onDrop(node.id, 'reparent', { nodeId });
        } else if (type) {
            onDrop(node.id, type, { variablePath, variableLabel });
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:element
    this={tag}
    class="node-{node.type} {node.x !== undefined ? 'canvas-node' : 'nested-node'}" 
    class:selected={isSelected}
    class:drag-over={isOver}
    class:is-dragging={isDragging}
    draggable={(!isDragging && !isSelected) && (node.x !== undefined || tag === 'div')}
    ondragstart={handleDragStart}
    ondragend={handleDragEnd}
    onmousedown={handleMouseDown}
    onclick={(e) => e.stopPropagation()}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    style:left={node.x !== undefined ? `${node.x}px` : undefined}
    style:top={node.y !== undefined ? `${node.y}px` : undefined}
    style:width={node.w !== undefined ? `${node.w}px` : (node.type === 'tableCell' ? `${((node.width || 12) / 12) * 100}%` : (node.style?.width || '100%'))}
    style:min-width={node.type === 'layoutTable' && node.w !== undefined ? `${node.w}px` : undefined}
    style:height={node.h !== undefined ? `${node.h}px` : (node.style?.height || 'auto')}
    style:min-height={node.type === 'layoutTable' && node.h !== undefined ? `${node.h}px` : undefined}
    style:overflow={(node.h !== undefined || node.style?.height) ? 'hidden' : undefined}
    title={node.type === 'text' ? (node.content || '') : undefined}
    style:padding={node.style?.padding || (node.type === 'tableCell' ? '5px' : '0px')}
    style:margin={node.style?.margin || '0'}
    style:border={node.style?.border || (node.type === 'tableCell' ? '1px dashed #eee' : (node.type === 'row' || node.type === 'column' ? '1px dashed #ccc' : 'none'))}
    style:text-align={node.style?.textAlign || 'left'}
    style:color={node.style?.color}
    style:background-color={isOver ? 'rgba(13, 110, 253, 0.05)' : (node.style?.backgroundColor || 'transparent')}
    style:font-size={node.style?.fontSize}
    style:font-weight={node.style?.fontWeight}
    style:z-index={node.style?.zIndex || 'auto'}
    style:position={node.x !== undefined ? 'absolute' : (tag === 'div' || tag === 'td' ? 'relative' : undefined)}
    style:border-collapse={node.type === 'layoutTable' ? (node.style?.borderCollapse || 'collapse') : undefined}
    style:outline={isSelected ? '2px solid #0d6efd' : undefined}
    style:outline-offset={isSelected ? '-2px' : undefined}
>
    <!-- Handle for layoutTable selection/move -->
    {#if node.type === 'layoutTable' && node.x !== undefined}
        <div 
            class="move-handle" 
            draggable="false"
            onmousedown={(e) => {
                e.preventDefault();
                onSelect(node.id, e);
                onStartAction(node.id, 'move', e);
                e.stopPropagation();
            }}
            title="Drag to Move Table"
        >
            <i class="bi bi-arrows-move"></i>
        </div>
    {/if}

    <!-- Drop Zone Overlay for Cells -->
    {#if node.type === 'tableCell' && isOver}
        <div class="drop-overlay">
            <div class="drop-hint"><i class="bi bi-plus-circle me-1"></i>Drop Here</div>
        </div>
    {/if}

    {#if node.type !== 'tableRow' && node.type !== 'tableCell' && node.type !== 'layoutTable'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
            class="node-label" 
            onmousedown={(e) => {
                onSelect(node.id, e);
                e.stopPropagation();
                (e as any)._selectionHandled = true;
            }}
        >
            {node.type}
        </div>
    {/if}
    
    {#if isSelected && (node.x !== undefined || ['text', 'image', 'variable', 'table', 'layoutTable'].includes(node.type))}
        <div class="resize-handle nw" data-dir="nw" draggable="false"></div>
        <div class="resize-handle ne" data-dir="ne" draggable="false"></div>
        <div class="resize-handle sw" data-dir="sw" draggable="false"></div>
        <div class="resize-handle se" data-dir="se" draggable="false"></div>
        <div class="resize-handle n" data-dir="n" draggable="false"></div>
        <div class="resize-handle s" data-dir="s" draggable="false"></div>
        <div class="resize-handle e" data-dir="e" draggable="false"></div>
        <div class="resize-handle w" data-dir="w" draggable="false"></div>
    {/if}

    {#if node.type === 'row'}
        <div class="row g-0" style:min-height="40px" style:width="100%">
            {#if node.children.length === 0}
                <div class="col-12 text-center text-muted small py-2 border-dashed border-1">Empty Row</div>
            {:else}
                {#each node.children as child (child.id)}
                    <div class="col-{child.width || 12}">
                        <svelte:self node={child} {onSelect} {onDrop} {selectedIds} {zoom} {onUpdateNode} {onStartAction} isDragging={selectedIds.includes(child.id) && isDragging}></svelte:self>
                    </div>
                {/each}
            {/if}
        </div>
    {:else if node.type === 'column'}
        <div class="column-content d-flex flex-column" style:min-height="30px" style:width="100%">
            {#if node.children.length === 0}
                <div class="text-center text-muted x-small py-1 border-dashed border-1">Empty Column</div>
            {:else}
                {#each node.children as child (child.id)}
                    <div style:width="100%">
                        <svelte:self node={child} {onSelect} {onDrop} {selectedIds} {zoom} {onUpdateNode} {onStartAction} isDragging={selectedIds.includes(child.id) && isDragging}></svelte:self>
                    </div>
                {/each}
            {/if}
        </div>
    {:else if node.type === 'layoutTable'}
        <table style="width:100%; height: 100%; border-collapse: inherit; table-layout: fixed; border: none;">
            <tbody>
                {#each node.children as row (row.id)}
                    <svelte:self node={row} {onSelect} {onDrop} {selectedIds} {zoom} {onUpdateNode} {onStartAction} {isDragging}></svelte:self>
                {/each}
            </tbody>
        </table>
    {:else if node.type === 'tableRow'}
        {#each node.children as cell (cell.id)}
            <svelte:self node={cell} {onSelect} {onDrop} {selectedIds} {zoom} {onUpdateNode} {onStartAction} {isDragging}></svelte:self>
        {/each}
    {:else if node.type === 'tableCell'}
        {#if node.children.length === 0}
            <div class="text-center text-muted xx-small py-2 border-dashed" style="pointer-events: none; min-height: 20px;">Cell</div>
        {:else}
            {#each node.children as child (child.id)}
                <div style:width="100%" style="pointer-events: auto;">
                    <svelte:self node={child} {onSelect} {onDrop} {selectedIds} {zoom} {onUpdateNode} {onStartAction} isDragging={selectedIds.includes(child.id) && isDragging}></svelte:self>
                </div>
            {/each}
        {/if}
    {:else if node.type === 'text'}
        {#if node.isConditional}
            <div class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 p-2 d-block text-start" style="pointer-events: none;">
                <i class="bi bi-shuffle me-1"></i> Conditional Text
                <div class="x-small text-muted font-monospace mt-1">[{(node.conditions || []).length} branches]</div>
            </div>
        {:else}
            <div style="white-space: pre-wrap; min-height: 1.2em; pointer-events: none;">{node.content || 'Hello There'}</div>
        {/if}
    {:else if node.type === 'variable'}
        <div class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 p-2 d-block text-start" style="pointer-events: none;">
            <i class="bi bi-braces me-1"></i> {node.variableLabel || node.variablePath || 'Variable'}
            <div class="x-small text-muted font-monospace mt-1">&#123;&#123;{node.variablePath}&#125;&#125;</div>
        </div>
    {:else if node.type === 'image'}
        <div class="text-center p-0 border-0 bg-light overflow-hidden h-100" style="pointer-events: none;">
            {#if node.src && !node.src.includes('{{')}
                <img src={node.src} alt="Preview" style="width: 100%; height: 100%; object-fit: contain;">
            {:else}
                <div class="d-flex flex-column align-items-center justify-content-center h-100">
                    <i class="bi bi-image fs-4 text-muted"></i>
                    <div class="xx-small text-muted mt-1 text-truncate px-2" style="max-width: 100%">
                        {node.src || 'Image Placeholder'}
                    </div>
                </div>
            {/if}
        </div>
    {:else if node.type === 'table'}
        <div class="table-responsive" style="pointer-events: none;">
            <table class="table table-bordered table-sm mb-0 bg-white" style="font-size: 0.75rem;">
                <thead class="table-light">
                    <tr>
                        {#each (node.columns || []) as col}
                            <th>{col.label}</th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {#each (node.columns || []) as col}
                            <td class="text-muted font-monospace xx-small">&#123;&#123;{col.path}&#125;&#125;</td>
                        {/each}
                    </tr>
                </tbody>
            </table>
            <div class="xx-small text-primary mt-1 fw-bold">
                <i class="bi bi-repeat"></i> Repeated for each in <u>{node.listPath}</u>
            </div>
        </div>
    {:else if node.type === 'divider'}
        <hr class="my-1" style="pointer-events: none; width: 100%;">
    {/if}
</svelte:element>

<style>
    .canvas-node {
        transition: outline 0.15s ease;
        cursor: move;
        min-height: 10px;
        box-sizing: border-box;
        user-select: none;
    }
    .is-dragging, .dragging-native {
        opacity: 0.5;
        z-index: 9999 !important;
    }
    .canvas-node:hover {
        outline: 1px dashed #0d6efd !important;
    }
    .canvas-node.selected {
        outline: 1px solid #0d6efd !important;
        z-index: 100 !important;
    }
    .drag-over {
        background-color: rgba(13, 110, 253, 0.08) !important;
        outline: 2px solid #0d6efd !important;
        z-index: 101 !important;
    }
    .node-label {
        position: absolute;
        top: -18px;
        left: -1px;
        background: #0d6efd;
        color: white;
        font-size: 10px;
        padding: 0 4px;
        border-radius: 2px 2px 0 0;
        opacity: 0;
        white-space: nowrap;
        pointer-events: auto;
        cursor: pointer;
        z-index: 1001;
        transition: opacity 0.2s;
    }
    .canvas-node:hover > .node-label,
    .node-row:hover > .node-label,
    .node-column:hover > .node-label,
    .node-text:hover > .node-label,
    .node-image:hover > .node-label,
    .node-variable:hover > .node-label,
    .node-table:hover > .node-label,
    .node-divider:hover > .node-label,
    .selected > .node-label {
        opacity: 1;
    }
    .x-small {
        font-size: 0.7rem;
    }
    .xx-small {
        font-size: 0.6rem;
    }

    /* Resize Handles */
    .resize-handle {
        position: absolute;
        width: 10px;
        height: 10px;
        background: white;
        border: 1px solid #0d6efd;
        z-index: 2000;
        box-shadow: 0 0 20px rgba(0,0,0,0.2);
    }
    .nw { top: -5px; left: -5px; cursor: nw-resize; }
    .ne { top: -5px; right: -5px; cursor: ne-resize; }
    .sw { bottom: -5px; left: -5px; cursor: sw-resize; }
    .se { bottom: -5px; right: -5px; cursor: se-resize; }
    .n { top: -5px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
    .s { bottom: -5px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
    .e { right: -5px; top: 50%; transform: translateY(-50%); cursor: e-resize; }
    .w { left: -5px; top: 50%; transform: translateY(-50%); cursor: w-resize; }

    .node-tableRow { display: table-row; }
    .node-tableCell { display: table-cell; vertical-align: top; }

    /* Move Handle for LayoutTable */
    .move-handle {
        position: absolute;
        top: -24px;
        left: 0;
        background: #0d6efd;
        color: white;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px 4px 0 0;
        cursor: move;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.2s;
    }
    .node-layoutTable:hover > .move-handle, 
    .node-layoutTable.selected > .move-handle {
        opacity: 1;
    }

    /* Drop Overlay for Cells */
    .drop-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(13, 110, 253, 0.15);
        border: 2px solid #0d6efd;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }
    .drop-hint {
        background: #0d6efd;
        color: white;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: bold;
        white-space: nowrap;
    }
</style>
