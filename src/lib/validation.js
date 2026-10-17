// Shared input validation helpers.

// Postgres rejects anything that is not a UUID for `uuid` columns, so validate
// reference values before they reach the database and surface a clear message.
export const isUuid = (value) =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value.trim(),
	);

// Foreign-key columns follow the `<table>_id` naming convention in this schema.
export const isUuidField = (key) => /_id$/.test(key);

export const fieldLabel = (key) => key.replaceAll('_', ' ');
