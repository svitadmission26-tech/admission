import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

import { approveApplicationLogic } from "$lib/server/application";

export const load: PageServerLoad = async ({
  url,
  locals: { supabase, getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (
    userProfile?.role !== "college_auth" &&
    userProfile?.role !== "adm_officer"
  ) {
    throw redirect(303, "/login");
  }

  // Use Service Role to bypass RLS
  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  // Admission Officers can see ALL applications regardless of college
  // College Auths can only see applications for their associated college

  // Params
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
  .from("applications")
  .select(
    `
          id, status, form_type, admission_type, submitted_at, updated_at, student_id, course_id, cycle_id, branch_id, form_data, application_fee_status, created_by, updated_by, approval_comment, rejection_reason,
            courses(id, name, colleges(id, name, universities(name))),
            branches(id, name, code),
            admission_cycles(id, name, academic_years(id, name)),
            users!student_id(full_name, email),
            documents(*)
        `,
      { count: "exact" },
    )
    .eq("status", "submitted") // Only pending applications
    .range(offset, offset + limit - 1);

  if (userProfile.role === "college_auth") {
    if (!userProfile.college_id) {
      return {
        applications: [],
        count: 0,
        message: "College authority not associated with a college.",
      };
    }
    query = query.eq("courses.colleges.id", userProfile.college_id);
  }
  // If adm_officer, no filter is applied, so they see all.

  const { data: applications, count, error: appError } = await query;

  if (appError) {
    console.error(
      "Error fetching applications for verification:",
      appError.message,
    );
    return {
      applications: [],
      count: 0,
      message: "Error fetching applications.",
    };
  }

  // Debug logging
  if (applications) {
    // console.log(`Fetched ${applications.length} applications.`);
  }

  // Generate signed URLs for documents in all applications
  if (applications && applications.length > 0) {
    for (const app of applications) {
      if (app.documents && app.documents.length > 0) {
        for (const doc of app.documents) {
          const { data: signedData, error: signedError } =
            await supabaseAdmin.storage
              .from("documents")
              .createSignedUrl(doc.file_path, 3600); // Valid for 1 hour

          if (signedData) {
            doc.signed_url = signedData.signedUrl;
          } else {
            // console.warn(`Failed to sign URL for ${doc.file_path}:`, signedError?.message);
          }
        }
      }
    }
  }

  // Fetch Form Type IDs for frontend filtering
  const { data: formTypesData } = await supabaseAdmin.from("form_types").select("id, name");
  const formTypesMap = Object.fromEntries(formTypesData?.map(ft => [ft.name, ft.id]) || []);

  const { data: printTemplates } = await supabaseAdmin
    .from('report_templates')
    .select('id, name, target_form_type_id, target_academic_year_id, target_course_id')
    .eq('report_type', 'html_profile')
    .contains('allowed_roles', [userProfile?.role]);

  return {
    applications: applications || [],
    count: count || 0,
    page,
    limit,
    message: null,
    printTemplates: printTemplates || [],
    formTypesMap
  };
};

export const actions: Actions = {
  approveDocument: async ({
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
    const document_id = formData.get("document_id") as string;

    const { error } = await supabase
      .from("documents")
      .update({ status: "approved" })
      .eq("id", document_id);

    if (error) {
      console.error("Error approving document:", error.message);
      return fail(500, { message: "Failed to approve document.", error: true });
    }

    return { success: true, message: "Document approved!" };
  },

  rejectDocument: async ({
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
    const document_id = formData.get("document_id") as string;
    const rejection_reason = formData.get("rejection_reason") as string;

    const { error } = await supabase
      .from("documents")
      .update({ status: "rejected", rejection_reason: rejection_reason })
      .eq("id", document_id);

    if (error) {
      console.error("Error rejecting document:", error.message);
      return fail(500, { message: "Failed to reject document.", error: true });
    }

    return { success: true, message: "Document rejected with reason." };
  },

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

    // Fetch application to check form_type
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("form_type, form_types(requires_merit_calculation)")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return fail(404, { message: "Application not found." });
    }

    // Check if merit calculation is required.
    const requiresMerit = application.form_types
      ? Array.isArray(application.form_types)
        ? application.form_types[0]?.requires_merit_calculation
        : application.form_types.requires_merit_calculation
      : true;

    if (!requiresMerit) {
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
      console.log(`[Direct Admission] Triggering auto-approval for ${application_id} (Fee Paid Manual - College Auth)`);
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
        "Direct Admission on Submit (Fee Paid - College Auth Override)"
      );
    }

    return {
      success: true,
      message: "Application fee marked as PAID manually.",
    };
  },
};
