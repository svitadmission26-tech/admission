import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { generateReceiptNumber } from "$lib/server/receipt";
import { applyRoleBasedCollegeFilter } from "$lib/server/security";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  locals: { supabase, getAuthenticatedUser, userProfile },
  url,
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "deo") {
    throw redirect(303, "/login");
  }

  const courseId = url.searchParams.get("courseId");
  const cycleId = url.searchParams.get("cycleId");
  const status = url.searchParams.get("status");
  const formType = url.searchParams.get("formType");
  const branchId = url.searchParams.get("branchId");
  const search = url.searchParams.get("search")?.trim();
  const createdBy = url.searchParams.get("createdBy"); // 'student' or UUID
  const updatedBy = url.searchParams.get("updatedBy"); // 'student' or UUID

  // Fetch filters options
  let coursesQuery = supabase.from("courses").select("id, name, college_id"); // Select college_id for filter
  coursesQuery = applyRoleBasedCollegeFilter(
    coursesQuery,
    userProfile,
    "courses",
  );
  const { data: courses } = await coursesQuery;

  const { data: cycles } = await supabase
    .from("admission_cycles")
    .select("id, name");

  const { data: allBranches } = await supabase
    .from("branches")
    .select("id, name, course_id")
    .order("name");

  // Fetch colleges with UPI settings for QR code display
  const { data: colleges } = await supabase
    .from("colleges")
    .select("id, name, upi_vpa, upi_merchant_name, upi_enabled");

  // Fetch Staff Users for filter dropdown (DEO, Admins, etc.)
  // We assume 'student' role is distinct.
  const { data: staffUsers } = await supabase
    .from("users")
    .select("id, full_name, role")
    .in("role", ["deo", "adm_officer", "college_auth", "admin"])
    .order("full_name");

  // Fetch Form Types to identify provisional ones
  const { data: formTypesData } = await supabase
    .from("form_types")
    .select("id, name, is_prov");
  const formTypesMap = new Map();
  formTypesData?.forEach((ft) => {
    formTypesMap.set(ft.name, { id: ft.id, is_prov: ft.is_prov });
  });

  // Build query for applications
  let baseQuery = supabase.from("applications").select(
    `
            id,
            status,
            student_id,
            application_fee_status,
            updated_at,
            form_type,
            admission_type,
            course_id,
            cycle_id,
            branch_id,
            form_data,
            users!applications_student_id_fkey (id, full_name, email, student_profiles(enrollment_number, profile_data)),
            courses!inner (name, college_id),
            branches(name),
            admission_cycles(name, academic_year_id),
            creator:created_by${createdBy === 'student' ? '!inner' : ''}(full_name, role),
            updater:updated_by${updatedBy === 'student' ? '!inner' : ''}(full_name, role),
            payments(id, amount, status, payment_type, receipt_number)
        `,
    { count: "exact" },
  );

  baseQuery = applyRoleBasedCollegeFilter(
    baseQuery,
    userProfile,
    "applications",
  );

  // Apply filters
  if (courseId) baseQuery = baseQuery.eq("course_id", courseId);
  if (cycleId) baseQuery = baseQuery.eq("cycle_id", cycleId);
  
  if (status) {
    baseQuery = baseQuery.eq("status", status);
  } else {
    // Exclude drafts by default from "All Statuses" list
    baseQuery = baseQuery.neq("status", "draft");
  }

  if (formType) baseQuery = baseQuery.eq("form_type", formType);
  if (branchId) baseQuery = baseQuery.eq("branch_id", branchId);
  
  if (createdBy) {
    if (createdBy === 'student') {
        baseQuery = baseQuery.eq('creator.role', 'student');
    } else {
        baseQuery = baseQuery.eq("created_by", createdBy);
    }
  }

  if (updatedBy) {
    if (updatedBy === 'student') {
        baseQuery = baseQuery.eq('updater.role', 'student');
    } else {
        baseQuery = baseQuery.eq("updated_by", updatedBy);
    }
  }

  const sortField = url.searchParams.get('sort') || 'updated_at';
  const sortOrder = url.searchParams.get('order') || 'desc';

  if (search || sortField === 'receipt_number') {
    console.log(`🔍 DEO applications: ${search ? 'Searching' : 'Sorting by receipt'}. Fetching all records for in-memory processing.`);
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  // Execute the query - if no search AND not sorting by receipt, use pagination
  let executeQuery = baseQuery;
  if (!search && sortField !== 'receipt_number') {
    // Standard server-side sorting for status/updated_at
    if (sortField === 'status') {
      executeQuery = executeQuery.order('status', { ascending: sortOrder === 'asc' });
    } else {
      executeQuery = executeQuery.order('updated_at', { ascending: sortOrder === 'asc' });
    }
    executeQuery = executeQuery.range(offset, offset + limit - 1);
  }
  
  const {
    data: rawApplications,
    count: totalCount,
    error,
  } = await executeQuery;

  // Helper to extract sorting receipt
  const getSortReceipt = (app: any) => {
    const isProvType = formTypesMap.get(app.form_type)?.is_prov;
    const payment = (app.payments || []).find((p: any) => p.payment_type === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number) 
                 || (app.payments || []).find((p: any) => p.receipt_number);
    if (!payment?.receipt_number) return { num: '', seq: 0 };
    const seqMatch = payment.receipt_number.match(/(\d+)$/);
    return {
      num: payment.receipt_number,
      seq: seqMatch ? parseInt(seqMatch[1]) : 0
    };
  };

  if (error) {
    console.error("❌ Error fetching DEO applications:", error.message);
  } else {
    let processedApplications = rawApplications || [];

    // Filter if search active
    if (search) {
      const searchLower = search.toLowerCase().trim();
      processedApplications = processedApplications.filter((app: any) => {
        const firstName = (app.form_data?.first_name || '').toLowerCase();
        const middleName = (app.form_data?.middle_name || '').toLowerCase();
        const lastName = (app.form_data?.last_name || '').toLowerCase();
        const fullName = (app.users?.full_name || '').toLowerCase();
        const email = (app.users?.email || '').toLowerCase();
        const enrollment = (app.users?.student_profiles?.enrollment_number || '').toLowerCase();
        
        return firstName.includes(searchLower) || 
               middleName.includes(searchLower) || 
               lastName.includes(searchLower) ||
               fullName.includes(searchLower) ||
               email.includes(searchLower) ||
               enrollment.includes(searchLower);
      });
    }

    // Sort if receipt sorting requested
    if (sortField === 'receipt_number') {
      processedApplications.sort((a, b) => {
        const rA = getSortReceipt(a);
        const rB = getSortReceipt(b);
        if (rA.seq !== rB.seq) {
          return sortOrder === 'asc' ? rA.seq - rB.seq : rB.seq - rA.seq;
        }
        return sortOrder === 'asc' ? rA.num.localeCompare(rB.num) : rB.num.localeCompare(rA.num);
      });
    }

    // Apply pagination if we did in-memory processing
    const finalCount = (search || sortField === 'receipt_number') ? processedApplications.length : (totalCount || 0);
    const paginatedApplications = (search || sortField === 'receipt_number') 
      ? processedApplications.slice(offset, offset + limit) 
      : processedApplications;

    // --- NEW: Fetch Print Profile Templates for DEO ---
    const { data: printTemplates } = await supabase
        .from('report_templates')
        .select('id, name, target_form_type_id, target_academic_year_id, target_course_id')
        .eq('report_type', 'html_profile')
        .contains('allowed_roles', ['deo']);

    // Fetch admission forms for enrichment
    const { data: admissionForms } = await supabase.from("admission_forms").select("course_id, cycle_id, form_type, form_fee");
    const enrich = (list: any[]) => (list || []).map((app: any) => {
      const form = admissionForms?.find(f => f.course_id === app.course_id && f.cycle_id === app.cycle_id && f.form_type === app.form_type);
      return { ...app, form_fee: form?.form_fee || 0 };
    });

    return {
      applications: enrich(paginatedApplications),
      courses: courses || [],
      cycles: cycles || [],
      branches: allBranches || [],
      formTypes: formTypesData || [],
      colleges: colleges || [],
      staffUsers: staffUsers || [],
      filters: { courseId, cycleId, status, search, createdBy, updatedBy, formType, branchId, sort: sortField, order: sortOrder },
      page,
      limit,
      totalCount: finalCount,
      formTypesMap: Object.fromEntries(formTypesMap),
      printTemplates: printTemplates || []
    };
  }
};

export const actions: Actions = {
  collectProvFee: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      return fail(403, { message: "Unauthorized" });
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const payment_mode = formData.get("payment_mode") as string;
    const reference_no = formData.get("reference_no") as string;

    if (!application_id || isNaN(amount) || !payment_mode || !reference_no) {
      return fail(400, { message: "Missing required payment details." });
    }

    console.log(
      `Collecting Prov Fee: AppID=${application_id}, Amount=${amount}`,
    );

    // Fetch application details to get academic year for receipt sequence
    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data: appData } = await supabaseAdmin
      .from("applications")
      .select(
        "cycle_id, course_id, form_type, admission_cycles(academic_year_id, academic_years(name, short_code)), courses(college_id)",
      )
      .eq("id", application_id)
      .single();

    const academicYearId = appData?.admission_cycles?.academic_year_id;
    const academicYearName = appData?.admission_cycles?.academic_years?.name;
    const academicYearShortCode = appData?.admission_cycles?.academic_years?.short_code;
    const collegeId = appData?.courses?.college_id;
    const courseId = appData?.course_id;
    const formType = appData?.form_type;

    // Generate Sequential Receipt Number
    const receipt_number = await generateReceiptNumber(
      supabaseAdmin,
      "provisional_fee",
      academicYearId,
      collegeId,
      courseId,
      academicYearName,
      academicYearShortCode,
      formType
    );

    // 1. Record Payment
    const { error: payError } = await supabase.from("payments").insert({
      application_id,
      amount,
      payment_type: "provisional_fee",
      payment_mode,
      reference_no,
      receipt_number, // Added receipt number
      transaction_id: reference_no, // Mapping reference to transaction_id as well for legacy compatibility
      status: "completed",
      payment_date: new Date().toISOString(),
    });

    if (payError) {
      console.error("Payment insert error:", payError);
      return fail(500, { message: "Failed to record payment." });
    }

    // 2. Update Application Fee Status
    // Even if provisional fee is separate, marking 'paid' helps general tracking.
    const { error: appError } = await supabase
      .from("applications")
      .update({ application_fee_status: "paid" })
      .eq("id", application_id);

    if (appError) {
      console.error("App update error:", appError);
      // Non-fatal if payment recorded
    }

    return { success: true };
  },
};
