/**
 * Returns a stable owner key for a ticket.
 * We use player_phone as the primary identifier (most unique).
 * Falls back to player_name if phone is absent.
 * Returns null for unbooked/ownerless tickets — these are excluded from all windows.
 *
 * @param {{ player_name?: string, player_phone?: string }} ticket
 * @returns {string|null}
 */
const _ownerKey = (ticket) => {
  const phone = ticket.player_phone?.trim();
  const name  = ticket.player_name?.trim();
  if (phone) return phone;           // phone is the strongest identifier
  if (name)  return `name:${name}`;  // fallback to name if no phone recorded
  return null;                        // unbooked — exclude
};

/**
 * Computes Half Sheet and Full Sheet windows, enforcing same-owner grouping.
 *
 * Rules implemented:
 *  - A window is only valid if EVERY ticket in it belongs to the SAME customer
 *    (identified by player_phone, falling back to player_name).
 *  - Tickets with no owner (unbooked) are NEVER part of any window.
 *  - Full Sheet = 6 same-owner consecutive tickets.
 *  - Half Sheet = 3 same-owner consecutive tickets (from tickets NOT consumed by Full Sheet).
 *  - A 6-ticket owner is fully consumed by a Full Sheet window and is therefore
 *    NEVER eligible for Half Sheet.
 *  - Overlapping Half Sheet windows are allowed within the remainder of a run
 *    (e.g. owner with tickets 1-2-3-4-5 gets windows [1,2,3], [2,3,4], [3,4,5]).
 *
 * @param {Array} tickets - Sorted array of booked tickets.
 *   Each ticket must have: { id, ticket_number, grid, player_name, player_phone }
 * @returns {{ half: Array[], full: Array[], halfCount: number, fullCount: number }}
 */
const computeSheetWindows = (tickets) => {
  const half = [];
  const full = [];

  if (!tickets || tickets.length === 0) return { half, full, halfCount: 0, fullCount: 0 };

  // ── Step 1: Partition tickets by their fixed 6-ticket sheet boundary ──────
  // Sheet 0: 1..6, Sheet 1: 7..12, Sheet 2: 13..18, etc.
  const sheetGroups = new Map();
  for (const t of tickets) {
    if (!t.ticket_number || t.ticket_number <= 0) continue;
    const sheetIdx = Math.floor((t.ticket_number - 1) / 6);
    if (!sheetGroups.has(sheetIdx)) {
      sheetGroups.set(sheetIdx, []);
    }
    sheetGroups.get(sheetIdx).push(t);
  }

  // ── Step 2: Process each sheet independently ──────────────────────────────
  const sortedSheetIndices = Array.from(sheetGroups.keys()).sort((a, b) => a - b);

  for (const sheetIdx of sortedSheetIndices) {
    const sheetTickets = sheetGroups.get(sheetIdx);
    sheetTickets.sort((a, b) => a.ticket_number - b.ticket_number);

    let isConsumedByFull = false;

    // Full Sheet: all 6 tickets of this fixed sheet must be booked by the same owner
    if (sheetTickets.length === 6) {
      const firstOwner = _ownerKey(sheetTickets[0]);
      const isCompleteConsecutive = sheetTickets.every(
        (t, idx) => t.ticket_number === (sheetIdx * 6 + 1 + idx)
      );

      if (
        firstOwner !== null &&
        isCompleteConsecutive &&
        sheetTickets.every((t) => _ownerKey(t) === firstOwner)
      ) {
        full.push(sheetTickets);
        isConsumedByFull = true;
      }
    }

    // Half Sheet: 3 consecutive tickets within this sheet booked by the same owner
    if (!isConsumedByFull && sheetTickets.length >= 3) {
      // Build consecutive runs within this sheet
      const runs = [];
      let currentRun = [sheetTickets[0]];

      for (let i = 1; i < sheetTickets.length; i++) {
        if (sheetTickets[i].ticket_number === sheetTickets[i - 1].ticket_number + 1) {
          currentRun.push(sheetTickets[i]);
        } else {
          runs.push(currentRun);
          currentRun = [sheetTickets[i]];
        }
      }
      runs.push(currentRun);

      for (const run of runs) {
        for (let j = 0; j <= run.length - 3; j++) {
          const group = run.slice(j, j + 3);
          const ownerKey = _ownerKey(group[0]);

          if (
            ownerKey !== null &&
            group.every((t) => _ownerKey(t) === ownerKey)
          ) {
            half.push(group);
          }
        }
      }
    }
  }

  return {
    half,
    full,
    halfCount: half.length,
    fullCount: full.length,
  };
};

module.exports = { computeSheetWindows };
