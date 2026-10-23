-- Migration: Allow fee_collector to view student html_profile templates
UPDATE public.report_templates 
SET allowed_roles = array_append(allowed_roles, 'fee_collector')
WHERE report_type = 'html_profile' AND NOT ('fee_collector' = ANY(allowed_roles));
