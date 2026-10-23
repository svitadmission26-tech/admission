import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Client } = pkg;

dotenv.config();

async function applyMigration() {
    const fileArg = process.argv[2];
    if (!fileArg) {
        console.error('Usage: node scripts/apply_sql_pg.js <path-to-sql-file>');
        process.exit(1);
    }

    const sqlPath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(sqlPath)) {
        console.error(`File not found: ${sqlPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Prefer DATABASE_URL for direct connection
    // If running in Supabase local dev, standard port is 54322
    const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

    console.log(`Connecting to DB...`);
    
    const client = new Client({ connectionString: dbUrl });
    
    try {
        await client.connect();
        console.log('Connected. Executing SQL...');
        await client.query(sql);
        console.log('SQL applied successfully.');
    } catch (e) {
        console.error('Failed to apply SQL:', e);
    } finally {
        await client.end();
    }
}

applyMigration();
