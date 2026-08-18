// ─── GET /auth/me ─────────────────────────────────────────────────────────────
// Debug/verification endpoint. Returns the parsed req.auth object so you can
// confirm JWTs are being decoded and the custom claims (tenantId, role) are
// flowing through correctly. Protected by requireAuth.

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getMe = (req, res) => {
  return res.status(200).json({
    data: req.auth,
  });
};

module.exports = { getMe };
