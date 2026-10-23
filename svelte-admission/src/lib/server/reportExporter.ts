
import { DateTime } from 'luxon';

interface ReportColumn {
    path: string;
    label: string;
}

export function generateCSV(data: any[], columns: ReportColumn[]): string {
    // 1. Header Row (Prepend Sr. No)
    const header = ['Sr. No', ...columns.map(c => c.label)].map(h => escapeCsv(h)).join(',');

    // 2. Data Rows
    const rows = (data || []).map((row, index) => {
        const srNo = index + 1;
        const dataCols = columns.map(col => {
            const val = getValueByPath(row, col.path);
            return escapeCsv(formatValue(val));
        });
        return [srNo, ...dataCols].join(',');
    });

    return [header, ...rows].join('\n');
}

export function getValueByPath(obj: any, path: string): any {
    if (!obj) return null;
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        
        // Strip !fk or :alias if present to find the property name
        const propName = part.split('!')[0].split(':')[0]; 
        
        // Attempt 1: Direct match
        if (current[propName] !== undefined) {
            current = current[propName];
        } 
        // Attempt 2: Case-insensitive search if direct match fails
        else {
            const foundKey = Object.keys(current).find(k => k.toLowerCase() === propName.toLowerCase());
            if (foundKey) {
                current = current[foundKey];
            } else {
                // If it's a leaf node but we didn't find the exact path, 
                // maybe the object itself IS the value? (Sometimes happens with PostgREST count/single joins)
                // But usually we just return null.
                return null;
            }
        }
        
        // Handle Arrays (take first item for flat reports)
        if (Array.isArray(current)) {
            current = current.length > 0 ? current[0] : null;
        }
    }
    return current;
}

export function formatValue(val: any): string {
    if (val === null || val === undefined) return '';
    
    // Check if it's already a Date object
    if (val instanceof Date) {
        return DateTime.fromJSDate(val).toFormat('dd/MM/yyyy');
    }

    // Check if it's a string that looks like an ISO date/time or date
    if (typeof val === 'string') {
        // ISO DateTime: 2026-05-20T10:00:00...
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
            const dt = DateTime.fromISO(val);
            if (dt.isValid) return dt.toFormat('dd/MM/yyyy');
        }
        // ISO Date: 2026-05-20
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
            const dt = DateTime.fromISO(val);
            if (dt.isValid) return dt.toFormat('dd/MM/yyyy');
        }
    }

    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

function escapeCsv(str: string): string {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
