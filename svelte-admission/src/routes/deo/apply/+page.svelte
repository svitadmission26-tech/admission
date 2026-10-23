<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance, deserialize } from '$app/forms'; // Import deserialize
    import { goto, invalidateAll } from '$app/navigation';
    import { onMount, tick } from 'svelte';
    import DynamicForm from '$lib/components/DynamicForm.svelte';
    import { supabase } from '$lib/supabase'; // Client-side supabase client
    import { startLoading, stopLoading } from '$lib/stores/loadingStore'; // Import loading controls
    import PaymentButton from '$lib/components/PaymentButton.svelte';
    import { toastStore } from '$lib/stores/toastStore';
    import { getBranchDisplayCode } from '$lib/utils/display_helpers'; // Import the helper

    let { data, form } = $props<{ data: PageData, form: ActionData }>();

    $effect(() => {
        if (form?.message) {
            if (form.error) {
                toastStore.error(form.message);
            } else {
                toastStore.success(form.message);
            }
        }
    });

    let studentSearchContainer: HTMLElement;

    onMount(() => {
        function handleClickOutside(event: MouseEvent) {
            if (studentSearchContainer && !studentSearchContainer.contains(event.target as Node)) {
                isStudentListExpanded = false;
            }
        }
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    });

    let selectedStudentId = $state(data.selectedStudent?.id || '');
    let showCreateStudentForm = $state(false);
    let isInquiryFormFilled = $state(false);

    let selectedCourseId = $state(data.selectedCourse?.id || '');
    let selectedCycleId = $state('');
    let selectedBranchId = $state(''); // Branch Selection
    let selectedFormType = $state('Provisional'); // Form Type Selection
    let selectedAdmissionType = $state('Regular'); // Admission Type Selection
    
    let currentApplicationId = $state<string | null>(null);
    let currentApplicationStatus = $state('');
    let applicationFormData = $state<Record<string, any>>({});
    
    // Error handling for applicationId loading
    let applicationLoadError = $state<string | null>(null);
    let isLoadingApplication = $state(false);
    let isLoadedFromApplicationId = $state(false); // Track if we loaded from URL param
    
    // Track if we're editing an existing application (vs creating new)
    let isEditingExistingApplication = $state(false);

    let currentAdmissionFormSchema = $state<any>(null);
    let isLoadingSchema = $state(false);
    let loadedStudentProfile = $state<any>(null); // Store fetched student profile
    
    // Track schema availability
    let isSchemaAvailable = $state(true);
    let schemaErrorMessage = $state('');

    // Sync selections into applicationFormData for DynamicForm visibility rules
    $effect(() => {
        if (applicationFormData) {
            applicationFormData.course_id = selectedCourseId;
            applicationFormData.branch_id = selectedBranchId;
            applicationFormData.admission_type = selectedAdmissionType;
            applicationFormData.cycle_id = selectedCycleId;
            applicationFormData.form_type = selectedFormType;

            // Sync names for visibility logic (requested by user)
            applicationFormData.course_name = data.courses.find((c: any) => c.id === selectedCourseId)?.name || '';
            applicationFormData.branch_name = branchesForSelectedCourse.find((b: any) => b.id === selectedBranchId)?.name || '';
        }
    });

    // Derived allowed admission types
    let allowedAdmissionTypes = $derived(
        currentAdmissionFormSchema?.allowedAdmissionTypes
            ? currentAdmissionFormSchema.allowedAdmissionTypes.split(',').map((t: string) => t.trim()).filter(Boolean)
            : []
    );

    // Create lookup for profile field defaults (for backward compatibility)
    let profileFieldDefaults = $derived(Object.fromEntries(
        (data.profileSchema || []).map((f: any) => [f.key, f.default_value])
    ));

    // Initialize from preloaded application data (if loading from applicationId)
    $effect(() => {
        if (data.preloadedApplicationData && !isLoadedFromApplicationId) {
            const appData = data.preloadedApplicationData;
            console.log('[DEO] Loading preloaded application data:', appData);
            
            // Set form data
            applicationFormData = appData.form_data || {};
            currentApplicationId = appData.id;
            currentApplicationStatus = appData.status || '';
            isEditingExistingApplication = true;
            isLoadedFromApplicationId = true; // Mark as loaded from URL
            
            // Pre-select course, cycle, form type
            if (appData.course_id) selectedCourseId = appData.course_id;
            if (appData.cycle_id) selectedCycleId = appData.cycle_id;
            if (appData.form_type) selectedFormType = appData.form_type;
            if (appData.branch_id) selectedBranchId = appData.branch_id;
            if (appData.admission_type) selectedAdmissionType = appData.admission_type;
            
            // If student is preloaded from server
            if (data.selectedStudent) {
                selectedStudentId = data.selectedStudent.id;
            }
        }
    });

    // Profile Editing State
    let showEditProfileModal = $state(false);
    let profileFormData = $state<Record<string, any>>({});
    let profileForm: DynamicForm;

    // New student form fields
    let newStudentFullName = $state('');
    let newStudentEmail = $state('');
    let newStudentPhone = $state(''); // Added phone field
    let newStudentPassword = $state('');
    let newStudentConfirmPassword = $state('');

    // Inquiry detection state
    let matchingInquiry = $state<any>(null);
    let isCheckingInquiry = $state(false);
    let inquiryEmailSuggestions = $state<string[]>([]);
    let inquirySuggestions = $state<any[]>([]); // New: Full inquiry objects
    let lastLoadedInquiryData = $state<any>(null);
    let isProgrammaticUpdate = false;

    // Debounced inquiry search for autocomplete
    let searchTimeout: any;
    async function searchInquiries(query: string) {
        if (!query || query.length < 3 || !isInquiryFormFilled) {
            inquirySuggestions = [];
            return;
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/inquiry/search?q=${encodeURIComponent(query)}`);
                inquirySuggestions = await res.json();
                
                // If there's an exact match in the suggestions, we can show the "Inquiry Found" alert
                const exactMatch = inquirySuggestions.find((s: any) => 
                    s.email.toLowerCase() === query.toLowerCase() || 
                    s.full_name.toLowerCase() === query.toLowerCase() ||
                    (s.phone && s.phone === query)
                );
                
                if (exactMatch) {
                    performInquiryCheck(exactMatch.email, 'email');
                }
            } catch (e) {
                console.error('Inquiry search failed:', e);
            }
        }, 800);
    }

    async function performInquiryCheck(val: string, type: 'email' | 'name' | 'phone') {
        if (!val || val.length < 3 || isProgrammaticUpdate || !isInquiryFormFilled) return;
        
        isCheckingInquiry = true;
        startLoading();
        try {
            const res = await fetch(`/api/inquiry/check?q=${encodeURIComponent(val)}`);
            const result = await res.json();
            if (result.found) {
                matchingInquiry = result;
            }
        } catch (e) {
            console.error('Inquiry check failed:', e);
        } finally {
            isCheckingInquiry = false;
            stopLoading();
        }
    }

    async function loadInquiryData() {
        if (!matchingInquiry) return;
        
        console.log('>>> [DIAGNOSTIC] loadInquiryData START');
        isProgrammaticUpdate = true;
        
        const nextName = matchingInquiry.fullName || '';
        const nextEmail = matchingInquiry.email || '';
        const nextPhone = matchingInquiry.phone || '';

        newStudentFullName = nextName;
        newStudentEmail = nextEmail;
        newStudentPhone = nextPhone;
        
        // Wait for Svelte to apply updates
        await tick();
        
        lastLoadedInquiryData = {
            ...(matchingInquiry.mappedData || {}),
            full_name: nextName,
            email: nextEmail,
            contact: nextPhone,
            phone: nextPhone
        };
        
        if (currentAdmissionFormSchema) {
            applicationFormData = mergeProfileData(
                { ...applicationFormData }, 
                currentAdmissionFormSchema, 
                null
            );
        }
        
        matchingInquiry = null; 
        
        setTimeout(() => { isProgrammaticUpdate = false; }, 1000);
        toastStore.info('Data from inquiry has been loaded successfully.');
    }

    $effect(() => {
        if (showCreateStudentForm && !isProgrammaticUpdate) {
            if (newStudentEmail) performInquiryCheck(newStudentEmail, 'email');
            else if (newStudentFullName) performInquiryCheck(newStudentFullName, 'name');
            else if (newStudentPhone) performInquiryCheck(newStudentPhone, 'phone');
        }
    });

    // Convert raw profile schema to DynamicForm schema format
    let profileFormSchema = $derived(data.profileSchema ? {
        fields: data.profileSchema.map((field: any) => {
            let parsedOptions = undefined;
            if (field.options && Array.isArray(field.options) && field.options.length > 0) {
                parsedOptions = field.options.map((opt: any) => {
                    if (typeof opt === 'string' && opt.includes('|')) {
                        const [val, lbl] = opt.split('|');
                        return { value: val.trim(), label: lbl.trim() };
                    }
                    if (typeof opt === 'object' && opt.value) return opt;
                    return { value: opt, label: opt };
                });
            }

            return {
                key: field.key,
                label: field.label,
                type: field.type,
                required: field.is_required,
                transform: field.force_uppercase ? 'uppercase' : 'none',
                dataSource: parsedOptions ? {
                    type: 'static',
                    options: parsedOptions
                } : undefined,
                col: 12
            };
        })
    } : null);

    // Search state
    let studentSearchTerm = $state('');
    let isStudentListExpanded = $state(false);

    // Reactive: Combined search results (Students + Inquiries)
    let searchResults = $derived.by(() => {
        if (!studentSearchTerm || studentSearchTerm.length < 2) return [];
        const term = studentSearchTerm.toLowerCase();
        
        console.log(`[DEO-SEARCH] data.students count: ${data.students?.length}, term: "${term}"`);
        
        // 1. Existing Students
        const students = data.students
            .filter((s: any) => s.full_name?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term))
            .map((s: any) => ({ ...s, type: 'student' }));

        // 2. Add Inquiry suggestions
        const inquiryMatches = inquirySuggestions
            .filter((s: any) => !students.some((st: any) => st.email === s.email))
            .map((s: any) => ({ ...s, type: 'inquiry' }));

        const result = [...students, ...inquiryMatches];
        console.log(`[DEO-SEARCH] student matches: ${students.length}, inquiry matches: ${inquiryMatches.length}, total: ${result.length}`);
        if (students.length > 0) console.log('[DEO-SEARCH] first match:', students[0]?.full_name, students[0]?.email);
        return result;
    });

    // React to search term changes (instead of inline oninput handler which can conflict with bind:value in Svelte 5)
    $effect(() => {
        if (studentSearchTerm) {
            searchInquiries(studentSearchTerm);
            isStudentListExpanded = true;
        } else {
            inquirySuggestions = [];
        }
    });

    async function handleSelectResult(item: any) {
        if (item.type === 'student') {
            await selectStudent(item);
        } else {
            showCreateStudentForm = true;
            newStudentEmail = item.email;
            newStudentFullName = item.full_name;
            newStudentPhone = item.phone || '';
            isStudentListExpanded = false;
            await performInquiryCheck(item.email, 'email');
            if (matchingInquiry) {
                loadInquiryData();
            }
        }
    }

    async function selectStudent(student: any) {
        console.log('>>> [SELECT-STUDENT] Initializing selection for:', student.email);
        startLoading();
        
        try {
            // 1. Reset states to prevent old data leaks
            loadedStudentProfile = null;
            lastLoadedInquiryData = null; 
            applicationFormData = {}; // Reset form data for clean slate
            
            selectedStudentId = student.id;
            studentSearchTerm = `${student.full_name} (${student.email})`;
            isStudentListExpanded = false;
            
            // 2. Fetch Inquiry Data first ONLY if toggle is ON
            if (isInquiryFormFilled) {
                const inquiryRes = await fetch(`/api/inquiry/check?q=${encodeURIComponent(student.email)}`);
                const inquiryResult = await inquiryRes.json();
                
                if (inquiryResult.found) {
                    console.log('>>> [AUTO-FETCH] Inquiry match found. Buffering data.');
                    lastLoadedInquiryData = {
                        ...(inquiryResult.mappedData || {}),
                        full_name: inquiryResult.fullName,
                        email: inquiryResult.email,
                        contact: inquiryResult.phone,
                        phone: inquiryResult.phone
                    };
                }
            }

            // 3. Fetch Official Profile
            const profileRes = await fetch(`/api/deo/get-student-profile?student_id=${student.id}`);
            if (profileRes.ok) {
                const profileResult = await profileRes.json();
                loadedStudentProfile = profileResult.profile;
            }

            // 4. If a form is already visible, trigger the merge now that BOTH sources are ready
            if (currentAdmissionFormSchema) {
                applicationFormData = mergeProfileData(
                    { ...applicationFormData }, 
                    currentAdmissionFormSchema, 
                    loadedStudentProfile?.profile_data
                );
            }
        } catch (e) {
            console.error('Failed to fully initialize student selection:', e);
        } finally {
            stopLoading();
        }
    }

    function clearStudentSelection() {
        selectedStudentId = '';
        studentSearchTerm = '';
        isStudentListExpanded = true;
        loadedStudentProfile = null;
        lastLoadedInquiryData = null; // Clear inquiry buffer too
        applicationFormData = {}; // Reset form data
        currentApplicationStatus = '';
    }

    // Helper to merge profile and inquiry data into form data based on schema
    function mergeProfileData(formData: any, schema: any, profileData: any = null) {
        console.log('>>> [DIAGNOSTIC] mergeProfileData START');
        if (!schema || !schema.fields) {
            console.warn('>>> mergeProfileData: Missing schema fields. Aborting.');
            return formData;
        }
        
        const merged = { ...formData };
        const inquiryData = lastLoadedInquiryData || {};
        
        // Use global loadedStudentProfile if profileData is not explicitly provided
        const pData = profileData || loadedStudentProfile?.profile_data || {};

        console.log('>>> Available Profile Data:', pData);
        console.log('>>> Available Inquiry Data:', inquiryData);

        // Helper to split full name
        const splitName = (fullName: string) => {
            if (!fullName) return { first: '', middle: '', last: '' };
            const parts = fullName.trim().split(/\s+/);
            if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
            if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
            return { 
                first: parts[0], 
                middle: parts.slice(1, -1).join(' '), 
                last: parts[parts.length - 1] 
            };
        };

        const profileFullName = pData.full_name || pData.name || '';
        const splitP = splitName(profileFullName);

        schema.fields.forEach((field: any) => {
            let val = undefined;
            let source = '';

            // 1. Priority: Official Profile Data
            if (field.profileFieldKey && pData[field.profileFieldKey] !== undefined && pData[field.profileFieldKey] !== '') {
                val = pData[field.profileFieldKey];
                source = 'PROFILE_KEY:' + field.profileFieldKey;
            }
            // 1b. Smart Name Mapping from Profile
            else if (field.key === 'first_name' && splitP.first) { val = splitP.first; source = 'PROFILE_NAME_SPLIT'; }
            else if (field.key === 'middle_name' && splitP.middle) { val = splitP.middle; source = 'PROFILE_NAME_SPLIT'; }
            else if (field.key === 'last_name' && splitP.last) { val = splitP.last; source = 'PROFILE_NAME_SPLIT'; }
            
            // 2. Secondary: Inquiry Data (if profile is empty for this field)
            else if (inquiryData[field.key] !== undefined && inquiryData[field.key] !== '') {
                val = inquiryData[field.key];
                source = 'INQUIRY_DIRECT_KEY:' + field.key;
            }
            else if (field.profileFieldKey && inquiryData[field.profileFieldKey] !== undefined && inquiryData[field.profileFieldKey] !== '') {
                val = inquiryData[field.profileFieldKey];
                source = 'INQUIRY_PROFILE_KEY:' + field.profileFieldKey;
            }
            // 2b. Smart Name Mapping from Inquiry
            else if (inquiryData.full_name) {
                const splitI = splitName(inquiryData.full_name);
                if (field.key === 'first_name' && splitI.first) { val = splitI.first; source = 'INQUIRY_NAME_SPLIT'; }
                else if (field.key === 'middle_name' && splitI.middle) { val = splitI.middle; source = 'INQUIRY_NAME_SPLIT'; }
                else if (field.key === 'last_name' && splitI.last) { val = splitI.last; source = 'INQUIRY_NAME_SPLIT'; }
            }

            // 3. Default value from admission form schema
            if ((val === undefined || val === '') && field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
                val = field.defaultValue;
                source = 'FORM_SCHEMA_DEFAULT';
            }

            if (val !== undefined && val !== null && val !== '') {
                // Fix for Select boxes: ensure merged value matches one of the options (case-insensitive)
                if (field.type === 'select') {
                    // Try to find the options in the field schema
                    let options: any[] = [];
                    if (field.dataSource?.options) options = field.dataSource.options;
                    else if (field.options) options = field.options;

                    if (options.length > 0) {
                        const valStr = String(val).toLowerCase();
                        const match = options.find(opt => {
                            const optVal = typeof opt === 'string' ? opt.split('|')[0].trim() : String(opt.value || opt);
                            return optVal.toLowerCase() === valStr;
                        });

                        if (match) {
                            // Use the EXACT case from the option value to prevent reset
                            val = typeof match === 'string' ? match.split('|')[0].trim() : (match.value || match);
                        }
                    }
                }

                console.log(`>>> MAPPED: Field [${field.key}] from source [${source}] = [${val}]`);
                merged[field.key] = val;
            }
        });
        console.log('>>> [DIAGNOSTIC] mergeProfileData END. New state:', merged);
        return merged;
    }

    $effect(() => {
        console.log('Client-side disableBranchSelection:', data.disableBranchSelection);
    });

    // Property is 'enableBranchSelection'. If missing or false, it's disabled.
    let isBranchSelectionDisabled = $derived(currentAdmissionFormSchema ? !currentAdmissionFormSchema.enableBranchSelection : data.disableBranchSelection);

    // Reactive: Get branches for the selected course
    let branchesForSelectedCourse = $derived(selectedCourseId 
        ? data.courses.find((c: any) => c.id === selectedCourseId)?.branches || []
        : []);

    // Reactive: Reset branch if course changes or if branch selection is disabled
    $effect(() => {
        if (selectedCourseId) {
            if (selectedBranchId && (!branchesForSelectedCourse.some((b: any) => b.id === selectedBranchId) || isBranchSelectionDisabled)) {
                selectedBranchId = '';
            }
        }
    });

    // Reactive: Auto-select active cycle if none selected
    $effect(() => {
        if (!selectedCycleId && data.availableCycles.length > 0) {
            selectedCycleId = data.availableCycles[0].id;
        }
    });

    // Track previous values to prevent duplicate fetches
    let prevCourseId = '';
    let prevCycleId = '';
    let prevFormType = '';
    let prevBranchId = '';

    // Reactive statement to fetch form schema and check for existing application
    $effect(() => {
        if (!selectedStudentId) {
            loadedStudentProfile = null;
        }

        // Only fetch schema if the combination actually changed
        const schemaKey = `${selectedCourseId}|${selectedCycleId}|${selectedFormType}`;
        const prevSchemaKey = `${prevCourseId}|${prevCycleId}|${prevFormType}`;
        
        if (schemaKey !== prevSchemaKey) {
            prevCourseId = selectedCourseId;
            prevCycleId = selectedCycleId;
            prevFormType = selectedFormType;

            // Reset editing flag if user manually changed selections
            if (!isLoadedFromApplicationId) {
                isEditingExistingApplication = false;
            }

            if (selectedCourseId && selectedCycleId && selectedFormType) {
                // If we loaded from applicationId, skip the check since we already have the app data
                if (isLoadedFromApplicationId) {
                    isLoadedFromApplicationId = false; // Reset the flag after first use
                    fetchAdmissionFormSchema(selectedCourseId, selectedCycleId, selectedFormType, true).then(async () => {
                         // Ensure profile data is loaded before merging
                         if (!loadedStudentProfile && selectedStudentId) {
                             await fetchStudentProfile(selectedStudentId);
                         }
                         if (currentAdmissionFormSchema && loadedStudentProfile) {
                              applicationFormData = mergeProfileData(applicationFormData, currentAdmissionFormSchema, loadedStudentProfile.profile_data);
                         }
                    });
                } else {
                    // When user manually changes form type, don't allow fallback
                    loadSchemaAndCheckApp();
                }
            } else {
                currentAdmissionFormSchema = null;
                isSchemaAvailable = true;
                schemaErrorMessage = '';
            }
        }
    });
    
    // Also check application when branch changes manually
    $effect(() => {
        if (selectedBranchId !== prevBranchId) {
             prevBranchId = selectedBranchId;
             if (selectedCourseId && selectedCycleId && selectedFormType && selectedBranchId) {
                  // Only if we already have a schema loaded
                  if (currentAdmissionFormSchema) {
                       checkExistingApplication();
                  }
             }
        }
    });

    async function fetchStudentProfile(studentId: string) {
        try {
            const response = await fetch(`/api/deo/get-student-profile?student_id=${studentId}`);
            if (response.ok) {
                const result = await response.json();
                loadedStudentProfile = result.profile;
                // If we have a form loaded, re-merge
                if (currentAdmissionFormSchema) {
                    applicationFormData = mergeProfileData(applicationFormData, currentAdmissionFormSchema, loadedStudentProfile?.profile_data);
                }
            }
        } catch (e) {
            console.error('Failed to fetch student profile', e);
        }
    }

    async function loadSchemaAndCheckApp() {
        await fetchAdmissionFormSchema(selectedCourseId, selectedCycleId, selectedFormType, isEditingExistingApplication);
        
        // Ensure profile data is loaded before merging (handles case where student was pre-selected via URL, not via search)
        if (!loadedStudentProfile && selectedStudentId) {
            await fetchStudentProfile(selectedStudentId);
        }
        
        // Explicitly pre-fill form data from profile as soon as schema is loaded
        if (currentAdmissionFormSchema && loadedStudentProfile) {
            applicationFormData = mergeProfileData(applicationFormData, currentAdmissionFormSchema, loadedStudentProfile.profile_data);
        }

        // Only check for existing app if we have a student selected AND (branch is selected OR no branches available OR branch selection is disabled)
        if (selectedStudentId && (!branchesForSelectedCourse.length || selectedBranchId || isBranchSelectionDisabled)) {
             await checkExistingApplication();
        }
    }

    async function checkExistingApplication() {
        startLoading();
        
        let query = supabase
            .from('applications')
            .select('id, form_data, branch_id, form_type, status')
            .eq('student_id', selectedStudentId)
            .eq('course_id', selectedCourseId)
            .eq('cycle_id', selectedCycleId)
            .eq('form_type', selectedFormType);

        if (selectedBranchId) {
            query = query.eq('branch_id', selectedBranchId);
        } else {
            query = query.is('branch_id', null);
        }

        const { data: existingApp, error } = await query.maybeSingle();

        if (error) {
            console.error('Error checking for existing application:', error.message);
        } else if (existingApp) {
            console.log('Found existing application:', existingApp.id);
            currentApplicationId = existingApp.id;
            currentApplicationStatus = existingApp.status || '';
            applicationFormData = mergeProfileData(
                existingApp.form_data || {}, 
                currentAdmissionFormSchema, 
                loadedStudentProfile?.profile_data
            );
        } else {
            if (currentApplicationId) {
                currentApplicationId = null;
                currentApplicationStatus = '';
                applicationFormData = {}; // Reset form for new entry
            }
            applicationFormData = mergeProfileData(
                applicationFormData, 
                currentAdmissionFormSchema, 
                loadedStudentProfile?.profile_data
            );
        }
        
        stopLoading();
    }

    async function fetchAdmissionFormSchema(courseId: string, cycleId: string, formType: string, allowFallback: boolean = true) {
        isLoadingSchema = true;
        startLoading();
        const { data: formResult, error } = await supabase
            .from('admission_forms')
            .select('schema_json')
            .eq('course_id', courseId)
            .eq('cycle_id', cycleId)
            .eq('form_type', formType)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching admission form schema:', error.message);
            currentAdmissionFormSchema = null;
            isSchemaAvailable = false;
            schemaErrorMessage = `Error loading form schema: ${error.message}`;
            applicationFormData = {};
        } else if (formResult) {
            currentAdmissionFormSchema = formResult.schema_json;
            isSchemaAvailable = true;
            schemaErrorMessage = '';
        } else {
            if (allowFallback && formType !== 'Provisional') {
                 const { data: defaultForm, error: defaultError } = await supabase
                    .from('admission_forms')
                    .select('schema_json')
                    .eq('course_id', courseId)
                    .eq('cycle_id', cycleId)
                    .eq('form_type', 'Provisional')
                    .limit(1)
                    .maybeSingle();
                
                if (defaultForm) {
                    currentAdmissionFormSchema = defaultForm.schema_json;
                    isSchemaAvailable = true;
                    schemaErrorMessage = '';
                } else {
                    currentAdmissionFormSchema = null;
                    isSchemaAvailable = false;
                    schemaErrorMessage = `No admission form configuration found for <strong>${formType}</strong> or <strong>Provisional</strong> in the selected course/cycle.`;
                    applicationFormData = {};
                }
            } else {
                currentAdmissionFormSchema = null;
                isSchemaAvailable = false;
                schemaErrorMessage = `No admission form configuration found for <strong>${formType}</strong> in the selected course/cycle. Please contact the administrator to create a form for this seat type.`;
                applicationFormData = {};
            }
        }
        isLoadingSchema = false;
        stopLoading();
    }

    async function fetchExistingApplication(appId: string) {
        isLoadingApplication = true;
        applicationLoadError = null;
        
        const { data: application, error } = await supabase
            .from('applications')
            .select('form_data, course_id, cycle_id, branch_id, form_type, admission_type, student_id, status')
            .eq('id', appId)
            .limit(1)
            .maybeSingle();

        if (error) {
            applicationLoadError = `Failed to load application: ${error.message}`;
            isLoadingApplication = false;
            return;
        }
        
        if (!application) {
            applicationLoadError = `Application not found.`;
            isLoadingApplication = false;
            return;
        }
        
        selectedStudentId = application.student_id;
        selectedCourseId = application.course_id;
        selectedCycleId = application.cycle_id;
        selectedBranchId = application.branch_id || '';
        selectedFormType = application.form_type || 'Provisional';
        selectedAdmissionType = application.admission_type || 'Regular';
        applicationFormData = application.form_data || {};
        currentApplicationStatus = application.status || '';
        isLoadedFromApplicationId = true;
        isEditingExistingApplication = true;

        const student = data.students.find((s: any) => s.id === selectedStudentId);
        if (student) {
            studentSearchTerm = `${student.full_name} (${student.email})`;
        }
        isLoadingApplication = false;
    }

    let dynamicForm: DynamicForm;

    async function handleSaveDraft() {
        if (!selectedStudentId) {
            toastStore.error('Please select or create a student first.');
            return false;
        }
        if (branchesForSelectedCourse.length > 0 && !selectedBranchId && !isBranchSelectionDisabled) {
            toastStore.error('Please select a Branch for this course.');
            return false;
        }
        
        const formPayload = new FormData();
        formPayload.append('student_id', selectedStudentId);
        formPayload.append('course_id', selectedCourseId);
        formPayload.append('cycle_id', selectedCycleId);
        formPayload.append('form_type', selectedFormType);
        formPayload.append('admission_type', selectedAdmissionType);
        if (selectedBranchId) formPayload.append('branch_id', selectedBranchId);
        formPayload.append('form_data', JSON.stringify(applicationFormData));
        if (currentApplicationId) formPayload.append('application_id', currentApplicationId);

        try {
            const response = await fetch('?/saveApplication', { method: 'POST', body: formPayload });
            const result = deserialize(await response.text()) as any;
            if (result.type === 'success' && result.data?.success) {
                toastStore.success('Draft saved successfully.');
                if (!currentApplicationId && result.data.applicationId) {
                    await goto(`/deo/apply?studentId=${selectedStudentId}&applicationId=${result.data.applicationId}`, { replaceState: true });
                    currentApplicationId = result.data.applicationId;
                    currentApplicationStatus = 'draft';
                }
                return true;
            } else if (result.type === 'failure') {
                toastStore.error(result.data?.message || 'Failed to save draft.');
                return false;
            }
            return false;
        } catch (e) {
            console.error(e);
            toastStore.error('An error occurred while saving.');
            return false;
        }
    }

    async function handleSubmitApplication() {
        if (!currentApplicationId || !selectedStudentId) {
            toastStore.error('Cannot submit without saving as draft first.');
            return;
        }
        if (dynamicForm && !dynamicForm.validate()) {
            toastStore.error('Please fill in all required fields.');
            return;
        }

        startLoading();
        try {
            const saved = await handleSaveDraft();
            if (!saved) return; // Halt if save failed

            const formPayload = new FormData();
            formPayload.append('student_id', selectedStudentId);
            formPayload.append('application_id', currentApplicationId);

            const response = await fetch('?/submitApplication', { method: 'POST', body: formPayload });
            const result = deserialize(await response.text()) as any;
            if (result.type === 'success' && result.data?.success) {
                if (result.data.feeStatus === 'pending' && result.data.feeAmount > 0) {
                    if (confirm(`Application Submitted. Fee of ₹${result.data.feeAmount} is pending. Record payment now?`)) {
                        currentFeeAmount = result.data.feeAmount;
                        showPaymentModal = true;
                    } else {
                        await goto('/deo/dashboard');
                    }
                } else {
                    toastStore.success('Application submitted successfully!');
                    await goto('/deo/dashboard'); 
                }
            } else if (result.type === 'failure') {
                toastStore.error(result.data?.message || 'Submission failed.');
            }
        } catch (e) {
            console.error(e);
            toastStore.error('An error occurred during submission.');
        } finally {
            stopLoading();
        }
    }

    let showPaymentModal = $state(false);
    let currentFeeAmount = $state(0);
    let paymentMode = $state('cash');
    let transactionRef = $state('');

    async function handleRecordPayment() {
        if (!currentApplicationId) return;
        startLoading();
        const formData = new FormData();
        formData.append('application_id', currentApplicationId);
        formData.append('amount', currentFeeAmount.toString());
        formData.append('payment_mode', paymentMode);
        formData.append('transaction_ref', transactionRef || `OFFLINE-${Date.now()}`);

        try {
            const response = await fetch('?/recordPayment', { method: 'POST', body: formData });
            const result = deserialize(await response.text()) as any;
            stopLoading();

            if (result.type === 'success') {
                toastStore.success('Payment recorded successfully!');
                showPaymentModal = false;
                await goto('/deo/dashboard');
            } else {
                toastStore.error(result.data?.message || 'Failed to record payment.');
            }
        } catch (e) {
            console.error(e);
            stopLoading();
            toastStore.error('An error occurred while recording payment.');
        }
    }

    async function handleDeleteDraft() {
        if (!currentApplicationId) return;
        if (!confirm('Are you sure you want to delete this draft?')) return;

        startLoading();
        const formData = new FormData();
        formData.append('application_id', currentApplicationId);
        
        try {
            const response = await fetch('?/deleteDraft', { method: 'POST', body: formData });
            const result = deserialize(await response.text()) as any;
            stopLoading();

            if (result.type === 'success') {
                toastStore.success('Draft deleted successfully.');
                await goto('/deo/dashboard');
            } else {
                toastStore.error(result.data?.message || 'Failed to delete draft.');
            }
        } catch (e) {
            console.error(e);
            stopLoading();
            toastStore.error('An error occurred while deleting.');
        }
    }

    function openEditProfile() {
        if (!selectedStudentId) return;
        profileFormData = loadedStudentProfile?.profile_data || {};
        showEditProfileModal = true;
    }

    async function handleUpdateProfile() {
        if (profileForm && !profileForm.validate()) {
            toastStore.error('Please fill in all required profile fields.');
            return;
        }

        startLoading();
        const formData = new FormData();
        formData.append('student_id', selectedStudentId);
        formData.append('profile_data', JSON.stringify(profileFormData));

        try {
            const response = await fetch('?/updateStudentProfile', {
                method: 'POST',
                body: formData
            });
            const result = deserialize(await response.text()) as any;
            
            if (result.type === 'success') {
                toastStore.success('Profile updated successfully!');
                showEditProfileModal = false;
                await fetchStudentProfile(selectedStudentId);
            } else {
                toastStore.error(result.data?.message || 'Failed to update profile.');
            }
        } catch (e) {
            console.error(e);
            toastStore.error('An error occurred during profile update.');
        } finally {
            stopLoading();
        }
    }

    function handleStudentCreated(event: any) {
        if (event.detail?.studentId) {
             selectedStudentId = event.detail.studentId;
             showCreateStudentForm = false;
             
             const newStudent = { 
                 id: event.detail.studentId, 
                 full_name: event.detail.full_name || '', 
                 email: event.detail.email || ''
             };
             
             studentSearchTerm = `${newStudent.full_name} (${newStudent.email})`.trim();
             if (studentSearchTerm === '()') studentSearchTerm = '';

             fetchStudentProfile(newStudent.id);
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">DEO: Apply on Behalf</h1>

    {#if applicationLoadError}
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
            <strong>Error:</strong> {applicationLoadError}
            <button type="button" class="btn btn-close" onclick={() => applicationLoadError = null}></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-body">
            <h5 class="card-title">Select or Create Student</h5>
            
            <div class="mb-3 position-relative" bind:this={studentSearchContainer}>
                <label for="student-search" class="form-label">Search Student</label>
                <div class="input-group">
                    <input 
                        type="text" 
                        class="form-control" 
                        id="student-search" 
                        placeholder="Type name or email..." 
                        bind:value={studentSearchTerm}
                        onfocus={() => isStudentListExpanded = true}
                        disabled={!!currentApplicationId || isLoadingApplication}
                        autocomplete="off"
                    />
                    {#if selectedStudentId && !currentApplicationId}
                        <button class="btn btn-outline-secondary" type="button" onclick={clearStudentSelection}>
                            <i class="bi bi-x-lg"></i> Clear
                        </button>
                    {/if}
                </div>
                
                {#if isStudentListExpanded && !selectedStudentId && !currentApplicationId}
                    <div class="list-group position-absolute w-100 shadow" style="z-index: 1000; max-height: 200px; overflow-y: auto;">
                        {#each searchResults as item}
                            <button 
                                type="button" 
                                class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                                onclick={() => handleSelectResult(item)}
                            >
                                <div>
                                    {item.full_name} <small class="text-muted">({item.email})</small>
                                </div>
                                {#if item.type === 'inquiry'}
                                    <span class="badge bg-info text-dark small">From Inquiry</span>
                                {/if}
                            </button>
                        {:else}
                            <div class="list-group-item text-muted">No results found matching "{studentSearchTerm}" (total students: {data.students?.length || 0})</div>
                        {/each}
                    </div>
                {/if}
            </div>
            
            {#if !currentApplicationId}
                <button class="btn btn-secondary" onclick={() => (showCreateStudentForm = !showCreateStudentForm)}>
                    {showCreateStudentForm ? 'Hide Create Student Form' : 'Create New Student'}
                </button>
            {/if}

            {#if showCreateStudentForm && !currentApplicationId}
                <div class="card mt-3 p-3">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="card-subtitle text-muted mb-0">New Student Details</h6>
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="inquiry-toggle-modal" bind:checked={isInquiryFormFilled}>
                            <label class="form-check-label small fw-bold text-primary" for="inquiry-toggle-modal">Is Inquiry Form Filled?</label>
                        </div>
                    </div>

                    {#if matchingInquiry}
                        <div class="alert alert-success d-flex justify-content-between align-items-center py-2 px-3 mb-3">
                            <div class="small">
                                <i class="bi bi-lightbulb-fill me-1"></i>
                                Inquiry found for <strong>{matchingInquiry.fullName}</strong>!
                            </div>
                            <button class="btn btn-sm btn-success" onclick={loadInquiryData}>
                                <i class="bi bi-download me-1"></i> Load Data
                            </button>
                        </div>
                    {/if}

                    <form method="POST" action="?/createStudent" use:enhance={() => { 
                        startLoading();
                        const identityToPreserve = {
                            full_name: newStudentFullName,
                            email: newStudentEmail
                        };

                        return async ({ update, result }) => {
                            if (result.type === 'success' && result.data?.studentId) {
                                const sid = result.data.studentId;
                                handleStudentCreated({ detail: { studentId: sid, ...identityToPreserve } });
                                
                                newStudentFullName = ''; newStudentEmail = ''; newStudentPhone = '';
                                newStudentPassword = ''; newStudentConfirmPassword = '';
                            }
                            await update();
                            stopLoading();
                        };
                    }} id="create-student-form">
                        <div class="row g-3">
                            <div class="col-md-6 mb-3">
                                <label for="new-student-full-name" class="form-label">Full Name</label>
                                <input 
                                    type="text" 
                                    class="form-control" 
                                    id="new-student-full-name" 
                                    name="full_name" 
                                    required 
                                    bind:value={newStudentFullName} 
                                    oninput={(e) => searchInquiries(e.currentTarget.value)}
                                    onchange={(e) => performInquiryCheck(e.currentTarget.value, 'name')}
                                    list="inquiry-datalist"
                                    autocomplete="off"
                                />
                            </div>
                            <div class="col-md-6 mb-3">
                                <label for="new-student-email" class="form-label">Email</label>
                                <input 
                                    type="email" 
                                    class="form-control" 
                                    id="new-student-email" 
                                    name="email" 
                                    required 
                                    bind:value={newStudentEmail} 
                                    oninput={(e) => searchInquiries(e.currentTarget.value)}
                                    onchange={(e) => performInquiryCheck(e.currentTarget.value, 'email')}
                                    list="inquiry-datalist"
                                    autocomplete="off"
                                />
                                <datalist id="inquiry-datalist">
                                    {#each inquirySuggestions as sug}
                                        <option value={sug.email}>{sug.full_name} ({sug.email})</option>
                                        <option value={sug.full_name}>{sug.full_name}</option>
                                    {/each}
                                </datalist>
                            </div>
                            <div class="col-md-12 mb-3">
                                <label for="new-student-phone" class="form-label">Phone Number</label>
                                <input 
                                    type="tel" 
                                    class="form-control" 
                                    id="new-student-phone" 
                                    name="phone" 
                                    bind:value={newStudentPhone} 
                                    oninput={(e) => searchInquiries(e.currentTarget.value)}
                                    onchange={(e) => performInquiryCheck(e.currentTarget.value, 'phone')}
                                    placeholder="Optional mobile number" 
                                />
                            </div>
                        </div>
                        <div class="mb-3">
                            <label for="new-student-password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="new-student-password" name="password" required bind:value={newStudentPassword} />
                        </div>
                        <div class="mb-3">
                            <label for="new-student-confirm-password" class="form-label">Confirm Password</label>
                            <input type="password" class="form-control" id="new-student-confirm-password" name="confirm_password" required bind:value={newStudentConfirmPassword} />
                        </div>
                        <button type="submit" class="btn btn-primary">Create Student</button>
                    </form>
                </div>
            {/if}
        </div>
    </div>

    {#if selectedStudentId}
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="mb-0">Application for: {studentSearchTerm}</h3>
            <button class="btn btn-outline-primary btn-sm" onclick={openEditProfile}>
                <i class="bi bi-person-lines-fill"></i> Edit Student Profile
            </button>
        </div>

        <div class="card mb-4">
            <div class="card-body">
                <h5 class="card-title">Application Details</h5>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label for="course-select" class="form-label">Course</label>
                        <select class="form-select" id="course-select" bind:value={selectedCourseId} disabled={!!currentApplicationId || isLoadingApplication}>
                            <option value="">Select a Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name} ({course.colleges?.name})</option>
                            {/each}
                        </select>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label for="cycle-select" class="form-label">Admission Cycle</label>
                        <select class="form-select" id="cycle-select" bind:value={selectedCycleId} disabled={!!currentApplicationId || isLoadingApplication}>
                            <option value="">Select an Admission Cycle</option>
                            {#each data.availableCycles as cycle}
                                <option value={cycle.id}>{cycle.name} ({cycle.academic_years?.name})</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label for="form-type-select" class="form-label">Form Type</label>
                        <select class="form-select" id="form-type-select" bind:value={selectedFormType} disabled={isEditingExistingApplication}>
                            {#each data.formTypes as ft}
                                <option value={ft.name}>{ft.name}</option>
                            {/each}
                        </select>
                    </div>

                    {#if allowedAdmissionTypes.length > 0}
                        <div class="col-md-6 mb-3">
                            <label for="admission-type-select" class="form-label">Admission Type</label>
                            <select class="form-select" id="admission-type-select" bind:value={selectedAdmissionType} disabled={isEditingExistingApplication}>
                                {#each allowedAdmissionTypes as type}
                                    <option value={type}>{type === 'D2D' ? 'D2D (Diploma to Degree)' : type === 'C2D' ? 'C2D (Certificate to Degree)' : type}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}

                    {#if branchesForSelectedCourse.length > 0 && !isBranchSelectionDisabled}
                        <div class="col-md-6 mb-3">
                            <label for="branch-select" class="form-label">Branch</label>
                            <select class="form-select" id="branch-select" bind:value={selectedBranchId}>
                                <option value="">Select a Branch</option>
                                {#each branchesForSelectedCourse as branch}
                                    <option value={branch.id}>{branch.name} ({getBranchDisplayCode(branch.name, branch.code)})</option>
                                {/each}
                            </select>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        {#if selectedCourseId && selectedCycleId}
            <div class="card">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="card-title mb-0">Application Form ({selectedFormType})</h5>
                        {#if ['verified', 'approved'].includes(currentApplicationStatus)}
                            <div class="d-flex align-items-center gap-3">
                                <span class="badge bg-success text-uppercase">{currentApplicationStatus}</span>
                                <div class="form-check form-switch">
                                    <input 
                                        class="form-check-input" 
                                        type="checkbox" 
                                        id="allow-reupload-switch" 
                                        bind:checked={applicationFormData.allow_reupload}
                                    />
                                    <label class="form-check-label fw-bold text-danger" for="allow-reupload-switch">
                                        Enable Edit & Re-upload
                                    </label>
                                </div>
                            </div>
                        {/if}
                    </div>
                    {#if isLoadingSchema}
                        <div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div></div>
                    {:else if !isSchemaAvailable}
                        <div class="alert alert-warning">{@html schemaErrorMessage}</div>
                    {:else if currentAdmissionFormSchema && currentAdmissionFormSchema.fields && currentAdmissionFormSchema.fields.length > 0}
                        {#key `${currentAdmissionFormSchema.id || selectedCourseId}-${selectedCycleId}-${selectedFormType}`}
                            <DynamicForm 
                                schema={currentAdmissionFormSchema} 
                                bind:formData={applicationFormData} 
                                bind:this={dynamicForm} 
                                readonly={['verified', 'approved'].includes(currentApplicationStatus) && !applicationFormData.allow_reupload}
                            />
                        {/key}
                        <div class="mt-3">
                            <button 
                                class="btn btn-secondary me-2" 
                                onclick={handleSaveDraft}
                                disabled={['verified', 'approved'].includes(currentApplicationStatus) && !applicationFormData.allow_reupload}
                            >
                                Save as Draft
                            </button>
                            <button 
                                class="btn btn-success" 
                                onclick={handleSubmitApplication} 
                                disabled={!currentApplicationId || (['verified', 'approved'].includes(currentApplicationStatus) && !applicationFormData.allow_reupload)}
                            >
                                Submit Application
                            </button>
                            {#if currentApplicationId}
                                <button 
                                    class="btn btn-danger float-end" 
                                    onclick={handleDeleteDraft}
                                    disabled={currentApplicationStatus !== 'draft'}
                                >
                                    Delete Draft
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</div>

<!-- Modals -->
<div class="modal" tabindex="-1" style="display: {showPaymentModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Record Payment</h5>
                <button type="button" class="btn-close" onclick={() => (showPaymentModal = false)}></button>
            </div>
            <div class="modal-body">
                <div class="row">
                    <div class="col-md-6 border-end">
                        <h6 class="text-uppercase text-muted small fw-bold mb-3">Option 1: Offline Payment</h6>
                        <h4 class="text-primary mb-3">Amount: ₹ {currentFeeAmount}</h4>
                        <div class="mb-3">
                            <label class="form-label">Payment Mode</label>
                            <select class="form-select" bind:value={paymentMode}>
                                <option value="cash">Cash</option>
                                <option value="cheque">Cheque</option>
                                <option value="online_transfer">Online Transfer</option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Reference No.</label>
                            <input type="text" class="form-control" bind:value={transactionRef} />
                        </div>
                        <button type="button" class="btn btn-success w-100" onclick={handleRecordPayment} disabled>Record Offline Payment</button>
                    </div>
                    <div class="col-md-6 ps-md-4">
                        <h6 class="text-uppercase text-muted small fw-bold mb-3">Option 2: Online Payment</h6>
                        <p class="text-muted small mb-4">Use the college terminal to process the student's card or UPI payment via the secure gateway.</p>
                        <div class="text-center py-4 bg-light rounded mb-3">
                            <i class="bi bi-shield-check display-4 text-success"></i>
                            <div class="mt-2 fw-bold">PayU Secure Checkout</div>
                        </div>
                        {#if currentApplicationId}
                            <PaymentButton 
                                applicationId={currentApplicationId} 
                                studentId={selectedStudentId} 
                                amount={currentFeeAmount} 
                                paymentType="application_fee" 
                                buttonText="Initiate Online Payment" 
                                buttonClass="btn btn-primary w-100 py-2 fw-bold"
                                returnUrl="/deo/dashboard"
                            />
                        {/if}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-link text-muted" onclick={() => (showPaymentModal = false)}>Cancel & Do Later</button>
            </div>
        </div>
    </div>
</div>

<div class="modal" tabindex="-1" style="display: {showEditProfileModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Student Profile</h5>
                <button type="button" class="btn-close" onclick={() => (showEditProfileModal = false)}></button>
            </div>
            <div class="modal-body">
                {#if profileFormSchema}
                    <DynamicForm schema={profileFormSchema} bind:formData={profileFormData} bind:this={profileForm} />
                {/if}
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" onclick={handleUpdateProfile}>Save Profile</button>
            </div>
        </div>
    </div>
</div>

<style>
    .border-dashed { border-style: dashed !important; }
</style>
