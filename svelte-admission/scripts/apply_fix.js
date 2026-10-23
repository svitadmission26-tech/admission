import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

async function runMigration() {
    const client = new Client({ connectionString: dbUrl });
    
    try {
        await client.connect();
        console.log('Connected to database.');

        const sqlFiles = [
            '../supabase/migrations/20260129100000_fix_deo_and_recursion.sql'
        ];

        for (const file of sqlFiles) {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                console.log(`Applying ${file}...`);
                const sql = fs.readFileSync(filePath, 'utf8');
                await client.query(sql);
                console.log(`Applied ${file}.`);
            } else {
                console.error(`File not found: ${filePath}`);
            }
        }
        
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
