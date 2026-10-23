import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generates a sequential College ID (Enrollment Number) for a student.
 * Format: [YY][CourseAlias][BranchAlias][CategoryChar][SEQ]
 * Example: 26BECEA001
 */
export async function generateEnrollmentNumber(
    supabase: SupabaseClient,
    collegeId: string,
    courseId: string,
    academicYearId: string,
    branchId: string | null = null,
    formType: string = 'MQ/NRI',
    categoryAliasOverride?: string,
    admissionType: string = 'Regular'
): Promise<string> {
    
    const sanitizedBranchId = (branchId && typeof branchId === 'string' && branchId.trim() !== '' && branchId !== 'null' && branchId !== 'undefined') ? branchId.trim() : null;

    // 1. Fetch required metadata
    const { data: ayData } = await supabase
        .from('academic_years')
        .select('short_code, name')
        .eq('id', academicYearId)
        .single();
    
    const { data: courseData } = await supabase
        .from('courses')
        .select('code, collegeid_code')
        .eq('id', courseId)
        .single();

    let branchCode = '';
    if (sanitizedBranchId) {
        const { data: branchData } = await supabase
            .from('branches')
            .select('code, collegeid_code')
            .eq('id', sanitizedBranchId)
            .maybeSingle();
        branchCode = branchData?.collegeid_code || '';
    }
    
    const yearShort = ayData?.short_code || ayData?.name.substring(0, 4).slice(-2) || new Date().getFullYear().toString().slice(-2);
    const courseAlias = courseData?.collegeid_code || courseData?.code || 'GEN';
    
    const categoryMap: Record<string, string> = {
        'ACPC': 'A',
        'MQ/NRI': 'M',
        'Provisional': 'P',
        'Vacant': 'V',
        'D2D': 'D'
    };
    
    let categoryChar = '';
    if (categoryAliasOverride) {
        categoryChar = categoryAliasOverride.trim().toUpperCase().charAt(0);
    } else {
        categoryChar = categoryMap[formType] || formType.trim().toUpperCase().charAt(0);
    }

    // The sequence tracking still happens per college/course/year/branch
    const sequencePrefix = `${yearShort}${courseAlias}${branchCode}${categoryChar}`;

    // 2. Fetch or Create Enrollment Sequence
    let query = supabase
        .from('enrollment_sequences')
        .select('id, current_sequence')
        .eq('college_id', collegeId)
        .eq('course_id', courseId)
        .eq('academic_year_id', academicYearId);

    if (sanitizedBranchId) {
        query = query.eq('branch_id', sanitizedBranchId);
    } else {
        query = query.is('branch_id', null);
    }

    query = query.eq('admission_type', admissionType || 'Regular');

    let { data: sequence, error } = await query.maybeSingle();

    if (!sequence) {
        const { data: newSeq, error: createError } = await supabase
            .from('enrollment_sequences')
            .insert({
                college_id: collegeId,
                course_id: courseId,
                academic_year_id: academicYearId,
                branch_id: sanitizedBranchId,
                admission_type: admissionType || 'Regular',
                prefix: sequencePrefix, // Store the new format prefix
                current_sequence: 0
            })
            .select()
            .single();
        
        if (createError) {
            console.error('Error creating enrollment sequence:', createError);
            throw new Error('Failed to create enrollment sequence');
        }
        sequence = newSeq;
    }

    if (!sequence) {
        throw new Error('Enrollment sequence could not be found or created.');
    }

    // 3. Increment Sequence
    const newSeqNum = (sequence.current_sequence || 0) + 1;
    const { error: updateError } = await supabase
        .from('enrollment_sequences')
        .update({ 
            current_sequence: newSeqNum,
            prefix: sequencePrefix // Update prefix in case it changed
        })
        .eq('id', sequence.id);

    if (updateError) {
        console.error('Error updating enrollment sequence:', updateError);
        throw new Error('Failed to increment enrollment sequence');
    }

    // 4. Return formatted number: [YY][Course][Branch][Category][001]
    const baseEnrollment = `${yearShort}${courseAlias}${branchCode}${categoryChar}${newSeqNum.toString().padStart(3, '0')}`;
    
    // If D2D or C2D, prepend '2' as per requirement
    if (admissionType === 'D2D' || admissionType === 'C2D') {
        return `2${baseEnrollment}`;
    }
    
    return baseEnrollment;
}

/**
 * Assigns a College ID (Enrollment Number) to a student if they don't already have one.
 * Typically called after a tuition fee payment is recorded.
 */
export async function ensureStudentEnrolled(
    supabase: SupabaseClient,
    applicationId: string,
    categoryAliasOverride?: string
) {
    // 1. Fetch application and student details
    const { data: app, error: appError } = await supabase
        .from('applications')
        .select(`
            id, 
            student_id, 
            course_id, 
            branch_id, 
            cycle_id,
            form_type,
            admission_type,
            admission_cycles(academic_year_id),
            courses(college_id)
        `)
        .eq('id', applicationId)
        .single();

    if (appError || !app) return;

    // 2. Check if student already has an enrollment number
    const { data: profile } = await supabase
        .from('student_profiles')
        .select('enrollment_number')
        .eq('user_id', app.student_id)
        .single();

    if (profile?.enrollment_number) return;

    // 3. Generate and Assign
    const collegeId = (app.courses as any)?.college_id;
    const academicYearId = (app.admission_cycles as any)?.academic_year_id;

    if (!collegeId || !academicYearId) return;

    try {
        const enrollmentNumber = await generateEnrollmentNumber(
            supabase,
            collegeId,
            app.course_id,
            academicYearId,
            app.branch_id,
            app.form_type,
            categoryAliasOverride,
            app.admission_type || 'Regular'
        );

        // Update student profile and official college affiliation in users table
        await supabase
            .from('student_profiles')
            .update({ 
                enrollment_number: enrollmentNumber,
                admission_status: 'Admitted'
            })
            .eq('user_id', app.student_id);

        await supabase
            .from('users')
            .update({ college_id: collegeId })
            .eq('id', app.student_id);
            
        console.log(`Assigned College ID ${enrollmentNumber} to Student ${app.student_id}`);
    } catch (e) {
        console.error('Failed to auto-enroll student:', e);
    }
}
