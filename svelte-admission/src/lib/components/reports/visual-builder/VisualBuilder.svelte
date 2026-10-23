<script lang="ts">
    import Sidebar from './Sidebar.svelte';
    import CanvasNode from './CanvasNode.svelte';

    // Props using Svelte 5 runes
    let { 
        layout = $bindable([]), 
        htmlContent = $bindable(''), 
        schema = [], 
        selectedTable = '',
        live = false
    } = $props();

    // Internal state
    let previewMode = $state(false);
    let selectedIds = $state<string[]>([]);
    let selectedId = $derived(selectedIds[0] || ''); // Keep for compatibility
    let rootIsOver = $state(false);
    let zoom = $state(1);
    let showSidebar = $state(true);
    let lastCompiledHtml = $state('');

    const selectedNodes = $derived(selectedIds.map(id => findNode(layout, id)).filter(n => n !== null));
    const selectedNode = $derived(selectedNodes[0] || null);

    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    function updateNodeInLayout(nodes: any[], id: string, updates: any): boolean {
        for (let node of nodes) {
            if (node.id === id) {
                Object.assign(node, updates);
                return true;
            }
            if (node.children && updateNodeInLayout(node.children, id, updates)) {
                return true;
            }
        }
        return false;
    }

    function findAndAdd(nodes: any[], targetId: string, newNode: any): boolean {
        for (let node of nodes) {
            if (node.id === targetId) {
                if (node.type === 'row' || node.type === 'column' || node.type === 'tableCell') {
                    node.children = [...node.children, newNode];
                    return true;
                }
            }
            if (node.children && findAndAdd(node.children, targetId, newNode)) {
                return true;
            }
        }
        return false;
    }

    function findNode(nodes: any[], id: string): any {
        for (let node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = findNode(node.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    function onDrop(targetId: string, type: string, data: any) {
        const isRoot = targetId === 'root';
        const isReparent = type === 'reparent';
        
        let nodeToProcess: any;
        
        if (isReparent) {
            const originalNode = findNode(layout, data.nodeId);
            if (!originalNode) return;
            
            if (isDescendant(originalNode, targetId)) return;
            
            nodeToProcess = JSON.parse(JSON.stringify(originalNode));
            layout = removeNodeFromLayout(layout, data.nodeId);
        } else {
            let customName = '';
            if (type === 'layoutTable') customName = 'Table';
            else if (type === 'tableCell') customName = 'Cell';
            else if (type === 'row') customName = 'Row';
            else if (type === 'column') customName = 'Column';
            else if (type === 'text') customName = 'Text';
            else if (type === 'image') customName = 'Image';
            else if (type === 'variable') {
                if (data.variableLabel) {
                    customName = data.variableLabel.replace(/List\s*>\s*/i, '').substring(0, 10).trim();
                } else {
                    customName = 'Variable';
                }
            } else if (type === 'pageBreak') customName = 'PageBreak';
            else {
                customName = type.charAt(0).toUpperCase() + type.slice(1).substring(0, 9);
            }

            nodeToProcess = {
                id: generateId(),
                type,
                customName,
                children: (type === 'row' || type === 'column') ? [] : undefined,
                style: {
                    width: '100%',
                    height: 'auto',
                    padding: '5px',
                    margin: '0px',
                    fontSize: '12px'
                }
            };

            if (type === 'variable') {
                nodeToProcess.variablePath = data.variablePath;
                nodeToProcess.variableLabel = data.variableLabel;
            } else if (type === 'text') {
                nodeToProcess.content = 'Hello There';
            } else if (type === 'image') {
                nodeToProcess.src = '{{college.logo_url}}';
            } else if (type === 'table') {
                nodeToProcess.listPath = 'payments';
                nodeToProcess.columns = [
                    { label: 'Date', path: 'created_at' },
                    { label: 'Amount', path: 'amount' },
                    { label: 'Status', path: 'status' }
                ];
                nodeToProcess.style.width = '100%';
                nodeToProcess.style.marginBottom = '10px';
            } else if (type === 'layoutTable') {
                nodeToProcess.children = [0, 1].map(() => ({
                    id: generateId(),
                    type: 'tableRow',
                    customName: 'Row',
                    children: [0, 1].map(() => ({
                        id: generateId(),
                        type: 'tableCell',
                        customName: 'Cell',
                        children: [],
                        style: { padding: '5px', border: '1px dashed #ccc' }
                    }))
                }));
                nodeToProcess.style.width = '100%';
                nodeToProcess.style.borderCollapse = 'collapse';
            }
        }

        if (isRoot) {
            nodeToProcess.x = data.x || 20;
            nodeToProcess.y = data.y || 20;
            nodeToProcess.w = nodeToProcess.w || (type === 'image' ? 150 : 200);
            nodeToProcess.h = nodeToProcess.h || (type === 'image' ? 150 : 40);
            nodeToProcess.style.position = 'absolute';
            nodeToProcess.style.left = `${nodeToProcess.x}px`;
            nodeToProcess.style.top = `${nodeToProcess.y}px`;
            
            layout = [...layout, nodeToProcess];
        } else {
            delete nodeToProcess.x;
            delete nodeToProcess.y;
            nodeToProcess.style.position = 'relative';
            nodeToProcess.style.left = undefined;
            nodeToProcess.style.top = undefined;
            nodeToProcess.style.width = nodeToProcess.style.width || '100%';

            const newLayout = JSON.parse(JSON.stringify(layout));
            if (findAndAdd(newLayout, targetId, nodeToProcess)) {
                layout = newLayout;
            }
        }
        
        selectedIds = [nodeToProcess.id];
        compile();
    }

    function isDescendant(parent: any, childId: string): boolean {
        if (!parent.children) return false;
        for (const child of parent.children) {
            if (child.id === childId) return true;
            if (isDescendant(child, childId)) return true;
        }
        return false;
    }

    function removeNodeFromLayout(nodes: any[], nodeId: string): any[] {
        return nodes.filter(n => {
            if (n.id === nodeId) return false;
            if (n.children) {
                n.children = removeNodeFromLayout(n.children, nodeId);
            }
            return true;
        });
    }

    function handleRootDragOver(e: DragEvent) {
        e.preventDefault();
        rootIsOver = true;
    }

    function handleRootDrop(e: DragEvent) {
        e.preventDefault();
        rootIsOver = false;
        
        const type = e.dataTransfer?.getData('componentType');
        const nodeId = e.dataTransfer?.getData('nodeId');
        const variablePath = e.dataTransfer?.getData('variablePath');
        const variableLabel = e.dataTransfer?.getData('variableLabel');
        
        const canvas = e.currentTarget as HTMLElement;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoom;
        const y = (e.clientY - rect.top) / zoom;

        if (nodeId) {
            onDrop('root', 'reparent', { nodeId, x: Math.round(x), y: Math.round(y) });
        } else if (type) {
            onDrop('root', type, { variablePath, variableLabel, x: Math.round(x), y: Math.round(y) });
        }
    }

    function handleSelect(id: string, event?: MouseEvent) {
        const isModifier = event && (event.shiftKey || event.ctrlKey || event.metaKey);
        const isAlreadySelected = selectedIds.includes(id);

        if (isModifier) {
            if (isAlreadySelected) {
                selectedIds = selectedIds.filter(sid => sid !== id);
            } else {
                selectedIds = [...selectedIds, id];
            }
        } else {
            if (!isAlreadySelected) {
                selectedIds = [id];
            }
        }
    }

    function findParentTable(nodes: any[], targetId: string, parentTable: any = null): any {
        for (const node of nodes) {
            if (node.id === targetId) return parentTable;
            if (node.children) {
                const found = findParentTable(node.children, targetId, node.type === 'layoutTable' ? node : parentTable);
                if (found) return found;
            }
        }
        return null;
    }

    function compileNode(node: any): string {
        let styleStr = '';
        const combinedStyle = { ...node.style };
        
        // Exclude zIndex from compiled HTML style so components are not hidden in rendered template
        if ('zIndex' in combinedStyle) delete combinedStyle.zIndex;
        if ('z-index' in combinedStyle) delete combinedStyle['z-index'];
        
        if (node.x !== undefined && node.y !== undefined) {
            combinedStyle.position = 'absolute';
            combinedStyle.left = `${node.x}px`;
            combinedStyle.top = `${node.y}px`;
            if (node.w) combinedStyle.width = `${node.w}px`;
            if (node.h && node.type !== 'text') combinedStyle.height = `${node.h}px`;
        } else {
            combinedStyle.position = 'relative';
            if (node.type !== 'tableCell' && node.type !== 'tableRow' && node.type !== 'layoutTable') {
                combinedStyle.width = combinedStyle.width || '100%';
            }
        }

        if (combinedStyle) {
            Object.entries(combinedStyle).forEach(([k, v]) => {
                if (v === undefined || v === null) return;
                const cssKey = k.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
                styleStr += `${cssKey}:${v};`;
            });
        }

        let innerHtml = '';
        switch (node.type) {
            case 'row':
                innerHtml = `<div class="row g-0" style="min-height:20px; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
                break;
            case 'column':
                innerHtml = `<div class="col-${node.width || 12}" style="min-height:10px; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
                break;
            case 'text':
                if (node.isConditional && node.conditions && node.conditions.length > 0) {
                    let condStr = '';
                    node.conditions.forEach((cond: any, idx: number) => {
                        if (idx === 0) {
                            condStr += `{{#if ${cond.expr.trim()}}}${cond.value}`;
                        } else {
                            condStr += `{{else if ${cond.expr.trim()}}}${cond.value}`;
                        }
                    });
                    condStr += `{{else}}${node.fallbackValue || ''}{{/if}}`;
                    innerHtml = `<div style="${styleStr}">${condStr}</div>`;
                } else {
                    innerHtml = `<div style="${styleStr}">${node.content || ''}</div>`;
                }
                break;
            case 'variable':
                innerHtml = `<span style="${styleStr}">{{${node.variablePath}}}</span>`;
                break;
            case 'image':
                innerHtml = `<img src="${node.src || '{{college.logo_url}}'}" style="${styleStr} object-fit:contain;">`;
                break;
            case 'table':
                const headers = (node.columns || []).map((c: any) => `<th style="border:1px solid #dee2e6; padding:8px; background-color:#f8f9fa;">${c.label}</th>`).join('');
                const cells = (node.columns || []).map((c: any) => `<td style="border:1px solid #dee2e6; padding:8px;">{{${c.path}}}</td>`).join('');
                innerHtml = `<table style="width:100%; border-collapse:collapse; ${styleStr}"><thead><tr>${headers}</tr></thead><tbody>{{#each ${node.listPath}}}<tr>${cells}</tr>{{/each}}</tbody></table>`;
                break;
            case 'layoutTable':
                innerHtml = `<table style="width:100%; table-layout:fixed; border-collapse:${node.style?.borderCollapse || 'collapse'}; ${styleStr}">${node.children.map(compileNode).join('')}</table>`;
                break;
            case 'tableRow':
                innerHtml = `<tr>${node.children.map(compileNode).join('')}</tr>`;
                break;
            case 'tableCell':
                const cellWidth = node.width ? `${((node.width / 12) * 100).toFixed(2)}%` : '';
                const widthStyle = cellWidth ? `width:${cellWidth};` : '';
                innerHtml = `<td style="position:relative; ${widthStyle} ${styleStr}">${node.children.map(compileNode).join('')}</td>`;
                break;
            case 'divider':
                innerHtml = `<hr style="${styleStr}">`;
                break;
        }

        if (node.condition && node.condition.trim()) {
            return `{{#if ${node.condition.trim()}}}${innerHtml}{{/if}}`;
        }
        return innerHtml;
    }

    function compile() {
        const compiled = layout.map(compileNode).join('');
        lastCompiledHtml = compiled;
        htmlContent = compiled;
    }

    let isExternalChange = $derived(htmlContent !== lastCompiledHtml && layout.length > 0);

    function deleteNode(targetId?: string) {
        const id = targetId || selectedId;
        if (!id) return;
        const idsToDelete = targetId ? [targetId] : selectedIds;
        function filterNodes(nodes: any[]) {
            return nodes.filter(n => {
                if (idsToDelete.includes(n.id)) return false;
                if (n.children) n.children = filterNodes(n.children);
                return true;
            });
        }
        layout = filterNodes(JSON.parse(JSON.stringify(layout)));
        selectedIds = selectedIds.filter(sid => !idsToDelete.includes(sid));
        compile();
    }

    function resetLayout() {
        if (confirm('Are you sure you want to clear the entire design?')) {
            layout = [];
            selectedIds = [];
            compile();
        }
    }

    function importLayout() {
        const json = prompt('Paste your Visual Layout JSON here:');
        if (json) {
            try {
                const parsed = JSON.parse(json);
                if (Array.isArray(parsed)) {
                    layout = parsed;
                    compile();
                    alert('Layout imported successfully!');
                } else {
                    alert('Invalid format: Expected a JSON array.');
                }
            } catch (e) {
                alert('Invalid JSON: ' + (e as Error).message);
            }
        }
    }

    let dragState = $state({
        activeId: '',
        type: '' as 'move' | 'resize' | '',
        resizeDir: '',
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        initialW: 0,
        initialH: 0,
        initialNodes: [] as { id: string, x: number, y: number }[]
    });

    let guidelines = $state<{ x?: number, y?: number }[]>([]);
    const SNAP_THRESHOLD = 5;

    function startAction(nodeId: string, type: 'move' | 'resize', event: MouseEvent, dir = '') {
        const node = findNode(layout, nodeId);
        if (!node) return;
        if (type === 'move' && !selectedIds.includes(nodeId)) {
            selectedIds = [nodeId];
        }
        dragState = {
            activeId: nodeId,
            type,
            resizeDir: dir,
            startX: event.clientX,
            startY: event.clientY,
            initialX: node.x || 0,
            initialY: node.y || 0,
            initialW: node.w || 100,
            initialH: node.h || 40,
            initialNodes: selectedNodes.map(n => ({ id: n.id, x: n.x || 0, y: n.y || 0 }))
        };
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        event.stopPropagation();
    }

    function handleGlobalMouseMove(e: MouseEvent) {
        if (!dragState.activeId) return;
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        
        if (dragState.type === 'move') {
            guidelines = [];
            let newX = dragState.initialX + dx;
            let newY = dragState.initialY + dy;
            const activeNode = findNode(layout, dragState.activeId);
            if (!activeNode) return;
            const currentW = activeNode.w || 100;
            const currentH = activeNode.h || 40;
            const canvasWidth = 210 * 3.7795275591;
            const canvasHeight = 297 * 3.7795275591;
            const targetsX = [0, canvasWidth / 2, canvasWidth]; 
            const targetsY = [0, canvasHeight / 2, canvasHeight];
            layout.forEach(n => {
                if (selectedIds.includes(n.id) || n.x === undefined) return;
                targetsX.push(n.x, n.x + (n.w || 0), n.x + (n.w || 0) / 2);
                targetsY.push(n.y, n.y + (n.h || 0), n.y + (n.h || 0) / 2);
            });
            for (const tx of targetsX) {
                if (Math.abs(newX - tx) < SNAP_THRESHOLD) { newX = tx; guidelines.push({ x: tx }); }
                else if (Math.abs((newX + currentW / 2) - tx) < SNAP_THRESHOLD) { newX = tx - currentW / 2; guidelines.push({ x: tx }); }
                else if (Math.abs((newX + currentW) - tx) < SNAP_THRESHOLD) { newX = tx - currentW; guidelines.push({ x: tx }); }
            }
            for (const ty of targetsY) {
                if (Math.abs(newY - ty) < SNAP_THRESHOLD) { newY = ty; guidelines.push({ y: ty }); }
                else if (Math.abs((newY + currentH / 2) - ty) < SNAP_THRESHOLD) { newY = ty - currentH / 2; guidelines.push({ y: ty }); }
                else if (Math.abs((newY + currentH) - ty) < SNAP_THRESHOLD) { newY = ty - currentH; guidelines.push({ y: ty }); }
            }
            const actualDx = newX - dragState.initialX;
            const actualDy = newY - dragState.initialY;
            let newLayout = JSON.parse(JSON.stringify(layout));
            dragState.initialNodes.forEach(initNode => {
                updateNodeInLayout(newLayout, initNode.id, { 
                    x: Math.round(initNode.x + actualDx), 
                    y: Math.round(initNode.y + actualDy) 
                });
            });
            layout = newLayout;
        } else if (dragState.type === 'resize') {
            const dir = dragState.resizeDir;
            let finalX = dragState.initialX;
            let finalY = dragState.initialY;
            let finalW = dragState.initialW;
            let finalH = dragState.initialH;
            if (dir.includes('e')) finalW = dragState.initialW + dx;
            if (dir.includes('s')) finalH = dragState.initialH + dy;
            if (dir.includes('w')) { const deltaW = Math.min(dragState.initialW - 20, dx); finalW = dragState.initialW - deltaW; finalX = dragState.initialX + deltaW; }
            if (dir.includes('n')) { const deltaH = Math.min(dragState.initialH - 20, dy); finalH = dragState.initialH - deltaH; finalY = dragState.initialY + deltaH; }
            const targetsX = [0, (210 * 3.7795275591) / 2, 210 * 3.7795275591];
            const targetsY = [0, (297 * 3.7795275591) / 2, 297 * 3.7795275591];
            layout.forEach(n => {
                if (n.id === dragState.activeId || n.x === undefined) return;
                targetsX.push(n.x, n.x + (n.w || 0), n.x + (n.w || 0) / 2);
                targetsY.push(n.y, n.y + (n.h || 0), n.y + (n.h || 0) / 2);
            });
            if (dir.includes('e')) for (const tx of targetsX) if (Math.abs((finalX + finalW) - tx) < SNAP_THRESHOLD) { finalW = tx - finalX; guidelines.push({ x: tx }); }
            if (dir.includes('w')) for (const tx of targetsX) if (Math.abs(finalX - tx) < SNAP_THRESHOLD) { const delta = tx - finalX; finalX = tx; finalW -= delta; guidelines.push({ x: tx }); }
            if (dir.includes('s')) for (const ty of targetsY) if (Math.abs((finalY + finalH) - ty) < SNAP_THRESHOLD) { finalH = ty - finalY; guidelines.push({ y: ty }); }
            if (dir.includes('n')) for (const ty of targetsY) if (Math.abs(finalY - ty) < SNAP_THRESHOLD) { const delta = ty - finalY; finalY = ty; finalH -= delta; guidelines.push({ y: ty }); }
            updateSelectedNode({ x: Math.round(finalX), y: Math.round(finalY), w: Math.round(finalW), h: Math.round(finalH) });
        }
    }

    function updateSelectedNode(updates: any, targetId?: string) {
        const id = targetId || selectedId;
        if (!id && !updates.groupFlow) return;
        const targetNode = findNode(layout, id);
        if (targetNode && targetNode.x === undefined) { delete updates.x; delete updates.y; }
        if (updates.delete) { deleteNode(id); return; }

        if (updates.groupFlow) {
            const nodesToGroup = selectedIds.map(sid => findNode(layout, sid)).filter(Boolean);
            if (nodesToGroup.length < 2) return;

            // Find bounds
            const minX = Math.min(...nodesToGroup.map(n => n.x ?? 0));
            const minY = Math.min(...nodesToGroup.map(n => n.y ?? 0));
            const maxX = Math.max(...nodesToGroup.map(n => (n.x ?? 0) + (n.w ?? 0)));
            const maxY = Math.max(...nodesToGroup.map(n => (n.y ?? 0) + (n.h ?? 0)));

            // Sort nodes by Y position to preserve visual order
            nodesToGroup.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

            // Create container
            const container: any = {
                id: generateId(),
                type: 'column',
                x: minX,
                y: minY,
                w: maxX - minX,
                h: maxY - minY,
                style: {
                    position: 'absolute',
                    left: `${minX}px`,
                    top: `${minY}px`,
                    width: `${maxX - minX}px`,
                    minHeight: `${maxY - minY}px`,
                    padding: '5px'
                },
                children: nodesToGroup.map(n => {
                    const cloned = JSON.parse(JSON.stringify(n));
                    delete cloned.x;
                    delete cloned.y;
                    cloned.style = {
                        ...cloned.style,
                        position: 'relative',
                        left: undefined,
                        top: undefined,
                        width: '100%',
                        marginBottom: '10px'
                    };
                    return cloned;
                })
            };

            // Remove original nodes and add container
            let newLayout = JSON.parse(JSON.stringify(layout));
            selectedIds.forEach(sid => {
                newLayout = removeNodeFromLayout(newLayout, sid);
            });
            layout = [...newLayout, container];
            selectedIds = [container.id];
            compile();
            return;
        }

        if (updates.duplicate) {
            const nodesToDuplicate = targetId ? [targetId] : selectedIds;
            const newIds: string[] = [];
            let l = JSON.parse(JSON.stringify(layout));
            nodesToDuplicate.forEach(nodeId => {
                const nodeToDuplicate = findNode(l, nodeId);
                if (nodeToDuplicate) {
                    const newNode = JSON.parse(JSON.stringify(nodeToDuplicate));
                    newNode.id = generateId();
                    newIds.push(newNode.id);
                    if (newNode.x !== undefined) { newNode.x += 20; newNode.y += 20; }
                    if (nodeToDuplicate.x !== undefined) { l = [...l, newNode]; } 
                    else {
                        function addSibling(nodes: any[]) {
                            for (let node of nodes) {
                                if (node.children) {
                                    const idx = node.children.findIndex((c: any) => c.id === nodeId);
                                    if (idx !== -1) { node.children.splice(idx + 1, 0, newNode); return true; }
                                    if (addSibling(node.children)) return true;
                                }
                            }
                            return false;
                        }
                        addSibling(l);
                    }
                }
            });
            layout = l; selectedIds = newIds; compile(); return;
        }
        function updateNodes(nodes: any[]) {
            return nodes.map(n => {
                if (n.id === id) return { ...n, ...updates };
                if (n.children) return { ...n, children: updateNodes(n.children) };
                return n;
            });
        }
        layout = updateNodes(JSON.parse(JSON.stringify(layout)));
        compile();
    }

    function handleGlobalMouseUp() {
        dragState = { activeId: '', type: '', resizeDir: '', startX: 0, startY: 0, initialX: 0, initialY: 0, initialW: 0, initialH: 0, initialNodes: [] };
        guidelines = [];
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
    }

    const A4_HEIGHT_PX = 297 * 3.7795275591;
    let pageCount = $derived(Math.max(1, Math.ceil((layout.reduce((max, n) => Math.max(max, (n.y || 0) + (n.h || 0)), 0) + 50) / A4_HEIGHT_PX)));
</script>

<div class="visual-builder-container border rounded bg-white" style="min-height: 800px;">
    <div class="toolbar p-2 border-bottom bg-dark d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-3">
            <button type="button" class="btn btn-xs {showSidebar ? 'btn-primary' : 'btn-outline-light'} py-0" onclick={() => showSidebar = !showSidebar} title="Toggle Sidebar">
                <i class="bi {showSidebar ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar'}"></i>
            </button>
            {#if layout.length === 0 && htmlContent}
                <span class="badge bg-warning text-dark"><i class="bi bi-eye-fill me-1"></i> Live Code Preview</span>
            {:else if isExternalChange}
                <span class="badge bg-info text-white"><i class="bi bi-pencil-square me-1"></i> Code Modified</span>
            {:else}
                <span class="badge bg-primary text-white">Visual Mode</span>
            {/if}
            {#if selectedId}
                <button type="button" class="btn btn-xs btn-outline-danger py-0" onclick={(e) => { e.stopPropagation(); deleteNode(); }} title="Delete Selected">
                    <i class="bi bi-trash"></i> Delete
                </button>
            {/if}
            <button type="button" class="btn btn-xs btn-outline-warning py-0 ms-1" onclick={(e) => { e.stopPropagation(); resetLayout(); }} title="Clear All">
                <i class="bi bi-arrow-counterclockwise"></i> Reset
            </button>
            <button type="button" class="btn btn-xs btn-outline-info py-0 ms-1" onclick={(e) => { e.stopPropagation(); importLayout(); }} title="Import Visual Layout">
                <i class="bi bi-box-arrow-in-down"></i> Import
            </button>
            <button type="button" class="btn btn-xs btn-outline-success py-0 ms-1" onclick={(e) => { 
                e.stopPropagation(); 
                if (layout.length === 0) return alert('No layout to export.');
                navigator.clipboard.writeText(JSON.stringify(layout, null, 2)).then(() => alert('Copied to clipboard!'));
            }} title="Export Visual Layout JSON">
                <i class="bi bi-box-arrow-up"></i> Export
            </button>
            <div class="d-flex align-items-center ms-3">
                <input type="range" class="form-range" min="0.5" max="1.5" step="0.1" bind:value={zoom} style="width: 100px;">
                <span class="text-light ms-2 x-small">{Math.round(zoom * 100)}%</span>
            </div>
        </div>
        <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-light" class:active={!previewMode} onclick={() => previewMode = false}>Design</button>
            <button type="button" class="btn btn-outline-light" class:active={previewMode} onclick={() => previewMode = true}>Preview</button>
        </div>
    </div>

    <div class="builder-body position-relative">
        <div class="sidebar-drawer border-end bg-light" class:active={showSidebar}>
            <div class="drawer-content p-3">
                {#if !previewMode}
                    <Sidebar {schema} {selectedTable} {layout} {selectedNode} {selectedNodes} selectedIds={selectedIds} onSelect={handleSelect} onUpdateNode={updateSelectedNode} onInsertVariable={(detail: any) => onDrop('root', 'variable', detail)} />
                {:else}
                    <div class="text-center text-muted mt-5"><p class="small px-3">Sidebar is hidden in Preview mode.</p></div>
                {/if}
            </div>
        </div>

        <div class="workspace-viewport">
            {#if previewMode || live || (layout.length === 0 && htmlContent)}
                <div class="canvas-paper shadow" style="transform: scale({zoom}); transform-origin: top center;">
                    <div class="p-0">{@html htmlContent}</div>
                </div>
            {:else}
                <div class="canvas-paper shadow show-grid" class:drag-over={rootIsOver} style:transform="scale({zoom})" style:transform-origin="top center" style:height="{pageCount * A4_HEIGHT_PX}px" ondragover={handleRootDragOver} ondragleave={() => rootIsOver = false} ondrop={handleRootDrop} onclick={() => selectedIds = []}>
                    <div class="print-margin-guide"></div>
                    <div style="position: relative; width: 100%; height: 100%;">
                        {#each layout as _, i (layout[i].id)}
                            <CanvasNode bind:node={layout[i]} onSelect={handleSelect} {onDrop} {selectedIds} {zoom} onUpdateNode={updateSelectedNode} onStartAction={startAction} onCancelAction={handleGlobalMouseUp} isDragging={dragState.activeId === layout[i].id} />
                        {/each}
                        {#each Array(pageCount) as _, i}
                            <div class="page-boundary-indicator" style:top="{(i + 1) * A4_HEIGHT_PX}px"></div>
                        {/each}
                        {#each guidelines as guide}
                            <div class="guideline {guide.x !== undefined ? 'vertical' : 'horizontal'}" style:left={guide.x !== undefined ? `${guide.x}px` : undefined} style:top={guide.y !== undefined ? `${guide.y}px` : undefined}></div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .visual-builder-container { display: flex; flex-direction: column; overflow: hidden; background: #f8f9fa; }
    .builder-body { display: flex; flex-direction: row; height: 800px; }
    .sidebar-drawer { width: 300px; background: #f8f9fa; border-right: 1px solid #dee2e6; overflow-y: auto; transition: all 0.3s; margin-left: -300px; }
    .sidebar-drawer.active { margin-left: 0; }
    .workspace-viewport { flex: 1; background: #e5e5e5; overflow: auto; padding: 40px; display: flex; justify-content: center; }
    .canvas-paper { background: white; width: 210mm; min-height: 297mm; position: relative; box-shadow: 0 0 15px rgba(0,0,0,0.1); z-index: 1; }
    .canvas-paper.show-grid { background-image: radial-gradient(#ddd 1px, transparent 1px); background-size: 20px 20px; }
    .page-boundary-indicator { position: absolute; left: 0; right: 0; height: 1px; border-top: 1px dashed red; z-index: 10; pointer-events: none; }
    .guideline { position: absolute; background: magenta; z-index: 1000; pointer-events: none; }
    .guideline.vertical { width: 1px; top: 0; bottom: 0; }
    .guideline.horizontal { height: 1px; left: 0; right: 0; }
    .btn-xs { padding: 0.1rem 0.4rem; font-size: 0.7rem; }
    :global(.canvas-node) { position: absolute !important; }
</style>
