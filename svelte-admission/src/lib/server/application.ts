import { fail } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared logic to approve an application and generate an admission number.
 * Used by University Auth (standard flow) and College Auth (direct approval for ACPC/Provisional).
 */
export async function approveApplicationLogic(
  supabase: SupabaseClient,
  applicationId: string,
  userId: string,
  admissionType: string = "Merit",
  approvalComment: string | null = null,
) {
  // 0. Idempotency Check: Check if already approved/admitted
  const { data: existingAdmission } = await supabase
    .from("account_admissions")
    .select("admission_number")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (existingAdmission) {
    // Ensure application status is consistent
    await supabase
      .from("applications")
      .update({ status: "approved" })
      .eq("id", applicationId);

    return {
      success: true,
      message: `Application already approved. Admission No: ${existingAdmission.admission_number}`,
      admissionNumber: existingAdmission.admission_number,
    };
  }

  // 1. Fetch application details to get course_id, cycle_id for sequence generation
  const { data: application, error: appFetchError } = await supabase
    .from("applications")
    .select(
      `
            course_id, 
            cycle_id, 
            form_type,
            admission_type,
            courses(college_id, code), 
            admission_cycles(
                academic_year_id,
                academic_years(name, short_code)
            )
        `,
    )
    .eq("id", applicationId)
    .single();

  if (appFetchError || !application) {
    console.error(
      "Application not found for approval:",
      appFetchError?.message,
    );
    return { success: false, message: "Application not found.", status: 404 };
  }

  // Fetch Form Type Details (is_prov, code)
  const { data: formTypeDetails } = await supabase
    .from("form_types")
    .select("code, is_prov")
    .eq("name", application.form_type)
    .single();

  // Helper to safely get first element if array
  const first = (val: any) => Array.isArray(val) ? val[0] : val;

  const admissionCycle = first(application.admission_cycles);
  const academicYear = first(admissionCycle?.academic_years);
  const courseDetails = first(application.courses);

  const college_id = courseDetails?.college_id;
  const academic_year_id = admissionCycle?.academic_year_id;
  const course_id = application.course_id;

  if (!college_id || !academic_year_id || !course_id) {
    return {
      success: false,
      message: "Missing application details for admission number generation.",
      status: 500,
    };
  }

  const formTypeCode = formTypeDetails?.code || "ADM"; 
  const isProvisional = formTypeDetails?.is_prov || false;

  // 2. Fetch and Increment Admission Sequence
  const courseCode = courseDetails?.code || "GEN";
  const yearName = academicYear?.name || new Date().getFullYear().toString();
  
  // FIXED: Prioritize short_code, otherwise take last 2 digits of start year
  const yearShort = academicYear?.short_code || yearName.substring(0, 4).slice(-2);
  const prefix = `${formTypeCode}-${yearShort}-${courseCode}-`;

  // Fetch sequence with exact prefix
  let { data: strictSequence } = await supabase
    .from("admission_sequences")
    .select("id, current_sequence")
    .eq("college_id", college_id)
    .eq("course_id", course_id)
    .eq("academic_year_id", academic_year_id)
    .eq("prefix", prefix)
    .maybeSingle();

  // Auto-create sequence if missing
  if (!strictSequence) {
    const { data: newSeq, error: createError } = await supabase
      .from("admission_sequences")
      .insert({
        college_id,
        course_id,
        academic_year_id,
        prefix,
        current_sequence: 0,
      })
      .select()
      .maybeSingle();

    if (createError) {
      console.error(
        "Error creating admission sequence:",
        createError.message,
      );
      
      if (createError.message.includes('duplicate key')) {
          return {
              success: false,
              message: "Database constraint error: Admission sequences are currently restricted to one per course. Please update the unique constraint on admission_sequences to include the prefix.",
              status: 500
          };
      }

      return {
        success: false,
        message: "Failed to create new admission sequence.",
        status: 500,
      };
    }
    strictSequence = newSeq;
  }

  if (!strictSequence) {
      return { success: false, message: "Critical error: Could not retrieve or create admission sequence.", status: 500 };
  }

  const newSequenceNumber = (strictSequence?.current_sequence ?? 0) + 1;
  const admission_number = `${prefix}${newSequenceNumber.toString().padStart(4, "0")}`; 

  const { error: updateSeqError } = await supabase
    .from("admission_sequences")
    .update({ current_sequence: newSequenceNumber })
    .eq("id", strictSequence!.id);

  if (updateSeqError) {
    console.error("Error updating admission sequence:", updateSeqError.message);
    return {
      success: false,
      message: "Failed to update admission sequence.",
      status: 500,
    };
  }

  // 3. Create entry in public.account_admissions
  const { error: accAdmError } = await supabase
    .from("account_admissions")
    .insert({
      application_id: applicationId,
      admission_number: admission_number,
      admission_type: admissionType,
      admission_mode: application.admission_type || "Regular",
      created_by: userId,
      enrollment_status: isProvisional ? "provisional" : "confirmed",
    });

  if (accAdmError) {
    console.error(
      "Error creating account admission entry:",
      accAdmError.message,
    );
    return {
      success: false,
      message: "Failed to create account admission entry.",
      status: 500,
    };
  }

  // 4. Update application status to 'approved'
  const { error: appUpdateError } = await supabase
    .from("applications")
    .update({ status: "approved", approval_comment: approvalComment })
    .eq("id", applicationId);

  if (appUpdateError) {
    console.error("Error updating application status:", appUpdateError.message);
    return {
      success: false,
      message: "Failed to update application status.",
      status: 500,
    };
  }

  // 5. Sync status to Student Profile
  const updatePayload: any = {
    admission_status: "Admitted",
    active_application_id: applicationId,
  };

  const { error: profileUpdateError } = await supabase
    .from("student_profiles")
    .update(updatePayload)
    .eq("user_id", userId);

  if (profileUpdateError) {
    console.error(
      "Error syncing student profile status:",
      profileUpdateError.message,
    );
  }

  return {
    success: true,
    message: `Application approved! Admission No: ${admission_number} (${isProvisional ? "Provisional" : "Confirmed"})`,
    admissionNumber: admission_number,
  };
}
