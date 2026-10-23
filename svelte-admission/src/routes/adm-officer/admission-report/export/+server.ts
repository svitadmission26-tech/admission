import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import * as XLSX from "xlsx";

export const GET: RequestHandler = async ({
  url,
  locals: { getSession, userProfile },
}) => {
  const session = await getSession();
  if (
    !session ||
    (userProfile?.role !== "adm_officer" && userProfile?.role !== "admin")
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  const branchesParam = url.searchParams.get("branches");
  const selectedBranchIds = branchesParam
    ? branchesParam.split(",").filter(Boolean)
    : [];

  const coursesParam = url.searchParams.get("courses");
  const selectedCourseIds = coursesParam
    ? coursesParam.split(",").filter(Boolean)
    : [];

  const formTypesParam = url.searchParams.get("form_types");
  const selectedFormTypes = formTypesParam
    ? formTypesParam.split(",").filter(Boolean)
    : [];

  const fieldsParam = url.searchParams.get("fields");
  const selectedFields = fieldsParam
    ? fieldsParam.split(",").filter(Boolean)
    : null;

  const sheetMode = url.searchParams.get("sheet_mode") || "branch"; // 'branch' | 'course' | 'single'
  const includeSummary = url.searchParams.get("include_summary") !== "false";
  const searchParam = url.searchParams.get("search") || "";

  // Filters:
  const excludeProvisional = url.searchParams.get("exclude_provisional") !== "false"; // Default true
  const admissionStatusFilter = url.searchParams.get("admission_status") || "admitted"; // 'admitted' | 'approved' | 'all'
  const admissionTypeFilter = url.searchParams.get("admission_type") || "Regular"; // Default 'Regular'
  const paymentStatusFilter = url.searchParams.get("payment_status") || "paid"; // 'paid' | 'tuition_paid' | 'app_fee_paid' | 'all'

  // 1. Fetch Branches & Courses & Form Types for name lookup
  const [coursesRes, branchesRes, provFormTypesRes] = await Promise.all([
    supabaseAdmin.from("courses").select("id, name, code, college_id, colleges(name)"),
    supabaseAdmin.from("branches").select("id, name, code, course_id"),
    supabaseAdmin.from("form_types").select("name, is_prov"),
  ]);

  const allCourses = coursesRes.data || [];
  const allBranches = branchesRes.data || [];
  const provFormTypeNames = new Set(
    (provFormTypesRes.data || [])
      .filter((ft) => ft.is_prov)
      .map((ft) => ft.name.toLowerCase())
  );
  provFormTypeNames.add("provisional");

  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const branchMap = new Map(allBranches.map((b) => [b.id, b]));

  // 2. Fetch ALL applications across all colleges and courses using pagination loop
  let applications: any[] = [];
  let from = 0;
  const pageLimit = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseAdmin
      .from("applications")
      .select(
        `
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
      `
      )
      .neq("status", "draft")
      .neq("status", "cancelled")
      .neq("status", "removed")
      .order("submitted_at", { ascending: false });

    if (selectedFormTypes.length > 0) {
      query = query.in("form_type", selectedFormTypes);
    }

    const { data: page, error } = await query.range(from, from + pageLimit - 1);

    if (error) {
      console.error("Admission report export query error:", error);
      return new Response("Error fetching data: " + error.message, {
        status: 500,
      });
    }

    if (page && page.length > 0) {
      applications = applications.concat(page);
      from += page.length;
      if (page.length < pageLimit) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  // Build map of student applications for non-provisional application fallback
  const appsByStudent = new Map<string, any[]>();
  (applications || []).forEach((a: any) => {
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

  // Filter non-provisional applications and de-duplicate ONLY among branches for the same student
  const uniqueBranchAppsMap = new Map<string, any>();

  (applications || []).forEach((app: any) => {
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

    // Course & Branch filter matching final resolved course/branch
    if (selectedCourseIds.length > 0 && !selectedCourseIds.includes(finalInfo.courseId)) {
      return;
    }
    if (selectedBranchIds.length > 0 && finalInfo.branchId && !selectedBranchIds.includes(finalInfo.branchId)) {
      return;
    }

    // Admission Type Filter
    const isD2D = (app.admission_type || "").toLowerCase().includes("d2d") ||
                  (app.form_type || "").toLowerCase().includes("d2d") ||
                  JSON.stringify(app.form_data || {}).toLowerCase().includes("d2d");
    const appAdmissionType = isD2D ? "D2D" : (app.admission_type || "Regular");
    if (admissionTypeFilter !== "all" && admissionTypeFilter !== "") {
      if (appAdmissionType.toLowerCase() !== admissionTypeFilter.toLowerCase()) {
        return;
      }
    }
    // Search Query Filter
    if (searchParam && searchParam.trim()) {
      const q = searchParam.toLowerCase().trim();
      const matchName = app.student_user?.full_name?.toLowerCase().includes(q);
      const matchEmail = app.student_user?.email?.toLowerCase().includes(q);
      const matchId = (profile?.enrollment_number || admissionEntry?.admission_number || "").toLowerCase().includes(q);
      const matchBranch = finalInfo.branchName.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchId && !matchBranch) {
        return;
      }
    }

    const branchKey = `${app.student_id}_${finalInfo.branchId || "unassigned"}`;

    if (!uniqueBranchAppsMap.has(branchKey)) {
      uniqueBranchAppsMap.set(branchKey, app);
    }
  });

  const filteredStudents = Array.from(uniqueBranchAppsMap.values());

  if (filteredStudents.length === 0) {
    return new Response(
      "No student records found matching the selected criteria.",
      { status: 404 }
    );
  }

  // Field mapping definitions
  const availableFieldMap: Record<
    string,
    { label: string; getValue: (app: any) => string }
  > = {
    student_name: {
      label: "Student Name",
      getValue: (app) => app.student_user?.full_name || "",
    },
    contact: {
      label: "Contact Number",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        return (
          pData.contact_number ||
          pData.mobile ||
          app.form_data?.mobile ||
          app.form_data?.contact_number ||
          ""
        );
      },
    },
    email: {
      label: "Email ID",
      getValue: (app) => app.student_user?.email || "",
    },
    college_id: {
      label: "College ID (Enrollment No)",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.enrollment_number || "";
      },
    },
    photo_url: {
      label: "Photo URL",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        const photoPath = pData.photo || app.form_data?.photo || "";
        if (!photoPath) return "";
        if (photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
          return photoPath;
        }
        const cleanPath = photoPath.replace(/^\/+/, "");
        const { data: pubData } = supabaseAdmin.storage
          .from("documents")
          .getPublicUrl(cleanPath);
        return pubData?.publicUrl || photoPath;
      },
    },
    dob: {
      label: "Date of Birth",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        return (
          pData.birth_date ||
          app.form_data?.dob ||
          app.form_data?.date_of_birth ||
          ""
        );
      },
    },
    address: {
      label: "Address",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const pData = profile?.profile_data || {};
        const pAddr = [
          pData.p_address_line_1 || app.form_data?.address_line_1,
          pData.p_address_line_2 || app.form_data?.address_line_2,
          pData.p_city || app.form_data?.city,
          pData.p_state || app.form_data?.state,
          pData.p_zip_code || app.form_data?.zip_code,
        ]
          .filter(Boolean)
          .join(", ");
        return pAddr || app.form_data?.address || "";
      },
    },
    department: {
      label: "College / Department",
      getValue: (app) => {
        const finalInfo = resolveFinalCourseAndBranch(app);
        return finalInfo.collegeName;
      },
    },
    course: {
      label: "Course",
      getValue: (app) => {
        const finalInfo = resolveFinalCourseAndBranch(app);
        return finalInfo.courseName;
      },
    },
    branch: {
      label: "Branch",
      getValue: (app) => {
        const finalInfo = resolveFinalCourseAndBranch(app);
        return finalInfo.branchName;
      },
    },
    admission_type: {
      label: "Admission Type",
      getValue: (app) => app.admission_type || "Regular",
    },
    status: {
      label: "Admission Status",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.admission_status || app.status || "Admitted";
      },
    },
    gender: {
      label: "Gender",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.gender || app.form_data?.gender || "";
      },
    },
    category: {
      label: "Category",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.category || app.form_data?.category || "";
      },
    },
    father_name: {
      label: "Father Name",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.father_full_name || app.form_data?.father_name || "";
      },
    },
    father_contact: {
      label: "Father Contact",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.father_contact_number || app.form_data?.father_contact || "";
      },
    },
    mother_name: {
      label: "Mother Name",
      getValue: (app) => {
        const profiles = app.student_user?.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.profile_data?.mother_full_name || app.form_data?.mother_name || "";
      },
    },
    admission_no: {
      label: "Admission Number",
      getValue: (app) => {
        const admissions = app.account_admissions;
        const entry = Array.isArray(admissions) ? admissions[0] : admissions;
        return entry?.admission_number || "";
      },
    },
    acpc_merit_number: {
      label: "ACPC / Merit Rank Number",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        const pData = profile?.profile_data || {};
        return (
          app.form_data?.acpc_merit_number ||
          app.form_data?.merit_number ||
          app.form_data?.merit_no ||
          app.form_data?.merit_rank ||
          app.form_data?.gcas_merit_no ||
          pData.acpc_merit_number ||
          pData.merit_number ||
          ""
        );
      },
    },
    acpc_application_number: {
      label: "ACPC / Seat / Application Number",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        const pData = profile?.profile_data || {};
        return (
          app.form_data?.acpc_number ||
          app.form_data?.acpc_app_number ||
          app.form_data?.acpc_application_number ||
          app.form_data?.acpc_seat_number ||
          app.form_data?.gcas_id ||
          app.form_data?.application_no ||
          pData.acpc_number ||
          pData.acpc_application_number ||
          ""
        );
      },
    },
    aadhar_number: {
      label: "Aadhaar Card Number",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return (
          profile?.profile_data?.aadhar_number ||
          profile?.profile_data?.aadhaar_card_no ||
          app.form_data?.aadhar_number ||
          ""
        );
      },
    },
    abc_id: {
      label: "ABC ID / APAAR ID",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return (
          profile?.profile_data?.abc_id ||
          profile?.profile_data?.apaar_id ||
          app.form_data?.abc_id ||
          ""
        );
      },
    },
    caste: {
      label: "Caste",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return profile?.profile_data?.caste || app.form_data?.caste || "";
      },
    },
    sub_caste: {
      label: "Sub-Caste",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return profile?.profile_data?.sub_caste || app.form_data?.sub_caste || "";
      },
    },
    religion: {
      label: "Religion",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return profile?.profile_data?.religion || app.form_data?.religion || "";
      },
    },
    nationality: {
      label: "Nationality",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return profile?.profile_data?.nationality || app.form_data?.nationality || "";
      },
    },
    blood_group: {
      label: "Blood Group",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return profile?.profile_data?.blood_group || app.form_data?.blood_group || "";
      },
    },
    bank_name: {
      label: "Bank Name",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return profile?.profile_data?.bank_name || app.form_data?.bank_name || "";
      },
    },
    bank_account_number: {
      label: "Bank Account Number",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return (
          profile?.profile_data?.bank_account_number ||
          app.form_data?.bank_account_number ||
          ""
        );
      },
    },
    ifsc_code: {
      label: "Bank IFSC Code",
      getValue: (app) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        return profile?.profile_data?.ifsc_code || app.form_data?.ifsc_code || "";
      },
    },
  };

  // Determine export columns
  let activeKeys = Object.keys(availableFieldMap);
  if (selectedFields && selectedFields.length > 0) {
    activeKeys = selectedFields;
  }

  // Dynamic field resolver for any key not explicitly defined
  const getFieldConfig = (key: string) => {
    if (availableFieldMap[key]) {
      return availableFieldMap[key];
    }
    // Dynamic fallback for custom student profile or application form fields
    const formattedLabel = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    return {
      label: formattedLabel,
      getValue: (app: any) => {
        const profile = Array.isArray(app.student_user?.student_profiles)
          ? app.student_user?.student_profiles[0]
          : app.student_user?.student_profiles;
        const pData = profile?.profile_data || {};
        const val = pData[key] ?? app.form_data?.[key] ?? "";
        if (typeof val === "object" && val !== null) {
          return JSON.stringify(val);
        }
        return val != null ? String(val) : "";
      },
    };
  };

  // Helper to format rows for a given list of applications
  const formatRowsForApps = (appList: any[]) => {
    return appList.map((app: any, idx: number) => {
      const row: Record<string, any> = {
        "Sr. No": idx + 1,
      };
      activeKeys.forEach((key) => {
        const fieldConfig = getFieldConfig(key);
        if (fieldConfig) {
          row[fieldConfig.label] = fieldConfig.getValue(app);
        }
      });
      return row;
    });
  };

  // Helper to sanitize sheet names for SheetJS (max 31 chars, no invalid chars : \ / ? * [ ])
  const sanitizeSheetName = (name: string, defaultName: string) => {
    if (!name) return defaultName;
    const clean = name.replace(/[:\\/?*\[\]]/g, "_").trim();
    return clean.length > 31 ? clean.substring(0, 31) : clean || defaultName;
  };

  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  const getUniqueSheetName = (proposed: string) => {
    let clean = sanitizeSheetName(proposed, "Sheet");
    let count = 1;
    let finalName = clean;
    while (usedSheetNames.has(finalName.toLowerCase())) {
      const suffix = `_${count}`;
      const base = clean.substring(0, 31 - suffix.length);
      finalName = `${base}${suffix}`;
      count++;
    }
    usedSheetNames.add(finalName.toLowerCase());
    return finalName;
  };

  // 1. Summary Sheet (Optional or Default)
  if (includeSummary || sheetMode === "single") {
    const summaryRows = formatRowsForApps(filteredStudents);
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    const sheetName = getUniqueSheetName("All Admitted Students");
    XLSX.utils.book_append_sheet(workbook, summarySheet, sheetName);
  }

  // 2. Individual sheets based on sheetMode
  if (sheetMode === "branch") {
    // Group by Final Branch
    const branchGroupMap = new Map<string, { branchName: string; apps: any[] }>();

    filteredStudents.forEach((app: any) => {
      const finalInfo = resolveFinalCourseAndBranch(app);
      const branchId = finalInfo.branchId || "unassigned";
      const branchName = finalInfo.branchName || "Unassigned Branch";

      if (!branchGroupMap.has(branchId)) {
        branchGroupMap.set(branchId, { branchName, apps: [] });
      }
      branchGroupMap.get(branchId)!.apps.push(app);
    });

    // Append a sheet for each branch
    for (const [_, group] of branchGroupMap) {
      const rows = formatRowsForApps(group.apps);
      const sheet = XLSX.utils.json_to_sheet(rows);
      const sheetName = getUniqueSheetName(group.branchName);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }
  } else if (sheetMode === "course") {
    // Group by Final Course
    const courseGroupMap = new Map<string, { courseName: string; apps: any[] }>();

    filteredStudents.forEach((app: any) => {
      const finalInfo = resolveFinalCourseAndBranch(app);
      const courseId = finalInfo.courseId || "unassigned";
      const courseName = finalInfo.courseName || "Unassigned Course";

      if (!courseGroupMap.has(courseId)) {
        courseGroupMap.set(courseId, { courseName, apps: [] });
      }
      courseGroupMap.get(courseId)!.apps.push(app);
    });

    // Append a sheet for each course
    for (const [_, group] of courseGroupMap) {
      const rows = formatRowsForApps(group.apps);
      const sheet = XLSX.utils.json_to_sheet(rows);
      const sheetName = getUniqueSheetName(group.courseName);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }
  }

  // Generate Excel file buffer
  const excelBuffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `Admitted_Students_Report_${timestamp}.xlsx`;

  return new Response(excelBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
