<script lang="ts">
    import { onMount } from 'svelte';

    export let showModal = false;

    let modalElement: HTMLElement; 

    onMount(async () => {
        if (typeof window !== 'undefined' && !(window as any).bootstrap) {
            await import('bootstrap');
        }
    });

    function closeModal() {
        showModal = false;
    }
</script>

{#if showModal}
<div class="modal d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5); z-index: 1050;" bind:this={modalElement}>
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content shadow-lg">
            <div class="modal-header bg-primary text-white">
                <h5 class="modal-title">
                    <i class="bi bi-book me-2"></i>
                    HTML Profile Template Designer Guide
                </h5>
                <button type="button" class="btn-close btn-close-white" aria-label="Close" on:click={closeModal}></button>
            </div>
            <div class="modal-body p-4">
                <div class="row">
                    <div class="col-md-7">
                        <h6><i class="bi bi-code-slash text-primary me-2"></i> How to use the Designer</h6>
                        <p>Our profile system uses <strong>HTML</strong> for layout and <strong>Handlebars</strong> for data injection. You can create tables, divs, and style them using inline CSS.</p>
                        
                        <div class="card bg-light mb-3">
                            <div class="card-body py-2">
                                <p class="mb-1 fw-bold small">Basic Variable Syntax:</p>
                                <code class="d-block">&lbrace;&lbrace;category.field_name&rbrace;&rbrace;</code>
                                <small class="text-muted">Example: <code>&lbrace;&lbrace;student.full_name&rbrace;&rbrace;</code></small>
                            </div>
                        </div>

                        <h6><i class="bi bi-diagram-3 text-primary me-2"></i> Data Categories (Prefixes)</h6>
                        <p>The system flattens database data into these main categories:</p>
                        <table class="table table-sm small table-bordered border-light-subtle">
                            <thead class="table-light">
                                <tr><th>Prefix</th><th>Source Tables</th><th>Description</th></tr>
                            </thead>
                            <tbody>
                                <tr><td><code>student.*</code></td><td>users, student_profiles</td><td>Name, Email, Photo, DOB, Aadhar, and custom profile fields.</td></tr>
                                <tr><td><code>application.*</code></td><td>applications, account_admissions</td><td>Status, Academic Year, Admission No, and all Admission Form data.</td></tr>
                                <tr><td><code>course.*</code></td><td>courses</td><td>The course name and code being applied for.</td></tr>
                                <tr><td><code>college.*</code></td><td>colleges, universities</td><td>College name, logo, trust details, and university branding.</td></tr>
                                <tr><td><code>marks.*</code></td><td>marks</td><td>Aggregated board exam marks by subject name.</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="col-md-5">
                        <h6><i class="bi bi-info-circle text-primary me-2"></i> Pro Tips</h6>
                        <ul class="small">
                            <li class="mb-2"><strong>The Side Picker:</strong> Use the "Variable Picker" in the sidebar to browse your entire database. Click the <code>+</code> to insert the field directly.</li>
                            <li class="mb-2"><strong>Single Page:</strong> Our PDF engine (pdfmake) is optimized for single-page output. Avoid overly long layouts.</li>
                            <li class="mb-2"><strong>Images:</strong> To show the student photo, use: 
                                <br><code>&lt;img src="&lbrace;&lbrace;student.photo_url&rbrace;&rbrace;" width="100" height="120" /&gt;</code>
                            </li>
                            <li class="mb-2"><strong>Conditionals & Ladders:</strong> Conditionally render content, perform comparison checks, or search string content (using <code>contains</code>):
                                <pre class="bg-light p-2 mt-1 border rounded xx-small" style="font-size: 0.7rem; white-space: pre-wrap;">
&lbrace;&lbrace;#if course.name contains 'engineering'&rbrace;&rbrace;
  Engineering Block (Label 1)
&lbrace;&lbrace;else if course.name contains 'architecture'&rbrace;&rbrace;
  Architecture Block (Label 2)
&lbrace;&lbrace;else&rbrace;&rbrace;
  General: &lbrace;&lbrace;course.name&rbrace;&rbrace;
&lbrace;&lbrace;/if&rbrace;&rbrace;</pre>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-light">
                <button type="button" class="btn btn-primary px-4" on:click={closeModal}>Got it!</button>
            </div>
        </div>
    </div>
</div>
{/if}

<style>
    code {
        color: #d63384;
    }
</style>
