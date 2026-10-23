import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  url,
  locals: { supabase, getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (
    userProfile?.role !== "univ_auth" &&
    userProfile?.role !== "university_auth"
  ) {
    throw redirect(303, "/login"); // Redirect non-university_auth users
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const search = url.searchParams.get("search") || "";
  const activeTab = url.searchParams.get("tab") || "verified";
  const sortField = url.searchParams.get("sort") || "merit_rank";
  const sortOrder = url.searchParams.get("order") || "asc";
  const offset = (page - 1) * limit;
  const courseId = url.searchParams.get("course_id") || "";
  const branchId = url.searchParams.get("branch_id") || "";

  let formTypeFilter = url.searchParams.get("form_type");

  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1. Get Applications for this university using Service Role and inner joins to flatten query waterfall
  if (!userProfile.university_id) {
    return { applications: [], count: 0, page, limit, search, activeTab, formTypeFilter };
  }

  // Build query using Service Role and filter using nested inner joins
  let query = supabaseAdmin
    .from("applications")
    .select(
      `
             id, status, form_type, admission_type, submitted_at, updated_at, student_id, course_id, cycle_id, branch_id, form_data, application_fee_status, created_by, updated_by, approval_comment, rejection_reason,
             courses!inner(id, name, branches(id, name, code, collegeid_code), colleges!inner(id, name, university_id, universities(name))),
             branches(id, name, code),
             admission_cycles(id, name, academic_years(id, name)),
             users!student_id!inner(full_name, email),
             documents(*),
             merit_list_entries(merit_score, merit_rank)
         `,
      { count: "exact" },
    )
    .eq("courses.colleges.university_id", userProfile.university_id);

  // Status Filter
  if (activeTab === "verified") {
    query = query.eq("status", "verified");
  } else if (activeTab === "approved") {
    query = query.eq("status", "approved");
  }

  // Form Type Filter (Support 'all', case-insensitive, and compound types like MQ/NRI)
  if (formTypeFilter && formTypeFilter.toLowerCase() !== "all" && formTypeFilter.trim() !== "") {
    if (formTypeFilter.includes("/")) {
      const types = formTypeFilter.split("/").map((t) => t.trim());
      query = query.in("form_type", [...types, formTypeFilter]);
    } else {
      query = query.ilike("form_type", formTypeFilter);
    }
  }

  // Course & Branch Filters
  if (courseId && courseId !== "all") {
    query = query.eq("course_id", courseId);
  }
  if (branchId && branchId !== "all") {
    query = query.eq("branch_id", branchId);
  }

  // Search Filter
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, {
      foreignTable: "users",
    });
  }

  // Pagination & Sort
  if (sortField === "merit_rank") {
    query = query
      .order("merit_list_entries(merit_rank)", { ascending: sortOrder === "asc", nullsFirst: false })
      .order("submitted_at", { ascending: false });
  } else {
    query = query.order(sortField, { ascending: sortOrder === "asc" });
  }
  query = query.range(offset, offset + limit - 1);

  // Fetch applications, form types (including is_prov), templates, courses, and branches concurrently using Promise.all
  const [appResult, formTypesResult, printTemplatesResult, coursesResult, branchesResult] = await Promise.all([
    query,
    supabaseAdmin.from("form_types").select("id, name, is_prov"),
    supabaseAdmin
      .from('report_templates')
      .select('id, name, target_form_type_id, target_academic_year_id, target_course_id')
      .eq('report_type', 'html_profile')
      .contains('allowed_roles', [userProfile?.role]),
    supabaseAdmin
      .from("courses")
      .select("id, name, code, colleges!inner(id, university_id)")
      .eq("colleges.university_id", userProfile.university_id)
      .order("name"),
    supabaseAdmin
      .from("branches")
      .select("id, name, code, course_id")
      .order("name")
  ]);

  const { data: applications, count, error: appError } = appResult;
  const formTypesData = formTypesResult.data;
  const printTemplates = printTemplatesResult.data;
  const coursesData = coursesResult.data;
  const branchesData = branchesResult.data;

  if (appError) {
    console.error(
      "Error fetching applications for university auth:",
      appError.message,
    );
    return {
      applications: [],
      message: "Error fetching applications.",
      count: 0,
      page,
      limit,
      search,
      activeTab,
      formTypeFilter,
    };
  }

  // --- Provisional Branch Fallback logic ---
  if (applications && applications.length > 0) {
    const studentIdsMissingBranch = applications
        .filter(app => !app.branches?.name)
        .map(app => app.student_id);

    if (studentIdsMissingBranch.length > 0) {
        // Reuse formTypesData from parallel fetch to identify provisional types
        const provFormTypes = formTypesData
            ?.filter(ft => ft.is_prov)
            .map(ft => ft.name) || ['Provisional'];

        const { data: provApps } = await supabaseAdmin
            .from('applications')
            .select('student_id, branches(name)')
            .in('student_id', studentIdsMissingBranch)
            .in('form_type', provFormTypes)
            .not('branch_id', 'is', null);

        if (provApps && provApps.length > 0) {
            const provBranchMap = new Map();
            provApps.forEach(pa => {
                const branchName = (pa.branches as any)?.name;
                if (branchName) {
                    provBranchMap.set(pa.student_id, branchName);
                }
            });

            applications.forEach(app => {
                if (!app.branches?.name) {
                    const provBranchName = provBranchMap.get(app.student_id);
                    if (provBranchName) {
                        (app as any).prov_branch_name = provBranchName;
                    }
                }
            });
        }
    }
  }

  // NOTE: Document URLs are now signed client-side on-demand to improve loading speed.

  // Build form types map from parallel fetch results
  const formTypesMap = Object.fromEntries(formTypesData?.map(ft => [ft.name, ft.id]) || []);

  return {
    applications: applications || [],
    count: count || 0,
    page,
    limit,
    search,
    activeTab,
    sortField,
    sortOrder,
    formTypeFilter,
    message: null,
    printTemplates: printTemplates || [],
    formTypesMap,
    courses: coursesData || [],
    branches: branchesData || [],
    courseId,
    branchId
  };
};

import { approveApplicationLogic } from "$lib/server/application";

export const actions: Actions = {
  approveApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    try {
      const authenticatedUser = await getAuthenticatedUser();
      if (
        !authenticatedUser ||
        (userProfile?.role !== "univ_auth" &&
          userProfile?.role !== "university_auth")
      ) {
        throw redirect(303, "/login");
      }

      const supabaseAdmin = createClient(
        PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );

      const formData = await request.formData();
      const application_id = formData.get("application_id") as string;
      const branch_id = formData.get("branch_id") as string;
      const approval_comment =
        (formData.get("approval_comment") as string) || null;

      // If a branch is selected (e.g. for MQ/NRI), update the application first
      // We MUST also set status to 'approved' here to satisfy the RLS policy which restricts updates to status changes
      if (branch_id) {
        const { error: branchUpdateError } = await supabaseAdmin
          .from("applications")
          .update({ branch_id, status: "approved", approval_comment })
          .eq("id", application_id);

        if (branchUpdateError) {
          console.error(
            "Error updating branch/status for application:",
            branchUpdateError.message,
          );
          return fail(500, {
            message:
              "Failed to update branch selection. " + branchUpdateError.message,
            error: true,
          });
        }
      } else if (approval_comment) {
        // Update approval_comment even without branch change using Service Role to bypass RLS
        const { error: commentError } = await supabaseAdmin
          .from("applications")
          .update({ approval_comment })
          .eq("id", application_id);

        if (commentError) {
          console.error(
            "Error updating approval comment:",
            commentError.message,
          );
        }
      }

      const result = await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        userProfile.id,
        "Merit",
        approval_comment,
      );

      if (!result.success) {
        return fail(result.status || 500, {
          message: result.message,
          error: true,
        });
      }

      return { success: true, message: result.message };
    } catch (e: any) {
      console.error("Exception in approveApplication:", e);
      // Handle redirect separately as it throws
      if (e.status === 303 || e.status === 307) {
        throw e;
      }
      return fail(500, {
        message: "Internal Server Error: " + (e.message || e),
        error: true,
      });
    }
  },

  revertApproval: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      (userProfile?.role !== "univ_auth" &&
        userProfile?.role !== "university_auth")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    // Check status
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("status")
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

    // Cleanup: Delete from account_admissions first (to remove generated admission number)
    const { error: deleteAdmError } = await supabase
      .from("account_admissions")
      .delete()
      .eq("application_id", application_id);

    if (deleteAdmError) {
      console.error(
        "Error deleting account admission:",
        deleteAdmError.message,
      );
      // We might continue if it doesn't exist, but it's risky. Let's log and proceed.
    }

    // Revert status to verified
    const { error } = await supabase
      .from("applications")
      .update({ status: "verified" })
      .eq("id", application_id);

    if (error) {
      console.error("Error reverting approval:", error.message);
      return fail(500, { message: "Failed to revert approval.", error: true });
    }

    return {
      success: true,
      message:
        'Approval reverted. Application is now "Verified" and back in queue.',
    };
  },

  waitlistApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      (userProfile?.role !== "univ_auth" &&
        userProfile?.role !== "university_auth")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const approval_comment =
      (formData.get("approval_comment") as string) || null;

    // Update application status to 'waitlisted'
    const { error } = await supabase
      .from("applications")
      .update({ status: "waitlisted", approval_comment })
      .eq("id", application_id);

    if (error) {
      console.error("Error waitlisting application:", error.message);
      return fail(500, {
        message: "Failed to waitlist application.",
        error: true,
      });
    }

    return { success: true, message: "Application waitlisted." };
  },

  rejectApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (
      !authenticatedUser ||
      (userProfile?.role !== "univ_auth" &&
        userProfile?.role !== "university_auth")
    ) {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const rejection_reason = formData.get("rejection_reason") as string;

    // Update application status to 'rejected' and save rejection reason
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
};
