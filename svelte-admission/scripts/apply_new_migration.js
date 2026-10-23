import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const migrationFile = process.argv[2];
if (!migrationFile) {
    console.error('Please provide migration file name (e.g. 20260202100000_add_report_templates.sql)');
    process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSql() {
  const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', migrationFile);
  console.log(`Applying migration: ${sqlPath}`);
  
  if (!fs.existsSync(sqlPath)) {
      console.error(`File not found: ${sqlPath}`);
      process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Try RPC first
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
      console.log('RPC exec_sql failed or not found (Expected if generic RPC not set up). Trying fallback to PG driver...');
      try {
          const { Client } = await import('pg');
          // Try to read connection string from .env or default to local supabase
          const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres"; 
          
          console.log(`Connecting to DB via pg driver...`);
          const client = new Client({ connectionString: dbUrl });
          await client.connect();
          await client.query(sql);
          await client.end();
          console.log('SQL applied successfully via pg driver.');
      } catch (e) {
          console.error('Failed to apply SQL via pg driver:', e);
          process.exit(1);
      }
  } else {
      console.log('SQL applied successfully via RPC.');
  }
}

runSql();
