import { fail, redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { z } from "zod";

// Schema for profile field validation
const fieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "Key must be lowercase with underscores only"),
  label: z.string().min(1),
  type: z.enum([
    "text",
    "number",
    "date",
    "select",
    "textarea",
    "email",
    "checkbox",
    "file",
    "image",
    "document",
  ]),
  is_required: z.coerce.boolean(),
  force_uppercase: z.coerce.boolean(),
  options: z.string().optional(), // Comma-separated options for select
  default_value: z.string().optional(), // Default value for the field
});

export const load: PageServerLoad = async ({
  locals: { supabase, getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser || userProfile?.role !== "admin") {
    throw redirect(303, "/login");
  }

  const { data: fields, error } = await supabase
    .from("student_profile_fields")
    .select("id, key, label, type, is_required, force_uppercase, options, default_value")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching profile fields:", error);
    return { fields: [] };
  }

  return { fields: fields || [] };
};

export const actions: Actions = {
  create: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);

    // Handle checkbox manually
    const payload = {
      ...rawData,
      is_required: formData.has("is_required"),
      force_uppercase: formData.has("force_uppercase"),
    };

    const parsed = fieldSchema.safeParse(payload);

    if (!parsed.success) {
      return fail(400, {
        error: true,
        message: parsed.error.issues.map((e: any) => e.message).join(", "),
      });
    }

    const { key, label, type, is_required, force_uppercase, options, default_value } =
      parsed.data;

    let optionsJson = null;
    if (type === "select" && options) {
      optionsJson = options
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean);
    }

    const { error } = await supabase.from("student_profile_fields").insert({
      key,
      label,
      type,
      is_required,
      force_uppercase,
      options: optionsJson,
      default_value: default_value || null,
    });

    if (error) {
      return fail(500, {
        error: true,
        message: "Failed to create field. Key might be duplicate.",
      });
    }

    return { success: true };
  },

  update: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const id = formData.get("id") as string;

    if (!id) {
      return fail(400, { error: true, message: "Field ID is required." });
    }

    const rawData = Object.fromEntries(formData);

    const payload = {
      ...rawData,
      is_required: formData.has("is_required"),
      force_uppercase: formData.has("force_uppercase"),
    };

    const parsed = fieldSchema.safeParse(payload);

    if (!parsed.success) {
      return fail(400, {
        error: true,
        message: parsed.error.issues.map((e: any) => e.message).join(", "),
      });
    }

    const { key, label, type, is_required, force_uppercase, options, default_value } =
      parsed.data;

    let optionsJson = null;
    if (type === "select" && options) {
      optionsJson = options
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean);
    }

    const { error } = await supabase
      .from("student_profile_fields")
      .update({
        key,
        label,
        type,
        is_required,
        force_uppercase,
        options: optionsJson,
        default_value: default_value || null,
      })
      .eq("id", id);

    if (error) {
      return fail(500, {
        error: true,
        message: "Failed to update field. Key might be duplicate.",
      });
    }

    return { success: true };
  },

  delete: async ({
    request,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const id = formData.get("id") as string;

    // 1. Get the key of the field before deleting it
    const { data: fieldToDelete, error: fetchError } = await supabase
      .from("student_profile_fields")
      .select("key")
      .eq("id", id)
      .single();

    if (fetchError || !fieldToDelete) {
      return fail(404, { error: true, message: "Field not found." });
    }

    const deletedKey = fieldToDelete.key;

    // 2. Delete the field from profile schema
    const { error: deleteError } = await supabase
      .from("student_profile_fields")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return fail(500, { error: true, message: "Failed to delete field." });
    }

    // 3. Clean up mappings in Admission Forms
    // Find forms that use this profile key
    // Note: We use a broad check then refine in JS because deeply nested JSON array updates in SQL are complex
    const { data: formsToUpdate } = await supabase
      .from("admission_forms")
      .select("id, schema_json");

    if (formsToUpdate) {
      for (const form of formsToUpdate) {
        let modified = false;
        const schema = form.schema_json;

        if (schema && schema.fields && Array.isArray(schema.fields)) {
          schema.fields = schema.fields.map((f: any) => {
            if (f.profileFieldKey === deletedKey) {
              modified = true;
              // Unlink the field by removing the property
              const { profileFieldKey, ...rest } = f;
              return rest;
            }
            return f;
          });
        }

        if (modified) {
          await supabase
            .from("admission_forms")
            .update({ schema_json: schema })
            .eq("id", form.id);
        }
      }
    }

    return { success: true };
  },
};
