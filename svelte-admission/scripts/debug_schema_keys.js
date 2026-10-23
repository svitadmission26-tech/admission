
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function debug() {
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const appId = 'e3796c09-3905-4368-9d1a-1290db3e7f14';

    const { data: app } = await supabase.from('applications').select('*').eq('id', appId).single();
    if (!app) return;

    const { data: form } = await supabase
        .from('admission_forms')
        .select('schema_json')
        .eq('course_id', app.course_id)
        .eq('cycle_id', app.cycle_id)
        .eq('form_type', app.form_type)
        .single();

    if (form) {
        console.log('--- Schema Fields ---');
        form.schema_json.fields.forEach(f => {
            if (f.type === 'file') {
                console.log(`Label: ${f.label}, Key: ${f.key}, Name: ${f.name}`);
            }
        });
        console.log('--- Form Data Keys ---');
        console.log(Object.keys(app.form_data));
    }
}

debug();
