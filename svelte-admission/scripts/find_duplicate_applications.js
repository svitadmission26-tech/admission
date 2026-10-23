import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Error: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Possible exact keys for matching in JSON fields
const AADHAR_KEYS = [
    'aadhar_name', 'name_as_per_aadhar', 'aadhar_card_name', 
    'name_on_aadhar', 'aadharname'
];
const MARKSHEET_KEYS = [
    'marksheet_name', 'name_as_per_marksheet', 'name_on_marksheet', 
    'marksheetname', 'name_as_per_mark_sheet'
];

// Keywords for fuzzy matching if exact keys are not found
const AADHAR_KEYWORDS = ['aadhar'];
const MARKSHEET_KEYWORDS = ['marksheet', 'mark_sheet'];

function findName(json, possibleKeys, keywords) {
    if (!json || typeof json !== 'object') return null;

    // 1. Direct check
    for (const key of possibleKeys) {
        if (json[key] && typeof json[key] === 'string') {
            return json[key];
        }
    }

    // 2. Fuzzy check: Look for keys containing BOTH a keyword and "name"
    for (const [key, val] of Object.entries(json)) {
        if (typeof val !== 'string') continue;
        const lowerKey = key.toLowerCase();
        const hasKeyword = keywords.some(kw => lowerKey.includes(kw));
        const hasName = lowerKey.includes('name');
        if (hasKeyword && hasName) {
            return val;
        }
    }
    return null;
}

async function findDuplicateApplications() {
    console.log("Fetching applications and student data from Supabase...");
    
    // Fetch applications with joined user and profile data
    const { data: applications, error } = await supabase
        .from('applications')
        .select(`
            id,
            form_type,
            form_data,
            student:users!applications_student_id_fkey (
                id,
                full_name,
                email,
                student_profiles (
                    profile_data
                )
            )
        `);

    if (error) {
        console.error("Error fetching applications:", error);
        process.exit(1);
    }

    console.log(`Successfully fetched ${applications.length} applications.\n`);

    const aadharGroups = {};
    const marksheetGroups = {};

    applications.forEach(app => {
        const formData = app.form_data || {};
        
        // Handle PostgREST returning single object or array
        const studentUser = Array.isArray(app.student) ? app.student[0] : app.student;
        const profiles = studentUser?.student_profiles;
        const profileData = Array.isArray(profiles) ? profiles[0]?.profile_data : profiles?.profile_data;
        const finalProfileData = profileData || {};

        // Merge all dynamic fields to search them together
        const allData = { ...formData, ...finalProfileData };

        const aadharName = findName(allData, AADHAR_KEYS, AADHAR_KEYWORDS);
        const marksheetName = findName(allData, MARKSHEET_KEYS, MARKSHEET_KEYWORDS);

        // Normalize names for case-insensitive matching
        const normAadhar = aadharName ? aadharName.trim().toLowerCase() : null;
        const normMarksheet = marksheetName ? marksheetName.trim().toLowerCase() : null;

        const record = {
            appId: app.id,
            formType: app.form_type,
            fullName: studentUser?.full_name || 'N/A',
            email: studentUser?.email || 'N/A',
            contact: allData.phone || allData.contact || allData.mobile || 'N/A',
            aadharName: aadharName || 'Not Found',
            marksheetName: marksheetName || 'Not Found'
        };

        if (normAadhar) {
            if (!aadharGroups[normAadhar]) aadharGroups[normAadhar] = [];
            aadharGroups[normAadhar].push(record);
        }

        if (normMarksheet) {
            if (!marksheetGroups[normMarksheet]) marksheetGroups[normMarksheet] = [];
            marksheetGroups[normMarksheet].push(record);
        }
    });

    const exportAadharData = [];
    const exportMarksheetData = [];

    // Output Aadhar duplicates
    console.log("================================================");
    console.log("DUPLICATES BASED ON AADHAR NAME (IGNORE CASE)");
    console.log("================================================");
    let foundAadharDuplicates = false;
    for (const [key, records] of Object.entries(aadharGroups)) {
        if (records.length > 1) {
            foundAadharDuplicates = true;
            console.log(`\n[Aadhar Name: "${key}"] - Found ${records.length} records`);
            records.forEach(rec => {
                console.log(`  - App ID: ${rec.appId} | Form Type: ${rec.formType}`);
                console.log(`    Profile:  ${rec.fullName} | Email: ${rec.email} | Contact: ${rec.contact}`);
                console.log(`    Aadhar Field:    "${rec.aadharName}"`);
                console.log(`    Marksheet Field: "${rec.marksheetName}"`);

                exportAadharData.push({
                    "Matched Aadhar Name": key,
                    "App ID": rec.appId,
                    "Form Type": rec.formType,
                    "Full Name": rec.fullName,
                    "Email": rec.email,
                    "Contact": rec.contact,
                    "Aadhar Field": rec.aadharName,
                    "Marksheet Field": rec.marksheetName
                });
            });
        }
    }
    if (!foundAadharDuplicates) console.log("No duplicates found based on Aadhar name.");

    // Output Marksheet duplicates
    console.log("\n================================================");
    console.log("DUPLICATES BASED ON MARKSHEET NAME (IGNORE CASE)");
    console.log("================================================");
    let foundMarksheetDuplicates = false;
    for (const [key, records] of Object.entries(marksheetGroups)) {
        if (records.length > 1) {
            foundMarksheetDuplicates = true;
            console.log(`\n[Marksheet Name: "${key}"] - Found ${records.length} records`);
            records.forEach(rec => {
                console.log(`  - App ID: ${rec.appId} | Form Type: ${rec.formType}`);
                console.log(`    Profile:  ${rec.fullName} | Email: ${rec.email} | Contact: ${rec.contact}`);
                console.log(`    Aadhar Field:    "${rec.aadharName}"`);
                console.log(`    Marksheet Field: "${rec.marksheetName}"`);
                
                exportMarksheetData.push({
                    "Matched Marksheet Name": key,
                    "App ID": rec.appId,
                    "Form Type": rec.formType,
                    "Full Name": rec.fullName,
                    "Email": rec.email,
                    "Contact": rec.contact,
                    "Aadhar Field": rec.aadharName,
                    "Marksheet Field": rec.marksheetName
                });
            });
        }
    }
    if (!foundMarksheetDuplicates) console.log("No duplicates found based on Marksheet name.");

    // Export to Excel
    if (exportAadharData.length > 0 || exportMarksheetData.length > 0) {
        console.log("\nExporting duplicates to duplicate_applications.xlsx ...");
        const wb = XLSX.utils.book_new();

        if (exportAadharData.length > 0) {
            const wsAadhar = XLSX.utils.json_to_sheet(exportAadharData);
            XLSX.utils.book_append_sheet(wb, wsAadhar, "Aadhar Duplicates");
        }

        if (exportMarksheetData.length > 0) {
            const wsMarksheet = XLSX.utils.json_to_sheet(exportMarksheetData);
            XLSX.utils.book_append_sheet(wb, wsMarksheet, "Marksheet Duplicates");
        }

        XLSX.writeFile(wb, "duplicate_applications.xlsx");
        console.log("Export complete: duplicate_applications.xlsx generated.");
    }
}

findDuplicateApplications();
