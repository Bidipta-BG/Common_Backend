const { z } = require('zod');

// ─── validateBody ─────────────────────────────────────────────────────────────
// Middleware factory. Pass a Zod schema; it parses req.body with safeParse.
// On failure, forwards a ZodError to the next error handler, which serialises
// it into { error: { message, code, details } } via the global errorHandler.
// On success, replaces req.body with the parsed+coerced data.
//
// Usage:
//   router.post('/', validateBody(mySchema), myController);

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(result.error); // ZodError — caught by errorHandler
  }
  req.body = result.data; // replace with coerced, validated data
  return next();
};

module.exports = { validateBody, z };
