<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance, deserialize } from '$app/forms'; // Import deserialize
    import { goto } from '$app/navigation';
    import { page } from '$app/stores'; 
    import { onMount } from 'svelte';
    import DynamicForm from '$lib/components/DynamicForm.svelte';
    import PaymentButton from '$lib/components/PaymentButton.svelte';
    import { supabase } from '$lib/supabase'; 
    import { startLoading, stopLoading } from '$lib/stores/loadingStore'; 
    import { getBranchDisplayCode } from '$lib/utils/display_helpers'; // Import the helper

    let { data, form } = $props<{ data: PageData, form: ActionData }>();

    // State variables for form selections
    let selectedCollegeId = $state('');
    let selectedCourseId = $state('');
    let selectedCycleId = $state('');
    let selectedFormType = $state('Provisional'); // Default
    let selectedBranchId = $state('');
    let selectedAdmissionType = $state('Regular');
    
    // Application data and UI state
    let currentApplicationId = $state<string | null>(null);
    let applicationFormData = $state<Record<string, any>>({});
    
    let lastLoadedKey = $state('');
    let lastCheckedKey = $state('');

    // Derived stores for filtering options
    let uniqueColleges = $derived(Array.from(new Map(data.courses.map((c: any) => [c.colleges?.id, c.colleges])).values()).filter(c => c));
    let filteredCourses = $derived(selectedCollegeId 
        ? data.courses.filter((c: any) => c.colleges?.id === selectedCollegeId) 
        : []);
    
    let filteredBranches = $derived(selectedCourseId
        ? data.branches.filter((b: any) => b.course_id === selectedCourseId)
        : []);

    // Filter available form types based on enabled forms for selected Course/Cycle
    let availableFormTypes = $derived(data.formTypes.filter((ft: any) => {
        if (!selectedCourseId || !selectedCycleId) return false;
        if (ft.student_can_apply === false) return false;

        return data.enabledForms?.some((ef: any) => 
            ef.course_id === selectedCourseId && 
            ef.cycle_id === selectedCycleId && 
            ef.form_type === ft.name
        );
    }));

    // Derived allowed admission types
    let currentAdmissionFormSchema = $state<any>(null);
    let allowedAdmissionTypes = $derived(currentAdmissionFormSchema?.allowedAdmissionTypes 
        ? currentAdmissionFormSchema.allowedAdmissionTypes.split(',').map((t: string) => t.trim()).filter(Boolean)
        : []);

    // Helper: Merge autofill data from profile and inquiry
    function mergeAutofillData(schema: any) {
        if (!schema || !schema.fields) return {};
        
        const merged: Record<string, any> = {};
        const profileData = data.studentProfile?.profile_data || {};
        const inquiryData = data.inquiryAutofillData || {};

        schema.fields.forEach((field: any) => {
            // 1. Priority: Profile Data (Linked by key)
            if (field.profileFieldKey && profileData[field.profileFieldKey] !== undefined) {
                merged[field.key] = profileData[field.profileFieldKey];
            }
            // 2. Secondary: Inquiry Data (Linked by key)
            else if (inquiryData[field.key] !== undefined) {
                merged[field.key] = inquiryData[field.key];
            }
            // 3. Special mapping for names/phone if linked
            else if (field.profileFieldKey === 'full_name' && data.studentProfile?.full_name) {
                merged[field.key] = data.studentProfile.full_name;
            }
            else if (field.profileFieldKey === 'phone' && data.studentProfile?.phone) {
                merged[field.key] = data.studentProfile.phone;
            }

            // Fix for Select boxes: ensure merged value matches one of the options (case-insensitive)
            if (field.type === 'select' && merged[field.key] !== undefined) {
                let options: any[] = [];
                if (field.dataSource?.options) options = field.dataSource.options;
                else if (field.options) options = field.options;

                if (options.length > 0) {
                    const val = String(merged[field.key]).toLowerCase();
                    const match = options.find(opt => {
                        const optVal = typeof opt === 'string' ? opt.split('|')[0].trim() : String(opt.value || opt);
                        return optVal.toLowerCase() === val;
                    });

                    if (match) {
                        merged[field.key] = typeof match === 'string' ? match.split('|')[0].trim() : (match.value || match);
                    }
                }
            }
        });

        return merged;
    }

    let isLoadingSchema = $state(false);
    let uiMessage = $state<{ type: 'success' | 'danger' | 'info' | 'warning', text: string } | null>(null);

    // Payment state
    let showPaymentModal = $state(false);
    let currentFeeAmount = $state(0);

    // Event handlers for selection changes
    function handleCollegeChange() {
        console.log('--- handleCollegeChange ---');
        selectedCourseId = '';
        selectedBranchId = '';
        selectedCycleId = '';
        selectedFormType = '';
        currentAdmissionFormSchema = null;
        console.log('Resetting selections.');
    }

    function handleCourseChange() {
        console.log('--- handleCourseChange ---');
        selectedBranchId = '';
        selectedCycleId = '';
        selectedFormType = '';
        currentAdmissionFormSchema = null;
        console.log('Resetting selections.');
    }

    // Function to synchronize core selections into form data
    function syncSelectionsToFormData() {
        if (!applicationFormData) return;
        
        console.log('Syncing selections to form data');
        applicationFormData.course_id = selectedCourseId;
        applicationFormData.branch_id = selectedBranchId;
        applicationFormData.admission_type = selectedAdmissionType;
        applicationFormData.cycle_id = selectedCycleId;
        applicationFormData.form_type = selectedFormType;
        
        // Sync names for visibility logic (requested by user)
        applicationFormData.course_name = data.courses.find(c => c.id === selectedCourseId)?.name || '';
        applicationFormData.branch_name = data.branches.find(b => b.id === selectedBranchId)?.name || '';
    }

    // Reactively sync whenever core selections change, but without modifying the selections themselves
    $effect(() => {
        if (selectedCourseId || selectedBranchId || selectedAdmissionType || selectedCycleId || selectedFormType) {
            syncSelectionsToFormData();
        }
    });

    // 2. Auto-check for existing applications when Course/Cycle are selected
    $effect(() => {
        const checkKey = `${selectedCourseId}|${selectedCycleId}`;
        const urlAppId = $page.url.searchParams.get('applicationId');

        if (selectedCourseId && selectedCycleId && !urlAppId && !selectedFormType && checkKey !== lastCheckedKey) {
            console.log('Course and Cycle selected. Checking for existing applications...');
            checkAnyExistingApplication();
            lastCheckedKey = checkKey;
        }
        
        if (!selectedCourseId || !selectedCycleId) {
            lastCheckedKey = '';
        }
    });
    
    // 3. Load schema and application data when selections are complete
    $effect(() => {
        const loadKey = `${selectedCourseId}|${selectedCycleId}|${selectedFormType}`;
        
        if (selectedCourseId && selectedCycleId && selectedFormType) {
            if (loadKey !== lastLoadedKey) {
                console.log('All main selections made. Guard triggering loadSchemaAndApplication...');
                lastLoadedKey = loadKey; // Set early to prevent parallel triggers
                loadSchemaAndApplication();
            }
        } else {
            if (lastLoadedKey !== '') {
                currentAdmissionFormSchema = null;
                lastLoadedKey = '';
                console.log('Selections cleared. Resetting schema.');
            }
        }
    });

    // Default to first available cycle if course is selected
    $effect(() => {
        if (selectedCourseId && !selectedCycleId && data.availableCycles.length > 0) {
            selectedCycleId = data.availableCycles[0].id;
        }
    });

    // Reactivity for URL parameters and existing application loading
    let urlApplicationId = $derived($page.url.searchParams.get('applicationId'));
    let urlCourseId = $derived($page.url.searchParams.get('courseId'));

    $effect(() => {
        if (urlApplicationId && urlApplicationId !== currentApplicationId) {
            currentApplicationId = urlApplicationId;
            fetchExistingApplication(urlApplicationId);
        }
    });

    $effect(() => {
        if (!urlApplicationId && urlCourseId && !selectedCourseId) {
            const course = data.courses.find(c => c.id === urlCourseId) as any;
            if (course && course.colleges) {
                selectedCollegeId = course.colleges.id;
                selectedCourseId = course.id;
            }
        }
    });

    // Function to fetch admission form schema from Supabase
    async function checkAnyExistingApplication() {
        console.log('--- checkAnyExistingApplication ---');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { console.log('User not logged in.'); return; }
        
        startLoading();
        try {
            const { data: anyApp } = await supabase
                .from('applications')
                .select('form_type')
                .eq('student_id', user.id)
                .eq('course_id', selectedCourseId)
                .eq('cycle_id', selectedCycleId)
                .limit(1)
                .maybeSingle();
            
            if (anyApp && selectedFormType !== anyApp.form_type) {
                console.log('Existing app found. Setting type to:', anyApp.form_type);
                selectedFormType = anyApp.form_type; 
            }
        } finally {
            stopLoading();
        }
    }

    async function loadSchemaAndApplication() {
        console.log('--- loadSchemaAndApplication START ---');
        startLoading();
        
        try {
            await fetchAdmissionFormSchema(selectedCourseId, selectedCycleId, selectedFormType);
            await checkExistingApplication();
            syncSelectionsToFormData();
        } finally {
            console.log('--- loadSchemaAndApplication END ---');
            stopLoading();
        }
    }

    // Helper to merge profile and inquiry data into form data based on schema
    function mergeProfileData(formData: any, schema: any, profileData: any) {
        console.log('--- mergeProfileData ---');
        const inquiryData = data.inquiryAutofillData || {};
        
        if (!schema || !schema.fields) return formData;
        
        const merged = { ...formData };
        schema.fields.forEach((field: any) => {
            // 1. Priority: Profile Data (Linked by key)
            if (field.profileFieldKey && profileData?.[field.profileFieldKey] !== undefined) {
                merged[field.key] = profileData[field.profileFieldKey];
            }
            // 2. Secondary: Inquiry Data (Linked by key)
            else if (inquiryData[field.key] !== undefined && (merged[field.key] === undefined || merged[field.key] === '')) {
                merged[field.key] = inquiryData[field.key];
            }
            // 3. Fallback: Direct key match in profile
            else if (profileData?.[field.key] !== undefined && (merged[field.key] === undefined || merged[field.key] === '')) {
                merged[field.key] = profileData[field.key];
            }
        });
        return merged;
    }

    async function checkExistingApplication() {
        console.log('--- checkExistingApplication ---');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { console.log('User not logged in.'); return; }

        let query = supabase
            .from('applications')
            .select('id, form_data, branch_id, form_type, status, admission_type')
            .eq('student_id', user.id)
            .eq('course_id', selectedCourseId)
            .eq('cycle_id', selectedCycleId)
            .eq('form_type', selectedFormType);

        const { data: existingApp, error: appQueryError } = await query.maybeSingle();
        if (appQueryError) console.error('Error in checkExistingApplication query:', appQueryError);

        if (existingApp) {
            currentApplicationId = existingApp.id;
            if (existingApp.branch_id) selectedBranchId = existingApp.branch_id;
            if (existingApp.admission_type) selectedAdmissionType = existingApp.admission_type;
            
            applicationFormData = mergeProfileData(
                existingApp.form_data || {}, 
                currentAdmissionFormSchema, 
                data.studentProfile?.profile_data
            );

            if (['verified', 'approved', 'submitted'].includes(existingApp.status)) {
                let msg = 'Application is locked.';
                if (existingApp.status === 'submitted') msg = 'Application submitted. Pending verification.';
                if (existingApp.status === 'verified') msg = 'Application verified.';
                if (existingApp.status === 'approved') msg = 'Application approved.';
                uiMessage = { type: 'info', text: msg };
            } else {
                uiMessage = null;
            }
        } else {
            if (currentApplicationId) {
                currentApplicationId = null;
                uiMessage = null;
            }
            applicationFormData = mergeProfileData({}, currentAdmissionFormSchema, data.studentProfile?.profile_data);
        }
    }

    async function fetchAdmissionFormSchema(courseId: string, cycleId: string, formType: string) {
        isLoadingSchema = true;
        const { data: formResult, error } = await supabase
            .from('admission_forms')
            .select('schema_json')
            .eq('course_id', courseId)
            .eq('cycle_id', cycleId)
            .eq('form_type', formType)
            .eq('is_enabled', true)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching admission form schema:', error.message);
            currentAdmissionFormSchema = null;
        } else {
            currentAdmissionFormSchema = formResult?.schema_json || null;
        }
        isLoadingSchema = false;
    }

    // Function to fetch existing application data
    async function fetchExistingApplication(appId: string) {
        const { data: application, error } = await supabase
            .from('applications')
            .select('form_data, course_id, cycle_id, branch_id, form_type')
            .eq('id', appId)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching existing application:', error.message);
            uiMessage = { type: 'danger', text: 'Error loading application data.' };
        } else if (application) {
            // Set selections based on fetched application data
            selectedCourseId = application.course_id;
            selectedCycleId = application.cycle_id;
            selectedBranchId = application.branch_id || '';
            selectedFormType = application.form_type || 'Provisional';
            applicationFormData = application.form_data || {};

            const course = data.courses.find(c => c.id === selectedCourseId) as any;
            if (course && course.colleges) {
                selectedCollegeId = course.colleges.id;
            }
        }
    }

    // Reference to the DynamicForm component instance
    let dynamicForm: DynamicForm;

    // Function to handle saving application draft
    async function handleSaveDraft() {
        uiMessage = null;
        const formPayload = new FormData();
        formPayload.append('course_id', selectedCourseId);
        formPayload.append('cycle_id', selectedCycleId);
        formPayload.append('branch_id', selectedBranchId);
        formPayload.append('form_type', selectedFormType);
        formPayload.append('admission_type', selectedAdmissionType);
        formPayload.append('form_data', JSON.stringify(applicationFormData));
        if (currentApplicationId) {
            formPayload.append('application_id', currentApplicationId);
        }

        try {
            const response = await fetch('?/saveApplication', {
                method: 'POST',
                body: formPayload
            });

            // Use deserialize to handle SvelteKit's action response format
            const result = deserialize(await response.text());
            
            if (result.type === 'success') {
                 if (result.data?.success) {
                     uiMessage = { type: 'success', text: result.data.message || 'Draft saved successfully.' };
                     if (!currentApplicationId && result.data.applicationId) { 
                         currentApplicationId = result.data.applicationId;
                         goto(`/student/apply?applicationId=${result.data.applicationId}`, { replaceState: true, noScroll: true, keepFocus: true });
                     }
                 } else {
                     uiMessage = { type: 'danger', text: 'Failed to save draft.' };
                 }
            } else if (result.type === 'failure') {
                uiMessage = { type: 'danger', text: result.data?.message || 'Failed to save draft.' };
            } else if (result.type === 'redirect') {
                 uiMessage = { type: 'success', text: 'Draft saved successfully.' };
            }

        } catch (e) {
            console.error(e);
            uiMessage = { type: 'danger', text: 'An error occurred while saving.' };
        }
    }

    // Function to handle application submission
    async function handleSubmitApplication() {
        uiMessage = null;
        
        if (dynamicForm && !dynamicForm.validate()) {
            uiMessage = { type: 'danger', text: 'Please fill in all required fields marked with *.' };
            return;
        }

        startLoading(); // Show overlay

        try {
            // Auto-save before submitting
            const saveFormPayload = new FormData();
            saveFormPayload.append('course_id', selectedCourseId);
            saveFormPayload.append('cycle_id', selectedCycleId);
            saveFormPayload.append('branch_id', selectedBranchId);
            saveFormPayload.append('form_type', selectedFormType);
            saveFormPayload.append('admission_type', selectedAdmissionType);
            saveFormPayload.append('form_data', JSON.stringify(applicationFormData));
            
            if (currentApplicationId) {
                saveFormPayload.append('application_id', currentApplicationId);
            }

            // Silent save
            const saveResponse = await fetch('?/saveApplication', { method: 'POST', body: saveFormPayload });
            const saveResult = deserialize(await saveResponse.text());
            
            if (saveResult.type === 'success' && saveResult.data?.applicationId) {
                currentApplicationId = saveResult.data.applicationId;
                console.log('Synchronized applicationId after silent save:', currentApplicationId);
            } else if (saveResult.type === 'failure') {
                throw new Error(saveResult.data?.message || 'Failed to save application data before submission.');
            }

            if (!currentApplicationId) {
                throw new Error('Failed to acquire application ID.');
            }

            const formPayload = new FormData();
            formPayload.append('application_id', currentApplicationId);

            const response = await fetch('?/submitApplication', {
                method: 'POST',
                body: formPayload
            });
            
            const result = deserialize(await response.text());

            if (result.type === 'success' && result.data?.success) {
                const data = result.data as any;
                if ((result.data as any).feeStatus === 'pending' && (result.data as any).feeAmount > 0) {
                    currentFeeAmount = (result.data as any).feeAmount;
                    showPaymentModal = true;
                    uiMessage = { type: 'success', text: 'Application submitted. Payment required.' };
                } else {
                    uiMessage = { type: 'success', text: result.data?.message || 'Application submitted successfully!' };
                    setTimeout(() => goto('/student'), 1500);
                }
            } else if (result.type === 'failure') {
                uiMessage = { type: 'danger', text: result.data?.message || 'Submission failed.' };
            } else {
                uiMessage = { type: 'danger', text: 'Submission failed.' };
            }
        } catch (e) {
             uiMessage = { type: 'danger', text: 'An error occurred during submission.' };
        } finally {
            stopLoading(); // Hide overlay
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Apply for Admission</h1>

    {#if uiMessage}
        <div class="alert alert-{uiMessage.type} alert-dismissible fade show" role="alert">
            {uiMessage.text}
            <button type="button" class="btn-close" on:click={() => uiMessage = null} aria-label="Close"></button>
        </div>
    {/if}
    
    {#if form?.message && !uiMessage}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-body">
            <h5 class="card-title">Select College, Course and Admission Cycle</h5>
            
            <div class="row g-3">
                <div class="col-md-6">
                    <label for="college-select" class="form-label">College</label>
                    <select class="form-select" id="college-select" bind:value={selectedCollegeId} on:change={handleCollegeChange}>
                        <option value="">Select a College</option>
                        {#each uniqueColleges as college}
                            {@const collegeAny = college as any}
                            <option value={collegeAny.id}>{collegeAny.name}</option>
                        {/each}
                    </select>
                </div>

                <div class="col-md-6">
                    <label for="course-select" class="form-label">Course</label>
                    <select class="form-select" id="course-select" bind:value={selectedCourseId} on:change={handleCourseChange} disabled={!selectedCollegeId}>
                        <option value="">Select a Course</option>
                        {#each filteredCourses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>

                {#if filteredBranches.length > 0 && currentAdmissionFormSchema?.enableBranchSelection}
                    <div class="col-md-6">
                        <label for="branch-select" class="form-label">Branch / Specialization</label>
                        <select class="form-select" id="branch-select" bind:value={selectedBranchId} disabled={!selectedCourseId}>
                            <option value="">Select a Branch</option>
                            {#each filteredBranches as branch}
                                {@const branchAny = branch as any}
                                <option value={branch.id}>{branch.name} ({getBranchDisplayCode(branch.name, branchAny.code)})</option>
                            {/each}
                        </select>
                    </div>
                {/if}

                <div class="col-md-6">
                    <label for="form-type-select" class="form-label">Form Type</label>
                    <select class="form-select" id="form-type-select" bind:value={selectedFormType} disabled={!selectedCourseId || !selectedCycleId}>
                        <option value="">Select Form Type</option>
                        {#if availableFormTypes.length > 0}
                            {#each availableFormTypes as ft}
                                <option value={ft.name}>{ft.name}</option>
                            {/each}
                        {:else}
                            <option value="" disabled>No forms enabled</option>
                        {/if}
                    </select>
                </div>

                {#if allowedAdmissionTypes.length > 0}
                    <div class="col-md-6">
                        <label for="admission-type-select" class="form-label">Admission Type</label>
                        <select class="form-select" id="admission-type-select" bind:value={selectedAdmissionType}>
                            {#each allowedAdmissionTypes as type}
                                <option value={type}>{type === 'D2D' ? 'D2D (Diploma to Degree)' : type === 'C2D' ? 'C2D (Certificate to Degree)' : type}</option>
                            {/each}
                        </select>
                    </div>
                {/if}

                <div class="col-md-6">
                    <label for="cycle-select" class="form-label">Admission Cycle</label>
                    <select class="form-select" id="cycle-select" bind:value={selectedCycleId} disabled={!selectedCourseId}>
                        <option value="">Select an Admission Cycle</option>
                        {#if selectedCourseId}
                            {#each data.availableCycles as cycle}
                                {@const cycleAny = cycle as any}
                                <option value={cycle.id}>{cycle.name} ({cycleAny.academic_years?.name})</option>
                            {/each}
                        {/if}
                    </select>
                </div>
            </div>
        </div>
    </div>

    {#if selectedCourseId && selectedCycleId}
        <div class="card">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="card-title mb-0">Application Form <span class="badge bg-secondary ms-2">{selectedFormType}</span></h5>
                    {#if currentApplicationId && !uiMessage?.text?.includes('locked')}
                        <span class="badge bg-warning text-dark">Editing Draft</span>
                    {/if}
                </div>
                {#if isLoadingSchema}
                    <div class="text-center p-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-2">Loading form...</p>
                    </div>
                {:else if currentAdmissionFormSchema && currentAdmissionFormSchema.fields && currentAdmissionFormSchema.fields.length > 0}
                    {#key `${selectedCourseId}-${selectedCycleId}-${selectedFormType}`}
                        <DynamicForm 
                            schema={currentAdmissionFormSchema} 
                            bind:formData={applicationFormData} 
                            bind:this={dynamicForm} 
                            readonly={uiMessage?.text?.includes('locked')}
                        />
                    {/key}
                    {#if !uiMessage?.text?.includes('locked')}
                        <div class="mt-3 text-end">
                            <button class="btn btn-success" on:click={handleSubmitApplication}>Submit Application</button>
                        </div>
                    {/if}
                {:else}
                    <p class="text-warning">No admission form found for the selected options. Please contact administration.</p>
                {/if}
            </div>
        </div>
    {:else}
        <p class="text-info">Please select a College, Course and an Admission Cycle to view the application form.</p>
    {/if}
</div>

<!-- Payment Modal -->
<div class="modal" tabindex="-1" style="display: {showPaymentModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Pay Application Fee</h5>
                <button type="button" class="btn-close" on:click={() => (showPaymentModal = false)}></button>
            </div>
            <div class="modal-body text-center">
                <p class="lead">Amount Due</p>
                <h2 class="text-primary mb-4">₹ {currentFeeAmount.toFixed(2)}</h2>
                <p class="text-muted small">This is a secure payment gateway integration.</p>
            </div>
            <div class="modal-footer justify-content-center">
                {#if currentApplicationId}
                    <PaymentButton 
                        applicationId={currentApplicationId}
                        studentId={data.userProfile?.id || ''}
                        amount={currentFeeAmount}
                        paymentType="application_fee"
                        buttonClass="btn btn-success w-100 py-2 fs-5"
                        buttonText="Pay Now"
                        returnUrl="/"
                    />
                {/if}
            </div>
        </div>
    </div>
</div>