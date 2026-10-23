const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // 1. Find BBA Course
    const { data: courses } = await supabase
        .from('courses')
        .select('id, name, college_id')
        .ilike('name', 'Bachelor of Business Administration');
    
    console.log('BBA Courses:', courses);

    if (!courses || courses.length === 0) return;

    for (const course of courses) {
        console.log(`\n--- Auditing Course: ${course.name} (ID: ${course.id}) ---`);
        
        // 2. Fetch Apps
        const { data: apps, error } = await supabase
            .from('applications')
            .select(`
                id, 
                status, 
                branch_id, 
                student_id, 
                admission_cycles(academic_year_id), 
                account_admissions(admission_number)
            `)
            .eq('course_id', course.id)
            .neq('status', 'draft');

        if (error) {
            console.error(error);
            continue;
        }

        console.log(`Total Non-Draft Apps: ${apps.length}`);

        const admitted = apps.filter(app => {
            const hasAdmissionNumber = !!(Array.isArray(app.account_admissions) 
                ? app.account_admissions[0]?.admission_number 
                : app.account_admissions?.admission_number);
            return hasAdmissionNumber;
        });

        console.log(`Admitted (ID Gen) Count: ${admitted.length}`);

        if (admitted.length > 0) {
            console.log('Sample Admitted App Details:');
            const sample = admitted[0];
            console.log(` - App ID: ${sample.id}`);
            console.log(` - Branch ID: ${sample.branch_id}`);
            console.log(` - Status: ${sample.status}`);
            console.log(` - Year ID: ${sample.admission_cycles?.academic_year_id}`);
        }

        // 3. Check Branches
        const { data: branches } = await supabase
            .from('branches')
            .select('id, name')
            .eq('course_id', course.id);
        
        console.log('Branches in this course:', branches.length);
        branches.forEach(b => console.log(` - ${b.name} (ID: ${b.id})`));
    }
}

run();
