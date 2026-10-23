import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
    const { data: form, error: formError } = await supabase
        .from('inquiry_forms')
        .select('*')
        .eq('slug', params.slug)
        .eq('is_active', true)
        .single();

    if (formError || !form) {
        throw error(404, 'Inquiry form not found');
    }

    const { data: courses } = await supabase
        .from('courses')
        .select('id, name, colleges(name)')
        .order('name');

    const { data: branches } = await supabase
        .from('branches')
        .select('id, name, course_id')
        .order('name');

    return {
        form,
        courses: courses || [],
        branches: branches || []
    };
};

export const actions: Actions = {
    default: async ({ request, params, locals: { supabase } }) => {
        const formData = await request.formData();
        const inquiryDataRaw = formData.get('inquiry_data') as string;
        const preferencesRaw = formData.get('preferences') as string;

        let inquiryData: Record<string, any> = {};
        try {
            inquiryData = JSON.parse(inquiryDataRaw || '{}');
        } catch (e) {
            return fail(400, { message: 'Invalid data format' });
        }

        // 1. Find form schema to identify identity fields
        const { data: form } = await supabase
            .from('inquiry_forms')
            .select('id, academic_year_id, schema_json')
            .eq('slug', params.slug)
            .single();

        if (!form) return fail(404, { message: 'Form not found' });

        // 2. Extract Identity from linked fields
        let email = '';
        let fullName = '';
        let phone = '';
        
        // Name components for assembly
        let nameParts = {
            title: '',
            first: '',
            middle: '',
            last: ''
        };

        if (form.schema_json && form.schema_json.fields) {
            form.schema_json.fields.forEach((field: any) => {
                const val = inquiryData[field.key];
                if (!val) return;

                const keyLower = field.key.toLowerCase();
                const profileKey = field.profileFieldKey;

                // Email
                if (profileKey === 'email' || (!email && keyLower.includes('email'))) {
                    email = val;
                }
                
                // Phone
                if (profileKey === 'phone' || profileKey === 'contact' || (!phone && (keyLower.includes('phone') || keyLower.includes('contact')))) {
                    phone = val;
                }

                // Name Assembly
                if (profileKey === 'full_name' && !fullName) fullName = val;
                
                if (profileKey === 'title' || profileKey === 'salutation' || keyLower === 'title' || keyLower === 'salutation') nameParts.title = val;
                if (profileKey === 'first_name' || keyLower === 'first_name' || keyLower === 'fname') nameParts.first = val;
                if (profileKey === 'middle_name' || keyLower === 'middle_name' || keyLower === 'mname') nameParts.middle = val;
                if (profileKey === 'last_name' || keyLower === 'last_name' || keyLower === 'lname' || keyLower === 'surname') nameParts.last = val;

                // Fallback for single "name" field if not already set
                if (!fullName && !nameParts.first && (keyLower === 'name' || keyLower === 'full_name')) {
                    fullName = val;
                }
            });
        }

        // Combine name parts if full name was not explicitly provided as a single field
        if (!fullName) {
            fullName = [nameParts.title, nameParts.first, nameParts.middle, nameParts.last]
                .filter(Boolean)
                .join(' ')
                .trim();
        }

        if (!email) {
            return fail(400, { message: 'An "Email" field linked to the student profile is required in this form.' });
        }

        // 3. Clean up JSON: Remove fields that are already stored in columns to avoid duplication
        const cleanedInquiryData = { ...inquiryData };
        if (form.schema_json && form.schema_json.fields) {
            form.schema_json.fields.forEach((field: any) => {
                if (['email', 'full_name', 'phone'].includes(field.profileFieldKey)) {
                    delete cleanedInquiryData[field.key];
                }
            });
        }

        // 4. Resolve Academic Year
        let academicYearId = form.academic_year_id;
        
        if (!academicYearId) {
            const { data: activeYear } = await supabase
                .from('academic_years')
                .select('id')
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();
            
            if (activeYear) academicYearId = activeYear.id;
        }

        // 3. Insert Preferences (Priority Choices)
        let preferences = [];
        try {
            preferences = JSON.parse(preferencesRaw || '[]');
        } catch (e) {
            preferences = [];
        }

        // Validate that at least one valid preference exists
        const validPreferences = preferences.filter((p: any) => p.course_id);
        if (validPreferences.length === 0) {
            return fail(400, { message: 'At least one Course Preference is required.' });
        }

        // 5. Insert Inquiry
        const { data: inquiry, error: inquiryError } = await supabase
            .from('inquiries')
            .insert({
                form_id: form.id,
                academic_year_id: academicYearId,
                email,
                full_name: fullName,
                phone,
                inquiry_data: cleanedInquiryData
            })
            .select()
            .single();

        if (inquiryError) {
            console.error('Inquiry Error:', inquiryError);
            return fail(500, { message: 'Failed to save inquiry' });
        }

        const prefsToInsert = validPreferences.map((p: any, index: number) => ({
            inquiry_id: inquiry.id,
            course_id: p.course_id,
            branch_id: p.branch_id || null,
            priority: index + 1
        }));

        const { error: prefsError } = await supabase
            .from('inquiry_preferences')
            .insert(prefsToInsert);

        if (prefsError) {
            console.error('Preferences Error:', prefsError);
            // Non-fatal for the main inquiry, but log it
        }

        return { success: true };
    }
};
