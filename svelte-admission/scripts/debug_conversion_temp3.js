import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function run() {
    // We fetch form types first
    const { data: formTypes } = await supabase.from('form_types').select('name, is_prov');
    const provMap = new Map();
    formTypes?.forEach(ft => provMap.set(ft.name, ft.is_prov));

    const { data: applications } = await supabase
        .from('applications')
        .select(`
            id, 
            student_id, 
            form_type, 
            status,
            submitted_at, 
            merit_list_entries(merit_rank)
        `)
        .neq('status', 'draft')
        .order('submitted_at', { ascending: true });

    const provApps = [];
    const finalAppsMap = new Map();

    applications?.forEach(app => {
        const isProv = provMap.get(app.form_type);
        if (isProv) {
            if (app.status === 'approved') provApps.push(app);
        } else if (app.form_type === 'MQ/NRI') {
            if (app.status !== 'draft') {
                if (!finalAppsMap.has(app.student_id)) {
                    finalAppsMap.set(app.student_id, []);
                }
                finalAppsMap.get(app.student_id).push(app);
            }
        }
    });

    console.log('Sample Matches:');
    let count = 0;
    for (const provApp of provApps) {
        const studentId = provApp.student_id;
        const potentialFinals = finalAppsMap.get(studentId);
        
        let convertedApp = null;
        if (potentialFinals) {
            convertedApp = potentialFinals.find(fa => new Date(fa.submitted_at) >= new Date(provApp.submitted_at));
            if (!convertedApp && potentialFinals.length > 0) convertedApp = potentialFinals[potentialFinals.length - 1]; 
        }

        if (convertedApp) {
            const mqNriMeritEntry = convertedApp?.merit_list_entries;
            const provMeritEntry = provApp?.merit_list_entries;

            const mqNriRank = (Array.isArray(mqNriMeritEntry) ? mqNriMeritEntry[0]?.merit_rank : mqNriMeritEntry?.merit_rank);
            const provRank = (Array.isArray(provMeritEntry) ? provMeritEntry[0]?.merit_rank : provMeritEntry?.merit_rank);

            // Let's run our logic
            let merit_rank = '-';
            if (mqNriRank !== undefined && mqNriRank !== null && mqNriRank !== '') {
                const parsedRank = parseInt(mqNriRank);
                if (!isNaN(parsedRank)) {
                    merit_rank = parsedRank + 25; // wait, let's see if 25 offset is parsedRank + 25 or parsedRank + 24
                } else {
                    merit_rank = mqNriRank;
                }
            } else if (provRank !== undefined && provRank !== null && provRank !== '') {
                merit_rank = provRank;
            }

            count++;
            console.log({
                student: provApp.student_id,
                mqNriRank: mqNriRank,
                provRank: provRank,
                calculatedMeritRank: merit_rank
            });

            if (count >= 10) break;
        }
    }
}

run();
