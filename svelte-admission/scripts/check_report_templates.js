import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTemplates() {
    console.log("Checking Report Templates...");
    
    const { data: templates, error } = await supabase
        .from('report_templates')
        .select('id, name, configuration, base_table');

    if (error) {
        console.error("Error:", error);
        return;
    }

    templates.forEach(t => {
        console.log(`\nTemplate: ${t.name} (ID: ${t.id})`);
        console.log(`  Base Table: ${t.base_table}`);
        const params = t.configuration?.parameters;
        if (params && params.length > 0) {
            params.forEach(p => {
                if (p.type === 'select') {
                    console.log(`  - Parameter: ${p.label} (Select, Column: ${p.column})`);
                    console.log(`    Options: ${JSON.stringify(p.options)}`);
                }
            });
        } else {
            console.log("  - No parameters.");
        }
    });
}

checkTemplates();
