const { supabaseAdmin } = require('../config/supabaseClient');

// ─── expireStaleBookingRequests ───────────────────────────────────────────────
// Runs every 5 minutes. Finds booking_requests with:
//   status = 'pending'  AND  created_at < (now - 15 minutes)
//
// For each stale request:
//   1. Sets booking_request.status = 'expired'.
//   2. Resets the linked ticket back to 'available'
//      (only if it is still 'reserved' — avoids clobbering a direct booking
//       that an admin/agent created for the same ticket after the request
//       was somehow left in pending state).
//
// Returns the count of expired requests for logging / manual-trigger response.
//
// This function is intentionally fault-tolerant — it logs errors but does
// NOT throw, so a DB blip won't crash the scheduler loop.

const PENDING_TTL_MINUTES = 15;

const expireStaleBookingRequests = async () => {
  const cutoff = new Date(Date.now() - PENDING_TTL_MINUTES * 60 * 1000).toISOString();

  // Fetch stale requests (we need ticket_id to reset ticket status)
  const { data: stale, error: fetchError } = await supabaseAdmin
    .from('booking_requests')
    .select('id, ticket_id')
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  if (fetchError) {
    console.error('[BookingExpiry] Failed to fetch stale requests:', fetchError.message);
    return 0;
  }

  if (!stale || stale.length === 0) {
    console.log('[BookingExpiry] No stale booking requests found.');
    return 0;
  }

  console.log(`[BookingExpiry] Found ${stale.length} stale request(s) — expiring...`);

  const staleIds     = stale.map(r => r.id);
  const staleTickets = stale.map(r => r.ticket_id).filter(Boolean);

  // Expire the requests
  const { error: expireError } = await supabaseAdmin
    .from('booking_requests')
    .update({ status: 'expired' })
    .in('id', staleIds);

  if (expireError) {
    console.error('[BookingExpiry] Failed to expire stale requests:', expireError.message);
    // Don't return early — still try to release the tickets
  }

  // Release linked tickets (only those still 'reserved' — status guard prevents
  // clobbering tickets that were booked directly after the request was made)
  if (staleTickets.length > 0) {
    const { error: ticketError } = await supabaseAdmin
      .from('tickets')
      .update({ status: 'available' })
      .in('id', staleTickets)
      .eq('status', 'reserved'); // safety guard

    if (ticketError) {
      console.error('[BookingExpiry] Failed to reset stale ticket statuses:', ticketError.message);
    }
  }

  console.log(`[BookingExpiry] Expired ${stale.length} stale booking request(s).`);
  return stale.length;
};

module.exports = { expireStaleBookingRequests };
