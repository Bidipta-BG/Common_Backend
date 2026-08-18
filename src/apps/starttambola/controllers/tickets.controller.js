const ticketsService = require('../services/tickets.service');
const { z } = require('zod');

// ─── GET /tenants/:tenantId/games/:gameId/tickets (PUBLIC) ────────────────────
const listTickets = async (req, res, next) => {
  try {
    const tickets = await ticketsService.listGameTickets(
      req.params.tenantId,
      req.params.gameId
    );
    return res.status(200).json({ data: tickets });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/games/:gameId/admin-tickets (PROTECTED) ───────────
const listAdminTickets = async (req, res, next) => {
  try {
    const tickets = await ticketsService.listAdminGameTickets(
      req.params.tenantId,
      req.params.gameId
    );
    return res.status(200).json({ data: tickets });
  } catch (err) {
    return next(err);
  }
};

// ─── POST .../tickets/:ticketId/book-request (PUBLIC) ────────────────────────
const bookRequest = async (req, res, next) => {
  try {
    const request = await ticketsService.createBookRequest(
      req.params.tenantId,
      req.params.gameId,
      req.params.ticketId,
      req.body
    );
    return res.status(201).json({ data: request });
  } catch (err) {
    return next(err);
  }
};

// ─── POST .../tickets/:ticketId/book-direct (tenant_admin | agent) ────────────
const bookDirect = async (req, res, next) => {
  try {
    const ticket = await ticketsService.bookDirect(
      req.params.tenantId,
      req.params.gameId,
      req.params.ticketId,
      req.body,
      req.auth
    );
    return res.status(200).json({ data: ticket });
  } catch (err) {
    return next(err);
  }
};

// ─── POST .../tickets/book-bulk (agent only) ──────────────────────────────────
const bookBulk = async (req, res, next) => {
  try {
    const tickets = await ticketsService.bookBulk(
      req.params.tenantId,
      req.params.gameId,
      req.body,
      req.auth
    );
    return res.status(200).json({ data: tickets });
  } catch (err) {
    return next(err);
  }
};

module.exports = { listTickets, listAdminTickets, bookRequest, bookDirect, bookBulk };
