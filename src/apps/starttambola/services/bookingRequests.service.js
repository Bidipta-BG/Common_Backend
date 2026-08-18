const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');

// ─── _getRequestOrThrow ───────────────────────────────────────────────────────
// Fetches a booking_request scoped to a tenant. Returns 404 if not found.
// The tenant_id equality is the ownership guard.

const _getRequestOrThrow = async (tenantId, requestId) => {
  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .select('*')
    .eq('id', requestId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) handleSupabaseError(error, 'BookingRequest');
  return data;
};

// ─── listBookingRequests ──────────────────────────────────────────────────────
// Returns booking_requests for a tenant, optionally filtered by status.
// Sorted most-recent-first.

const listBookingRequests = async (tenantId, statusFilter) => {
  let query = supabaseAdmin
    .from('booking_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) handleSupabaseError(error, 'BookingRequests');
  return data ?? [];
};

// ─── approveBookingRequest ────────────────────────────────────────────────────
// Sets ticket.status = 'booked', copies player info from request, marks
// booked_via = 'self' (player requested → admin approved).
// Sets request.status = 'approved', records resolver + timestamp.
//
// Guards: request must be 'pending'. If ticket is no longer 'reserved' (e.g. it
// was reset by an admin), we still approve the request but log the discrepancy.

const approveBookingRequest = async (tenantId, requestId, resolvedBy) => {
  const request = await _getRequestOrThrow(tenantId, requestId);

  if (request.status !== 'pending') {
    throw new AppError(
      `Cannot approve a request that is already '${request.status}'.`,
      'BAD_REQUEST',
      400
    );
  }

  const resolvedAt = new Date().toISOString();

  // Update ticket to booked with player info from the original request
  const { error: ticketError } = await supabaseAdmin
    .from('tickets')
    .update({
      status:       'booked',
      player_name:  request.player_name,
      player_phone: request.player_phone,
      booked_via:   'self',
      agent_id:     null,
    })
    .eq('id', request.ticket_id)
    .eq('tenant_id', tenantId);

  if (ticketError) handleSupabaseError(ticketError, 'Ticket');

  // Update request status
  const { data: updatedRequest, error: reqError } = await supabaseAdmin
    .from('booking_requests')
    .update({
      status:      'approved',
      resolved_at: resolvedAt,
      resolved_by: resolvedBy,
    })
    .eq('id', requestId)
    .select()
    .single();

  if (reqError) handleSupabaseError(reqError, 'BookingRequest');
  return updatedRequest;
};

// ─── rejectBookingRequest ─────────────────────────────────────────────────────
// Releases the ticket back to 'available', sets request to 'rejected'.
// Only resets ticket if it is currently 'reserved' — avoids accidentally
// un-booking a ticket that an admin later booked directly.

const rejectBookingRequest = async (tenantId, requestId, resolvedBy) => {
  const request = await _getRequestOrThrow(tenantId, requestId);

  if (request.status !== 'pending') {
    throw new AppError(
      `Cannot reject a request that is already '${request.status}'.`,
      'BAD_REQUEST',
      400
    );
  }

  const resolvedAt = new Date().toISOString();

  // Only release the ticket if it is still 'reserved' for this request
  // (guarded by .eq('status', 'reserved') to avoid clobbering a manual booking)
  const { error: ticketError } = await supabaseAdmin
    .from('tickets')
    .update({ status: 'available' })
    .eq('id',     request.ticket_id)
    .eq('status', 'reserved');

  if (ticketError) handleSupabaseError(ticketError, 'Ticket');

  // Update request status
  const { data: updatedRequest, error: reqError } = await supabaseAdmin
    .from('booking_requests')
    .update({
      status:      'rejected',
      resolved_at: resolvedAt,
      resolved_by: resolvedBy,
    })
    .eq('id', requestId)
    .select()
    .single();

  if (reqError) handleSupabaseError(reqError, 'BookingRequest');
  return updatedRequest;
};

module.exports = { listBookingRequests, approveBookingRequest, rejectBookingRequest };
