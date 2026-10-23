# Changelog - June 1, 2026

## [1.2.1] - Admission Sequence Partitioning & Constraint Refinement

### Added
- **Admission Type Partitioning**: Implemented support for partitioning admission and enrollment sequences by `admission_type` (Regular, D2D, C2D).
- **Database Migrations**:
    - `new_database/add_admission_type_to_admission_sequences.sql`: Adds `admission_type` to admission sequences.
    - `new_database/add_enrollment_type_to_enrollment_sequences.sql`: Adds `admission_type` to enrollment sequences and updates the unique index.
    - `supabase/migrations/20260601000001_fix_admission_sequences_unique_constraint.sql`: Refines the unique constraint for admission sequences to include the admission type.
- **Documentation**: Added `UI_TEMPLATEBUILDER_IMPLEMENTATION_DETAIL.md` covering internal architecture for form rendering and data binding.

### Changed
- **Enrollment Logic**: Refactored `src/lib/server/enrollment.ts` to use `admission_type` when fetching or creating enrollment sequences, ensuring accurate numbering for different admission modes.
- **Admission Sequence Management**: Updated the administrative interface (`src/routes/admin/admission-sequences/`) to allow management of sequences specifically for different admission types.
- **Schema Hardening**: Updated `supabase/schema.sql` and related setup scripts to include the new column and constraint definitions as part of the core schema.

### Fixed
- **Constraint Collisions**: Resolved issues where different admission types could not share the same sequence prefix by making the unique constraints aware of the `admission_type`.
- **Enrollment Number Overlaps**: Fixed potential overlaps in enrollment numbers by partitioning sequences at the database level.

### Migration Required
1. Run `new_database/add_admission_type_to_admission_sequences.sql`
2. Run `new_database/add_enrollment_type_to_enrollment_sequences.sql`
3. Run `supabase/migrations/20260601000001_fix_admission_sequences_unique_constraint.sql`
