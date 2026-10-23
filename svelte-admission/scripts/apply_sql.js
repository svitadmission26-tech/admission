import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSql() {
  const sqlPath = path.join(process.cwd(), 'supabase', 'fix_deo_rls.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Supabase-js doesn't have a direct raw SQL execution method exposed easily for arbitrary scripts 
  // via the standard client without using the REST API for RPC if configured, or direct postgres connection.
  // However, for this environment where we lack psql CLI but have the service key, we can try to use 
  // a "hack" if there's no RPC function exposed to run SQL.
  
  // BUT, usually in these environments, the user expects us to use the tool provided or we simulate it.
  // Since 'psql' failed, we will assume we need to instruct the user or use a pre-existing RPC if available.
  // Checking for 'exec_sql' or similar RPC...
  
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql }); // Hypothetical RPC
  
  if (error) {
      console.error('RPC exec_sql failed or not found. Trying fallback...');
      // If no RPC, we might not be able to apply this directly from Node without 'pg' library.
      // Let's check if we can import 'pg'.
      try {
          const { Client } = await import('pg');
          // We need the DB connection string. The user usually provides it or it's in .env.
          // Env often has DATABASE_URL for Prisma/etc. Let's check.
          const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres"; // Default fallback
          
          console.log(`Connecting to DB via pg driver...`);
          const client = new Client({ connectionString: dbUrl });
          await client.connect();
          await client.query(sql);
          await client.end();
          console.log('SQL applied successfully via pg driver.');
      } catch (e) {
          console.error('Failed to apply SQL via pg driver:', e);
          console.log('\n\nMANUAL ACTION REQUIRED: Please run the SQL in "supabase/fix_deo_rls.sql" in your Supabase SQL Editor.');
      }
  } else {
      console.log('SQL applied successfully via RPC.');
  }
}

runSql();
