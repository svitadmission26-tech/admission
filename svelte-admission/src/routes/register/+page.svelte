<script lang="ts">
    import type { ActionData } from './$types';
    import { enhance } from '$app/forms';

    let { form } = $props<{ form: ActionData }>();
</script>

<div class="container d-flex justify-content-center align-items-center vh-100">
    <div class="card shadow p-4" style="max-width: 400px; width: 100%;">
        <h2 class="text-center mb-4">Register</h2>

        {#if form?.message}
            <div class="alert {form.error ? 'alert-danger' : 'alert-success'}" role="alert">
                {form.message}
            </div>
        {/if}

        <form method="POST" use:enhance>
            <div class="mb-3">
                <label for="full_name" class="form-label">Full Name</label>
                <input type="text" class="form-control" id="full_name" name="full_name" required placeholder="John Doe">
            </div>
            <div class="mb-3">
                <label for="email" class="form-label">Email address</label>
                <input type="email" class="form-control" id="email" name="email" required placeholder="name@example.com">
            </div>
            <div class="mb-3">
                <label for="password" class="form-label">Password</label>
                <input type="password" class="form-control" id="password" name="password" required placeholder="********">
            </div>
            <div class="mb-3">
                <label for="confirmPassword" class="form-label">Confirm Password</label>
                <input type="password" class="form-control" id="confirmPassword" name="confirmPassword" required placeholder="********">
            </div>
            <button type="submit" class="btn btn-primary w-100">Register</button>
        </form>

        <div class="mt-3 text-center">
            <p>Already have an account? <a href="/">Login here</a></p>
        </div>
    </div>
</div>