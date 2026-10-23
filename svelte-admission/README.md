# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Local Supabase Backup & Sync

We have provided a sync utility (`scripts/sync_supabase.js`) to backup/sync your remote Supabase database and storage buckets to your local Supabase development instance. This allows the application to run offline in case of internet connection issues.

### 1. Configuration

Add the following environment variables to your `.env` (or environment setup):

```bash
# --- Remote Supabase (Source) ---
PUBLIC_SUPABASE_URL="https://your-remote-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-remote-service-role-key"
DATABASE_URL="postgresql://postgres:[password]@db.your-remote-project.supabase.co:5432/postgres"

# --- Local Supabase (Target) ---
LOCAL_SUPABASE_URL="http://127.0.0.1:54321"
LOCAL_SUPABASE_SERVICE_ROLE_KEY="your-local-service-role-key"
LOCAL_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

### 2. Usage

Run the sync script using Node.js:

* **Sync everything (Database and Storage):**
  ```bash
  node scripts/sync_supabase.js --all
  ```

* **Sync Database only (pg_dump / pg_restore method - Recommended):**
  ```bash
  node scripts/sync_supabase.js --db --method dump
  ```
  *(Requires `pg_dump` and `pg_restore` command-line tools installed in your PATH).*

* **Sync Database only (Incremental row-by-row API method):**
  ```bash
  node scripts/sync_supabase.js --db --method incremental
  ```

* **Sync Storage buckets only (Incremental files copy):**
  ```bash
  node scripts/sync_supabase.js --storage
  ```

