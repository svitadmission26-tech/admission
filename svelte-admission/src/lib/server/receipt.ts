import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generates a sequential receipt number based on payment type and optional academic year.
 * Format: PREFIX-YYCOURSECODE-0001 (e.g., PROV-26BE-0001)
 */
export async function generateReceiptNumber(
    supabase: SupabaseClient, 
    paymentType: string, 
    academicYearId: string,
    collegeId: string,
    courseId: string,
    yearName?: string, // e.g. "2025-2026" for formatting
    shortCode?: string, // New optional parameter
    formType?: string, // Added formType for conditional prefixing
    admissionType?: string // Added admissionType
): Promise<string> {
    // 1. Fetch Metadata (Academic Year and Course)
    const { data: ayData } = await supabase
        .from('academic_years')
        .select('short_code, name')
        .eq('id', academicYearId)
        .single();

    const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('code')
        .eq('id', courseId)
        .single();

    let courseCode = courseData?.code || '';
    if (courseError) console.warn('Error fetching course code:', courseError.message);

    // Determine Academic Year Shortcode
    let academicYearShortcode = ayData?.short_code || '';
    if (!academicYearShortcode && yearName) {
        const parts = yearName.split('-');
        if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
            academicYearShortcode = `${parts[0].slice(-2)}-${parts[1].slice(-2)}`;
        } else if (parts.length === 1 && parts[0].length === 4) {
            academicYearShortcode = parts[0].slice(-2);
        } else {
            academicYearShortcode = yearName;
        }
    }

    // Force non-tuition/non-admission fees to use the generic 'Regular' sequence
    const targetAdmissionType = (paymentType === 'tuition_fee') 
        ? (admissionType || 'Regular') 
        : 'Regular';

    // 2. Determine Default Prefix (for creation if missing)
    let defaultPrefix = 'REC-';
    switch (paymentType) {
        case 'provisional_fee': defaultPrefix = 'PROV-'; break;
        case 'application_fee': 
            defaultPrefix = (formType === 'MQ/NRI') ? 'MQ-' : 'APP-';
            break;
        case 'tuition_fee': 
            if (targetAdmissionType && targetAdmissionType !== 'Regular') {
                if (targetAdmissionType === 'D2D') {
                    defaultPrefix = 'TD-';
                } else if (targetAdmissionType === 'C2D') {
                    defaultPrefix = 'TC-';
                } else {
                    defaultPrefix = `T${targetAdmissionType.toUpperCase().slice(0, 2)}-`;
                }
            } else {
                defaultPrefix = 'TUIT-';
            }
            break;
        default: defaultPrefix = 'GEN-';
    }

    // 3. Fetch Sequence
    let { data: sequence, error: fetchError } = await supabase
        .from('receipt_sequences')
        .select('id, current_sequence, prefix')
        .eq('college_id', collegeId)
        .eq('course_id', courseId)
        .eq('academic_year_id', academicYearId)
        .eq('payment_type', paymentType)
        .eq('admission_type', targetAdmissionType)
        .maybeSingle();

    // 4. Create if missing
    if (!sequence) {
        const { data: newSeq, error: createError } = await supabase
            .from('receipt_sequences')
            .insert({
                college_id: collegeId,
                course_id: courseId,
                academic_year_id: academicYearId,
                payment_type: paymentType,
                admission_type: targetAdmissionType,
                prefix: defaultPrefix,
                current_sequence: 0
            })
            .select()
            .single();
        
        if (createError || !newSeq) {
            console.error('Error creating receipt sequence:', createError || 'No data returned');
            return `REC-${Date.now()}`;
        }
        sequence = newSeq;
    }

    if (!sequence) {
        console.error('Receipt sequence is null after creation attempt');
        return `REC-${Date.now()}`;
    }

    // 5. Increment
    const newSeqNum = (sequence.current_sequence || 0) + 1;
    const { error: updateError } = await supabase
        .from('receipt_sequences')
        .update({ current_sequence: newSeqNum })
        .eq('id', sequence.id);

    if (updateError) {
        console.error('Error updating receipt sequence:', updateError);
        return `REC-${Date.now()}`;
    }

    // 6. Final Format using Sequence Prefix
    const prefix = sequence.prefix || defaultPrefix;
    const yearCoursePart = academicYearShortcode && courseCode ? 
        `${academicYearShortcode}${courseCode}` : 
        (academicYearShortcode || courseCode || '');
    
    return `${prefix}${yearCoursePart ? yearCoursePart + '-' : ''}${newSeqNum.toString().padStart(4, '0')}`;
}

export interface ReceiptCreationParams {
    transactionId: string;
    studentId: string;
    applicationId?: string;
    amount: number;
    details?: any; // JSONB generic metadata
    paymentBreakdown?: any[]; // JSONB detailed payment modes
    feeComponentsBreakdown?: any[]; // JSONB fee sections/items
    generatedBy?: string; // User ID
    paymentType?: string; // e.g. 'tuition_fee', 'application_fee'
    formType?: string; // Added formType
    academicYearId?: string;
    yearName?: string;
    collegeId?: string;
    courseId?: string;
    admissionType?: string; // Added admissionType
}

export async function createFeeReceipt(
    supabase: SupabaseClient,
    params: ReceiptCreationParams
) {
    // 1. Generate Receipt Number
    const receiptNo = await generateReceiptNumber(
        supabase,
        params.paymentType || 'tuition_fee',
        params.academicYearId!,
        params.collegeId!,
        params.courseId!,
        params.yearName,
        undefined, // shortCode
        params.formType,
        params.admissionType // Forward admissionType
    );

    // Prepare composite details object for the receipt record
    const compositeDetails = {
        ...(params.details || {}),
        payment_breakdown: params.paymentBreakdown || [],
        fee_components_breakdown: params.feeComponentsBreakdown || [],
        payment_type: params.paymentType || 'tuition_fee'
    };

    // 2. Create Receipt Record
    const insertResult = await supabase
        .from('fee_receipts')
        .insert({
            receipt_no: receiptNo,
            transaction_id: params.transactionId,
            application_id: params.applicationId,
            student_id: params.studentId,
            amount: params.amount,
            details: compositeDetails,
            generated_by: params.generatedBy
        })
        .select()
        .single();

    let receipt = insertResult.data;
    let error = insertResult.error;

    if (error) {
        const errCode = error.code || '';
        const errMsg = error.message || '';
        const errDetail = error.details || '';
        const isDuplicate = errCode === '23505' && 
            (errMsg.includes('receipt_no') || errDetail.includes('receipt_no') || errMsg.includes('receipt_no_key') || errDetail.includes('receipt_no_key'));
        
        if (isDuplicate) {
            console.warn(`[createFeeReceipt] Duplicate receipt_no ${receiptNo} detected (code 23505). Renaming existing receipt to ${receiptNo}-DUP to make room.`);
            
            // 1. Rename the existing receipt in the database
            const { error: renameError } = await supabase
                .from('fee_receipts')
                .update({ receipt_no: `${receiptNo}-DUP` })
                .eq('receipt_no', receiptNo);
                
            if (renameError) {
                console.error(`Failed to rename conflicting receipt ${receiptNo}:`, renameError);
                throw new Error('Failed to generate receipt record: conflict resolution failed: ' + renameError.message);
            }
            
            // 2. Retry inserting the new receipt record with the original receiptNo
            const retryResult = await supabase
                .from('fee_receipts')
                .insert({
                    receipt_no: receiptNo,
                    transaction_id: params.transactionId,
                    application_id: params.applicationId,
                    student_id: params.studentId,
                    amount: params.amount,
                    details: compositeDetails,
                    generated_by: params.generatedBy
                })
                .select()
                .single();
                
            if (retryResult.error) {
                console.error('Failed to insert new receipt after renaming conflict:', retryResult.error);
                throw new Error('Failed to generate receipt record after conflict resolution: ' + retryResult.error.message);
            }
            
            return retryResult.data;
        }

        console.error('Error creating fee receipt:', error);
        throw new Error('Failed to generate receipt record: ' + (error.message || 'Unknown database error'));
    }

    return receipt;
}
