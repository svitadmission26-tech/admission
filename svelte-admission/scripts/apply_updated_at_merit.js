import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyMigration() {
    console.log('Applying migration to add updated_at to merit_list_entries...');
    
    const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260131120000_add_updated_at_to_merit_entries.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Trying RPC exec_sql
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
         console.error('RPC failed (expected if exec_sql is missing). Please run manually.');
         console.log('--------------------------------------------------');
         console.log(sql);
         console.log('--------------------------------------------------');
    } else {
         console.log('Migration applied successfully via RPC.');
    }
}

applyMigration();
