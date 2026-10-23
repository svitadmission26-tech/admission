<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';
    import { toastStore } from '$lib/stores/toastStore';
    import { convertHtmlToPdfMake } from '$lib/utils/htmlToPdf';
    import * as pdfMakeLib from "pdfmake/build/pdfmake";
    import * as pdfFontsLib from "pdfmake/build/vfs_fonts";

    const pdfMake: any = (pdfMakeLib as any).default || pdfMakeLib;
    const pdfFonts: any = (pdfFontsLib as any).default || pdfFontsLib;
    if (pdfMake) {
        pdfMake.vfs = pdfFonts?.pdfMake?.vfs || pdfFonts?.vfs || pdfFonts;
    }

    export let data: PageData;

    let compiledHtml = '';
    let loading = true;
    let fetchError = '';
    let isPdfReady = false;
    let pdfDocGenerator: any = null;

    // Dot-notation getter with case-insensitivity support and bracket stripping
    function getNestedValue(obj: any, path: string): any {
        if (!obj || !path) return null;
        
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (current === null || current === undefined) return null;
            
            // Strip brackets for array-like or subject-mapped access (e.g., [math] -> math)
            const cleanPart = part.replace(/^\[|\]$/g, '').trim();
            if (!cleanPart) continue;

            // 1. Try exact match first (case-sensitive)
            if (current[cleanPart] !== undefined) {
                current = current[cleanPart];
                continue;
            }

            // 2. Try case-insensitive match
            const keys = Object.keys(current);
            const key = keys.find(k => k.toLowerCase() === cleanPart.toLowerCase());
            
            if (key !== undefined) {
                current = current[key];
            } else {
                // 3. Special fallback for flattened student/application data
                // If we are looking for a field in 'student' but it's actually inside 'profile_data'
                if ((current === obj.student || current === obj.student_profile) && current.profile_data) {
                    const subKey = Object.keys(current.profile_data).find(k => k.toLowerCase() === cleanPart.toLowerCase());
                    if (subKey) {
                        current = current.profile_data[subKey];
                        continue;
                    }
                }
                if (current === obj.application && current.form_data) {
                    const subKey = Object.keys(current.form_data).find(k => k.toLowerCase() === cleanPart.toLowerCase());
                    if (subKey) {
                        current = current.form_data[subKey];
                        continue;
                    }
                }
                
                return null;
            }
        }
        
        return current;
    }

    async function generatePdf(action: 'print' | 'download' = 'print') {
        if (action === 'print' && (data.configuration?.visualLayout || data.reportType === 'html_profile')) {
            window.print();
            return;
        }

        if (!pdfDocGenerator) {
            toastStore.error('PDF not ready yet.');
            return;
        }

        if (action === 'download') {
            pdfDocGenerator.download(`${data.templateName.replace(/\s+/g, '_')}_${data.applicationId}.pdf`);
        } else {
            pdfDocGenerator.print();
        }
    }

    function preprocessElseIf(html: string): string {
        if (!html) return '';
        const tagRegex = /(\{{1,2}\s*(?:[#:/]?if|:?else if|:?elseif|:?elif|:?else|\/if)\s*(?:[a-zA-Z0-9_.!\[\]\s=><!'"()&|-]+)?\s*\}{1,2})/g;
        const tagTestRegex = /^\{{1,2}\s*(?:[#:/]?if|:?else if|:?elseif|:?elif|:?else|\/if)\s*(?:[a-zA-Z0-9_.!\[\]\s=><!'"()&|-]+)?\s*\}\s*\}?$/;
        const parts = html.split(tagRegex);
        let output = '';
        const stack: number[] = [];
        
        for (const part of parts) {
            if (tagTestRegex.test(part)) {
                const cleanTag = part.replace(/[{}]/g, '').trim();
                if (cleanTag.startsWith('/if')) {
                    const count = stack.pop() || 0;
                    output += `{{/if}}`;
                    if (count > 0) {
                        output += '{{/if}}'.repeat(count);
                    }
                } else if (cleanTag.startsWith('else if') || cleanTag.startsWith(':else if') || 
                           cleanTag.startsWith('elseif') || cleanTag.startsWith(':elseif') ||
                           cleanTag.startsWith('elif') || cleanTag.startsWith(':elif')) {
                    
                    let condition = '';
                    if (cleanTag.startsWith(':else if')) condition = cleanTag.substring(8).trim();
                    else if (cleanTag.startsWith('else if')) condition = cleanTag.substring(7).trim();
                    else if (cleanTag.startsWith(':elseif')) condition = cleanTag.substring(7).trim();
                    else if (cleanTag.startsWith('elseif')) condition = cleanTag.substring(6).trim();
                    else if (cleanTag.startsWith(':elif')) condition = cleanTag.substring(5).trim();
                    else if (cleanTag.startsWith('elif')) condition = cleanTag.substring(4).trim();
                    
                    output += `{{else}}{{#if ${condition}}}`;
                    if (stack.length > 0) {
                        stack[stack.length - 1]++;
                    }
                    stack.push(0);
                } else if (cleanTag === 'else' || cleanTag === ':else') {
                    output += `{{else}}`;
                } else if (cleanTag.startsWith('#if') || cleanTag.startsWith('if') || cleanTag.startsWith(':if')) {
                    stack.push(0);
                    const cond = cleanTag.replace(/^[#:]?if/, '').trim();
                    output += `{{#if ${cond}}}`;
                }
            } else {
                output += part;
            }
        }
        while (stack.length > 0) {
            stack.pop();
            output += '{{/if}}';
        }
        return output;
    }

    // Evaluates complex conditions with relations, Logical AND (&&), OR (||), and NOT (!)
    function evaluateCondition(expr: string, context: any): boolean {
        expr = expr.trim();
        
        // 1. Handle logical OR (||)
        if (expr.includes('||')) {
            const terms = expr.split('||');
            return terms.some(t => evaluateCondition(t, context));
        }
        
        // 2. Handle logical AND (&&)
        if (expr.includes('&&')) {
            const terms = expr.split('&&');
            return terms.every(t => evaluateCondition(t, context));
        }
        
        // 3. Parentheses support (can strip matching outer parentheses)
        if (expr.startsWith('(') && expr.endsWith(')')) {
            return evaluateCondition(expr.substring(1, expr.length - 1), context);
        }
        
        const trimmed = expr.trim();
        
        if (trimmed.includes(' == ')) {
            const [path, val] = trimmed.split(' == ').map(s => s.trim());
            const actual = getNestedValue(context, path);
            return String(actual ?? '') === val.replace(/['"]/g, '');
        }
        
        if (trimmed.includes(' != ')) {
            const [path, val] = trimmed.split(' != ').map(s => s.trim());
            const actual = getNestedValue(context, path);
            return String(actual ?? '') !== val.replace(/['"]/g, '');
        }
        
        if (trimmed.includes(' >= ')) {
            const [path, val] = trimmed.split(' >= ').map(s => s.trim());
            const actual = Number(getNestedValue(context, path) ?? 0);
            const limit = Number(val.replace(/['"]/g, ''));
            return !isNaN(actual) && !isNaN(limit) && actual >= limit;
        }
        
        if (trimmed.includes(' <= ')) {
            const [path, val] = trimmed.split(' <= ').map(s => s.trim());
            const actual = Number(getNestedValue(context, path) ?? 0);
            const limit = Number(val.replace(/['"]/g, ''));
            return !isNaN(actual) && !isNaN(limit) && actual <= limit;
        }
        
        if (trimmed.includes(' > ')) {
            const [path, val] = trimmed.split(' > ').map(s => s.trim());
            const actual = Number(getNestedValue(context, path) ?? 0);
            const limit = Number(val.replace(/['"]/g, ''));
            return !isNaN(actual) && !isNaN(limit) && actual > limit;
        }
        
        if (trimmed.includes(' < ')) {
            const [path, val] = trimmed.split(' < ').map(s => s.trim());
            const actual = Number(getNestedValue(context, path) ?? 0);
            const limit = Number(val.replace(/['"]/g, ''));
            return !isNaN(actual) && !isNaN(limit) && actual < limit;
        }
        
        if (trimmed.includes(' contains ')) {
            const [path, val] = trimmed.split(' contains ').map(s => s.trim());
            const actual = getNestedValue(context, path);
            let searchString = val.replace(/['"]/g, '');
            const contextVal = getNestedValue(context, val);
            if (contextVal !== null && contextVal !== undefined) {
                searchString = String(contextVal);
            }
            return String(actual || '').toLowerCase().includes(searchString.toLowerCase());
        }
        
        // Logical NOT (!)
        if (trimmed.startsWith('!')) {
            return !evaluateCondition(trimmed.substring(1), context);
        }
        
        // Simple value truthiness check
        const val = getNestedValue(context, trimmed);
        return !!(val && val !== 'null' && val !== 'N/A' && val !== '');
    }

    // Recursive interpolation function
    function interpolate(html: string, context: any): string {
        if (!html) return '';
        
        // 0. Preprocess 'else if' ladders into nested else/if blocks
        html = preprocessElseIf(html);
        
        // 1. Handle #each blocks - Supports {{#each}} and {#each}
        let result = html.replace(/\{{1,2}\s*#each\s+([a-zA-Z0-9_.!\[\]\s-]+)\s*\}{1,2}([\s\S]*?)\{{1,2}\s*\/each\s*\}{1,2}/g, (match: string, listPath: string, template: string) => {
            const list = getNestedValue(context, listPath.trim());
            if (!Array.isArray(list)) return '';
            
            return list.map(item => interpolate(template, item)).join('');
        });

        // 2. Handle #if / else blocks - Supports {{#if}} and {#if} with logical operators
        result = result.replace(/\{{1,2}\s*#if\s+([a-zA-Z0-9_.!\[\]\s=><!'"()&|-]+)\s*\}{1,2}([\s\S]*?)(?:\{{1,2}\s*else\s*\}{1,2}([\s\S]*?))?\{{1,2}\s*\/if\s*\}{1,2}/g, (match: string, conditionExpr: string, trueBlock: string, falseBlock?: string) => {
            const isTrue = evaluateCondition(conditionExpr, context);
            return isTrue ? interpolate(trueBlock, context) : interpolate(falseBlock || '', context);
        });

        // 3. Replace standard variables - Supports {{var}} and {var}
        result = result.replace(/\{{1,2}\s*([a-zA-Z0-9_.!\[\]\s-]+)\s*\}{1,2}/g, (match: string, path: string) => {
            // Skip if it looks like a block command already handled
            if (path.startsWith('#') || path.startsWith('/') || path === 'else') return match;

            const value = getNestedValue(context, path.trim());
            if (value === null || value === undefined) return '';
            
            // If value is an object, check if it has a 'value' property (common for marks like {value: 50, max_score: 100})
            if (typeof value === 'object') {
                if (value !== null && 'value' in value) {
                    return String(value.value);
                }
                return '';
            }
            
            return String(value);
        });

        return result;
    }

    onMount(async () => {
        try {
            console.log('Fetching data for Application:', data.applicationId);
            // 1. Fetch the data from the API
            const response = await fetch('/api/reports/profile-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId: data.applicationId })
            });

            if (!response.ok) {
                const resData = await response.json();
                throw new Error(resData.error || 'Failed to fetch profile data');
            }

            const res = await response.json();
            const profileData = res.data;
            console.log('Profile Data received:', profileData);

            // 2. Interpolate HTML string
            compiledHtml = interpolate(data.rawHtml, profileData);

            console.log('Compiled HTML:', compiledHtml);

            // 3. Prepare PDF
            const content = await convertHtmlToPdfMake(compiledHtml);
            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [0, 0, 0, 0], // Zero margins for absolute positioning to match visual canvas
                content: content,
                defaultStyle: {
                    fontSize: 10
                }
            };

            pdfDocGenerator = pdfMake.createPdf(docDefinition);
            isPdfReady = true;
            loading = false;

        } catch (err: any) {
            console.error('Render error:', err);
            fetchError = err.message;
            toastStore.error(err.message);
            loading = false;
        }
    });
</script>

<svelte:head>
    <title>{data.templateName} - Print Preview</title>
</svelte:head>

<div class="print-container">
    {#if loading}
        <div class="loading-overlay">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2">Preparing Profile Data...</p>
        </div>
    {:else if fetchError}
        <div class="alert alert-danger m-5 text-center shadow-sm">
            <i class="bi bi-exclamation-triangle display-4 text-danger mb-3 d-block"></i>
            <h4>Error generating report</h4>
            <p class="text-muted">{fetchError}</p>
            <button class="btn btn-primary mt-3" on:click={() => window.location.reload()}>
                <i class="bi bi-arrow-clockwise me-1"></i> Try Again
            </button>
            <button class="btn btn-outline-secondary mt-3 ms-2" on:click={() => window.close()}>Close Window</button>
        </div>
    {:else}
        <div class="controls no-print d-flex justify-content-between align-items-center p-3 bg-white border-bottom sticky-top shadow-sm">
            <div>
                <h5 class="mb-0 fw-bold">{data.templateName}</h5>
                <small class="text-muted">ID: {data.applicationId}</small>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-outline-secondary" on:click={() => window.close()}>
                    <i class="bi bi-x-lg me-1"></i> Close
                </button>
                <button class="btn btn-primary px-4" on:click={() => generatePdf('print')} disabled={!isPdfReady}>
                    <i class="bi bi-printer me-1"></i> {data.configuration?.visualLayout ? 'Print / Save as PDF' : 'Print / Save'}
                </button>
                {#if !data.configuration?.visualLayout}
                    <button class="btn btn-success" on:click={() => generatePdf('download')} disabled={!isPdfReady}>
                        <i class="bi bi-download me-1"></i> Download
                    </button>
                {:else}
                    <div class="text-muted d-flex align-items-center x-small ms-2">
                        <i class="bi bi-info-circle me-1"></i> Use 'Print' to Save as PDF
                    </div>
                {/if}
            </div>
        </div>

        <div class="preview-wrapper p-4 p-md-5">
            <div class="preview-paper shadow">
                {@html compiledHtml}
            </div>
        </div>
    {/if}
</div>

<style>
    :global(body) {
        background-color: #f0f2f5;
        margin: 0;
        padding: 0;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
        min-height: calc(100vh - 75px);
        background-color: #525659; /* PDF-like dark background */
        padding-top: 40px !important;
        padding-bottom: 40px !important;
    }

    .preview-paper {
        background: white;
        width: 210mm;
        min-height: 297mm;
        padding: 0 !important; /* Zero padding to match designer origin */
        box-sizing: border-box;
        position: relative; /* REQUIRED for absolute elements */
        overflow: hidden;
    }

    .loading-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: white; z-index: 2000;
    }

    @media print {
        @page {
            size: A4;
            margin: 0;
        }
        :global(body) {
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        .no-print { display: none !important; }
        .preview-wrapper { 
            padding: 0 !important; 
            margin: 0 !important;
            background: none !important; 
            display: block !important;
        }
        .preview-paper {
            box-shadow: none !important;
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            overflow: visible !important;
        }
        /* Ensure absolute elements are visible */
        :global(.preview-paper *) {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
</style>
