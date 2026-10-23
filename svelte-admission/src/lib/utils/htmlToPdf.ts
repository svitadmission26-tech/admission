/**
 * A simplified HTML to pdfmake converter.
 * Supports: div, p, span, b, strong, i, em, h1-h6, table, tr, td, th, img, hr, br
 * Supports styles: text-align, font-size, font-weight, color, background-color, border, padding, width, margin
 */
export async function convertHtmlToPdfMake(html: string): Promise<any[]> {
    if (typeof window === 'undefined') return [];

    const parser = new DOMParser();
    // Wrap in a div to ensure we have a root
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    return await parseElement(doc.body);
}

async function parseElement(element: Element): Promise<any[]> {
    const content: any[] = [];

    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) {
                content.push(text);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const style = el.style;
            const tagName = el.tagName.toLowerCase();

            // Skip script and style tags
            if (tagName === 'script' || tagName === 'style') continue;

            let item: any = {};
            
            const scale = 0.75; // px to pt scale factor

            // Extract margins with scaling
            const marginTop = (parseFloat(style.marginTop) || 0) * scale;
            const marginBottom = (parseFloat(style.marginBottom) || 0) * scale;
            const marginLeft = (parseFloat(style.marginLeft) || 0) * scale;
            const marginRight = (parseFloat(style.marginRight) || 0) * scale;
            if (marginTop || marginBottom || marginLeft || marginRight) {
                item.margin = [marginLeft, marginTop, marginRight, marginBottom];
            }

            // Common styles with scaling
            if (style.textAlign) item.alignment = style.textAlign;
            if (style.fontSize) item.fontSize = parseFloat(style.fontSize) * scale;
            if (style.fontWeight === 'bold' || tagName === 'b' || tagName === 'strong' || tagName === 'th') item.bold = true;
            if (style.color) item.color = style.color;
            if (style.backgroundColor) item.fillColor = style.backgroundColor;
            if (style.textDecoration === 'underline') item.decoration = 'underline';

            // Absolute positioning support for Visual Builder
            const isAbsolute = style.position === 'absolute';
            if (isAbsolute) {
                const x = parseFloat(style.left) || 0;
                const y = parseFloat(style.top) || 0;
                item.absolutePosition = { x: x * scale, y: y * scale };
                
                // Fixed dimensions with scaling
                if (style.width && style.width.endsWith('px')) {
                    item.width = parseFloat(style.width) * scale;
                } else if (style.minWidth && style.minWidth.endsWith('px')) {
                    item.width = parseFloat(style.minWidth) * scale;
                }
                
                if (style.height && style.height.endsWith('px') && tagName !== 'text') {
                    item.height = parseFloat(style.height) * scale;
                } else if (style.minHeight && style.minHeight.endsWith('px') && tagName !== 'text') {
                    item.height = parseFloat(style.minHeight) * scale;
                }
            }

            // Tag specific handling
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                item.text = await parseElement(el);
                item.bold = true;
                const sizes: Record<string, number> = { h1: 22, h2: 18, h3: 16, h4: 14, h5: 12, h6: 11 };
                item.fontSize = item.fontSize || (sizes[tagName] * scale);
                if (!item.margin && !isAbsolute) item.margin = [0, 5, 0, 5];
                content.push(item);
            } else if (tagName === 'p' || tagName === 'div') {
                const children = await parseElement(el);
                if (children.length > 0) {
                    // If it's just text, don't wrap in stack
                    if (children.length === 1 && typeof children[0] === 'string' && !Object.keys(item).length) {
                        content.push({ text: children[0], margin: [0, 2, 0, 2] });
                    } else {
                        item.stack = children;
                        content.push(item);
                    }
                } else if (isAbsolute) {
                    // Empty div with background color/border used as shape
                    item.text = ' ';
                    content.push(item);
                }
            } else if (tagName === 'span' || tagName === 'strong' || tagName === 'b' || tagName === 'i' || tagName === 'em' || tagName === 'th' || tagName === 'td') {
                const children = await parseElement(el);
                if (children.length > 0) {
                    item.text = children;
                    if (tagName === 'i' || tagName === 'em') item.italics = true;
                    content.push(item);
                }
            } else if (tagName === 'br') {
                content.push({ text: '\n' });
            } else if (tagName === 'hr') {
                content.push({ canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 0.5, lineColor: '#ccc' }], margin: [0, 5, 0, 5] });
            } else if (tagName === 'img') {
                const src = el.getAttribute('src');
                if (src && src !== 'null') {
                    try {
                        item.image = await imageToDataURL(src);
                        // Convert designer px to PDF points for image sizing
                        let w = (parseFloat(style.width) || el.getAttribute('width') || 80) * scale;
                        let h = (parseFloat(style.height) || el.getAttribute('height') || 80) * scale;
                        item.width = w;
                        item.height = h;
                        content.push(item);
                    } catch (e) {
                        console.error('Failed to load image for PDF:', src);
                    }
                }
            } else if (tagName === 'table') {
                const table: any = {
                    table: {
                        headerRows: el.querySelector('thead') ? 1 : 0,
                        widths: [],
                        body: []
                    },
                    layout: 'lightHorizontalLines' // Default nice layout
                };

                // Check for border style
                if (style.border || el.getAttribute('border')) {
                    table.layout = {
                        hLineWidth: () => 0.5,
                        vLineWidth: () => 0.5,
                        hLineColor: () => '#444',
                        vLineColor: () => '#444'
                    };
                }

                const rows = Array.from(el.querySelectorAll('tr'));
                let maxCols = 0;

                for (const row of rows) {
                    const cells = Array.from(row.children);
                    const pdfRow: any[] = [];
                    let currentCol = 0;

                    for (const cell of cells) {
                        const cellEl = cell as HTMLElement;
                        const cellContent = await parseElement(cellEl);
                        const pdfCell: any = {
                            stack: cellContent
                        };
                        
                        // Handle styles
                        const cStyle = cellEl.style;
                        if (cStyle.backgroundColor) pdfCell.fillColor = cStyle.backgroundColor;
                        if (cStyle.textAlign) pdfCell.alignment = cStyle.textAlign;
                        if (cStyle.padding) {
                            const p = parseFloat(cStyle.padding) || 2;
                            pdfCell.padding = [p, p, p, p];
                        }
                        
                        // Colspan
                        const colspan = cellEl.getAttribute('colspan');
                        if (colspan) {
                            pdfCell.colSpan = parseInt(colspan);
                        }

                        pdfRow.push(pdfCell);
                        
                        // Add fillers for colspan
                        if (colspan) {
                            for (let i = 1; i < parseInt(colspan); i++) {
                                pdfRow.push({});
                            }
                        }
                        currentCol += (pdfCell.colSpan || 1);
                    }
                    table.table.body.push(pdfRow);
                    maxCols = Math.max(maxCols, currentCol);
                }

                // Widths
                const firstRow = rows[0];
                if (firstRow) {
                    const cells = Array.from(firstRow.children);
                    for (const cell of cells) {
                        const cellEl = cell as HTMLElement;
                        const w = cellEl.style.width || cellEl.getAttribute('width');
                        if (w && w.endsWith('%')) table.table.widths.push(w);
                        else if (w && !isNaN(parseFloat(w))) table.table.widths.push(parseFloat(w));
                        else table.table.widths.push('*');
                    }
                    
                    // Pad widths if fewer than maxCols
                    while (table.table.widths.length < maxCols) {
                        table.table.widths.push('*');
                    }
                    // Trim if more
                    if (table.table.widths.length > maxCols) {
                        table.table.widths = table.table.widths.slice(0, maxCols);
                    }
                }

                if (style.marginBottom) table.margin = [0, 0, 0, parseFloat(style.marginBottom)];
                content.push(table);
            }
        }
    }

    return content;
}

async function imageToDataURL(url: string): Promise<string> {
    if (url.startsWith('data:')) return url;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Error in imageToDataURL:', e);
        throw e;
    }
}
