import { redirect, error, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { approveApplicationLogic } from "$lib/server/application";
import { createFeeReceipt } from "$lib/server/receipt";

export const load: PageServerLoad = async ({
  params,
  locals: { supabase, getSession, userProfile },
}) => {
  const session = await getSession();

  if (!session) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "adm_officer" && userProfile?.role !== "admin") {
    throw redirect(303, "/login");
  }

  const { id } = params;

  // Use Service Role to bypass RLS for fetching details
  // This ensures Adm Officer sees everything even if RLS policies are tricky or broken
  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: application, error: appError } = await supabaseAdmin
    .from("applications")
    .select(
      `
            id, status, form_type, admission_type, submitted_at, updated_at, student_id, course_id, cycle_id, branch_id, form_data, application_fee_status, created_by, updated_by, approval_comment,
            student_user:users!applications_student_id_fkey(id, full_name, email, student_profiles(enrollment_number, admission_status)),
            creator_user:users!applications_created_by_fkey(id, full_name, email),
            updater_user:users!applications_updated_by_fkey(id, full_name, email),
            courses(id, name, code, colleges(id, name, universities(id, name))),
            branches(id, name, code),
            admission_cycles(id, name, academic_years(id, name)),
            payments(*),
            marks(*),
            account_admissions(*),
            form_types(id, name, auto_approve_on_verification)
        `,
    )
    .eq("id", id)
    .single();

  if (appError) {
    console.error("Error fetching application details:", appError.message);
    throw error(500, "Error fetching application details");
  }

  if (!application) {
    throw error(404, "Application not found");
  }

  // Fetch documents separately to ensure no join/RLS weirdness
  const { data: docs, error: docError } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("application_id", id);

  if (docError) {
    console.error("Error fetching documents separately:", docError.message);
  }

  application.documents = docs || [];

  // --- Provisional Branch Fallback logic for single application ---
  if (!application.branches?.name) {
    const { data: formTypesData } = await supabaseAdmin
        .from('form_types')
        .select('name, is_prov');

    const provFormTypes = formTypesData
        ?.filter(ft => ft.is_prov)
        .map(ft => ft.name) || ['Provisional'];

    const { data: provApp } = await supabaseAdmin
        .from('applications')
        .select('branches(name)')
        .eq('student_id', application.student_id)
        .in('form_type', provFormTypes)
        .not('branch_id', 'is', null)
        .limit(1)
        .maybeSingle();

    if (provApp && (provApp.branches as any)?.name) {
        application.prov_branch_name = (provApp.branches as any).name;
    }
  }

  // Debugging: Check if documents are being fetched
  if (application.documents) {
    console.log(
      `[Debug] Application ${id} has ${application.documents.length} documents.`,
    );
  } else {
    console.log(
      `[Debug] Application ${id} has NO documents property (or null).`,
    );
  }

  // Generate signed URLs for documents using Admin client to ensure access
  if (application.documents && application.documents.length > 0) {
    for (const doc of application.documents) {
      const { data: signedData, error: signedError } =
        await supabaseAdmin.storage
          .from("documents")
          .createSignedUrl(doc.file_path, 3600); // Valid for 1 hour

      if (signedData) {
        doc.signed_url = signedData.signedUrl;
      } else {
        console.warn(
          `Failed to sign URL for ${doc.file_path}:`,
          signedError?.message,
        );
      }
    }
  }

  // Fetch form schema to help render form data correctly
  let { data: formSchema } = await supabaseAdmin
    .from("admission_forms")
    .select("schema_json")
    .eq("course_id", application.course_id)
    .eq("cycle_id", application.cycle_id)
    .eq("form_type", application.form_type)
    .maybeSingle();

  // FALLBACK: If no exact match (e.g. historical data with different form_type name), 
  // try to get ANY form for this course/cycle to at least show the fields.
  if (!formSchema) {
    const { data: fallbackForm } = await supabaseAdmin
      .from("admission_forms")
      .select("schema_json")
      .eq("course_id", application.course_id)
      .eq("cycle_id", application.cycle_id)
      .limit(1)
      .maybeSingle();
      
    if (fallbackForm) {
        console.log(`[Debug] Using fallback schema for application ${id}`);
        formSchema = fallbackForm;
    }
  }

  // Fetch lists for Transfer Modal
  const { data: allCourses } = await supabaseAdmin
    .from("courses")
    .select("id, name, code, collegeid_code, branches(id, name, code, collegeid_code)")
    .order("name");

  const { data: allCycles } = await supabaseAdmin
    .from("admission_cycles")
    .select("id, name")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  // Fetch Form Types for Transfer
  const { data: allFormTypes } = await supabaseAdmin
    .from("form_types")
    .select("name")
    .eq("is_active", true)
    .order("name");

  // --- NEW: Fetch Print Profile Templates ---
  const formTypeData = application.form_types
    ? Array.isArray(application.form_types)
      ? application.form_types[0]
      : application.form_types
    : null;

  const { data: printTemplates } = await supabaseAdmin
    .from('report_templates')
    .select('id, name, target_form_type_id, target_academic_year_id, target_course_id')
    .eq('report_type', 'html_profile')
    .contains('allowed_roles', [userProfile?.role]);

  const cycleRaw = application.admission_cycles;
  const cycle = Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw;
  const acYearRaw = cycle?.academic_years;
  const acYear = Array.isArray(acYearRaw) ? acYearRaw[0] : acYearRaw;
  const academicYearId = acYear?.id;

  // Filter templates to match application characteristics
  const filteredTemplates = (printTemplates || []).filter(t => {
      const matchesFormType = !t.target_form_type_id || t.target_form_type_id === formTypeData?.id;
      const matchesAcademicYear = !t.target_academic_year_id || t.target_academic_year_id === academicYearId;
      const matchesCourse = !t.target_course_id || t.target_course_id === application.course_id;
      return matchesFormType && matchesAcademicYear && matchesCourse;
  });

  return {
    application,
    formSchema: formSchema?.schema_json || null,
    allCourses: allCourses || [],
    allCycles: allCycles || [],
    allFormTypes: allFormTypes || [],
    printTemplates: filteredTemplates
  };
};

export const actions: Actions = {
  verifyApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const approval_comment =
      (formData.get("approval_comment") as string) || null;

    // Fetch application to check form_type and its configuration
    // We try to fetch the new flag 'auto_approve_on_verification' if it exists.
    // If not, we fall back to a code-based config.
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select(
        `
                form_type, 
                form_types (
                    requires_merit_calculation,
                    auto_approve_on_verification
                )
            `,
      )
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return fail(404, { message: "Application not found." });
    }

    // Determine Approval Flow
    // 1. Try DB configuration (Priority)
    // 2. Fallback to hardcoded defaults (if DB column missing/migration pending)
    let shouldAutoApprove = false;

    const formTypeData = application.form_types
      ? Array.isArray(application.form_types)
        ? application.form_types[0]
        : application.form_types
      : null;

    if (formTypeData && "auto_approve_on_verification" in formTypeData) {
      shouldAutoApprove = formTypeData.auto_approve_on_verification;
    } else {
      // Fallback Configuration
      const AUTO_APPROVE_DEFAULTS: Record<string, boolean> = {
        Provisional: true,
        ACPC: true,
        "MQ/NRI": false,
        Vacant: false,
        D2D: false,
      };
      shouldAutoApprove = AUTO_APPROVE_DEFAULTS[application.form_type] || false;

      // Legacy fallback: if requires_merit_calculation is FALSE, we used to auto-approve
      // Only apply if form type not in defaults
      if (!(application.form_type in AUTO_APPROVE_DEFAULTS)) {
        const requiresMerit = formTypeData?.requires_merit_calculation ?? true;
        if (!requiresMerit) shouldAutoApprove = true;
      }
    }

    if (shouldAutoApprove) {
      // Direct Approval Logic for specific form types
      // Use Service Role to bypass RLS for Sequence Creation/Increment
      const supabaseAdmin = createClient(
        PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );

      const result = await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        userProfile.id,
        application.form_type,
        approval_comment,
      );

      if (!result.success) {
        return fail(result.status || 500, {
          message: result.message,
          error: true,
        });
      }
      return {
        success: true,
        message: `Application approved directly (Type: ${application.form_type})! Admission No: ${result.admissionNumber}`,
      };
    } else {
      // Standard Flow: Verify and forward to University/Admin
      const { error } = await supabase
        .from("applications")
        .update({ status: "verified", approval_comment })
        .eq("id", application_id);

      if (error) {
        console.error("Error verifying application:", error.message);
        return fail(500, {
          message: "Failed to verify application.",
          error: true,
        });
      }

      // Auto-verify (approve) all associated documents
      const { error: docError } = await supabase
        .from("documents")
        .update({ status: "approved" })
        .eq("application_id", application_id);

      if (docError) {
        console.error("Error auto-approving documents:", docError.message);
      }

      return {
        success: true,
        message:
          "Application verified and forwarded to University Authority. All documents auto-approved.",
      };
    }
  },

  revertVerification: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    // Check current status
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("status")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return fail(404, { message: "Application not found." });
    }

    if (application.status !== "verified") {
      return fail(400, {
        message: 'Can only revert applications that are currently "Verified".',
        error: true,
      });
    }

    const { error } = await supabase
      .from("applications")
      .update({ status: "submitted" }) // Revert to submitted
      .eq("id", application_id);

    if (error) {
      console.error("Error reverting verification:", error.message);
      return fail(500, {
        message: "Failed to revert verification.",
        error: true,
      });
    }

    return {
      success: true,
      message:
        'Verification reverted. Application is now "Submitted" (Unlocked).',
    };
  },

  revertSelfApproval: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // Check current status and form type
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select("status, form_types(auto_approve_on_verification)")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return fail(404, { message: "Application not found." });
    }

    if (application.status !== "approved") {
      return fail(400, {
        message: 'Can only revert applications that are currently "Approved".',
        error: true,
      });
    }

    // Check if form type allows self-approval
    const formTypeData = application.form_types
      ? Array.isArray(application.form_types)
        ? application.form_types[0]
        : application.form_types
      : null;

    const isSelfApproved = formTypeData?.auto_approve_on_verification === true;

    if (!isSelfApproved) {
      return fail(400, {
        message:
          "Cannot revert approval for this application type. Contact University Authority.",
        error: true,
      });
    }

    // Delete from account_admissions to remove admission number
    await supabaseAdmin
      .from("account_admissions")
      .delete()
      .eq("application_id", application_id);

    // Revert status to verified
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({ status: "verified" })
      .eq("id", application_id);

    if (updateError) {
      console.error("Error reverting self-approval:", updateError.message);
      return fail(500, {
        message: "Failed to revert approval.",
        error: true,
      });
    }

    return {
      success: true,
      message: "Approval reverted. Application is now in verification queue.",
    };
  },

  rejectApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const rejection_reason = formData.get("rejection_reason") as string;

    const { error } = await supabase
      .from("applications")
      .update({ status: "rejected", rejection_reason: rejection_reason })
      .eq("id", application_id);

    if (error) {
      console.error("Error rejecting application:", error.message);
      return fail(500, {
        message: "Failed to reject application.",
        error: true,
      });
    }

    return { success: true, message: "Application rejected." };
  },

  revertRejection: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const { error } = await supabaseAdmin
      .from("applications")
      .update({ 
        status: "submitted", 
        rejection_reason: null,
        updated_at: new Date().toISOString(),
        updated_by: userProfile.id
      })
      .eq("id", application_id);

    if (error) {
      console.error("Error reverting rejection:", error.message);
      return fail(500, {
        message: "Failed to revert rejection.",
        error: true,
      });
    }

    return { success: true, message: "Rejection reverted. Application is now back in pending queue." };
  },

  markFeePaid: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const approval_comment =
      (formData.get("approval_comment") as string) || null;

    // Fetch application details to get form fee
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("course_id, cycle_id, form_type, application_fee_status")
      .eq("id", application_id)
      .single();

    if (appError || !application) {
      return fail(404, { message: "Application not found.", error: true });
    }

    if (application.application_fee_status === "paid") {
      return fail(400, { message: "Fee already paid.", error: true });
    }

    // Get form fee amount
    const { data: formDetails } = await supabase
      .from("admission_forms")
      .select("form_fee")
      .eq("course_id", application.course_id)
      .eq("cycle_id", application.cycle_id)
      .eq("form_type", application.form_type)
      .single();

    const amount = formDetails?.form_fee || 0;

    // Use Service Role to bypass RLS for application updates
    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // Record Manual Payment
    const { error: payError } = await supabase.from("payments").insert({
      application_id,
      amount,
      payment_type: "application_fee",
      transaction_id: `MANUAL-${Date.now()}`,
      status: "completed",
      payment_date: new Date().toISOString(),
    });

    if (payError) {
      console.error("Error recording manual payment:", payError.message);
      return fail(500, { message: "Failed to record payment.", error: true });
    }

    // Update status using Service Role to bypass RLS
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({ application_fee_status: "paid", approval_comment })
      .eq("id", application_id);

    if (updateError) {
      console.error("Error updating fee status:", updateError.message);
      return fail(500, {
        message: "Payment recorded but status update failed.",
        error: true,
      });
    }

    // Check for Direct Admission on Payment
    const { data: formTypeCheck } = await supabaseAdmin
      .from("form_types")
      .select("direct_admission_on_submit")
      .eq("name", application.form_type)
      .single();

    if (formTypeCheck?.direct_admission_on_submit) {
      console.log(`[Direct Admission] Triggering auto-approval for ${application_id} (Fee Paid Manual)`);
      const { data: appData } = await supabaseAdmin
        .from("applications")
        .select("admission_type")
        .eq("id", application_id)
        .single();

      await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        authenticatedUser.id,
        appData?.admission_type || "Merit",
        "Direct Admission on Submit (Fee Paid - Manual Override)"
      );
    }

    return {
      success: true,
      message: "Application fee marked as PAID manually.",
    };
  },

  updatePayment: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["adm_officer", "admin"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const payment_id = formData.get("payment_id") as string;
    const receipt_number = ((formData.get("receipt_number") as string) || "").trim();
    const payment_date = (formData.get("payment_date") as string) || "";

    if (!payment_id) {
      return fail(400, {
        message: "Payment ID is required to update payment details.",
        error: true,
      });
    }

    if (!receipt_number) {
      return fail(400, {
        message: "Receipt number is required.",
        error: true,
      });
    }

    if (!payment_date) {
      return fail(400, {
        message: "Payment date is required.",
        error: true,
      });
    }

    const parsedDate = new Date(payment_date);
    if (Number.isNaN(parsedDate.getTime())) {
      return fail(400, {
        message: "Payment date must be a valid date.",
        error: true,
      });
    }

    if (parsedDate.getTime() > Date.now()) {
      return fail(400, {
        message: "Payment date cannot be in the future.",
        error: true,
      });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // First, get the application details for this payment to determine course and academic year
    const { data: paymentData, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select(`
        id,
        applications!inner (
          course_id,
          admission_cycles!inner (academic_year_id)
        )
      `)
      .eq("id", payment_id)
      .single();

    if (paymentError || !paymentData) {
      console.error("Error fetching payment application data:", paymentError?.message);
      return fail(500, {
        message: "Error retrieving payment information.",
        error: true,
      });
    }

    const course_id = paymentData.applications.course_id;
    const academic_year_id = paymentData.applications.admission_cycles.academic_year_id;

    // Check receipt number uniqueness within the same course-academic year pair
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("payments")
      .select(`
        id,
        applications!inner (
          course_id,
          admission_cycles!inner (academic_year_id)
        )
      `)
      .eq("receipt_number", receipt_number)
      .neq("id", payment_id)
      .eq("applications.course_id", course_id)
      .eq("applications.admission_cycles.academic_year_id", academic_year_id)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking receipt number uniqueness:", existingError.message);
      return fail(500, {
        message: "Error validating receipt number.",
        error: true,
      });
    }

    if (existing) {
      return fail(400, {
        message:
          "Another payment in the same course and academic year already uses this receipt number. Please use a unique receipt number within this course-year combination.",
        error: true,
      });
    }

    const { data: payment, error: paymentFetchError } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("id", payment_id)
      .single();

    if (paymentFetchError || !payment) {
      return fail(404, { message: "Payment not found.", error: true });
    }

    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        receipt_number,
        payment_date: parsedDate.toISOString(),
      })
      .eq("id", payment_id);

    if (updateError) {
      console.error("Error updating payment:", updateError.message);
      return fail(500, {
        message: "Failed to update payment details.",
        error: true,
      });
    }

    return {
      success: true,
      message: "Payment receipt number and date updated successfully.",
    };
  },

  cancelAdmission: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const reason = formData.get("reason") as string;

    if (!application_id || !reason) {
      return fail(400, {
        message: "Application ID and reason are required.",
        error: true,
      });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // 1. Fetch Current State for history
    const { data: appData, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select("student_id, course_id, branch_id")
      .eq("id", application_id)
      .single();

    if (fetchError || !appData) {
      return fail(404, { message: "Application not found.", error: true });
    }

    const { data: profile } = await supabaseAdmin
        .from("student_profiles")
        .select("enrollment_number")
        .eq("user_id", appData.student_id)
        .single();

    // 2. Perform Updates in "Transaction" (Manual sequence)
    
    // a. Record History
    await supabaseAdmin
      .from("student_transfer_history")
      .insert({
        application_id: application_id,
        previous_course_id: appData.course_id,
        previous_branch_id: appData.branch_id,
        previous_enrollment_number: profile?.enrollment_number,
        new_enrollment_number: null, // Indicates cancellation
        transferred_by: userProfile.id,
      });

    // b. Revoke Enrollment Number & Update Status (Student Profile)
    const { error: profileError } = await supabaseAdmin
      .from("student_profiles")
      .update({ 
        enrollment_number: null,
        admission_status: 'Cancelled'
      })
      .eq("user_id", appData.student_id);

    if (profileError) {
      console.error("Error clearing enrollment number:", profileError.message);
    }

    // c. Flag Account Admission as Cancelled (Do not delete, so original admission number is preserved)
    await supabaseAdmin
      .from("account_admissions")
      .update({
        remarks: `Cancelled: ${reason}`
      })
      .eq("application_id", application_id);

    // d. Update Application Status
    const { error: appUpdateError } = await supabaseAdmin
      .from("applications")
      .update({
        status: "cancelled",
        rejection_reason: `Cancelled: ${reason}`,
      })
      .eq("id", application_id);

    if (appUpdateError) {
      console.error("Error cancelling application:", appUpdateError.message);
      return fail(500, {
        message: "Failed to update application status.",
        error: true,
      });
    }

    return { success: true, message: "Admission cancelled successfully." };
  },

  transferStudent: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["college_auth", "adm_officer"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const new_course_id = formData.get("new_course_id") as string;
    const new_cycle_id = formData.get("new_cycle_id") as string;
    const new_form_type = formData.get("new_form_type") as string;
    const new_branch_id = (formData.get("new_branch_id") as string) || null; // Can be null
    const enrollment_prefix_letter = formData.get(
      "enrollment_prefix_letter",
    ) as string; // New: Prefix Letter

    if (
      !application_id ||
      !new_course_id ||
      !new_cycle_id ||
      !new_form_type ||
      !enrollment_prefix_letter
    ) {
      return fail(400, {
        message: "Missing required transfer details.",
        error: true,
      });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // 1. Fetch Target Details & Check Vacancy
    const { data: courseData } = await supabaseAdmin
      .from("courses")
      .select("intake_capacity, code, collegeid_code, college_id, branches(id, code, collegeid_code)")
      .eq("id", new_course_id)
      .single();

    if (!courseData) {
      return fail(404, { message: "Target course not found.", error: true });
    }

    // Simple Vacancy Check (Optimistic)
    const { count: admittedCount } = await supabaseAdmin
      .from("applications")
      .select("id", { count: 'exact', head: true })
      .eq("course_id", new_course_id)
      .eq("cycle_id", new_cycle_id)
      .eq("status", "approved");

    const capacity = courseData.intake_capacity || 0;
    const currentAdmitted = admittedCount || 0;

    if (capacity > 0 && currentAdmitted >= capacity) {
        return fail(400, { 
            message: `No vacancy in target course. Capacity: ${capacity}, Admitted: ${currentAdmitted}`,
            error: true 
        });
    }

    // 2. Fetch Current Application & Profile
    const { data: currentApp, error: appFetchError } = await supabaseAdmin
      .from("applications")
      .select("*, admission_type")
      .eq("id", application_id)
      .single();

    if (appFetchError || !currentApp) {
      return fail(404, { message: "Application not found.", error: true });
    }

    const admissionType = currentApp.admission_type || 'Regular';

    const { data: studentProfile } = await supabaseAdmin
      .from("student_profiles")
      .select("enrollment_number, profile_data")
      .eq("user_id", currentApp.student_id)
      .maybeSingle();

    // 3. Fetch Target Schema & Merge Form Data
    const { data: targetForm } = await supabaseAdmin
      .from("admission_forms")
      .select("schema_json")
      .eq("course_id", new_course_id)
      .eq("cycle_id", new_cycle_id)
      .eq("form_type", new_form_type)
      .maybeSingle();

    const targetSchema = targetForm?.schema_json;
    let newFormData = { ...currentApp.form_data };
    if (targetSchema && targetSchema.fields && studentProfile?.profile_data) {
      const profileData = studentProfile.profile_data;
      targetSchema.fields.forEach((field: any) => {
        let val = undefined;
        if (field.profileFieldKey && profileData[field.profileFieldKey] !== undefined) {
          val = profileData[field.profileFieldKey];
        } else if (profileData[field.key] !== undefined) {
          val = profileData[field.key];
        }
        if (val !== undefined && val !== null && val !== "") {
          newFormData[field.key] = val;
        }
      });
    }

    // 4. Generate New Enrollment Number
    const { data: cycleData } = await supabaseAdmin
      .from("admission_cycles")
      .select("academic_year_id, academic_years(name)")
      .eq("id", new_cycle_id)
      .single();

    if (!cycleData) {
      return fail(500, { message: "Failed to fetch cycle details.", error: true });
    }

    let branchCode = "";
    if (new_branch_id && courseData.branches) {
      const b = (courseData.branches as any[]).find((b: any) => b.id === new_branch_id);
      if (b) branchCode = b.collegeid_code || "";
    }

    const courseCode = courseData.collegeid_code || courseData.code || "CRS";
    const yearName = cycleData.academic_years?.name || "2025";
    const yearStart = yearName.substring(0, 4).slice(-2);

    // Format: YY + Course + Branch + Prefix Letter
    const prefix = `${yearStart}${courseCode}${branchCode}${enrollment_prefix_letter}`;

    // Fetch/Increment Sequence
    let { data: sequence } = await supabaseAdmin
      .from("admission_sequences")
      .select("id, current_sequence")
      .eq("college_id", courseData.college_id)
      .eq("course_id", new_course_id)
      .eq("academic_year_id", cycleData.academic_year_id)
      .eq("prefix", prefix)
      .maybeSingle();

    if (!sequence) {
      const { data: newSeq } = await supabaseAdmin
        .from("admission_sequences")
        .insert({
          college_id: courseData.college_id,
          course_id: new_course_id,
          academic_year_id: cycleData.academic_year_id,
          prefix: prefix,
          current_sequence: 0,
        })
        .select()
        .single();
      sequence = newSeq;
    }

    const newSequenceNumber = (sequence?.current_sequence ?? 0) + 1;
    let newEnrollmentNumber = `${prefix}${newSequenceNumber.toString().padStart(3, "0")}`;
    
    // Apply D2D/C2D prefix logic
    if (admissionType === 'D2D' || admissionType === 'C2D') {
        newEnrollmentNumber = `2${newEnrollmentNumber}`;
    }

    // 5. Update All Records (Manual Transaction)
    
    // a. Update Sequence
    if (sequence) {
      await supabaseAdmin
        .from("admission_sequences")
        .update({ current_sequence: newSequenceNumber })
        .eq("id", sequence.id);
    }

    // b. Record History
    const { error: histError } = await supabaseAdmin
      .from("student_transfer_history")
      .insert({
        application_id: application_id,
        previous_course_id: currentApp.course_id,
        previous_branch_id: currentApp.branch_id,
        previous_enrollment_number: studentProfile?.enrollment_number,
        new_enrollment_number: newEnrollmentNumber,
        transferred_by: userProfile.id,
      });

    if (histError) {
      console.error("History insert error:", histError);
      return fail(500, { message: "Failed to record transfer history.", error: true });
    }

    // c. Update Student Profile
    await supabaseAdmin
      .from("student_profiles")
      .update({ enrollment_number: newEnrollmentNumber })
      .eq("user_id", currentApp.student_id);

    // d. Update Application & Revert Status to 'verified' for fee review
    const { error: appUpdateError } = await supabaseAdmin
      .from("applications")
      .update({
        course_id: new_course_id,
        cycle_id: new_cycle_id,
        branch_id: new_branch_id,
        form_type: new_form_type,
        form_data: newFormData,
        status: "verified", // Re-verify to ensure fee collection review
        approval_comment: `Transferred from ${currentApp.course_id}. Needs fee review.`
      })
      .eq("id", application_id);

    // e. Remove old account admission (optional, but clean)
    await supabaseAdmin
      .from("account_admissions")
      .delete()
      .eq("application_id", application_id);

    if (appUpdateError) {
      return fail(500, { message: "Failed to update application details.", error: true });
    }

    return {
      success: true,
      message: `Student transferred successfully! New Enrollment ID: ${newEnrollmentNumber}. Status reverted to 'verified' for fee review.`,
    };
  },

  saveFormData: async ({
    params,
    request,
    locals: { getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["adm_officer", "admin"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const { id } = params;
    const formData = await request.formData();
    const updatedDataRaw = formData.get("form_data") as string;

    if (!updatedDataRaw) {
      return fail(400, { message: "No data provided." });
    }

    let updatedData = {};
    try {
      updatedData = JSON.parse(updatedDataRaw);
    } catch (e) {
      return fail(400, { message: "Invalid JSON data." });
    }

    // Use Service Role to ensure we can update even if user permissions are tight
    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        form_data: updatedData,
        updated_at: new Date().toISOString(),
        updated_by: userProfile.id,
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error saving application data:", updateError.message);
      return fail(500, { message: "Failed to save application data." });
    }

    return {
      success: true,
      message: "Application data updated successfully.",
    };
  },

  markAppFeePaid: async ({
    params,
    locals: { getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      !["adm_officer", "admin"].includes(userProfile?.role || "")
    ) {
      throw redirect(303, "/login");
    }

    const { id: application_id } = params;

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // 1. Fetch application to get fee amount and IDs for receipt
    const { data: app, error: appError } = await supabaseAdmin
      .from("applications")
      .select("student_id, course_id, cycle_id, form_type, admission_type, application_fee_status, courses(college_id), admission_cycles(academic_year_id)")
      .eq("id", application_id)
      .single();

    if (appError || !app) {
      return fail(404, { message: "Application not found." });
    }

    if (app.application_fee_status === "paid") {
      return { success: true, message: "Fee already marked as paid." };
    }

    // 2. Fetch fee amount from admission_forms
    const { data: form } = await supabaseAdmin
      .from("admission_forms")
      .select("form_fee")
      .eq("course_id", app.course_id)
      .eq("cycle_id", app.cycle_id)
      .eq("form_type", app.form_type)
      .maybeSingle();

    const amount = form?.form_fee || 0;
    const gateway_transaction_id = `MANUAL-${Date.now()}`;

    // 3. Record payment in transactions table
    const { data: transaction, error: payError } = await supabaseAdmin
      .from("transactions")
      .insert({
        student_id: app.student_id, // Use student_id from application
        application_id,
        amount,
        currency: 'INR',
        status: "success",
        gateway_transaction_id: gateway_transaction_id,
        gateway_response: { manual_override_by: userProfile.id }
      })
      .select()
      .single();

    if (payError || !transaction) {
      console.error("Error recording manual payment:", payError?.message);
      return fail(500, { message: "Failed to record payment." });
    }

    // 4. Generate sequential receipt (APP-)
    let yearName = undefined;
    const academicYearId = (app.admission_cycles as any)?.academic_year_id;
    if (academicYearId) {
        const { data: ay } = await supabaseAdmin.from('academic_years').select('name').eq('id', academicYearId).single();
        yearName = ay?.name;
    }

    const receipt = await createFeeReceipt(supabaseAdmin, {
        transactionId: transaction.id,
        studentId: app.student_id,
        applicationId: application_id,
        amount: amount,
        details: { manual_override_by: userProfile.id },
        generatedBy: userProfile.id,
        paymentType: 'application_fee',
        formType: app.form_type, // Added formType
        admissionType: app.admission_type, // Added admissionType
        academicYearId: academicYearId,
        yearName: yearName,
        collegeId: (app.courses as any)?.college_id,
        courseId: app.course_id
    });

    // 5. Record in `payments` table for dashboard visibility
    await supabaseAdmin.from('payments').insert({
        application_id: application_id,
        amount: amount,
        transaction_id: transaction.id,
        receipt_number: receipt.receipt_no,
        status: 'completed',
        payment_type: 'application_fee',
        payment_date: new Date().toISOString(),
        payment_breakdown: [{ mode: 'cash', amount: amount, ref: gateway_transaction_id }]
    });

    // 6. Update application status
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({ application_fee_status: "paid" })
      .eq("id", application_id);

    if (updateError) {
      console.error("Error updating application fee status:", updateError.message);
      return fail(500, { message: "Failed to update fee status." });
    }

    return {
      success: true,
      message: "Application fee marked as paid successfully.",
    };
  },

  undoManualPayment: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'adm_officer' && userProfile?.role !== 'admin') {
      return fail(403, { message: 'Unauthorized. Only admin officers can undo payments.' });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const formData = await request.formData();
    const application_id = formData.get('application_id') as string;

    if (!application_id) {
      return fail(400, { message: 'Application ID is required.' });
    }

    try {
      // 1. Find and delete the manually recorded transaction
      const { data: transactions, error: fetchError } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('application_id', application_id)
        .not('gateway_response->manual_override_by', 'is', null);

      if (fetchError) {
        console.error('Error fetching manual transaction:', fetchError.message);
        return fail(500, { message: 'Failed to fetch transaction records.' });
      }

      // Delete the manual payment record(s)
      if (transactions && transactions.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from('transactions')
          .delete()
          .in('id', (transactions as any[]).map((t: any) => t.id));

        if (deleteError) {
          console.error('Error deleting manual transaction:', deleteError.message);
          return fail(500, { message: 'Failed to delete transaction record.' });
        }
      }

      // 2. Reset application_fee_status to pending
      const { error: updateError } = await supabaseAdmin
        .from('applications')
        .update({ application_fee_status: 'pending' })
        .eq('id', application_id);

      if (updateError) {
        console.error('Error resetting application fee status:', updateError.message);
        return fail(500, { message: 'Failed to reset fee status.' });
      }

      return {
        success: true,
        message: 'Manual payment successfully undone. Fee status reset to pending.',
      };
    } catch (err) {
      console.error('Exception in undoManualPayment:', err);
      return fail(500, { message: 'An unexpected error occurred while undoing payment.' });
    }
  },

  resetAppFeeStatus: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'adm_officer' && userProfile?.role !== 'admin') {
      return fail(403, { message: 'Unauthorized. Only admin officers can reset fee status.' });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const formData = await request.formData();
    const application_id = formData.get('application_id') as string;

    if (!application_id) {
      return fail(400, { message: 'Application ID is required.' });
    }

    try {
      // 1. Fetch application and admission form to check if fees are required
      const { data: app, error: appError } = await supabaseAdmin
        .from('applications')
        .select('id, course_id, cycle_id, form_type, application_fee_status')
        .eq('id', application_id)
        .single();

      if (appError || !app) {
        return fail(404, { message: 'Application not found.' });
      }

      // 2. Check if this application requires fees
      const { data: form, error: formError } = await supabaseAdmin
        .from('admission_forms')
        .select('form_fee')
        .eq('course_id', app.course_id)
        .eq('cycle_id', app.cycle_id)
        .eq('form_type', app.form_type)
        .maybeSingle();

      if (formError) {
        console.error('Error fetching admission form:', formError.message);
        return fail(500, { message: 'Failed to check fee requirements.' });
      }

      const formFee = form?.form_fee || 0;

      if (formFee === 0) {
        return fail(400, { message: 'This application does not require application fees.' });
      }

      // 3. Reset application_fee_status to pending
      const { error: updateError } = await supabaseAdmin
        .from('applications')
        .update({ application_fee_status: 'pending' })
        .eq('id', application_id);

      if (updateError) {
        console.error('Error resetting application fee status:', updateError.message);
        return fail(500, { message: 'Failed to reset fee status.' });
      }

      return {
        success: true,
        message: `Application fee status reset to pending (Amount: ₹${formFee})`,
      };
    } catch (err) {
      console.error('Exception in resetAppFeeStatus:', err);
      return fail(500, { message: 'An unexpected error occurred while resetting fee status.' });
    }
  },

  recoverAdmission: async ({
    request,
    locals: { getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'adm_officer' && userProfile?.role !== 'admin') {
      return fail(403, { message: 'Unauthorized. Only admission officers can recover admissions.' });
    }

    const formData = await request.formData();
    const application_id = formData.get('application_id') as string;

    if (!application_id) {
      return fail(400, { message: 'Application ID is required.' });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    try {
      // 1. Fetch application details
      const { data: appData, error: fetchError } = await supabaseAdmin
        .from('applications')
        .select('*, courses(college_id, code)')
        .eq('id', application_id)
        .single();

      if (fetchError || !appData) {
        console.error('Error fetching application:', fetchError?.message);
        return fail(404, { message: 'Application not found.' });
      }

      // 2. Fetch the previous enrollment number from student_transfer_history
      const { data: history, error: histError } = await supabaseAdmin
        .from('student_transfer_history')
        .select('previous_enrollment_number')
        .eq('application_id', application_id)
        .not('previous_enrollment_number', 'is', null)
        .order('transfer_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (histError) {
        console.error('Error fetching transfer history:', histError.message);
        return fail(500, { message: 'Failed to retrieve transfer history.' });
      }

      const previousEnrollmentNumber = history?.previous_enrollment_number;
      if (!previousEnrollmentNumber) {
        return fail(400, {
          message: 'Could not find a previous enrollment number (College ID) for this student in history.',
        });
      }

      // 3. Reconstruct the original Admission Number
      // Extract sequence number from previous enrollment number (last 3 digits)
      const seqStr = previousEnrollmentNumber.slice(-3);
      const seqNum = parseInt(seqStr, 10);
      if (Number.isNaN(seqNum)) {
        return fail(400, {
          message: `Failed to parse sequence number from previous College ID: ${previousEnrollmentNumber}`,
        });
      }

      // Fetch Form Type Details
      const { data: formTypeDetails } = await supabaseAdmin
        .from('form_types')
        .select('code, is_prov')
        .eq('name', appData.form_type)
        .single();

      const formTypeCode = formTypeDetails?.code || 'ADM';
      const isProvisional = formTypeDetails?.is_prov || false;

      // Fetch Cycle/Academic Year details
      const { data: cycleData } = await supabaseAdmin
        .from('admission_cycles')
        .select('academic_year_id, academic_years(name, short_code)')
        .eq('id', appData.cycle_id)
        .single();

      const firstCycleData = Array.isArray(cycleData) ? cycleData[0] : cycleData;
      const academicYear = firstCycleData?.academic_years;
      const yearName = academicYear?.name || new Date().getFullYear().toString();
      const yearShort = academicYear?.short_code || yearName.substring(0, 4).slice(-2);
      const courseCode = appData.courses?.code || 'GEN';

      const admissionPrefix = `${formTypeCode}-${yearShort}-${courseCode}-`;
      let reconstructedAdmissionNumber = `${admissionPrefix}${seqNum.toString().padStart(4, '0')}`;

      // Resolves uniqueness conflicts by checking active admissions and finding the first available sequence gap
      const { data: activeAdmissions, error: activeErr } = await supabaseAdmin
        .from('account_admissions')
        .select('admission_number')
        .ilike('admission_number', `${admissionPrefix}%`);

      if (activeErr) {
        console.error('Error fetching active admissions:', activeErr.message);
      } else if (activeAdmissions && activeAdmissions.length > 0) {
        const activeSet = new Set(activeAdmissions.map(a => a.admission_number));
        let tempSeq = seqNum;
        while (true) {
          const candidate = `${admissionPrefix}${tempSeq.toString().padStart(4, '0')}`;
          if (!activeSet.has(candidate)) {
            reconstructedAdmissionNumber = candidate;
            break;
          }
          tempSeq++;
        }
      }

      // 4. Update student profile
      const { error: profileError } = await supabaseAdmin
        .from('student_profiles')
        .update({
          enrollment_number: previousEnrollmentNumber,
          admission_status: 'Admitted',
          active_application_id: application_id,
        })
        .eq('user_id', appData.student_id);

      if (profileError) {
        console.error('Error restoring enrollment number:', profileError.message);
        return fail(500, { message: 'Failed to restore College ID.' });
      }

      // Restore college affiliation in users
      await supabaseAdmin
        .from('users')
        .update({ college_id: appData.courses?.college_id })
        .eq('id', appData.student_id);

      // 5. Restore or Re-create account_admissions entry
      const { data: existingAA } = await supabaseAdmin
        .from('account_admissions')
        .select('id, admission_number')
        .eq('application_id', application_id)
        .maybeSingle();

      let accAdmError = null;
      let restoredAdmissionNumber = reconstructedAdmissionNumber;

      if (existingAA) {
        restoredAdmissionNumber = existingAA.admission_number;
        // If it exists (flagged as cancelled in remarks), simply clear the remarks cancellation flag
        const { error } = await supabaseAdmin
          .from('account_admissions')
          .update({
            remarks: null,
            enrollment_status: isProvisional ? 'provisional' : 'confirmed'
          })
          .eq('application_id', application_id);
        accAdmError = error;
      } else {
        // If it does not exist (legacy cancelled cases like Nistha Suthar/Jagtap where it was deleted), insert it back
        const { error } = await supabaseAdmin
          .from('account_admissions')
          .insert({
            application_id: application_id,
            admission_number: reconstructedAdmissionNumber,
            admission_type: appData.form_type,
            admission_mode: appData.admission_type || 'Regular',
            created_by: userProfile.id,
            enrollment_status: isProvisional ? 'provisional' : 'confirmed',
          });
        accAdmError = error;
      }

      if (accAdmError) {
        console.error('Error restoring account admission entry:', accAdmError.message);
        // Rollback profile status
        await supabaseAdmin
          .from('student_profiles')
          .update({ enrollment_number: null, admission_status: 'Cancelled' })
          .eq('user_id', appData.student_id);

        return fail(500, { message: 'Failed to restore Admission Number. It may already be in use.' });
      }

      // 6. Restore application status to 'approved' and clear rejection reason
      const { error: appUpdateError } = await supabaseAdmin
        .from('applications')
        .update({
          status: 'approved',
          rejection_reason: null,
          updated_at: new Date().toISOString(),
          updated_by: userProfile.id,
          approval_comment: `Admission recovered. Original College ID (${previousEnrollmentNumber}) and Admission Number (${restoredAdmissionNumber}) restored.`,
        })
        .eq('id', application_id);

      if (appUpdateError) {
        console.error('Error recovering application status:', appUpdateError.message);
        return fail(500, { message: 'Failed to update application status.' });
      }

      // Log recovery in history
      await supabaseAdmin
        .from('student_transfer_history')
        .insert({
          application_id: application_id,
          previous_course_id: appData.course_id,
          previous_branch_id: appData.branch_id,
          previous_enrollment_number: null,
          new_enrollment_number: previousEnrollmentNumber,
          transferred_by: userProfile.id,
        });

      return {
        success: true,
        message: `Admission successfully recovered! College ID: ${previousEnrollmentNumber}, Admission No: ${restoredAdmissionNumber}`,
      };
    } catch (err) {
      console.error('Exception in recoverAdmission:', err);
      return fail(500, { message: 'An unexpected error occurred while recovering admission.' });
    }
  },
};
