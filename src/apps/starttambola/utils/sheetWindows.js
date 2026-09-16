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

  // ── Step 1: Build consecutive runs of tickets ─────────────────────────────
  // A "run" is an unbroken sequence of ticket numbers (e.g. 1,2,3,4,5,6).
  const runs = [];
  let currentRun = [tickets[0]];
  for (let i = 1; i < tickets.length; i++) {
    if (tickets[i].ticket_number === tickets[i - 1].ticket_number + 1) {
      currentRun.push(tickets[i]);
    } else {
      runs.push(currentRun);
      currentRun = [tickets[i]];
    }
  }
  runs.push(currentRun);

  // ── Step 2: Process each consecutive run ──────────────────────────────────
  for (const run of runs) {
    // ── Full Sheet: greedy, same-owner groups of 6 ────────────────────────
    // Walk the run in non-overlapping steps of 6. Only form a full-sheet window
    // if all 6 tickets share the same owner. Otherwise, advance one ticket at a
    // time to find the next valid group.
    let i = 0;
    const consumedByFull = new Set(); // indices consumed into full-sheet windows

    while (i <= run.length - 6) {
      const group = run.slice(i, i + 6);
      const ownerKey = _ownerKey(group[0]);

      if (
        ownerKey !== null &&
        group.every((t) => _ownerKey(t) === ownerKey)
      ) {
        // Valid same-owner full sheet
        full.push(group);
        for (let k = i; k < i + 6; k++) consumedByFull.add(k);
        i += 6; // advance past this group
      } else {
        i += 1; // mixed ownership or unbooked — slide one forward
      }
    }

    // ── Half Sheet: overlapping, same-owner groups of 3 from the remainder ──
    // Only consider tickets NOT consumed by a full-sheet window.
    const remainder = run.filter((_, idx) => !consumedByFull.has(idx));

    for (let j = 0; j <= remainder.length - 3; j++) {
      const group = remainder.slice(j, j + 3);
      const ownerKey = _ownerKey(group[0]);

      if (
        ownerKey !== null &&
        group.every((t) => _ownerKey(t) === ownerKey)
      ) {
        half.push(group);
      }
      // If mixed ownership or unbooked, skip this window silently.
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
