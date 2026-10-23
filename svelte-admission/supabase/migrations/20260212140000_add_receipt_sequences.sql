-- Migration: Add receipt_sequences table for separate receipt number tracking

CREATE TABLE public.receipt_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_type TEXT NOT NULL, -- e.g. 'provisional_fee', 'application_fee'
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE, -- Optional: Link to year for yearly reset
    current_sequence INTEGER DEFAULT 0,
    prefix TEXT, -- e.g. 'REC-PROV-', 'REC-APP-'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(payment_type, academic_year_id)
);

-- Index for performance
CREATE INDEX idx_receipt_sequences_type_year ON public.receipt_sequences(payment_type, academic_year_id);
