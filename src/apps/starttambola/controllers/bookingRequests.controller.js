const bookingRequestsService = require('../services/bookingRequests.service');
const { z } = require('zod');

// ─── GET /tenants/:tenantId/booking-requests (tenant_admin) ──────────────────
const listRequests = async (req, res, next) => {
  try {
    // Validate optional status query param
    const VALID_STATUSES = ['pending', 'approved', 'rejected', 'expired'];
    const { status } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: {
          message: `Invalid status filter. Allowed: ${VALID_STATUSES.join(', ')}`,
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const requests = await bookingRequestsService.listBookingRequests(
      req.params.tenantId,
      status || null
    );
    return res.status(200).json({ data: requests });
  } catch (err) {
    return next(err);
  }
};

// ─── POST .../booking-requests/:requestId/approve (tenant_admin) ──────────────
const approveRequest = async (req, res, next) => {
  try {
    const result = await bookingRequestsService.approveBookingRequest(
      req.params.tenantId,
      req.params.requestId,
      req.auth.userId
    );
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST .../booking-requests/:requestId/reject (tenant_admin) ───────────────
const rejectRequest = async (req, res, next) => {
  try {
    const result = await bookingRequestsService.rejectBookingRequest(
      req.params.tenantId,
      req.params.requestId,
      req.auth.userId
    );
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

module.exports = { listRequests, approveRequest, rejectRequest };
