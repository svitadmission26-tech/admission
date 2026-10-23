const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

const layout = [
    // Header Section
    {
        id: generateId(),
        type: 'layoutTable',
        style: { width: '100%', borderCollapse: 'collapse', marginBottom: '20px', border: '1px solid black' },
        children: [
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    {
                        id: generateId(),
                        type: 'tableCell',
                        width: 2,
                        style: { padding: '10px', textAlign: 'center', borderRight: '1px solid black' },
                        children: [
                            { id: generateId(), type: 'image', src: '{{college.logo_url}}', style: { width: '80px', height: '80px' } }
                        ]
                    },
                    {
                        id: generateId(),
                        type: 'tableCell',
                        width: 10,
                        style: { padding: '10px', textAlign: 'center' },
                        children: [
                            { id: generateId(), type: 'text', content: '<h2 style="margin: 0; font-size: 20px;">{{college.name}}</h2>' },
                            { id: generateId(), type: 'text', content: '<h4 style="margin: 5px 0; font-weight: normal;">Managed By: {{college.trust_name}}</h4>' },
                            { id: generateId(), type: 'text', content: '<h3 style="margin: 5px 0;">Application Form ({{application.academic_year}})</h3>' }
                        ]
                    }
                ]
            }
        ]
    },
    // Top Metadata + Photo
    {
        id: generateId(),
        type: 'row',
        style: { marginBottom: '20px' },
        children: [
            {
                id: generateId(),
                type: 'column',
                width: 9,
                children: [
                    {
                        id: generateId(),
                        type: 'layoutTable',
                        style: { width: '100%', borderCollapse: 'collapse', border: '1px solid black' },
                        children: [
                            ['ACPC Number:', '{{application.acpc_number}}'],
                            ['ACPC Merit Number:', '{{application.acpc_merit_number}}'],
                            ['Entrance Exam Number:', '{{application.entrance_exam_number}}'],
                            ['Branch:', '{{branch.name}}']
                        ].map(row => ({
                            id: generateId(),
                            type: 'tableRow',
                            children: [
                                {
                                    id: generateId(),
                                    type: 'tableCell',
                                    width: 5,
                                    style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' },
                                    children: [{ id: generateId(), type: 'text', content: row[0] }]
                                },
                                {
                                    id: generateId(),
                                    type: 'tableCell',
                                    width: 7,
                                    style: { border: '1px solid black', padding: '8px', textAlign: 'center' },
                                    children: [{ id: generateId(), type: 'text', content: row[1] }]
                                }
                            ]
                        }))
                    }
                ]
            },
            {
                id: generateId(),
                type: 'column',
                width: 3,
                style: { textAlign: 'center' },
                children: [
                    {
                        id: generateId(),
                        type: 'image',
                        src: '{{student.photo_url}}',
                        condition: 'student.photo_url',
                        style: { width: '120px', height: '150px', border: '1px solid black', objectFit: 'cover' }
                    },
                    {
                        id: generateId(),
                        type: 'text',
                        condition: '!student.photo_url',
                        content: 'PHOTO',
                        style: { width: '120px', height: '150px', border: '1px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9f9f9', color: '#999', margin: '0 auto' }
                    },
                    { id: generateId(), type: 'text', content: 'Applied For: {{application.form_type}}', style: { fontWeight: 'bold', marginTop: '5px' } }
                ]
            }
        ]
    },
    // PERSONAL DETAILS
    {
        id: generateId(),
        type: 'text',
        content: 'PERSONAL DETAILS',
        style: { backgroundColor: '#d9e2f3', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', padding: '5px', fontSize: '18px', marginBottom: '-1px' }
    },
    {
        id: generateId(),
        type: 'layoutTable',
        style: { width: '100%', borderCollapse: 'collapse', border: '1px solid black', marginBottom: '20px' },
        children: [
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Name' }] },
                    { id: generateId(), type: 'tableCell', width: 9, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.full_name}}' }] }
                ]
            },
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Current Address' }] },
                    { id: generateId(), type: 'tableCell', width: 9, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.address_line_1}}, {{student.district}}' }] }
                ]
            },
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'State' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.state}}' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Country' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.country}}' }] }
                ]
            },
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'City' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.city}}' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Pincode' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.pincode}}' }] }
                ]
            },
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Contact' }] },
                    { id: generateId(), type: 'tableCell', width: 9, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.phone}}' }] }
                ]
            },
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Email' }] },
                    { id: generateId(), type: 'tableCell', width: 9, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.email}}' }] }
                ]
            },
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Birth Date' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.dob}}' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: 'Gender' }] },
                    { id: generateId(), type: 'tableCell', width: 3, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: '{{student.gender}}' }] }
                ]
            }
        ]
    },
    // ACADEMIC DETAILS
    {
        id: generateId(),
        type: 'text',
        content: 'ACADEMIC DETAILS',
        style: { backgroundColor: '#d9e2f3', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', padding: '5px', fontSize: '18px', marginBottom: '-1px' }
    },
    {
        id: generateId(),
        type: 'layoutTable',
        style: { width: '100%', borderCollapse: 'collapse', border: '1px solid black', marginBottom: '20px' },
        children: [
            ['Exam Board', '{{application.board}}'],
            ['Last School Name', '{{application.school_name}}'],
            ['Last School City', '{{application.school_city}}']
        ].map(row => ({
            id: generateId(),
            type: 'tableRow',
            children: [
                { id: generateId(), type: 'tableCell', width: 4, style: { border: '1px solid black', padding: '8px', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: row[0] }] },
                { id: generateId(), type: 'tableCell', width: 8, style: { border: '1px solid black', padding: '8px' }, children: [{ id: generateId(), type: 'text', content: row[1] }] }
            ]
        }))
    },
    // BOARD EXAM RESULT
    {
        id: generateId(),
        type: 'text',
        content: 'BOARD EXAM RESULT',
        style: { backgroundColor: '#d9e2f3', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', padding: '5px', fontSize: '18px', marginBottom: '-1px' }
    },
    {
        id: generateId(),
        type: 'layoutTable',
        style: { width: '100%', borderCollapse: 'collapse', border: '1px solid black', marginBottom: '30px' },
        children: [
            {
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 6, style: { border: '1px solid black', padding: '8px', backgroundColor: '#f2f2f2', fontWeight: 'bold', textAlign: 'center' }, children: [{ id: generateId(), type: 'text', content: 'Subject' }] },
                    { id: generateId(), type: 'tableCell', width: 6, style: { border: '1px solid black', padding: '8px', backgroundColor: '#f2f2f2', fontWeight: 'bold', textAlign: 'center' }, children: [{ id: generateId(), type: 'text', content: 'Result' }] }
                ]
            },
            ...['English/Gujarati', 'Mathematics', 'Chemistry', 'Physics', 'Computer'].map(sub => ({
                id: generateId(),
                type: 'tableRow',
                children: [
                    { id: generateId(), type: 'tableCell', width: 6, style: { border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold' }, children: [{ id: generateId(), type: 'text', content: sub }] },
                    { id: generateId(), type: 'tableCell', width: 6, style: { border: '1px solid black', padding: '8px', textAlign: 'center' }, children: [{ id: generateId(), type: 'text', content: '{{marks.' + sub.toLowerCase().split('/')[0] + '.obtained}}' }] }
                ]
            }))
        ]
    },
    // Footer
    {
        id: generateId(),
        type: 'text',
        content: 'I hereby declare that the details furnished above are true and correct to the best of my knowledge and belief.',
        style: { marginBottom: '50px' }
    },
    {
        id: generateId(),
        type: 'row',
        children: [
            { id: generateId(), type: 'column', width: 8, children: [] },
            { id: generateId(), type: 'column', width: 4, style: { textAlign: 'right' }, children: [
                { id: generateId(), type: 'text', content: 'Signature', style: { borderTop: '1px solid black', paddingTop: '5px', display: 'inline-block', minWidth: '150px', textAlign: 'center' } }
            ]}
        ]
    }
];

// Simple compiler to generate HTML content from layout
function compileNode(node) {
    let styleStr = '';
    const combinedStyle = { ...node.style };
    
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
            innerHtml = `<div class="row g-0" style="${styleStr}">${node.children.map(compileNode).join('')}</div>`;
            break;
        case 'column':
            innerHtml = `<div class="col-${node.width || 12}" style="${styleStr}">${node.children.map(compileNode).join('')}</div>`;
            break;
        case 'text':
            innerHtml = `<div style="${styleStr}">${node.content || ''}</div>`;
            break;
        case 'variable':
            innerHtml = `<span style="${styleStr}">{{${node.variablePath}}}</span>`;
            break;
        case 'image':
            innerHtml = `<img src="${node.src || '{{college.logo_url}}'}" style="${styleStr} object-fit:contain;">`;
            break;
        case 'layoutTable':
            innerHtml = `<table style="width:100%; border-collapse:collapse; ${styleStr}">${node.children.map(compileNode).join('')}</table>`;
            break;
        case 'tableRow':
            innerHtml = `<tr>${node.children.map(compileNode).join('')}</tr>`;
            break;
        case 'tableCell':
            const cellWidth = node.width ? `${((node.width / 12) * 100).toFixed(2)}%` : '';
            const widthStyle = cellWidth ? `width:${cellWidth};` : '';
            innerHtml = `<td style="${widthStyle} ${styleStr}">${node.children.map(compileNode).join('')}</td>`;
            break;
        case 'divider':
            innerHtml = `<hr style="${styleStr}">`;
            break;
    }

    if (node.condition) {
        return `{{#if ${node.condition}}}${innerHtml}{{/if}}`;
    }
    
    return innerHtml;
}

const htmlContent = layout.map(compileNode).join('');

async function updateTemplate() {
    console.log("Updating ACPC Template Layout...");
    
    const { data, error } = await supabase
        .from('report_templates')
        .update({
            configuration: {
                columns: [],
                parameters: [],
                visualLayout: layout
            },
            html_content: htmlContent
        })
        .eq('name', 'ACPC Official Profile Form');

    if (error) {
        console.error("Error updating template:", error);
    } else {
        console.log("Template updated successfully!");
    }
}

updateTemplate();
