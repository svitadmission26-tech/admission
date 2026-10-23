import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

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
    SUPABASE_SERVICE_ROLE_KEY,
  );

  const statusParam = url.searchParams.get("status");
  const selectedStatuses = statusParam ? statusParam.split(",").filter(Boolean) : [];
  const searchQuery = url.searchParams.get("search");
  const courseFilter = url.searchParams.get("course");
  const branchFilter = url.searchParams.get("branch");
  const formTypeFilter = url.searchParams.get("form_type");
  const formTypes = formTypeFilter ? formTypeFilter.split(",").filter(Boolean) : [];
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  const fieldsParam = url.searchParams.get("fields");

  let query = supabaseAdmin
    .from("applications")
    .select(
      `
                    id,
                    student_id,
                    status,
                    form_type,
                    submitted_at,
                    updated_at,
                    form_data,
                    approval_comment,
                    student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
                    courses(name, code, colleges(name)),
                    branches(name),
                    admission_cycles(name, academic_years(name)),
                    account_admissions(admission_number),
                    merit_list_entries(merit_score)
                    `,
    )
    .order("updated_at", { ascending: false });

  if (selectedStatuses.length > 0) {
    query = query.in("status", selectedStatuses);
  } else {
    query = query.neq("status", "draft");
  }

  if (courseFilter) query = query.eq("course_id", courseFilter);
  if (branchFilter) query = query.eq("branch_id", branchFilter);
  if (formTypes.length > 0) query = query.in("form_type", formTypes);
  if (startDate) query = query.gte("submitted_at", startDate);
  if (endDate) query = query.lte("submitted_at", endDate + "T23:59:59");

  if (searchQuery) {
    query = query.or(
      `email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`,
      { foreignTable: "student_user" },
    );
  }

  const [applicationsRes, formTypesRes] = await Promise.all([
    query,
    supabaseAdmin.from("form_types").select("name, is_prov")
  ]);

  const { data: applications, error } = applicationsRes;
  const { data: formTypesData } = formTypesRes;

  if (error) {
    console.error("Export query error:", error);
    return new Response("Error fetching data: " + error.message, { status: 500 });
  }

  // --- Provisional Branch Fallback logic for Export ---
  if (applications && applications.length > 0) {
    const studentIdsMissingBranch = applications
      .filter(app => !app.branches?.name)
      .map(app => app.student_id);

    if (studentIdsMissingBranch.length > 0) {
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

  // Define Field Mappings
  const fieldMap: Record<
    string,
    { label: string; getValue: (app: any) => string }
  > = {
    id: { label: "Application ID", getValue: (app) => app.id },
    student_name: {
      label: "Student Name",
      getValue: (app) => `"${app.student_user?.full_name || ""}"`,
    },
    email: { label: "Email", getValue: (app) => app.student_user?.email || "" },
    enrollment_number: {
      label: "College ID",
      getValue: (app) => app.student_user?.student_profiles?.enrollment_number || "",
    },
    course: {
      label: "Course",
      getValue: (app) => `"${app.courses?.name || ""}"`,
    },
    branch: { label: "Branch", getValue: (app) => app.branches?.name || app.prov_branch_name || "-" },
    form_type: { label: "Form Type", getValue: (app) => app.form_type || "" },
    admission_type: { label: "Admission Mode", getValue: (app) => app.admission_type || "Regular" },
    college: {
      label: "College",
      getValue: (app) => `"${app.courses?.colleges?.name || ""}"`,
    },
    cycle: {
      label: "Admission Cycle",
      getValue: (app) => `"${app.admission_cycles?.name || ""}"`,
    },
    status: { label: "Status", getValue: (app) => app.status || "" },
    merit_score: {
      label: "Merit Score",
      getValue: (app) => {
        const score = Array.isArray(app.merit_list_entries)
          ? app.merit_list_entries[0]?.merit_score
          : app.merit_list_entries?.merit_score;
        return score || "";
      },
    },
    admission_no: {
      label: "Admission Number",
      getValue: (app) => app.account_admissions?.[0]?.admission_number || "",
    },
    submitted_date: {
      label: "Submitted Date",
      getValue: (app) =>
        app.submitted_at
          ? new Date(app.submitted_at).toISOString().split("T")[0]
          : "",
    },
    updated_date: {
      label: "Last Updated",
      getValue: (app) =>
        app.updated_at
          ? new Date(app.updated_at).toISOString().split("T")[0]
          : "",
    },
  };

  // Determine columns to export
  let selectedKeys = Object.keys(fieldMap);
  if (fieldsParam) {
    const requestedKeys = fieldsParam.split(",");
    // Filter valid keys (in fieldMap) OR dynamic keys
    selectedKeys = requestedKeys.filter(
      (k) => fieldMap[k] || k.startsWith("dynamic:"),
    );
    if (selectedKeys.length === 0) selectedKeys = Object.keys(fieldMap);
  }

  const headers = ['Sr. No', ...selectedKeys.map((k) => {
    if (fieldMap[k]) return fieldMap[k].label;
    if (k.startsWith("dynamic:")) return k.replace("dynamic:", "");
    return k;
  })];
  const csvRows = [headers.join(",")];

  applications?.forEach((app: any, index: number) => {
    const row = [index + 1, ...selectedKeys.map((k) => {
      if (fieldMap[k]) return fieldMap[k].getValue(app);
      if (k.startsWith("dynamic:")) {
        const dynamicKey = k.replace("dynamic:", "");
        const val = app.form_data?.[dynamicKey];
        if (val === undefined || val === null) return "";
        // Simple string conversion and CSV escaping
        const strVal =
          typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return "";
    })];
    csvRows.push(row.join(","));
  });

  const csvContent = csvRows.join("\n");

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="applications_report_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
};
