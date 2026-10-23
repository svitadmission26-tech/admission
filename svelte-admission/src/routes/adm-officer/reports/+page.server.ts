import { fail, redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  url,
  locals: { getSession, userProfile },
}) => {
  const session = await getSession();

  if (!session) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "adm_officer" && userProfile?.role !== "admin") {
    throw redirect(303, "/login");
  }

  // Use Service Role for robust fetching
  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  // --- Extract Filter Parameters ---
  const courseFilter = url.searchParams.get("course");
  const branchFilter = url.searchParams.get("branch");
  const formTypeFilter = url.searchParams.get("form_type");
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");

  // --- Fetch Metadata for Filters ---
  const { data: allCourses } = await supabaseAdmin
    .from("courses")
    .select("id, name, code")
    .order("name");
  const { data: allBranches } = await supabaseAdmin
    .from("branches")
    .select("id, name, course_id")
    .order("name");

  // Fetch unique form types
  const { data: distinctTypes } = await supabaseAdmin
    .from("applications")
    .select("form_type")
    .limit(100);
  const formTypes = [
    ...new Set(distinctTypes?.map((a) => a.form_type).filter(Boolean)),
  ].sort();

  // --- Fetch Dynamic Form Fields ---
  let schemaQuery = supabaseAdmin
    .from("admission_forms")
    .select("schema_json")
    .eq("is_enabled", true);

  if (courseFilter) {
    schemaQuery = schemaQuery.eq("course_id", courseFilter);
  }

  if (formTypeFilter) {
    schemaQuery = schemaQuery.eq("form_type", formTypeFilter);
  }

  const { data: formSchemas } = await schemaQuery;

  const dynamicFieldsMap = new Map<string, string>(); // key -> label

  formSchemas?.forEach((form) => {
    if (form.schema_json?.fields) {
      form.schema_json.fields.forEach((field: any) => {
        const fieldKey = field.key || field.name;
        if (fieldKey && !dynamicFieldsMap.has(fieldKey)) {
          dynamicFieldsMap.set(fieldKey, field.label || fieldKey);
        }
      });
    }
  });

  const dynamicFields = Array.from(dynamicFieldsMap.entries())
    .map(([key, label]) => ({
      key: `dynamic:${key}`, // Prefix to distinguish from static fields
      label: `[Form] ${label}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // --- Fetch Preview Data ---
  let query = supabaseAdmin
    .from("applications")
    .select(
      `
            id,
            status,
            form_type,
            admission_type,
            submitted_at,
            updated_at,
            approval_comment,
            student_user:users!student_id(full_name, email, student_profiles(enrollment_number)),
            courses(name, code, colleges(name)),
            branches(name),
            account_admissions(admission_number),
            merit_list_entries(merit_score)
        `,
    )
    .neq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(10); // Preview limit

  if (courseFilter) query = query.eq("course_id", courseFilter);
  if (branchFilter) query = query.eq("branch_id", branchFilter);
  if (formTypeFilter) query = query.eq("form_type", formTypeFilter);
  if (startDate) query = query.gte("submitted_at", startDate);
  if (endDate) query = query.lte("submitted_at", endDate + "T23:59:59");

  const { data: rawPreviewApplications, error: previewError } = await query;

  let previewApplications: any[] = [];

  if (previewError) {
    console.error("Error fetching preview:", previewError.message);
  } else {
    // Flatten the structure for the frontend
    previewApplications =
      rawPreviewApplications?.map((app) => ({
        ...app,
        merit_score: (() => {
          const entry = Array.isArray(app.merit_list_entries)
            ? app.merit_list_entries[0]
            : app.merit_list_entries;
          return (entry as any)?.merit_score || "";
        })(),
      })) || [];
  }

  // --- Fetch Saved Templates ---
  const { data: templates, error: templateError } = await supabaseAdmin
    .from("report_templates")
    .select("*")
    .neq("report_type", "html_profile")
    .or(`created_by.eq.${session.user.id},is_public.eq.true`)
    .order("name");

  if (templateError) {
    console.error("Error fetching templates:", templateError);
  }

  return {
    options: {
      courses: allCourses || [],
      branches: allBranches || [],
      formTypes: formTypes || [],
    },
    previewApplications: previewApplications || [],
    dynamicFields,
    templates: templates || [],
  };
};

export const actions: Actions = {
  saveTemplate: async ({ request, locals: { getSession } }) => {
    const session = await getSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const isPublic = formData.get("is_public") === "on";
    const columns = formData.get("columns") as string; // JSON string
    const filters = formData.get("filters") as string; // JSON string

    if (!name || !columns) {
      return fail(400, { message: "Name and Columns are required" });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const { error } = await supabaseAdmin.from("report_templates").insert({
      name,
      description,
      is_public: isPublic,
      columns: JSON.parse(columns),
      filters: filters ? JSON.parse(filters) : {},
      created_by: session.user.id,
    });

    if (error) {
      console.error("Save template error:", error);
      return fail(500, { message: "Failed to save template" });
    }

    return { success: true };
  },
  deleteTemplate: async ({ request, locals: { getSession } }) => {
    const session = await getSession();
    if (!session) return fail(401, { message: "Unauthorized" });

    const formData = await request.formData();
    const id = formData.get("id") as string;

    if (!id) return fail(400, { message: "Template ID required" });

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // Check ownership manually since we are using service role
    const { data: template } = await supabaseAdmin
      .from("report_templates")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!template) return fail(404, { message: "Template not found" });
    if (template.created_by !== session.user.id)
      return fail(403, { message: "Forbidden" });

    const { error } = await supabaseAdmin
      .from("report_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete template error:", error);
      return fail(500, { message: "Failed to delete template" });
    }

    return { success: true };
  },
};
