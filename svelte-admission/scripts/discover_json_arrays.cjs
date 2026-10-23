const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function discoverJsonArrays() {
    console.log("Starting JSON Array Discovery...");
    const discoveries = {};

    // 1. Check Applications (form_data)
    console.log("Scanning applications.form_data...");
    const { data: apps } = await supabase.from('applications').select('form_data').limit(200);
    
    apps?.forEach(app => {
        if (!app.form_data) return;
        Object.entries(app.form_data).forEach(([key, value]) => {
            if (Array.isArray(value) && value.length > 0) {
                if (!discoveries[key]) discoveries[key] = { sources: new Set(), keys: new Set() };
                discoveries[key].sources.add('application');
                // Inspect first item for keys
                Object.keys(value[0]).forEach(k => discoveries[key].keys.add(k));
            }
        });
    });

    // 2. Check Student Profiles (profile_data)
    console.log("Scanning student_profiles.profile_data...");
    const { data: profiles } = await supabase.from('student_profiles').select('profile_data').limit(200);
    
    profiles?.forEach(profile => {
        if (!profile.profile_data) return;
        Object.entries(profile.profile_data).forEach(([key, value]) => {
            if (Array.isArray(value) && value.length > 0) {
                if (!discoveries[key]) discoveries[key] = { sources: new Set(), keys: new Set() };
                discoveries[key].sources.add('profile');
                Object.keys(value[0]).forEach(k => discoveries[key].keys.add(k));
            }
        });
    });

    // 3. Check Dedicated Marks Table (for marks_list alias)
    console.log("Scanning marks table...");
    const { data: marks } = await supabase.from('marks').select('*').limit(50);
    if (marks && marks.length > 0) {
        discoveries['marks_list'] = {
            sources: new Set(['marks table']),
            keys: new Set(Object.keys(marks[0]))
        };
    }

    // 4. Check Payments
    console.log("Scanning payments table...");
    const { data: payments } = await supabase.from('payments').select('*').limit(50);
    if (payments && payments.length > 0) {
        discoveries['payments'] = {
            sources: new Set(['payments table']),
            keys: new Set(Object.keys(payments[0]))
        };
    }

    // Format for output
    const result = {};
    Object.entries(discoveries).forEach(([key, data]) => {
        result[key] = {
            sources: Array.from(data.sources),
            sample_keys: Array.from(data.keys).filter(k => !k.includes('id') && !k.includes('at')) // Filter out IDs/Dates for cleaner suggestions
        };
    });

    console.log("\n--- DISCOVERED JSON ARRAYS ---");
    console.log(JSON.stringify(result, null, 2));
}

discoverJsonArrays();
