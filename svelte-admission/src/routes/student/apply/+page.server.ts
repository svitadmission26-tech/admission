import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { z } from "zod"; // Will need to install zod
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { getUnprocessedInquiry, mapInquiryToProfile } from "$lib/server/inquiry";
import { approveApplicationLogic } from "$lib/server/application";

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
  courseId: string,
  cycleId: string,
  formType: string,
) {
  try {
    const { data: formDetails } = await supabase
      .from("admission_forms")
      .select("schema_json")
      .eq("course_id", courseId)
      .eq("cycle_id", cycleId)
      .eq("form_type", formType)
      .maybeSingle();

    if (formDetails?.schema_json?.fields) {
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
  } catch (e) {
    console.error("Error in syncDocuments:", e);
  }
}

const applicationSchema = z.object({
  course_id: z.string().uuid(),
  cycle_id: z.string().uuid(),
  branch_id: z.string().uuid().optional().or(z.literal("")),
  form_type: z.string().min(1),
  admission_type: z.string().optional().default("Regular"),
  form_data: z.record(z.string(), z.any()).optional(), // Dynamic JSON data
  application_id: z.string().uuid().optional(), // For updates
});

export const load: PageServerLoad = async ({
  locals: { supabase, getAuthenticatedUser, userProfile },
  url,
  parent,
}) => {
  const parentData = await parent(); // Fetch layout data (student profile)

  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "student") {
    throw redirect(303, "/login"); // Redirect non-student users
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
  let admissionFormSchema: any = null; // Stored as JSONB

  // Fetch available courses
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, name, code, colleges(id, name, universities(name))");

  if (coursesError) {
    console.error("Error fetching courses:", coursesError.message);
    return {
      courses: [],
      availableCycles: [],
      branches: [],
      selectedCourse: null,
      admissionFormSchema: null,
    };
  }

  // If a courseId is provided, try to pre-select it
  if (courseId) {
    selectedCourse = courses.find((c) => c.id === courseId) || null;
  }

  // Fetch active admission cycles
  const { data: cycles, error: cyclesError } = await supabase
    .from("admission_cycles")
    .select("id, name, academic_years(name)")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  if (cyclesError) {
    console.error("Error fetching cycles:", cyclesError.message);
  } else {
    availableCycles = cycles;
  }

  // Fetch branches
  const { data: branches, error: branchesError } = await supabase
    .from("branches")
    .select("id, name, course_id")
    .order("name");

  if (branchesError) {
    console.error("Error fetching branches:", branchesError.message);
  }

  const { data: formTypes, error: formTypesError } = await supabase
    .from("form_types")
    .select("name, student_can_apply")
    .eq("is_active", true)
    .order("name");
  if (formTypesError) {
    console.error("Error fetching form types:", formTypesError.message);
  }

  // Fetch student's existing applications
  const { data: existingApplications, error: existError } = await supabase
    .from("applications")
    .select(
      "id, course_id, cycle_id, branch_id, form_type, admission_type, status, application_fee_status",
    )
    .eq("student_id", userProfile.id);

  if (existError) {
    console.error("Error fetching existing applications:", existError.message);
  }

  // Fetch all enabled admission forms metadata for dropdown filtering
  const { data: enabledForms, error: enabledFormsError } = await supabase
    .from("admission_forms")
    .select("course_id, cycle_id, form_type, is_enabled, is_merit_published")
    .eq("is_enabled", true);

  if (enabledFormsError) {
    console.error("Error fetching enabled forms:", enabledFormsError.message);
  }

  // Filter form types to only those that have at least one enabled form in the system
  // (We'll do further filtering on the client based on selected course/cycle)
  const activeFormTypeNames = Array.from(new Set(enabledForms?.map(f => f.form_type) || []));
  const filteredFormTypes = (formTypes || []).filter(ft => 
    activeFormTypeNames.includes(ft.name) && ft.student_can_apply !== false
  );

  // --- Autofill Logic ---
  let inquiryAutofillData = {};
  const unprocessedInquiry = await getUnprocessedInquiry(supabase, userProfile.email);
  if (unprocessedInquiry) {
    inquiryAutofillData = await mapInquiryToProfile(unprocessedInquiry);
  }

  return {
    courses: courses || [],
    availableCycles: availableCycles,
    branches: branches || [],
    selectedCourse: selectedCourse,
    admissionFormSchema: admissionFormSchema,
    existingApplications: existingApplications || [],
    formTypes: filteredFormTypes,
    studentProfile: parentData.studentProfile, // Get from layout
    userProfile, // Explicitly include user profile
    enabledForms: enabledForms || [],
    inquiryAutofillData
  };
};

export const actions: Actions = {
  saveApplication: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "student") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const course_id = formData.get("course_id") as string;
    const cycle_id = formData.get("cycle_id") as string;
    const branch_id = formData.get("branch_id") as string;
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

    // Validate incoming data using Zod
    const parsed = applicationSchema.safeParse({
      course_id,
      cycle_id,
      branch_id,
      form_type,
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
      course_id: validatedCourseId,
      cycle_id: validatedCycleId,
      branch_id: validatedBranchId,
      form_type: validatedFormType,
      admission_type: validatedAdmissionType,
      form_data: validatedFormData,
      application_id: validatedApplicationId,
    } = parsed.data;

    let finalBranchId = validatedBranchId || null;

    // Fetch form details (schema and fee) early
    const { data: formDetails } = await supabase
      .from("admission_forms")
      .select("schema_json, form_fee")
      .eq("course_id", validatedCourseId)
      .eq("cycle_id", validatedCycleId)
      .eq("form_type", validatedFormType)
      .eq("is_enabled", true)
      .single();

    // Auto-assign branch if disabled in schema and not provided
    if (!finalBranchId && formDetails?.schema_json?.enableBranchSelection === false) {
      const { data: prevApp } = await supabase
        .from("applications")
        .select("branch_id")
        .eq("student_id", userProfile.id)
        .eq("course_id", validatedCourseId)
        .not("branch_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevApp?.branch_id) {
        finalBranchId = prevApp.branch_id;
        console.log(`[Auto-Assign] Branch ${finalBranchId} inherited from previous application for student ${userProfile.id}`);
      }
    }

    const formFee = formDetails?.form_fee || 0;

    if (validatedApplicationId) {
      // Check application status before update
      const { data: existingAppCheck, error: checkError } = await supabase
        .from("applications")
        .select("status, application_fee_status")
        .eq("id", validatedApplicationId)
        .single();

      if (checkError || !existingAppCheck) {
        return fail(404, { message: "Application not found.", error: true });
      }

      if (["verified", "approved"].includes(existingAppCheck.status)) {
        return fail(403, {
          message: "Application is locked and cannot be edited.",
          error: true,
        });
      }

      // Determine new fee status logic:
      // If currently 'paid' or 'waived', keep it.
      // If 'not_applicable' and fee > 0, set to 'pending'.
      // If fee == 0, set to 'not_applicable'.
      let newFeeStatus = existingAppCheck.application_fee_status;
      if (formFee > 0) {
        if (newFeeStatus === "not_applicable") newFeeStatus = "pending";
      } else {
        // Should we reset paid to not_applicable? Probably not if they already paid.
        // But if it was pending and fee becomes 0, then not_applicable.
        if (newFeeStatus === "pending") newFeeStatus = "not_applicable";
      }

      // Update existing application
      const { error } = await supabase
        .from("applications")
        .update({
          form_data: validatedFormData,
          branch_id: finalBranchId,
          form_type: validatedFormType,
          admission_type: validatedAdmissionType,
          status: existingAppCheck.status, // Preserve current status
          updated_at: new Date().toISOString(),
          updated_by: userProfile.id, // Audit
          application_fee_status: newFeeStatus,
        })
        .eq("id", validatedApplicationId)
        .eq("student_id", userProfile.id);

      if (error) {
        console.error("Error updating application:", error.message);
        return fail(500, {
          message: "Failed to update application",
          error: true,
        });
      }

      // Sync documents AFTER update
      await syncDocuments(
        supabase,
        userProfile.id,
        validatedApplicationId,
        validatedFormData,
        validatedCourseId,
        validatedCycleId,
        validatedFormType,
      );

      await syncProfileFields(
        supabase,
        userProfile.id,
        validatedFormData,
        validatedCourseId,
        validatedCycleId,
        validatedFormType,
      );

      return { success: true, message: "Application updated successfully!" };
    } else {
      // Check for existing application
      const { data: existingApp } = await supabase
        .from("applications")
        .select("id, status, application_fee_status")
        .eq("student_id", userProfile.id)
        .eq("course_id", validatedCourseId)
        .eq("cycle_id", validatedCycleId)
        .eq("form_type", validatedFormType)
        .maybeSingle();

      if (existingApp) {
        // If it exists, update it instead of returning "already exists" message
        // This handles cases where user starts fresh but a draft exists
        
        if (["verified", "approved"].includes(existingApp.status)) {
            return {
              success: true,
              message: "A submitted application already exists and is locked.",
              applicationId: existingApp.id,
            };
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
            updated_at: new Date().toISOString(),
            updated_by: userProfile.id,
            application_fee_status: newFeeStatus,
          })
          .eq("id", existingApp.id);

        if (error) {
          return fail(500, { message: "Failed to update existing draft.", error: true });
        }

        await syncDocuments(supabase, userProfile.id, existingApp.id, validatedFormData, validatedCourseId, validatedCycleId, validatedFormType);
        await syncProfileFields(supabase, userProfile.id, validatedFormData, validatedCourseId, validatedCycleId, validatedFormType);

        return {
          success: true,
          message: "Updated existing draft.",
          applicationId: existingApp.id,
        };
      }

      // Determine fee status for new app
      const feeStatus = formFee > 0 ? "pending" : "not_applicable";

      // Create new application
      const { data, error } = await supabase
        .from("applications")
        .insert({
          student_id: userProfile.id,
          course_id: validatedCourseId,
          cycle_id: validatedCycleId,
          branch_id: finalBranchId,
          form_type: validatedFormType,
          admission_type: validatedAdmissionType,
          form_data: validatedFormData,
          status: "draft",
          submitted_at: null,
          application_fee_status: feeStatus,
          created_by: userProfile.id, // Audit
          updated_by: userProfile.id, // Audit
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
        // Sync documents AFTER creation
        await syncDocuments(
          supabase,
          userProfile.id,
          data.id,
          validatedFormData,
          validatedCourseId,
          validatedCycleId,
          validatedFormType,
        );

        await syncProfileFields(
          supabase,
          userProfile.id,
          validatedFormData,
          validatedCourseId,
          validatedCycleId,
          validatedFormType,
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
    if (!authenticatedUser || userProfile?.role !== "student") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const application_id = formData.get("application_id") as string;

    if (!application_id) {
      return fail(400, {
        message: "Application ID is required to submit",
        error: true,
      });
    }

    // Fetch application to get details for validation
    const { data: appData, error: fetchError } = await supabase
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (fetchError || !appData) {
      return fail(404, { message: "Application not found", error: true });
    }

    if (["verified", "approved"].includes(appData.status)) {
      return fail(403, {
        message:
          "Application is already processed and cannot be submitted again.",
        error: true,
      });
    }

    // Fetch schema to validate against
    const { data: formSchema } = await supabase
      .from("admission_forms")
      .select("schema_json, form_fee")
      .eq("course_id", appData.course_id)
      .eq("cycle_id", appData.cycle_id)
      .eq("form_type", appData.form_type)
      .eq("is_enabled", true)
      .single();

    if (!formSchema) {
      return fail(400, {
        message: "Form schema not found for this application type.",
        error: true,
      });
    }

    // Ensure fee status is consistent before submission
    // If fee > 0 and status is 'not_applicable', fix it to 'pending'
    let feeStatusUpdate = {};
    if (
      formSchema.form_fee > 0 &&
      appData.application_fee_status === "not_applicable"
    ) {
      feeStatusUpdate = { application_fee_status: "pending" };
    }

    // Update application status to 'submitted'
    const { error } = await supabase
      .from("applications")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        updated_by: userProfile.id, // Audit
        ...feeStatusUpdate,
      })
      .eq("id", application_id)
      .eq("student_id", userProfile.id);

    if (error) {
      console.error("Error submitting application:", error.message);
      return fail(500, {
        message: "Failed to submit application",
        error: true,
      });
    }

    // Get final status for return
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
        `[Direct Admission] Triggering auto-approval for ${application_id} (Zero Fee)`,
      );
      const supabaseAdmin = createClient(
        PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );
      const approveResult = await approveApplicationLogic(
        supabaseAdmin,
        application_id,
        userProfile.id,
        appData.admission_type || "Merit",
        "Direct Admission on Submit (Zero Fee)",
      );
      if (approveResult.success) {
        return {
          success: true,
          message: "Application submitted and admitted successfully!",
          feeStatus: finalFeeStatus,
          feeAmount: formSchema.form_fee,
          admitted: true,
          admissionNumber: approveResult.admissionNumber,
        };
      } else {
        console.error(
          "[Direct Admission] Auto-approval failed:",
          approveResult.message,
        );
        // We still return success for submission, but maybe with a warning or just let it stay as submitted
      }
    }

    return {
      success: true,
      message: "Application submitted successfully!",
      feeStatus: finalFeeStatus,
      feeAmount: formSchema.form_fee,
    };
  },
};
