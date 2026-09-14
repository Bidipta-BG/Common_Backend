const express = require('express');
const referrersService = require('../services/referrers.service');

const router = express.Router();

// POST /api/starttambola/internal/referrals/confirm
router.post('/confirm', async (req, res, next) => {
  try {
    const { tenantId, orderId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    const data = await referrersService.confirmReferral({ tenantId, orderId });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
