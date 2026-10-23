import type { PageServerLoad } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({ locals: { getSession, userProfile } }) => {
  const session = await getSession();
  if (
    !session ||
    (userProfile?.role !== "adm_officer" && userProfile?.role !== "admin")
  ) {
    throw redirect(303, "/login");
  }

  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Fetch courses with college details
  const { data: courses, error: coursesErr } = await supabaseAdmin
    .from("courses")
    .select(`
      id,
      name,
      code,
      college_id,
      colleges(name)
    `)
    .order("name");

  if (coursesErr) {
    console.error("Error fetching courses:", coursesErr);
  }

  // 2. Fetch branches
  const { data: branches, error: branchesErr } = await supabaseAdmin
    .from("branches")
    .select(`
      id,
      name,
      code,
      course_id
    `)
    .order("name");

  if (branchesErr) {
    console.error("Error fetching branches:", branchesErr);
  }

  // 3. Fetch form types
  const { data: formTypesData } = await supabaseAdmin
    .from("form_types")
    .select("name, is_prov")
    .order("name");

  // 3b. Fetch student profile fields schema
  const { data: dbProfileFieldsData } = await supabaseAdmin
    .from("student_profile_fields")
    .select("id, key, label, type, options")
    .order("label");

  // 3c. Fetch admission form schemas to extract application-wise fields
  const { data: dbAdmissionFormsData } = await supabaseAdmin
    .from("admission_forms")
    .select("id, course_id, form_type, schema_json");

  // 4. Fetch ALL applications across all colleges and courses using pagination loop
  let rawApps: any[] = [];
  let from = 0;
  const pageLimit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error: appsErr } = await supabaseAdmin
      .from("applications")
      .select(`
        id,
        student_id,
        course_id,
        branch_id,
        status,
        form_type,
        admission_type,
        submitted_at,
        form_data,
        application_fee_status,
        courses(id, name, code, colleges(name)),
        branches(id, name, code),
        student_user:users!student_id(
          id,
          full_name,
          email,
          student_profiles(enrollment_number, admission_status, profile_data)
        ),
        account_admissions(
          admission_number,
          application_id,
          applications!application_id(
            id,
            course_id,
            branch_id,
            courses(id, name, code, colleges(name)),
            branches(id, name, code)
          )
        ),
        payments(id, payment_type, status, amount, receipt_number)
      `)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .neq("status", "removed")
      .range(from, from + pageLimit - 1);

    if (appsErr) {
      console.error("Error fetching applications for report:", appsErr);
      break;
    }

    if (page && page.length > 0) {
      rawApps = rawApps.concat(page);
      from += page.length;
      if (page.length < pageLimit) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  // Build map of student applications for non-provisional application fallback
  const appsByStudent = new Map<string, any[]>();
  (rawApps || []).forEach((a: any) => {
    if (!a.student_id) return;
    if (!appsByStudent.has(a.student_id)) {
      appsByStudent.set(a.student_id, []);
    }
    appsByStudent.get(a.student_id)!.push(a);
  });

  // Helper to resolve final admitted course and branch (Option 2 primary, Option 1 fallback)
  function resolveFinalCourseAndBranch(app: any) {
    const admissions = Array.isArray(app.account_admissions)
      ? app.account_admissions[0]
      : app.account_admissions;

    // Option 2 (Primary): Check official account_admissions referenced application
    const accApp = admissions?.applications;
    if (accApp?.branches?.name && accApp?.courses?.name) {
      return {
        courseId: accApp.course_id,
        courseName: accApp.courses.name,
        collegeName: accApp.courses.colleges?.name || app.courses?.colleges?.name || "N/A",
        branchId: accApp.branch_id,
        branchName: accApp.branches.name,
      };
    }

    // Option 1 (Fallback): Check student's non-provisional application (Regular / MQ / NRI)
    const allUserApps = appsByStudent.get(app.student_id) || [];
    const regularApp = allUserApps.find(
      (a: any) =>
        a.status !== "draft" &&
        a.status !== "cancelled" &&
        a.status !== "removed" &&
        !a.form_type?.toLowerCase().includes("provisional") &&
        a.branches?.name
    );

    if (regularApp?.branches?.name && regularApp?.courses?.name) {
      return {
        courseId: regularApp.course_id,
        courseName: regularApp.courses.name,
        collegeName: regularApp.courses.colleges?.name || app.courses?.colleges?.name || "N/A",
        branchId: regularApp.branch_id,
        branchName: regularApp.branches.name,
      };
    }

    // Ultimate Fallback: Current application record's course & branch
    return {
      courseId: app.course_id,
      courseName: app.courses?.name || "N/A",
      collegeName: app.courses?.colleges?.name || "N/A",
      branchId: app.branch_id,
      branchName: app.branches?.name || "N/A",
    };
  }

  // Build application-wise schema fields map
  const appFieldsMap = new Map<string, { key: string; label: string; type?: string; category: string }>();

  (dbAdmissionFormsData || []).forEach((af: any) => {
    const schema = af.schema_json;
    if (schema?.fields && Array.isArray(schema.fields)) {
      schema.fields.forEach((f: any) => {
        if (f.key && !appFieldsMap.has(f.key)) {
          appFieldsMap.set(f.key, {
            key: f.key,
            label: f.label || f.key.replace(/_/g, ' ').toUpperCase(),
            type: f.type || 'text',
            category: 'Application'
          });
        }
      });
    }
  });

  const profileFieldsList = (dbProfileFieldsData || []).map((pf: any) => ({
    key: pf.key,
    label: pf.label || pf.key,
    type: pf.type || 'text',
    category: 'Profile'
  }));

  const provFormTypeNames = new Set(
    (formTypesData || []).filter((ft) => ft.is_prov).map((ft) => ft.name.toLowerCase().trim())
  );

  // Filter non-provisional applications and de-duplicate ONLY among branches for the same student
  const uniqueBranchAppsMap = new Map<string, any>();

  (rawApps || []).forEach((app: any) => {
    // 1. Exclude provisional forms (is_prov == true or form_type includes provisional)
    const formTypeLower = (app.form_type || "").toLowerCase().trim();
    const isProv = provFormTypeNames.has(formTypeLower) || formTypeLower.includes("provisional");
    if (isProv) return;

    // 2. Must have College ID (enrollment_number) or Account Admission Number
    const profiles = app.student_user?.student_profiles;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const admissionEntry = Array.isArray(app.account_admissions)
      ? app.account_admissions[0]
      : app.account_admissions;

    const hasEnrollmentOrAdmNo = !!profile?.enrollment_number || !!admissionEntry?.admission_number;
    if (!hasEnrollmentOrAdmNo) return;

    // 3. Payment status check for admission / tuition fees (completed payment in payments OR application_fee_status == paid)
    const payments = Array.isArray(app.payments) ? app.payments : [];
    const hasPaidPayment = payments.some((p: any) => p.status === "completed") || app.application_fee_status === "paid";
    if (!hasPaidPayment) return;

    const finalInfo = resolveFinalCourseAndBranch(app);
    const branchKey = `${app.student_id}_${finalInfo.branchId || "unassigned"}`;

    if (!uniqueBranchAppsMap.has(branchKey)) {
      uniqueBranchAppsMap.set(branchKey, app);
    }
  });

  const allStudentApps = Array.from(uniqueBranchAppsMap.values());

  // Unique list of form types & admission types present in actual applications
  const activeFormTypesSet = new Set<string>();
  const activeAdmissionTypesSet = new Set<string>(["Regular", "D2D", "C2D"]);

  (rawApps || []).forEach((app: any) => {
    if (app.form_type) activeFormTypesSet.add(app.form_type);
    if (app.admission_type) activeAdmissionTypesSet.add(app.admission_type);
  });
  if (formTypesData) {
    formTypesData.forEach((ft) => activeFormTypesSet.add(ft.name));
  }

  const availableFormTypes = Array.from(activeFormTypesSet).sort();
  const availableAdmissionTypes = Array.from(activeAdmissionTypesSet).sort();

  // Format ALL matching student items for complete client-side accuracy (no slicing)
  const allStudents = allStudentApps.map((app: any, idx: number) => {
    const profiles = app.student_user?.student_profiles;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const profileData = profile?.profile_data || {};
    const admissionEntry = Array.isArray(app.account_admissions)
      ? app.account_admissions[0]
      : app.account_admissions;

    const contact =
      profileData.contact_number ||
      profileData.mobile ||
      app.form_data?.mobile ||
      app.form_data?.contact_number ||
      "-";

    const photoPath = profileData.photo || app.form_data?.photo || "";
    let photoUrl = "";
    if (photoPath) {
      if (photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
        photoUrl = photoPath;
      } else {
        const cleanPath = photoPath.replace(/^\/+/, "");
        const { data: pubData } = supabaseAdmin.storage
          .from("documents")
          .getPublicUrl(cleanPath);
        photoUrl = pubData?.publicUrl || photoPath;
      }
    }

    const address = [
      profileData.p_address_line_1 || app.form_data?.address_line_1,
      profileData.p_city || app.form_data?.city,
      profileData.p_state || app.form_data?.state,
    ]
      .filter(Boolean)
      .join(", ") || "-";

    const payments = Array.isArray(app.payments) ? app.payments : [];
    const hasTuitionPaid = payments.some(
      (p: any) => p.payment_type === "tuition_fee" && p.status === "completed"
    );
    const hasAppFeePaid =
      payments.some(
        (p: any) => p.payment_type === "application_fee" && p.status === "completed"
      ) || app.application_fee_status === "paid";
    const hasAnyPaid = payments.some((p: any) => p.status === "completed") || hasAppFeePaid;

    const acpcMeritNo =
      app.form_data?.acpc_merit_number ||
      app.form_data?.merit_number ||
      app.form_data?.merit_no ||
      app.form_data?.merit_rank ||
      app.form_data?.gcas_merit_no ||
      profileData?.acpc_merit_number ||
      profileData?.merit_number ||
      "-";

    const acpcAppNo =
      app.form_data?.acpc_number ||
      app.form_data?.acpc_app_number ||
      app.form_data?.acpc_application_number ||
      app.form_data?.acpc_seat_number ||
      app.form_data?.gcas_id ||
      app.form_data?.application_no ||
      profileData?.acpc_number ||
      profileData?.acpc_application_number ||
      "-";

    const finalInfo = resolveFinalCourseAndBranch(app);

    return {
      srNo: idx + 1,
      id: app.id,
      studentName: app.student_user?.full_name || "N/A",
      email: app.student_user?.email || "-",
      contact,
      collegeId: profile?.enrollment_number || admissionEntry?.admission_number || "Pending",
      admissionNo: admissionEntry?.admission_number || "-",
      photoUrl: photoUrl,
      dob: profileData.birth_date || app.form_data?.dob || app.form_data?.date_of_birth || "-",
      address,
      college: finalInfo.collegeName,
      course: finalInfo.courseName,
      courseId: finalInfo.courseId,
      branch: finalInfo.branchName,
      branchId: finalInfo.branchId,
      admissionStatus: profile?.admission_status || "Admitted",
      admissionType: (
        (app.admission_type || "").toLowerCase().includes("d2d") ||
        (app.form_type || "").toLowerCase().includes("d2d") ||
        JSON.stringify(app.form_data || {}).toLowerCase().includes("d2d")
      ) ? "D2D" : (app.admission_type || "Regular"),
      appStatus: app.status || "",
      formType: app.form_type || "-",
      isProv: app.form_type?.toLowerCase().includes("provisional") || false,
      hasTuitionPaid,
      hasAppFeePaid,
      hasAnyPaid,
      acpcMeritNo,
      acpcAppNo,
      profileData,
      formData: app.form_data || {},
    };
  });

  return {
    courses: courses || [],
    branches: branches || [],
    formTypes: availableFormTypes,
    admissionTypes: availableAdmissionTypes,
    provFormTypes: formTypesData?.filter((ft) => ft.is_prov).map((ft) => ft.name) || ["Provisional"],
    totalAdmitted: allStudentApps.length,
    allStudents,
    dbProfileFields: profileFieldsList,
    dbAppFields: Array.from(appFieldsMap.values()),
  };
};
