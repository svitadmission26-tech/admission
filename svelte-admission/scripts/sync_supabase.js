import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

dotenv.config();

// Configuration helper
const config = {
  // Remote configuration
  remoteUrl: process.env.PUBLIC_SUPABASE_URL,
  remoteKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  remoteDbUrl: process.env.DATABASE_URL,
  
  // Local configuration (with default fallbacks matching a standard Supabase local setup)
  localUrl: process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321',
  localKey: process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY,
  localDbUrl: process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
};

// Help menu
function showHelp() {
  console.log(`
Supabase Remote-to-Local Sync Script
====================================
Usage: node scripts/sync_supabase.js [options]

Options:
  --db                 Sync the database only.
  --storage            Sync the storage buckets only.
  --all                Sync both database and storage (default if no option is specified).
  --method <type>      Database sync method: 'dump' or 'incremental'. (default: 'dump')
  --help               Show this help message.

Environment Variables needed in .env:
  PUBLIC_SUPABASE_URL           - Remote Supabase API URL
  SUPABASE_SERVICE_ROLE_KEY     - Remote Supabase Service Role Key (admin privileges)
  DATABASE_URL                  - Remote Postgres connection string (required for 'dump' method)
  
  LOCAL_SUPABASE_URL            - Local Supabase API URL (default: http://127.0.0.1:54321)
  LOCAL_SUPABASE_SERVICE_ROLE_KEY- Local Supabase Service Role Key
  LOCAL_DATABASE_URL            - Local Postgres connection string (default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
`);
}

// Check command-line commands
function isCommandAvailable(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// ----------------------------------------------------
// Database Sync: Option B (pg_dump / pg_restore)
// ----------------------------------------------------
function syncDatabaseDump() {
  console.log('\n--- Starting Database Sync: Option B (pg_dump / pg_restore) ---');
  
  if (!config.remoteDbUrl) {
    console.error('Error: DATABASE_URL (remote connection string) is not configured in .env');
    process.exit(1);
  }
  
  if (!isCommandAvailable('pg_dump') || !isCommandAvailable('pg_restore')) {
    console.error('Error: pg_dump or pg_restore command-line tools are not found in PATH.');
    console.error('Please install PostgreSQL client tools, or run the sync with "--method incremental".');
    process.exit(1);
  }

  const tempDir = path.join(process.cwd(), 'supabase', '.temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const dumpFile = path.join(tempDir, 'remote_data.dump');

  try {
    console.log('1. Exporting public and auth schema data from remote database...');
    // We export data-only to avoid overriding local triggers, constraints, or schemas.
    // We exclude storage.objects data because storage sync is handled separately.
    const dumpCmd = `pg_dump "${config.remoteDbUrl}" \
      --data-only \
      --schema=public \
      --schema=auth \
      --exclude-table-data="storage.objects" \
      --format=custom \
      --file="${dumpFile}"`;
    
    execSync(dumpCmd, { stdio: 'inherit' });
    console.log('   Remote data exported successfully.');

    console.log('2. Restoring exported data into the local database (disabling triggers)...');
    // We use pg_restore with data-only and disable triggers to insert cleanly without breaking constraint checks.
    // Note: This does not delete local rows first, so we truncate local tables first to ensure a clean sync.
    
    // List tables in reverse dependency order to truncate safely without FK violations
    const truncateQuery = `
      TRUNCATE TABLE 
        public.account_admissions,
        public.admission_sequences,
        public.documents,
        public.payments,
        public.marks,
        public.applications,
        public.merit_formulas,
        public.fee_structures,
        public.admission_forms,
        public.courses,
        public.users,
        public.colleges,
        public.universities,
        public.admission_cycles,
        public.academic_years,
        auth.users
      CASCADE;
    `;
    
    console.log('   Truncating local tables to prevent duplicates...');
    const truncateCmd = `psql "${config.localDbUrl}" -c "${truncateQuery.replace(/\s+/g, ' ')}"`;
    try {
      execSync(truncateCmd, { stdio: 'inherit' });
    } catch (e) {
      console.warn('   Warning: Direct truncate via psql failed. Attempting pg_restore directly (may cause unique key conflicts if data exists).');
    }

    const restoreCmd = `pg_restore \
      --dbname="${config.localDbUrl}" \
      --data-only \
      --disable-triggers \
      "${dumpFile}"`;
      
    execSync(restoreCmd, { stdio: 'inherit' });
    console.log('   Database restore complete.');
  } catch (error) {
    console.error('Database dump sync failed:', error.message);
  } finally {
    // Clean up dump file
    if (fs.existsSync(dumpFile)) {
      try {
        fs.unlinkSync(dumpFile);
      } catch (e) {}
    }
  }
}

// ----------------------------------------------------
// Database Sync: Option A (JS API-based Incremental)
// ----------------------------------------------------
async function syncDatabaseIncremental(remoteSupabase, localSupabase) {
  console.log('\n--- Starting Database Sync: Option A (Incremental JS) ---');
  
  const statePath = path.join(process.cwd(), '.local_sync_state.json');
  let lastSyncTime = '1970-01-01T00:00:00.000Z';
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (state.lastSyncTime) {
        lastSyncTime = state.lastSyncTime;
      }
    } catch (e) {
      console.warn('Could not parse .local_sync_state.json, starting sync from the beginning.');
    }
  }
  
  const currentTime = new Date().toISOString();
  console.log(`Syncing changes since: ${lastSyncTime}`);

  // 1. Sync auth users first to avoid FK constraint errors in public.users
  console.log('Syncing Auth Users...');
  const { data: { users: remoteUsers }, error: remoteUsersError } = await remoteSupabase.auth.admin.listUsers();
  if (remoteUsersError) {
    console.error('Failed to retrieve remote auth users:', remoteUsersError.message);
  } else {
    for (const remoteUser of remoteUsers) {
      // Check if user exists locally
      const { data: localUser, error: localUserError } = await localSupabase.auth.admin.getUserById(remoteUser.id).catch(() => ({ data: null }));
      
      if (!localUser) {
        console.log(`   Creating local auth user: ${remoteUser.email} (${remoteUser.id})`);
        const { error: createError } = await localSupabase.auth.admin.createUser({
          id: remoteUser.id,
          email: remoteUser.email,
          email_confirm: true,
          user_metadata: remoteUser.user_metadata,
          app_metadata: remoteUser.app_metadata
        });
        if (createError) {
          console.error(`   Failed to create auth user ${remoteUser.email}:`, createError.message);
        }
      }
    }
  }

  // 2. Synchronize all public tables in dependency order
  const tables = [
    { name: 'academic_years', idCol: 'id', hasUpdatedAt: false },
    { name: 'admission_cycles', idCol: 'id', hasUpdatedAt: false },
    { name: 'universities', idCol: 'id', hasUpdatedAt: false },
    { name: 'colleges', idCol: 'id', hasUpdatedAt: false },
    { name: 'users', idCol: 'id', hasUpdatedAt: false }, // Sync public profiles mapping to auth users
    { name: 'courses', idCol: 'id', hasUpdatedAt: false },
    { name: 'admission_forms', idCol: 'id', hasUpdatedAt: false },
    { name: 'fee_structures', idCol: 'id', hasUpdatedAt: false },
    { name: 'merit_formulas', idCol: 'id', hasUpdatedAt: false },
    { name: 'applications', idCol: 'id', hasUpdatedAt: true }, // Incremental via updated_at
    { name: 'marks', idCol: 'id', hasUpdatedAt: false },
    { name: 'payments', idCol: 'id', hasUpdatedAt: false },
    { name: 'documents', idCol: 'id', hasUpdatedAt: false },
    { name: 'admission_sequences', idCol: 'id', hasUpdatedAt: false },
    { name: 'account_admissions', idCol: 'id', hasUpdatedAt: false }
  ];

  for (const table of tables) {
    console.log(`Syncing table: ${table.name}...`);
    
    let query = remoteSupabase.from(table.name).select('*');
    if (table.hasUpdatedAt) {
      query = query.gt('updated_at', lastSyncTime);
    } else {
      // Configuration tables are small, so we retrieve all rows to ensure updates are captured.
      // For log/transaction tables, we filter by created_at if possible.
      // (The helper handles either full sync or date sync based on row presence)
      if (['marks', 'payments', 'documents', 'admission_sequences', 'account_admissions'].includes(table.name)) {
        query = query.gt('created_at', lastSyncTime);
      }
    }
    
    const { data: remoteRows, error: remoteError } = await query;
    if (remoteError) {
      console.error(`   Error fetching remote rows for ${table.name}:`, remoteError.message);
      continue;
    }
    
    if (!remoteRows || remoteRows.length === 0) {
      console.log(`   No updates in ${table.name}.`);
      continue;
    }
    
    console.log(`   Found ${remoteRows.length} changed rows. Upserting locally...`);
    
    // Chunk upserts to handle large batches safely
    const chunkSize = 100;
    for (let i = 0; i < remoteRows.length; i += chunkSize) {
      const chunk = remoteRows.slice(i, i + chunkSize);
      const { error: upsertError } = await localSupabase
        .from(table.name)
        .upsert(chunk);
        
      if (upsertError) {
        console.error(`   Error upserting chunk to local ${table.name}:`, upsertError.message);
      }
    }
  }

  // Update sync state timestamp
  fs.writeFileSync(statePath, JSON.stringify({ lastSyncTime: currentTime }, null, 2));
  console.log(`Database sync complete. Last sync timestamp updated to: ${currentTime}`);
}

// ----------------------------------------------------
// Storage Sync: Incremental Syncing of Buckets
// ----------------------------------------------------
async function listAllFiles(supabase, bucketId, path = '') {
  let allFiles = [];
  let limit = 100;
  let offset = 0;
  
  while (true) {
    const { data, error } = await supabase.storage.from(bucketId).list(path, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      break;
    }
    
    for (const item of data) {
      // In Supabase storage list api, folders don't have metadata/id keys
      const isFolder = !item.id && !item.metadata;
      const fullPath = path ? `${path}/${item.name}` : item.name;
      
      if (isFolder) {
        // Recursively list sub-directory
        const subFiles = await listAllFiles(supabase, bucketId, fullPath);
        allFiles.push(...subFiles);
      } else {
        // Collect file properties
        allFiles.push({
          name: item.name,
          path: fullPath,
          size: item.metadata?.size || 0,
          updated_at: item.updated_at || item.created_at || ''
        });
      }
    }
    
    if (data.length < limit) {
      break;
    }
    offset += limit;
  }
  
  return allFiles;
}

async function syncStorage(remoteSupabase, localSupabase) {
  console.log('\n--- Starting Storage Sync (Incremental) ---');
  
  // 1. Fetch remote buckets
  const { data: remoteBuckets, error: bucketsError } = await remoteSupabase.storage.listBuckets();
  if (bucketsError) {
    console.error('Failed to retrieve remote buckets:', bucketsError.message);
    return;
  }

  // 2. Fetch local buckets
  const { data: localBuckets, error: localBucketsError } = await localSupabase.storage.listBuckets();
  if (localBucketsError) {
    console.error('Failed to retrieve local buckets:', localBucketsError.message);
    return;
  }
  const localBucketNames = new Set(localBuckets.map(b => b.name));

  for (const bucket of remoteBuckets) {
    console.log(`\nSyncing Bucket: "${bucket.name}"...`);
    
    // Ensure bucket exists locally
    if (!localBucketNames.has(bucket.name)) {
      console.log(`   Bucket "${bucket.name}" does not exist locally. Creating...`);
      const { error: createBucketError } = await localSupabase.storage.createBucket(bucket.name, {
        public: bucket.public
      });
      if (createBucketError) {
        console.error(`   Failed to create bucket "${bucket.name}":`, createBucketError.message);
        continue;
      }
    }

    // 3. Scan files on remote and local
    console.log('   Scanning files on remote instance...');
    let remoteFiles = [];
    try {
      remoteFiles = await listAllFiles(remoteSupabase, bucket.name);
    } catch (e) {
      console.error(`   Failed to list remote files in bucket "${bucket.name}":`, e.message);
      continue;
    }
    console.log(`   Found ${remoteFiles.length} files on remote.`);

    console.log('   Scanning files on local instance...');
    let localFiles = [];
    try {
      localFiles = await listAllFiles(localSupabase, bucket.name);
    } catch (e) {
      console.log('   Local bucket is empty or failed to read. Initializing transfer...');
    }
    
    const localFileMap = new Map(localFiles.map(f => [f.path, f]));
    console.log(`   Found ${localFiles.length} files locally.`);

    // 4. Compare and Sync
    let syncCount = 0;
    for (const file of remoteFiles) {
      const localFile = localFileMap.get(file.path);
      
      const isMissing = !localFile;
      const isModified = localFile && localFile.size !== file.size;

      if (isMissing || isModified) {
        const action = isMissing ? 'Downloading new' : 'Updating changed';
        console.log(`   [->] ${action} file: ${file.path} (${(file.size / 1024).toFixed(2)} KB)`);
        
        const { data: fileData, error: downloadError } = await remoteSupabase.storage
          .from(bucket.name)
          .download(file.path);
          
        if (downloadError) {
          console.error(`   [Error] Failed to download ${file.path}:`, downloadError.message);
          continue;
        }

        const { error: uploadError } = await localSupabase.storage
          .from(bucket.name)
          .upload(file.path, fileData, {
            upsert: true,
            contentType: fileData.type
          });

        if (uploadError) {
          console.error(`   [Error] Failed to upload ${file.path} to local:`, uploadError.message);
        } else {
          syncCount++;
        }
      }
    }
    console.log(`   Bucket "${bucket.name}" sync complete. Updated/Downloaded: ${syncCount} files.`);
  }
  
  console.log('\nStorage sync finished.');
}

// ----------------------------------------------------
// Main Command Line Runner
// ----------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Parse arguments
  let runDb = args.includes('--db');
  let runStorage = args.includes('--storage');
  const runAll = args.includes('--all') || (!runDb && !runStorage);
  
  if (runAll) {
    runDb = true;
    runStorage = true;
  }

  let dbMethod = 'dump'; // default
  const methodIndex = args.indexOf('--method');
  if (methodIndex !== -1 && methodIndex + 1 < args.length) {
    const val = args[methodIndex + 1].toLowerCase();
    if (val === 'incremental' || val === 'dump') {
      dbMethod = val;
    } else {
      console.warn(`Warning: Unknown db sync method "${val}". Falling back to "dump".`);
    }
  }

  console.log('Supabase Sync Initialization');
  console.log('=============================');
  
  // Validate basic config credentials
  if (!config.remoteUrl || !config.remoteKey) {
    console.error('Error: Remote credentials PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
    process.exit(1);
  }
  
  if (!config.localKey) {
    console.error('Error: Local credential LOCAL_SUPABASE_SERVICE_ROLE_KEY missing in .env');
    console.error('Please configure your local service role key to sync data using administrative access.');
    process.exit(1);
  }

  const remoteSupabase = createClient(config.remoteUrl, config.remoteKey, {
    auth: { persistSession: false }
  });
  
  const localSupabase = createClient(config.localUrl, config.localKey, {
    auth: { persistSession: false }
  });

  // Execute database sync
  if (runDb) {
    if (dbMethod === 'dump') {
      syncDatabaseDump();
    } else {
      await syncDatabaseIncremental(remoteSupabase, localSupabase);
    }
  }

  // Execute storage sync
  if (runStorage) {
    await syncStorage(remoteSupabase, localSupabase);
  }
  
  console.log('\nAll sync tasks completed.');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
