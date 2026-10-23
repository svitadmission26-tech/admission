-- Migration: Synchronize receipt_sequences with max receipt numbers in fee_receipts
DO $$
DECLARE
    seq RECORD;
    max_num INTEGER;
    search_pattern TEXT;
    ay_short TEXT;
    c_code TEXT;
BEGIN
    RAISE NOTICE 'Starting receipt sequence synchronization...';
    
    FOR seq IN SELECT * FROM public.receipt_sequences LOOP
        -- Fetch academic year short code
        SELECT short_code INTO ay_short 
        FROM public.academic_years 
        WHERE id = seq.academic_year_id;
        
        -- Fetch course code
        SELECT code INTO c_code 
        FROM public.courses 
        WHERE id = seq.course_id;
        
        -- Build the search pattern
        -- Format: prefix + (ay_short + c_code) + '-' + seq
        -- Example: TUIT-26BE-0022
        IF ay_short IS NOT NULL AND c_code IS NOT NULL THEN
            search_pattern := seq.prefix || ay_short || c_code || '-%';
        ELSE
            search_pattern := seq.prefix || '%';
        END IF;

        -- Extract and find the maximum numeric suffix from fee_receipts
        SELECT COALESCE(MAX(SUBSTRING(receipt_no FROM '-([0-9]+)$')::INTEGER), 0)
        INTO max_num
        FROM public.fee_receipts
        WHERE receipt_no LIKE search_pattern;

        -- Update sequence if the actual max suffix number is higher than the current tracker
        IF max_num > seq.current_sequence THEN
            RAISE NOTICE 'Updating sequence % (prefix: %, course: %, year: %) from % to %', 
                seq.id, seq.prefix, c_code, ay_short, seq.current_sequence, max_num;
                
            UPDATE public.receipt_sequences
            SET current_sequence = max_num
            WHERE id = seq.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Sequence synchronization complete.';
END $$;
