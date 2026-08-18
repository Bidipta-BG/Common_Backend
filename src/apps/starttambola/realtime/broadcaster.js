const axios = require('axios');

// ─── Supabase Realtime HTTP Broadcast ─────────────────────────────────────────
// Uses the Supabase Realtime REST broadcast API so the server can push to
// channels without maintaining a WebSocket subscription.
//
// Clients subscribe with:
//   const channel = supabase.channel('game:<gameId>');
//   channel.on('broadcast', { event: 'number_called' }, handler).subscribe();
//
// POST {SUPABASE_URL}/realtime/v1/api/broadcast
//   Authorization: Bearer <service_role_key>
//   { messages: [{ topic: 'realtime:<channel>', event, payload }] }
//
// This is intentionally fault-tolerant — a broadcast failure must NEVER stop
// the game engine tick. Real-time updates are a convenience; the DB is truth.

const _getRealtimeConfig = () => ({
  url:  `${process.env.TAMBO_SUPABASE_URL}/realtime/v1/api/broadcast`,
  key:  process.env.TAMBO_SUPABASE_SERVICE_KEY,
});

/**
 * Broadcasts an event to a Supabase Realtime channel.
 * @param {string} channelName  — e.g. 'game:abc-123'
 * @param {string} event        — e.g. 'number_called'
 * @param {object} payload
 */
const broadcast = async (channelName, event, payload) => {
  try {
    const { url, key } = _getRealtimeConfig();
    if (!url || !key) {
      console.warn('[Broadcast] Supabase URL or service key not configured — skipping broadcast.');
      return;
    }

    await axios.post(
      url,
      { messages: [{ topic: `realtime:${channelName}`, event, payload }] },
      {
        headers: {
          Authorization:   `Bearer ${key}`,
          apikey:          key,
          'Content-Type':  'application/json',
        },
        timeout: 3000, // don't let a slow broadcast block the tick loop
      }
    );
  } catch (err) {
    // Non-fatal — log and move on
    console.error(
      `[Broadcast] Failed to broadcast '${event}' on '${channelName}':`,
      err.response?.data ?? err.message
    );
  }
};

/** Broadcasts to the game-specific channel. */
const broadcastToGame = (gameId, event, payload) =>
  broadcast(`game:${gameId}`, event, payload);

/** Broadcasts a lighter summary event to the tenant-level channel. */
const broadcastToTenant = (tenantId, event, payload) =>
  broadcast(`tenant:${tenantId}`, event, payload);

module.exports = { broadcast, broadcastToGame, broadcastToTenant };
