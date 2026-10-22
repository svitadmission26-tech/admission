// Resolves the ERP module access of the signed-in account.
//
// The database is the only source of truth: public.get_my_erp_access() reads
// the module registry and the permission matrix with the signed-in role and
// returns the modules that the account may open and what it may do with them.
// The client never widens access on its own.

import { supabase } from '../supabase';

const emptyAccess = {
	role: null,
	is_admin: false,
	modules: [],
};

export async function loadErpAccess() {
	try {
		const { data, error } = await supabase.rpc('get_my_erp_access');
		if (error) {
			console.warn('ERP access could not be read', error);
			return { ...emptyAccess, unavailable: true };
		}
		return {
			role: data?.role ?? null,
			is_admin: Boolean(data?.is_admin),
			modules: Array.isArray(data?.modules) ? data.modules : [],
		};
	} catch (error) {
		console.warn('ERP access could not be read', error);
		return { ...emptyAccess, unavailable: true };
	}
}

// The permissions of one module for the signed-in account.
export function modulePermissions(access, moduleId) {
	const entry = (access?.modules ?? []).find((module) => module.id === moduleId);
	if (!entry) {
		return {
			view: false,
			create: false,
			edit: false,
			delete: false,
			export: false,
			approve: false,
		};
	}
	return {
		view: Boolean(entry.permissions?.view),
		create: Boolean(entry.permissions?.create),
		edit: Boolean(entry.permissions?.edit),
		delete: Boolean(entry.permissions?.delete),
		export: Boolean(entry.permissions?.export),
		approve: Boolean(entry.permissions?.approve),
	};
}

// The modules the account may open, in the order of the registry.
export function accessibleModules(access) {
	return (access?.modules ?? []).slice().sort((a, b) => {
		const order = (a.display_order ?? 0) - (b.display_order ?? 0);
		if (order !== 0) return order;
		return (a.number ?? 0) - (b.number ?? 0);
	});
}
