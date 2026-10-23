
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new pg.Client({ connectionString });

async function run() {
    try {
        await client.connect();
        console.log('Connected to database.');

        // 1. Check if table exists
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'report_templates';
        `);

        const columns = res.rows.map(r => r.column_name);
        console.log('Existing columns in report_templates:', columns);

        if (columns.length === 0) {
            console.log('Table report_templates does not exist. Creating...');
            const sqlPath = path.join(__dirname, '../supabase/migrations/20260212180000_add_report_templates.sql');
            const sql = fs.readFileSync(sqlPath, 'utf8');
            await client.query(sql);
            console.log('Table created.');
        } else {
            if (!columns.includes('base_table')) {
                console.log('Adding missing column base_table...');
                await client.query(`ALTER TABLE public.report_templates ADD COLUMN base_table TEXT NOT NULL DEFAULT '';`);
                console.log('Column base_table added.');
            }
            if (!columns.includes('configuration')) {
                console.log('Adding missing column configuration...');
                await client.query(`ALTER TABLE public.report_templates ADD COLUMN configuration JSONB NOT NULL DEFAULT '{}'::jsonb;`);
                console.log('Column configuration added.');
            }
             if (!columns.includes('allowed_roles')) {
                console.log('Adding missing column allowed_roles...');
                await client.query(`ALTER TABLE public.report_templates ADD COLUMN allowed_roles TEXT[] DEFAULT '{}';`);
                console.log('Column allowed_roles added.');
            }
        }

        // 2. Reload Schema Cache
        console.log('Reloading PostgREST schema cache...');
        await client.query(`NOTIFY pgrst, 'reload schema';`);
        console.log('Schema cache reloaded.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
