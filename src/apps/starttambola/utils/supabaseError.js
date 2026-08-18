const { AppError } = require('./AppError');

// ─── handleSupabaseError ──────────────────────────────────────────────────────
// Converts a raw Supabase/PostgREST error into a typed AppError so the global
// error handler can return the correct HTTP status code rather than a generic 500.
//
// Usage (in any service):
//   const { data, error } = await supabaseAdmin.from(...).select(...).single();
//   if (error) handleSupabaseError(error, 'Tenant');

const handleSupabaseError = (error, resourceLabel = 'Resource') => {
  switch (error.code) {
    case '23505': // unique_violation
      throw new AppError(
        `${resourceLabel} already exists (duplicate entry)`,
        'CONFLICT',
        409
      );
    case '23503': // foreign_key_violation
      throw new AppError(
        'Referenced resource does not exist',
        'NOT_FOUND',
        404
      );
    case 'PGRST116': // PostgREST: 0 rows when .single() expected exactly 1
      throw new AppError(`${resourceLabel} not found`, 'NOT_FOUND', 404);
    default:
      // Surface the raw DB message in development for easier debugging
      throw new AppError(
        process.env.NODE_ENV === 'development'
          ? `Database error: ${error.message}`
          : 'A database error occurred',
        'DB_ERROR',
        500
      );
  }
};

module.exports = { handleSupabaseError };
