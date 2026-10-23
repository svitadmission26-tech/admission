const { createClient } = require('@supabase/supabase-js'); const dotenv = require('dotenv'); dotenv.config(); const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); async function run() { [dotenv@17.2.3] injecting env (0) from .env -- tip: 🛠️  run anywhere with `dotenvx run -- yourcommand`
Branch not found
 } run();