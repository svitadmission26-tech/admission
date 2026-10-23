<svelte:head>
  <title>Admin Documentation & User Manual</title>
</svelte:head>

<div class="container mx-auto p-6 max-w-4xl">
  <h1 class="text-3xl font-bold mb-6 text-gray-800">Admin Documentation</h1>

  <div class="mb-8">
    <h2 class="text-2xl font-semibold mb-4 text-blue-600">Developer Documentation</h2>
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-xl font-medium mb-3">Architecture Overview</h3>
      <p class="mb-4 text-gray-600">
        This application is built using <strong>SvelteKit</strong> for the frontend/backend framework and <strong>Supabase</strong> for the database and authentication.
        It uses a role-based access control (RBAC) system enforced via Row Level Security (RLS) policies in PostgreSQL.
      </p>

      <h3 class="text-xl font-medium mb-3">Key Technologies</h3>
      <ul class="list-disc list-inside mb-4 text-gray-600">
        <li><strong>Frontend:</strong> SvelteKit, Tailwind CSS</li>
        <li><strong>Backend:</strong> SvelteKit Server Actions (+page.server.ts), Supabase (PostgreSQL)</li>
        <li><strong>Authentication:</strong> Supabase Auth</li>
        <li><strong>Database:</strong> PostgreSQL with RLS</li>
      </ul>

      <h3 class="text-xl font-medium mb-3">Database Schema</h3>
      <p class="mb-4 text-gray-600">
        Key tables include:
      </p>
      <ul class="list-disc list-inside mb-4 text-gray-600">
        <li><code>users</code>: Extends Supabase auth.users with role and profile data.</li>
        <li><code>applications</code>: Stores student application data. linked to <code>users</code>.</li>
        <li><code>colleges</code> / <code>universities</code>: Institutional hierarchy.</li>
        <li><code>fee_structures</code>: Defines fees for courses/colleges.</li>
        <li><code>payments</code>: Records transaction details.</li>
      </ul>

      <h3 class="text-xl font-medium mb-3">Deployment</h3>
      <p class="text-gray-600">
        The application is designed to be deployed on platforms supporting Node.js or edge functions (e.g., Vercel, Netlify) or as a containerized Docker application.
      </p>
    </div>
  </div>

  <div class="mb-8">
    <h2 class="text-2xl font-semibold mb-4 text-green-600">User Manual (How-To)</h2>
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-xl font-medium mb-3">Managing Users</h3>
      <ol class="list-decimal list-inside mb-4 text-gray-600 space-y-2">
        <li>Navigate to the <strong>Users</strong> section in the admin dashboard.</li>
        <li>Click "Create User" to add a new administrator, college authority, or other staff.</li>
        <li>Assign the appropriate role to ensure correct permissions.</li>
      </ol>

      <h3 class="text-xl font-medium mb-3">Configuring Colleges & Universities</h3>
      <ol class="list-decimal list-inside mb-4 text-gray-600 space-y-2">
        <li>Go to <strong>Universities</strong> to manage top-level institutions.</li>
        <li>Go to <strong>Colleges</strong> to add or edit colleges.</li>
        <li>Ensure each college is correctly linked to its parent university.</li>
      </ol>

      <h3 class="text-xl font-medium mb-3">Fee Structures</h3>
      <p class="mb-4 text-gray-600">
        Navigate to <strong>Fee Structures</strong> to define tuition, admission, and other fees. These can be set globally or overridden per college.
      </p>

      <h3 class="text-xl font-medium mb-3">Creating Dynamic Forms (Table / Data Grid Layouts)</h3>
      <div class="mb-4 text-gray-600">
        <p class="mb-2">When creating a new Form Schema via <strong>Admin > Forms</strong>, you can set a section's layout to <strong>Table Layout</strong> to create advanced Data Grids (e.g., for Subjects and Scores).</p>
        <ul class="list-disc list-inside space-y-1">
          <li><strong>Columns:</strong> Add custom columns (e.g., <em>Theory</em>, <em>Practical</em>, <em>Total</em>). Types can be Number, Text, or Calculated.</li>
          <li><strong>Calculated Columns:</strong> Use math formulas like <code>theory + practical</code>. The system will automatically compute the value in real-time based on the other column keys in the same row.</li>
          <li><strong>Rows (Fields):</strong> Each Field you add to the section acts as a <strong>Row</strong> (e.g., Subject: <em>Math</em>).</li>
          <li><strong>Merit Fields:</strong> If a field is marked as an "Is Merit Field", an extra <strong>Max Score</strong> column is automatically generated for that row, allowing input for the maximum possible score (defaulting to the field's max score setting).</li>
        </ul>
      </div>

      <h3 class="text-xl font-medium mb-3">System Reports</h3>
      <p class="text-gray-600">
        Access the <strong>Reports</strong> section to generate system-wide analytics on admissions, payments, and user activity.
      </p>
    </div>
  </div>
</div>
