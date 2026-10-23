import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function applyFix() {
    console.log('Applying RLS fix for student_profiles...');
    
    const sql = `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies 
                WHERE tablename = 'student_profiles' 
                AND policyname = 'Users can insert their own profile'
            ) THEN
                CREATE POLICY "Users can insert their own profile" ON public.student_profiles
                FOR INSERT 
                WITH CHECK (auth.uid() = user_id);
            END IF;
        END
        $$;
    `;

    const { error } = await supabaseAdmin.rpc('exec_sql', { sql_query: sql }); // Assuming exec_sql exists?
    // Wait, Supabase JS client doesn't run raw SQL unless there's a function.
    // I can't run raw SQL easily without direct PG access.
    
    // Alternative: Use the 'apply_sql.js' script I see in the file list?
    // Let's check 'scripts/apply_sql.js'.
}
// applyFix();
