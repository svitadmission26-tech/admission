import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { z } from "zod"; // Zod for validation
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { generateReceiptNumber } from "$lib/server/receipt";
import { applyRoleBasedCollegeFilter } from "$lib/server/security";
import { approveApplicationLogic } from "$lib/server/application";

const createStudentSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
});

function extractLinkedProfileFields(
  formData: any,
  schemaFields: any[],
): Record<string, any> {
  if (!schemaFields || !Array.isArray(schemaFields) || !formData) return {};

  const profileUpdates: Record<string, any> = {};

  for (const field of schemaFields) {
    if (field.profileFieldKey && formData[field.key] !== undefined) {
      profileUpdates[field.profileFieldKey] = formData[field.key];
    }
  }

  return profileUpdates;
}

async function syncProfileFields(
  supabase: any,
  studentId: string,
  formData: any,
  courseId: string,
  cycleId: string,
  formType: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: formDetails, error: schemaError } = await supabase
      .from("admission_forms")
      .select("schema_json")
      .eq("course_id", courseId)
      .eq("cycle_id", cycleId)
      .eq("form_type", formType)
      .maybeSingle();

    if (schemaError) {
      console.error(
        "Error fetching schema for profile sync:",
        schemaError.message,
      );
      return { success: false, error: schemaError.message };
    }

    if (!formDetails?.schema_json?.fields) {
      return { success: true };
    }

    const linkedFields = extractLinkedProfileFields(
      formData,
      formDetails.schema_json.fields,
    );

    if (Object.keys(linkedFields).length === 0) {
      return { success: true };
    }

    console.log("Syncing linked profile fields:", linkedFields);

    const { data: existingProfile, error: fetchError } = await supabase
      .from("student_profiles")
      .select("profile_data")
      .eq("user_id", studentId)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching existing profile:", fetchError.message);
      return { success: false, error: fetchError.message };
    }

    const existingProfileData = existingProfile?.profile_data || {};
    const updatedProfileData = { ...existingProfileData, ...linkedFields };

    if (existingProfile) {
      const { error: updateError } = await supabase
        .from("student_profiles")
        .update({ profile_data: updatedProfileData })
        .eq("user_id", studentId);

      if (updateError) {
        console.error("Error updating student profile:", updateError.message);
        return { success: false, error: updateError.message };
      }
    } else {
      const { error: insertError } = await supabase
        .from("student_profiles")
        .insert({ user_id: studentId, profile_data: updatedProfileData });

      if (insertError) {
        console.error("Error inserting student profile:", insertError.message);
        return { success: false, error: insertError.message };
      }
    }

    return { success: true };
    } catch (e) {
    console.error("Exception in syncProfileFields:", e);
    return { success: false, error: String(e) };
    }
    }

    async function syncDocuments(
    supabase: any,
    studentId: string,
    appId: string,
    formData: any,
    formDetails: any,
    ) {
    if (
    formDetails &&
    formDetails.schema_json &&
    formDetails.schema_json.fields
    ) {
    const fileFields = formDetails.schema_json.fields.filter(
      (f: any) => f.type === "file",
    );

        const currentUserId = (await supabase.auth.getUser()).data.user?.id;
        for (const field of fileFields) {
            const key = field.key || field.name;
            const filePath = formData ? formData[key] : null;
            if (filePath) {
                const { data: existingDoc } = await supabase
                    .from("documents")
                    .select("id")
                    .eq("application_id", appId)
                    .eq("document_type", field.label)
                    .maybeSingle();

                const docData = {
                    application_id: appId,
                    user_id: studentId,
                    file_path: filePath,
                    file_name: filePath.split("/").pop() || "uploaded_file",
                    document_type: field.label,
                    status: "pending",
                    uploaded_by: currentUserId,
                };

                if (existingDoc) {
                    await supabase.from("documents").update(docData).eq("id", existingDoc.id);
                } else {
                    await supabase.from("documents").insert(docData);
                }
            }
        }
    }
}

const applicationSchema = z.object({
    student_id: z.string().uuid(),
    course_id: z.string().uuid(),
    cycle_id: z.string().uuid(),
    branch_id: z.string().uuid().optional().nullable().or(z.literal("")),
    form_type: z.string().min(1).default("Provisional"),
    admission_type: z.string().optional().default("Regular"),
    form_data: z.record(z.string(), z.any()).optional(),
    application_id: z.string().uuid().optional(),
});

export const load: PageServerLoad = async ({
  locals: { supabase, getAuthenticatedUser, userProfile },
  url,
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "deo") {
    throw redirect(303, "/login"); // Redirect non-DEO users
  }

  // Fetch list of existing student users (using service role to bypass RLS)
  // PostgREST has a default 1000-row limit, so paginate to get all students
  const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const allStudents = [];
  const pageSize = 1000;
  let offset = 0;
  let pageError = null;
  while (true) {
    const { data: page, error } = await supabaseAdmin
      .from("users")
      .select("id, email, full_name")
      .eq("role", "student")
      .range(offset, offset + pageSize - 1);
    if (error) { pageError = error; break; }
    if (!page || page.length === 0) break;
    allStudents.push(...page);
    offset += pageSize;
    if (page.length < pageSize) break;
  }
  const students = allStudents;
  const studentError = pageError;

  if (studentError) {
    console.error("Error fetching student list:", studentError.message);
    return {
      students: [],
      courses: [],
      availableCycles: [],
      selectedStudent: null,
      selectedCourse: null,
      admissionFormSchema: null,
    };
  }

  console.log(`[DEO-APPLY] Fetched ${students?.length || 0} students for DEO search`);

  const studentId = url.searchParams.get("studentId");
  const applicationId = url.searchParams.get("applicationId");

  let selectedStudent: { id: string; email: string; full_name: string } | null =
    null;
  let preloadedApplicationData: any = null;

  // If applicationId is provided, load existing application
  if (applicationId) {
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select(
        "*, student:users!applications_student_id_fkey(id, email, full_name)",
      )
      .eq("id", applicationId)
      .single();

    if (app && !appError) {
      preloadedApplicationData = {
        id: app.id,
        form_data: app.form_data || {},
        course_id: app.course_id,
        cycle_id: app.cycle_id,
        form_type: app.form_type,
        admission_type: app.admission_type,
        branch_id: app.branch_id,
        status: app.status,
      };
      // Pre-select the student from the application
      if (app.student) {
        selectedStudent = {
          id: app.student.id,
          email: app.student.email,
          full_name: app.student.full_name,
        };
      }
    }
  }

  if (studentId && !selectedStudent) {
    selectedStudent = students?.find((s) => s.id === studentId) || null;
  }

  const courseId = url.searchParams.get("courseId");
  let selectedCourse: {
    id: string;
    name: string;
    colleges: { id: string; name: string };
  } | null = null;
  let availableCycles: {
    id: string;
    name: string;
    academic_years: { name: string };
  }[] = [];
  let admissionFormSchema: any = null;

  // Fetch available courses (including branches)
  let coursesQuery = supabase
    .from("courses")
    .select(
      "id, name, college_id, code, colleges(id, name, universities(name)), branches(id, name, code)",
    ); // Added college_id for filter logic if needed by helper locally, helper filters on it.

  coursesQuery = applyRoleBasedCollegeFilter(
    coursesQuery,
    userProfile,
    "courses",
  );

  const { data: courses, error: coursesError } = await coursesQuery;

  if (coursesError) {
    console.error("Error fetching courses:", coursesError.message);
    return {
      students: students || [],
      courses: [],
      availableCycles: [],
      selectedStudent,
      selectedCourse,
      admissionFormSchema,
    };
  }

  const { data: cycles, error: cyclesError } = await supabase
    .from("admission_cycles")
    .select("id, name, academic_years(name)")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  if (cyclesError) {
    console.error("Error fetching cycles:", cyclesError.message);
  } else {
    availableCycles = cycles || [];
  }

  const { data: formTypes, error: formTypesError } = await supabase
    .from("form_types")
    .select("name")
    .eq("is_active", true)
    .order("name");
  if (formTypesError) {
    console.error("Error fetching form types:", formTypesError.message);
  }

  // Fetch Student Profile Schema for the 'Edit Profile' modal
  const { data: profileSchema, error: schemaError } = await supabase
    .from("student_profile_fields")
    .select("*")
    .order("created_at");

  if (schemaError) {
    console.error(
      "Error fetching student profile schema:",
      schemaError.message,
    );
  }

  if (courseId) {
    selectedCourse = courses.find((c) => c.id === courseId) || null;
  }

  // Fetch admissionFormSchema and disableBranchSelection flag
  const selectedCycleId = url.searchParams.get("cycleId");
  const selectedFormType = url.searchParams.get("formType");

  let disableBranchSelection = false;
  if (courseId && selectedCycleId && selectedFormType) {
    console.log(
      `Fetching schema for Course: ${courseId}, Cycle: ${selectedCycleId}, Type: ${selectedFormType}`,
    );
    const { data: formDetails, error: formError } = await supabase
      .from("admission_forms")
      .select("schema_json")
      .eq("course_id", courseId)
      .eq("cycle_id", selectedCycleId)
      .eq("form_type", selectedFormType)
      .maybeSingle();

    if (formError) {
      console.error("Error fetching admission form schema:", formError.message);
    } else if (formDetails) {
      admissionFormSchema = formDetails.schema_json;
      // The property is named 'enableBranchSelection' (camelCase).
      // If it is true, selection is enabled. If false or undefined, it is disabled.
      disableBranchSelection = !admissionFormSchema.enableBranchSelection;
      console.log(
        "Schema fetched. Disable Branch Selection:",
        disableBranchSelection,
      );
      console.log("Raw Schema JSON:", JSON.stringify(admissionFormSchema));
    } else {
      console.log("No specific schema found for this combination.");
    }
  }

  return {
    students: students || [],
    selectedStudent: selectedStudent,
    courses: courses || [],
    availableCycles: availableCycles,
    selectedCourse: selectedCourse,
    admissionFormSchema: admissionFormSchema,
    formTypes: formTypes || [],
    profileSchema: profileSchema || [],
    disableBranchSelection: disableBranchSelection,
    preloadedApplicationData: preloadedApplicationData,
  };
};

export const actions: Actions = {
  createStudent: async ({
    request,
    locals: { getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirm_password = formData.get("confirm_password") as string;
    const full_name = formData.get("full_name") as string;
    const phone = formData.get("phone") as string;

    // 1. Validate input
    if (password !== confirm_password) {
      return fail(400, { message: "Passwords do not match.", error: true });
    }
    const parsed = createStudentSchema.safeParse({
      email,
      password,
      full_name,
    });
    if (!parsed.success) {
      return fail(400, {
        message: "Invalid student data",
        errors: parsed.error.issues,
        error: true,
      });
    }

    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    // 2. Create user using Admin API
    const { data: userData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: {
          full_name: parsed.data.full_name,
          phone: phone, // Store phone in metadata
          role: "student",
        },
      });

    if (createError) {
      console.error("Error creating user via Admin API:", createError.message);
      // Handle specific errors like 'User already registered'
      if (
        createError.message.includes("already registered") ||
        createError.message.includes("duplicate key")
      ) {
        return fail(409, {
          message:
            "User with this email already exists. Please select them from the search list.",
          error: true,
        });
      }
      return fail(500, { message: createError.message, error: true });
    }

    // The public.users record is typically created by a trigger when auth.users is created.
    // We ensure consistency or update if needed.
    // For simplicity and to avoid race conditions with triggers, we will upsert here.
    const { error: profileUpsertError } = await supabaseAdmin
      .from("users")
      .upsert({
        id: userData.user.id,
        email: parsed.data.email,
        full_name: parsed.data.full_name,
        role: "student",
      });

    if (profileUpsertError) {
      console.error(
        "Error upserting student profile (public.users):",
        profileUpsertError.message,
      );
      // This error is logged but not critical enough to fail the entire user creation as the user exists in auth.
    }

    return {
      success: true,
      message: "Student created successfully!",
      studentId: userData.user.id,
    };
  },

  updateStudentProfile: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const student_id = formData.get("student_id") as string;
    const profile_data_str = formData.get("profile_data") as string;

    if (!student_id || !profile_data_str) {
      return fail(400, {
        message: "Missing student ID or profile data",
        error: true,
      });
    }

    let profileData;
    try {
      profileData = JSON.parse(profile_data_str);
    } catch (e) {
      return fail(400, { message: "Invalid profile JSON", error: true });
    }

    // Verify student exists and is a student
    const { data: studentCheck } = await supabase
      .from("users")
      .select("role")
      .eq("id", student_id)
      .single();

    if (studentCheck?.role !== "student") {
      return fail(403, {
        message: "Target user is not a student",
        error: true,
      });
    }

    // Upsert profile data
    // Note: We use upsert to create the row if it's missing (though trigger handles creation, this is safe)
    const { error } = await supabase.from("student_profiles").upsert(
      {
        user_id: student_id,
        profile_data: profileData,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      console.error("Error updating student profile:", error.message);
      return fail(500, {
        message: "Failed to update student profile.",
        error: true,
      });
    }

    return { success: true, message: "Student profile updated successfully!" };
  },

  saveApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const student_id = formData.get("student_id") as string;
    const course_id = formData.get("course_id") as string;
    const cycle_id = formData.get("cycle_id") as string;
    const branch_id = (formData.get("branch_id") as string) || null;
    const form_type = formData.get("form_type") as string;
    const admission_type = formData.get("admission_type") as string;
    const form_data_str = formData.get("form_data") as string;

    let application_id = formData.get("application_id") as
      | string
      | undefined
      | null;
    if (application_id === "" || application_id === null) {
      application_id = undefined;
    }

    let parsedFormData: any;
    try {
      parsedFormData = JSON.parse(form_data_str);
    } catch (e) {
      return fail(400, { message: "Invalid form data JSON", error: true });
    }

    const parsed = applicationSchema.safeParse({
      student_id,
      course_id,
      cycle_id,
      branch_id,
      form_type: form_type as any,
      admission_type,
      form_data: parsedFormData,
      application_id,
    });

    if (!parsed.success) {
      console.error("Validation failed:", parsed.error.issues);
      return fail(400, {
        message: "Invalid form submission",
        errors: parsed.error.issues,
        error: true,
      });
    }

    const {
      student_id: validatedStudentId,
      course_id: validatedCourseId,
      cycle_id: validatedCycleId,
      branch_id: validatedBranchId,
      form_type: validatedFormType,
      admission_type: validatedAdmissionType,
      form_data: validatedFormData,
      application_id: validatedApplicationId,
    } = parsed.data;

    let finalBranchId = validatedBranchId || null;

    // Security: Validate Course College against User Profile
    if (userProfile.college_id) {
      const { data: courseCheck } = await supabase
        .from("courses")
        .select("college_id")
        .eq("id", validatedCourseId)
        .single();
      if (courseCheck?.college_id !== userProfile.college_id) {
        return fail(403, {
          message: "Unauthorized: Cannot create application for this college.",
          error: true,
        });
      }
    }

    // Fetch form details (schema and fee) early
    const { data: formDetails } = await supabase
      .from("admission_forms")
      .select("schema_json, form_fee")
      .eq("course_id", validatedCourseId)
      .eq("cycle_id", validatedCycleId)
      .eq("form_type", validatedFormType)
      .limit(1)
      .maybeSingle();

    // Auto-assign branch if disabled in schema and not provided
    if (!finalBranchId && formDetails?.schema_json?.enableBranchSelection === false) {
      const { data: prevApp } = await supabase
        .from("applications")
        .select("branch_id")
        .eq("student_id", validatedStudentId)
        .eq("course_id", validatedCourseId)
        .not("branch_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevApp?.branch_id) {
        finalBranchId = prevApp.branch_id;
        console.log(`[DEO Auto-Assign] Branch ${finalBranchId} inherited from previous application for student ${validatedStudentId}`);
      }
    }

    const formFee = formDetails?.form_fee || 0;

    // Verify that the DEO is allowed to act on behalf of this student
    const { data: studentCheck, error: studentCheckError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", validatedStudentId)
      .eq("role", "student")
      .single();

    if (studentCheckError || !studentCheck) {
      console.error(
        "Student not found or not a student role:",
        studentCheckError?.message,
      );
      return fail(430, {
        message: "Cannot act on behalf of this user.",
        error: true,
      });
    }

    if (validatedApplicationId) {
      // Check application status before update
      const { data: existingAppCheck, error: checkError } = await supabase
        .from("applications")
        .select("status, application_fee_status, form_data")
        .eq("id", validatedApplicationId)
        .single();

      if (checkError || !existingAppCheck) {
        return fail(404, { message: "Application not found.", error: true });
      }

      const isReuploadAllowed = existingAppCheck.form_data?.allow_reupload === true || validatedFormData?.allow_reupload === true;
      if (["verified", "approved"].includes(existingAppCheck.status) && !isReuploadAllowed) {
        return fail(403, {
          message: "Application is locked and cannot be edited.",
          error: true,
        });
      }

      // Determine new fee status logic
      let newFeeStatus = existingAppCheck.application_fee_status;
      if (formFee > 0) {
        if (newFeeStatus === "not_applicable") newFeeStatus = "pending";
      } else {
        if (newFeeStatus === "pending") newFeeStatus = "not_applicable";
      }

      // Update existing application
      const { error } = await supabase
        .from("applications")
        .update({
          form_data: validatedFormData,
          status: existingAppCheck.status, // Preserve current status
          branch_id: finalBranchId,
          form_type: validatedFormType,
          admission_type: validatedAdmissionType,
          application_fee_status: newFeeStatus,
          updated_by: authenticatedUser.id,
        })
        .eq("id", validatedApplicationId)
        .eq("student_id", validatedStudentId);

      if (error) {
        console.error("Error updating application:", error.message);
        return fail(500, {
          message: "Failed to update application",
          error: true,
        });
      }

      await syncProfileFields(
        supabase,
        validatedStudentId,
        validatedFormData,
        validatedCourseId,
        validatedCycleId,
        validatedFormType,
      );

      await syncDocuments(
        supabase,
        validatedStudentId,
        validatedApplicationId,
        validatedFormData,
        formDetails,
      );

      return { success: true, message: "Application updated successfully!" };
    } else {
      // Check for existing application
      const { data: existingApp, error: existingAppError } = await supabase
        .from("applications")
        .select("id, status, application_fee_status, form_data")
        .eq("student_id", validatedStudentId)
        .eq("course_id", validatedCourseId)
        .eq("cycle_id", validatedCycleId)
        .eq("form_type", validatedFormType)
        .maybeSingle();

      if (existingApp) {
        // If it exists, update it instead of creating duplicate
        const isReuploadAllowed = existingApp.form_data?.allow_reupload === true || validatedFormData?.allow_reupload === true;
        if (["verified", "approved"].includes(existingApp.status) && !isReuploadAllowed) {
            return fail(403, { message: "Application is locked and cannot be edited.", error: true });
        }

        let newFeeStatus = existingApp.application_fee_status;
        if (formFee > 0) {
          if (newFeeStatus === "not_applicable") newFeeStatus = "pending";
        } else {
          if (newFeeStatus === "pending") newFeeStatus = "not_applicable";
        }

        const { error } = await supabase
          .from("applications")
          .update({
            form_data: validatedFormData,
            branch_id: finalBranchId,
            form_type: validatedFormType,
            admission_type: validatedAdmissionType,
            application_fee_status: newFeeStatus,
            updated_by: authenticatedUser.id,
          })
          .eq("id", existingApp.id);

        if (error) {
          return fail(500, {
            message: "Failed to update existing draft.",
            error: true,
          });
        }

        await syncProfileFields(
          supabase,
          validatedStudentId,
          validatedFormData,
          validatedCourseId,
          validatedCycleId,
          validatedFormType,
        );

        await syncDocuments(
          supabase,
          validatedStudentId,
          existingApp.id,
          validatedFormData,
          formDetails,
        );

        return {
          success: true,
          message: "Updated existing draft for this student/course.",
          applicationId: existingApp.id,
        };
      }

      // Determine fee status for new app
      const feeStatus = formFee > 0 ? "pending" : "not_applicable";

      // Create new application
      const { data, error } = await supabase
        .from("applications")
        .insert({
          student_id: validatedStudentId,
          course_id: validatedCourseId,
          cycle_id: validatedCycleId,
          branch_id: finalBranchId,
          form_type: validatedFormType,
          admission_type: validatedAdmissionType,
          form_data: validatedFormData,
          status: "draft",
          submitted_at: null,
          application_fee_status: feeStatus,
          created_by: authenticatedUser.id,
          updated_by: authenticatedUser.id,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating application:", error.message);
        return fail(500, {
          message: "Failed to create application",
          error: true,
        });
      }
      if (data) {
        await syncProfileFields(
          supabase,
          validatedStudentId,
          validatedFormData,
          validatedCourseId,
          validatedCycleId,
          validatedFormType,
        );

        await syncDocuments(
          supabase,
          validatedStudentId,
          data.id,
          validatedFormData,
          formDetails,
        );

        return {
          success: true,
          message: "Application created successfully!",
          applicationId: data.id,
        };
      }
    }
  },

  submitApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const student_id = formData.get("student_id") as string;
    const application_id = formData.get("application_id") as string;

    if (!application_id || !student_id) {
      return fail(400, {
        message: "Application ID and Student ID are required to submit",
        error: true,
      });
    }

    const { data: studentCheck, error: studentCheckError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", student_id)
      .eq("role", "student")
      .single();

    if (studentCheckError || !studentCheck) {
      return fail(403, {
        message: "Cannot act on behalf of this user.",
        error: true,
      });
    }

    const { data: appData, error: appError } = await supabase
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appError || !appData) {
      return fail(404, { message: "Application not found", error: true });
    }

    const isReuploadAllowed = appData.form_data?.allow_reupload === true;
    if (["verified", "approved"].includes(appData.status) && !isReuploadAllowed) {
      return fail(403, {
        message:
          "Application is already processed and cannot be submitted again.",
        error: true,
      });
    }

    // Fetch form schema to get fee
    const { data: formSchema } = await supabase
      .from("admission_forms")
      .select("form_fee")
      .eq("course_id", appData.course_id)
      .eq("cycle_id", appData.cycle_id)
      .eq("form_type", appData.form_type)
      .single();

    const feeAmount = formSchema?.form_fee || 0;
    let feeStatusUpdate = {};
    if (feeAmount > 0 && appData.application_fee_status === "not_applicable") {
      feeStatusUpdate = { application_fee_status: "pending" };
    }

    // Reset allow_reupload inside form_data when submitting
    const updatedFormData = { ...appData.form_data };
    if (updatedFormData.allow_reupload) {
      delete updatedFormData.allow_reupload;
    }

    const nextStatus = isReuploadAllowed && ["verified", "approved"].includes(appData.status) 
      ? appData.status 
      : "submitted";

    const { error } = await supabase
      .from("applications")
      .update({
        status: nextStatus,
        submitted_at: new Date().toISOString(),
        form_data: updatedFormData,
        updated_by: authenticatedUser.id,
        ...feeStatusUpdate,
      })
      .eq("id", application_id)
      .eq("student_id", student_id);

    if (error) {
      console.error("Error submitting application:", error.message);
      return fail(500, {
        message: "Failed to submit application",
        error: true,
      });
    }

    const finalFeeStatus =
      feeStatusUpdate["application_fee_status"] ||
      appData.application_fee_status;

    // Check for Direct Admission on Submit
    const { data: formTypeCheck } = await supabase
      .from("form_types")
      .select("direct_admission_on_submit, name")
      .eq("name", appData.form_type)
      .single();

    if (
      formTypeCheck?.direct_admission_on_submit &&
      finalFeeStatus === "not_applicable"
    ) {
      console.log(
        `[DEO Direct Admission] Triggering auto-approval for ${application_id} (Zero Fee)`,
      );
      const supabaseAdmin = createClient(
        PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );
      const approveResult = await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        authenticatedUser.id,
        appData.admission_type || "Regular",
        "Direct Admission on Submit (Zero Fee - DEO)",
      );
      if (approveResult.success) {
        return {
          success: true,
          message: "Application submitted and admitted successfully!",
          feeStatus: finalFeeStatus,
          feeAmount: feeAmount,
          admitted: true,
          admissionNumber: approveResult.admissionNumber,
        };
      }
    }

    return {
      success: true,
      message: "Application submitted successfully!",
      feeStatus: finalFeeStatus,
      feeAmount: feeAmount,
    };
  },

  recordPayment: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const payment_mode = formData.get("payment_mode") as string; // 'cash', 'cheque', 'online_transfer'
    const transaction_ref = formData.get("transaction_ref") as string;

    if (!application_id || isNaN(amount) || amount <= 0) {
      return fail(400, { message: "Invalid payment details.", error: true });
    }

    // Fetch application details to get course and cycle info for receipt generation
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select(
        `
        id,
        course_id,
        cycle_id,
        form_type,
        courses(college_id),
        admission_cycles(academic_year_id, academic_years(name))
      `,
      )
      .eq("id", application_id)
      .single();

    if (appError || !application) {
      console.error("Error fetching application:", appError?.message);
      return fail(404, { message: "Application not found.", error: true });
    }

    // Generate receipt number
    let receipt_number: string;
    try {
      const academicYearId = application.admission_cycles?.academic_year_id;
      const yearName = application.admission_cycles?.academic_years?.name;
      const collegeId = application.courses?.college_id;
      const courseId = application.course_id;
      const paymentType = "application_fee";

      if (!academicYearId || !collegeId || !courseId) {
        console.error("Missing required parameters for receipt generation:", {
          academicYearId,
          collegeId,
          courseId,
        });
        receipt_number = `REC-${Date.now()}`;
      } else {
        console.log("Generating receipt number with params:", {
          paymentType,
          academicYearId,
          yearName,
          collegeId,
          courseId,
        });

        receipt_number = await generateReceiptNumber(
          supabase,
          paymentType,
          academicYearId,
          collegeId,
          courseId,
          yearName,
          undefined, // shortCode
          application.form_type
        );

        console.log("Generated receipt number:", receipt_number);
      }
    } catch (e) {
      console.error("Error generating receipt number:", e);
      // Fallback to timestamp-based receipt number
      receipt_number = `REC-${Date.now()}`;
    }

    // Record Payment
    const { error: payError } = await supabase.from("payments").insert({
      application_id,
      amount,
      payment_type: "application_fee",
      transaction_id: transaction_ref, // Use reference as transaction ID
      receipt_number, // Add generated receipt number
      status: "completed", // Manual payments are considered completed immediately
      payment_date: new Date().toISOString(),
      // Could add payment_mode to metadata or a new column if needed, but for now strict schema match.
      // If schema doesn't have payment_mode, maybe we store it in transaction_id as prefix?
      // "CASH-123", "CHQ-123". But transaction_id is text.
    });

    if (payError) {
      console.error("Error recording payment:", payError.message);
      return fail(500, { message: "Failed to record payment.", error: true });
    }

    // Update Application Status
    const { error: updateError } = await supabase
      .from("applications")
      .update({ application_fee_status: "paid" })
      .eq("id", application_id);

    if (updateError) {
      console.error("Error updating fee status:", updateError.message);
      return fail(500, {
        message: "Payment recorded but status update failed.",
        error: true,
      });
    }

    // Check for Direct Admission on Payment
    const { data: formTypeCheck } = await supabase
      .from("form_types")
      .select("direct_admission_on_submit, name")
      .eq("name", application.form_type)
      .single();

    if (formTypeCheck?.direct_admission_on_submit) {
      console.log(
        `[DEO Direct Admission] Triggering auto-approval for ${application_id} (Fee Paid)`,
      );
      const supabaseAdmin = createClient(
        PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );
      const approveResult = await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        authenticatedUser.id,
        "Regular", // Default for manual payment
        "Direct Admission on Submit (Fee Paid - DEO Manual)",
      );
      if (approveResult.success) {
        return {
          success: true,
          message: "Payment recorded and admitted successfully!",
          admitted: true,
          admissionNumber: approveResult.admissionNumber,
        };
      }
    }

    return { success: true, message: "Payment recorded successfully!" };
  },

  deleteDraft: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "deo") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    if (!application_id) {
      return fail(400, { message: "Application ID is required.", error: true });
    }

    const { data: appData, error: fetchError } = await supabase
      .from("applications")
      .select("status")
      .eq("id", application_id)
      .single();

    if (fetchError || !appData) {
      return fail(404, { message: "Application not found.", error: true });
    }

    if (appData.status !== "draft") {
      return fail(403, {
        message: "Only draft applications can be deleted.",
        error: true,
      });
    }

    const { error: deleteError } = await supabase
      .from("applications")
      .delete()
      .eq("id", application_id);

    if (deleteError) {
      console.error("Error deleting draft:", deleteError.message);
      return fail(500, { message: "Failed to delete draft.", error: true });
    }

    return { success: true, message: "Draft deleted successfully." };
  },
};
