const express = require('express');
const { requireSuperAdminKey } = require('../middleware/superAdmin');
const referrersService = require('../services/referrers.service');
const { AppError } = require('../utils/AppError');

const router = express.Router();

// POST /api/starttambola/referrers (Requires internal key for security from Next.js)
router.post('/', requireSuperAdminKey, async (req, res, next) => {
  try {
    const { name, email, mobile, password } = req.body;
    if (!name || !email || !mobile || !password) {
      throw new AppError('Missing required fields', 'BAD_REQUEST', 400);
    }
    const data = await referrersService.createReferrer({ name, email, mobile, password });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// POST /api/starttambola/referrers/auth
router.post('/auth', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError('Missing email or password', 'BAD_REQUEST', 400);
    }
    const data = await referrersService.authenticateReferrer({ email, password });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// GET /api/starttambola/referrers/by-code/:code
router.get('/by-code/:code', async (req, res, next) => {
  try {
    const data = await referrersService.validateReferralCode(req.params.code);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// GET /api/starttambola/referrers/:id/dashboard
router.get('/:id/dashboard', requireSuperAdminKey, async (req, res, next) => {
  try {
    const data = await referrersService.getDashboardStats(req.params.id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
