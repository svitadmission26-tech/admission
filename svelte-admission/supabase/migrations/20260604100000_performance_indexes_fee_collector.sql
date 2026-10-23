-- Migration: Performance Indexes for Fee Collector
-- Path: supabase/migrations/20260604100000_performance_indexes_fee_collector.sql

-- 1. Indexes for payments table
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON public.payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_application_id ON public.payments(application_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 2. Indexes for account_admissions table
CREATE INDEX IF NOT EXISTS idx_account_admissions_account_status ON public.account_admissions(account_status);
CREATE INDEX IF NOT EXISTS idx_account_admissions_enrollment_status ON public.account_admissions(enrollment_status);

-- 3. Composite indexes for common filters
CREATE INDEX IF NOT EXISTS idx_payments_app_type_status ON public.payments(application_id, payment_type, status);
