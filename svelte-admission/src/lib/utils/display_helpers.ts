// src/lib/utils/display_helpers.ts

export function getBranchDisplayCode(branchName: string | null | undefined, branchCode: string | null | undefined): string {
    if (branchCode) {
        return branchCode;
    }
    if (branchName) {
        // Generate alias from branch name: e.g., "Bachelor of Computer Applications" -> "BCA"
        return branchName.split(' ')
                         .filter(word => word.toLowerCase() !== 'of') // Ignore 'of'
                         .map(word => word.charAt(0))
                         .join('');
    }
    return ''; // Fallback if both name and code are missing
}
