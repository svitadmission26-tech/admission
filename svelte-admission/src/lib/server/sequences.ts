import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generates the next sequence number for a given type (receipt, enrollment, etc.)
 * Handles finding the existing sequence or creating a new one if it doesn't exist.
 */
export async function generateSequence(
    supabase: SupabaseClient, 
    tableName: 'receipt_sequences' | 'enrollment_sequences',
    collegeId: string,
    courseId: string,
    academicYearId: string,
    defaultPrefix: string,
    branchId?: string | null,
    admissionCategory?: string
): Promise<string> {
    
    // Fetch course code for receipt format (only for receipt_sequences)
    let courseCode = '';
    if (tableName === 'receipt_sequences') {
        const { data: courseData } = await supabase
            .from('courses')
            .select('code')
            .eq('id', courseId)
            .single();
        
        if (courseData?.code) {
            courseCode = courseData.code;
        }
    }

    // 1. Try to find existing sequence
    let query = supabase
        .from(tableName)
        .select('id, current_sequence, prefix')
        .eq('college_id', collegeId)
        .eq('course_id', courseId)
        .eq('academic_year_id', academicYearId);

    // Add filters for enrollment-specific fields
    if (tableName === 'enrollment_sequences') {
        if (branchId) {
            query = query.eq('branch_id', branchId);
        } else {
            query = query.is('branch_id', null);
        }
        const category = admissionCategory || 'general';
        query = query.eq('admission_category', category);
    }

    const { data: sequence, error: fetchError } = await query.maybeSingle();

    if (fetchError) {
        console.error(`Error fetching ${tableName}:`, fetchError.message);
        throw new Error(`Failed to fetch sequence for ${tableName}`);
    }

    let sequenceId = sequence?.id;
    let currentSeq = sequence?.current_sequence ?? 0;
    let prefix = sequence?.prefix ?? defaultPrefix;

    if (!sequenceId) {
        // 2. Create if not exists
        const insertData: any = {
            college_id: collegeId,
            course_id: courseId,
            academic_year_id: academicYearId,
            current_sequence: 0,
            prefix: defaultPrefix
        };

        if (tableName === 'enrollment_sequences') {
            insertData.branch_id = branchId || null;
            insertData.admission_category = admissionCategory || 'general';
        }

        const { data: newSeq, error: createError } = await supabase
            .from(tableName)
            .insert(insertData)
            .select()
            .single();
        
        if (createError) {
            console.error(`Error creating ${tableName}:`, createError.message);
            throw new Error(`Failed to create new sequence for ${tableName}`);
        }
        sequenceId = newSeq.id;
        currentSeq = 0;
        prefix = defaultPrefix;
    }

    // 3. Increment
    const nextSeq = currentSeq + 1;
    
    const { error: updateError } = await supabase
        .from(tableName)
        .update({ current_sequence: nextSeq })
        .eq('id', sequenceId);

    if (updateError) {
        console.error(`Error updating ${tableName}:`, updateError.message);
        throw new Error(`Failed to update sequence for ${tableName}`);
    }

    // 4. Format
    // For receipts: PREFIX-YYCOURSECODE-0001, for others: PREFIX-0001
    if (tableName === 'receipt_sequences' && courseCode) {
        // Get academic year shortcode
        const { data: yearData } = await supabase
            .from('academic_years')
            .select('name')
            .eq('id', academicYearId)
            .single();
        
        let yearShort = '';
        if (yearData?.name) {
            const parts = yearData.name.split('-');
            if (parts.length >= 2 && parts[0].length === 4) {
                yearShort = parts[0].slice(-2); // Get last 2 digits of start year
            }
        }
        
        const yearCoursePart = yearShort && courseCode ? `${yearShort}${courseCode}` : (yearShort || courseCode || '');
        return `${prefix}${yearCoursePart ? yearCoursePart + '-' : ''}${nextSeq.toString().padStart(4, '0')}`;
    } else {
        return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    }
}

export async function generateCollegeId(
    supabase: SupabaseClient,
    collegeId: string,
    courseId: string,
    academicYearId: string,
    academicYearCode: string, // e.g., '25'
    courseCode: string,       // e.g., 'BE'
    branchCode: string,       // e.g., 'CE'
    admissionCategoryCode: string, // e.g., 'V'
    branchId?: string | null, // Used for sequence lookup
): Promise<string> {
    const tableName = 'enrollment_sequences';
    
    // 1. Try to find existing sequence
    let query = supabase
        .from(tableName)
        .select('id, current_sequence')
        .eq('college_id', collegeId)
        .eq('course_id', courseId)
        .eq('academic_year_id', academicYearId);

    if (branchId) {
        query = query.eq('branch_id', branchId);
    } else {
        query = query.is('branch_id', null);
    }

    const { data: sequence, error: fetchError } = await query.maybeSingle();

    if (fetchError) {
        console.error(`Error fetching ${tableName}:`, fetchError.message);
        throw new Error(`Failed to fetch sequence for ${tableName}`);
    }

    let sequenceId = sequence?.id;
    let currentSeq = sequence?.current_sequence ?? 0;

    if (!sequenceId) {
        // 2. Create if not exists
        const insertData: any = {
            college_id: collegeId,
            course_id: courseId,
            academic_year_id: academicYearId,
            current_sequence: 0,
            branch_id: branchId || null,
        };

        const { data: newSeq, error: createError } = await supabase
            .from(tableName)
            .insert(insertData)
            .select()
            .single();
        
        if (createError) {
            console.error(`Error creating ${tableName}:`, createError.message);
            throw new Error(`Failed to create new sequence for ${tableName}`);
        }
        sequenceId = newSeq.id;
        currentSeq = 0;
    }

    // 3. Increment
    const nextSeq = currentSeq + 1;
    
    const { error: updateError } = await supabase
        .from(tableName)
        .update({ current_sequence: nextSeq })
        .eq('id', sequenceId);

    if (updateError) {
        console.error(`Error updating ${tableName}:`, updateError.message);
        throw new Error(`Failed to update sequence for ${tableName}`);
    }

    // 4. Format the CollegeID (e.g., 25BECEV001)
    const seqNumPadded = nextSeq.toString().padStart(3, '0'); // 001, 002, ...
    return `${academicYearCode}${courseCode}${branchCode}${admissionCategoryCode}${seqNumPadded}`;
}
