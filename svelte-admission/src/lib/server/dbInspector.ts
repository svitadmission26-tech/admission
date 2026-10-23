
// Static definition of the database schema for the Report Builder
// This avoids complex introspection permissions issues.

export interface JsonColumnKey {
  key: string;
  label: string;
}

export interface TableDefinition {
  name: string;
  label: string;
  columns: { name: string; label: string; type: string; jsonKeys?: JsonColumnKey[] }[];
  relationships: {
    targetTable: string;
    label: string;
    foreignKey: string;
    type: "one-to-one" | "many-to-one" | "one-to-many";
  }[];
}

export const DB_SCHEMA: Record<string, TableDefinition> = {
  applications: {
    name: "applications",
    label: "Applications",
    columns: [
      { name: "id", label: "ID", type: "uuid" },
      { name: "status", label: "Status", type: "text" },
      { name: "form_type", label: "Form Type", type: "text" },
      { name: "submitted_at", label: "Submitted Date", type: "datetime" },
      { name: "updated_at", label: "Last Updated", type: "datetime" },
      { name: "merit_score", label: "Merit Score", type: "number" },
      { name: "merit_rank", label: "Merit Rank", type: "number" },
      { name: "application_fee_status", label: "Fee Status", type: "text" },
      { name: "approval_comment", label: "Approval Comment", type: "text" },
      { name: "rejection_reason", label: "Rejection Reason", type: "text" },
      { name: "form_data", label: "Form Data", type: "json", jsonKeys: [] },
    ],
    relationships: [
      {
        targetTable: "users",
        label: "Student",
        foreignKey: "student_id",
        type: "many-to-one",
      },
      {
        targetTable: "courses",
        label: "Course",
        foreignKey: "course_id",
        type: "many-to-one",
      },
      {
        targetTable: "admission_cycles",
        label: "Cycle",
        foreignKey: "cycle_id",
        type: "many-to-one",
      },
      {
        targetTable: "branches",
        label: "Branch",
        foreignKey: "branch_id",
        type: "many-to-one",
      },
      {
        targetTable: "payments",
        label: "Payments",
        foreignKey: "application_id",
        type: "one-to-many",
      },
      {
        targetTable: "account_admissions",
        label: "Admission Info",
        foreignKey: "application_id",
        type: "one-to-one",
      },
    ],
  },
  account_admissions: {
    name: "account_admissions",
    label: "Account Admissions",
    columns: [
      { name: "admission_number", label: "Admission No", type: "text" },
      { name: "admission_date", label: "Admission Date", type: "datetime" },
      { name: "admission_type", label: "Admission Type", type: "text" },
      { name: "account_status", label: "Account Status", type: "text" },
      { name: "remarks", label: "Remarks", type: "text" },
    ],
    relationships: [
      {
        targetTable: "applications",
        label: "Application",
        foreignKey: "application_id",
        type: "many-to-one",
      },
    ],
  },
  users: {
    name: "users",
    label: "Users",
    columns: [
      { name: "id", label: "ID", type: "uuid" },
      { name: "full_name", label: "Full Name", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "role", label: "Role", type: "text" },
    ],
    relationships: [
      {
        targetTable: "student_profiles",
        label: "Profile",
        foreignKey: "student_profiles_user_id_fkey",
        type: "one-to-one",
      },
    ],
  },
  student_profiles: {
    name: "student_profiles",
    label: "Student Profiles",
    columns: [
      { name: "enrollment_number", label: "College ID", type: "text" },
      { name: "admission_status", label: "Admission Status", type: "text" },
      { name: "profile_data", label: "Profile Data", type: "json", jsonKeys: [] },
    ],
    relationships: [],
  },
  courses: {
    name: "courses",
    label: "Courses",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
    ],
    relationships: [
      {
        targetTable: "colleges",
        label: "College",
        foreignKey: "college_id",
        type: "many-to-one",
      },
    ],
  },
  payments: {
    name: "payments",
    label: "Payments",
    columns: [
      { name: "amount", label: "Amount", type: "number" },
      { name: "payment_type", label: "Type", type: "text" },
      { name: "status", label: "Status", type: "text" },
      { name: "transaction_id", label: "Transaction ID", type: "text" },
      { name: "receipt_number", label: "Receipt No", type: "text" },
      { name: "payment_date", label: "Date", type: "datetime" },
    ],
    relationships: [
      {
        targetTable: "applications",
        label: "Application",
        foreignKey: "application_id",
        type: "many-to-one",
      },
    ],
  },
  branches: {
    name: "branches",
    label: "Branches",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
    ],
    relationships: [
      {
        targetTable: "courses",
        label: "Course",
        foreignKey: "course_id",
        type: "many-to-one",
      },
    ],
  },
  admission_cycles: {
    name: "admission_cycles",
    label: "Admission Cycles",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "end_date", label: "End Date", type: "date" },
    ],
    relationships: [
      {
        targetTable: "academic_years",
        label: "Academic Year",
        foreignKey: "academic_year_id",
        type: "many-to-one",
      },
    ],
  },
  colleges: {
    name: "colleges",
    label: "Colleges",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
      { name: "logo_url", label: "Logo URL", type: "text" },
      { name: "address", label: "Address", type: "text" },
      { name: "upi_vpa", label: "UPI ID", type: "text" },
    ],
    relationships: [
      {
        targetTable: "universities",
        label: "University",
        foreignKey: "university_id",
        type: "many-to-one",
      },
    ],
  },
  universities: {
    name: "universities",
    label: "Universities",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "code", label: "Code", type: "text" },
      { name: "logo_url", label: "Logo URL", type: "text" },
      { name: "footer_text", label: "Footer Text", type: "text" },
      { name: "website", label: "Website", type: "text" },
      { name: "address", label: "Address", type: "text" },
    ],
    relationships: [],
  },
  academic_years: {
    name: "academic_years",
    label: "Academic Years",
    columns: [
      { name: "name", label: "Name", type: "text" },
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "end_date", label: "End Date", type: "date" },
    ],
    relationships: [],
  },
};

export function getSchema(
  profileFields: { key: string; label: string }[] = [],
  formFields: { key: string; label: string }[] = []
) {
  const schemaCopy = JSON.parse(JSON.stringify(DB_SCHEMA)) as Record<string, TableDefinition>;

  // 1. Inject Profile Fields
  const profileTable = schemaCopy.student_profiles;
  if (profileTable) {
    const profileDataColumn = profileTable.columns.find((c) => c.name === 'profile_data');
    if (profileDataColumn) {
      profileDataColumn.jsonKeys = profileFields.map((field) => ({
        key: field.key,
        label: field.label,
      }));
    }
  }

  // 2. Inject Application Form Fields
  const appTable = schemaCopy.applications;
  if (appTable) {
    const formDataColumn = appTable.columns.find((c) => c.name === 'form_data');
    if (formDataColumn) {
      formDataColumn.jsonKeys = formFields.map((field) => ({
        key: field.key,
        label: field.label,
      }));
    }
  }

  return Object.values(schemaCopy);
}
