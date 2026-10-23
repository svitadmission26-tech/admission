const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const applicationId = 'b6083c46-9523-42c3-9d5b-db9d16cb2c49';

function getNestedValue(obj, path) {
    if (!obj || !path) return null;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        const cleanPart = part.replace(/^\[|\]$/g, '').trim();
        if (!cleanPart) continue;
        const keys = Object.keys(current);
        const key = keys.find(k => k.toLowerCase() === cleanPart.toLowerCase());
        if (key !== undefined) {
            current = current[key];
        } else {
            return null;
        }
    }
    return current;
}

async function testDataFetching() {
    console.log('--- STARTING TEST ---');
    try {
        let { data: appData, error: appError } = await supabaseAdmin
            .from('applications')
            .select(`
                *,
                course:courses(*, college:colleges(*, university:universities(*))),
                admission_cycles(*, academic_years(*)),
                student:users!applications_student_id_fkey(id, full_name, email, student_profiles(*)),
                marks(*),
                account_admissions(*),
                payments(*)
            `)
            .eq('id', applicationId)
            .single();

        const studentUser = appData.student;
        const profileObj = Array.isArray(studentUser?.student_profiles) ? studentUser.student_profiles[0] : studentUser?.student_profiles;
        const profileData = (profileObj?.profile_data && typeof profileObj.profile_data === 'object') ? profileObj.profile_data : {};
        const formData = (appData.form_data && typeof appData.form_data === 'object') ? appData.form_data : {};

        const studentObj = {
            full_name: studentUser?.full_name || 'N/A',
            ...profileData
        };

        const flatData = {
            student: studentObj,
            course: appData.course,
            application: {
                ...appData,
                form_data: formData,
                ...formData,
                student: studentObj,
                course: appData.course
            }
        };

        Object.keys(studentObj).forEach(k => { if (!flatData[k]) flatData[k] = studentObj[k]; });
        Object.keys(formData).forEach(k => { if (!flatData[k]) flatData[k] = formData[k]; });

        console.log('Test Paths:');
        const testPaths = [
            'student.full_name',
            'student.contact_number',
            'application.form_type',
            'course.college.logo_url',
            'course.college.name',
            'course.college.code',
            'course.college.address',
            'application.contact_number',
            'application.acpc_application_number',
            'application.acpc_merit',
            'application.ssc',
            'application.hsc'
        ];

        testPaths.forEach(path => {
            const val = getNestedValue(flatData, path);
            if (val === null) {
                console.log(` - ${path}: MISSING`);
            } else if (typeof val === 'object' && val !== null && 'value' in val) {
                console.log(` - ${path}: ${val.value} (from object)`);
            } else if (typeof val === 'object') {
                console.log(` - ${path}: [object Object] (no value)`);
            } else {
                console.log(` - ${path}: ${val}`);
            }
        });

    } catch (e) {
        console.error('Fatal:', e.message);
    }
}

testDataFetching();