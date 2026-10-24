// ─── Deterministic Sequence Planner for Tambola Game Engine ──────────────────
//
// Generates an authentic 90-number call order such that:
//   1. Targeted dividends (target_ticket_number != null) are guaranteed to be won
//      by the exact target ticket or target sheet window.
//   2. Untargeted dividends are won organically by eligible non-target tickets.
//   3. Tickets targeted for later prizes (Full House 1, 2, 3) are protected from accidental
//      early retirement via reverse holdbacks on every row.
//   4. Competitor sheets are isolated from winning Sheet Bonuses by withholding competitor
//      blocking tickets until the target sheet qualifies.
//   5. Every ticket in the game has holdbacks preventing accidental Full House completions
//      until its designated turn.
//   6. Real-time simulation checks before every number call prevent accidental competitor wins.
//   7. Pacing is natural and realistic (~55–75 calls to reach Full House).
//   8. If no targets are set for a game, returns null to use live random draws.
//
// ─────────────────────────────────────────────────────────────────────────────

const { isPatternComplete } = require('./patternMatcher');

const SHEET_BONUS_TYPES = ['half_seat_bonus', 'full_sheet_bonus'];

/** Fisher-Yates shuffle helper */
const _shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** All non-blank numbers on a ticket grid */
const _ticketNumbers = (grid) => grid.flat().filter((n) => n > 0);

/** Check if window qualifies for sheet bonus (every ticket has >= 2 called numbers) */
const _isSheetWindowComplete = (windowTickets, calledSet) => {
  for (const t of windowTickets) {
    let count = 0;
    for (const row of t.grid) {
      for (const cell of row) {
        if (cell > 0 && calledSet.has(cell)) count++;
      }
    }
    if (count < 2) return false;
  }
  return true;
};

/**
 * Resolves targets for active dividends.
 */
const _resolveTargets = (dividends, tickets, sheetWindows) => {
  const targets = new Map();

  for (const d of dividends) {
    const targetNum = d.target_ticket_number;
    if (targetNum === null || targetNum === undefined) continue;

    if (d.pattern_type === 'full_sheet_bonus') {
      const sheetStart = Math.floor((targetNum - 1) / 6) * 6 + 1;
      const window = (sheetWindows?.full ?? []).find(
        (w) => w.length === 6 && w[0].ticket_number === sheetStart
      );
      if (window) {
        targets.set(d.id, { type: 'window', entity: window, dividend: d, targetNumber: sheetStart });
      } else {
        console.warn(
          `[SequencePlanner] Full sheet window starting at ticket ${sheetStart} not found among booked sheets.`
        );
      }
    } else if (d.pattern_type === 'half_seat_bonus') {
      const window = (sheetWindows?.half ?? []).find(
        (w) => w.length === 3 && w[0].ticket_number === targetNum
      );
      if (window) {
        targets.set(d.id, { type: 'window', entity: window, dividend: d, targetNumber: targetNum });
      } else {
        console.warn(
          `[SequencePlanner] Half sheet window starting at ticket ${targetNum} not found among booked sheets.`
        );
      }
    } else {
      const ticket = tickets.find((t) => t.ticket_number === targetNum);
      if (ticket) {
        targets.set(d.id, { type: 'ticket', entity: ticket, dividend: d, targetNumber: targetNum });
      } else {
        console.warn(
          `[SequencePlanner] Target ticket #${targetNum} for dividend '${d.name}' is not booked.`
        );
      }
    }
  }

  return targets;
};

/**
 * Returns the exact numbers on a ticket grid required to satisfy a specific pattern.
 */
const _getPatternNumbers = (patternType, grid) => {
  const allNums = _ticketNumbers(grid);
  const row0 = grid[0].filter((n) => n > 0);
  const row1 = grid[1].filter((n) => n > 0);
  const row2 = grid[2].filter((n) => n > 0);

  switch (patternType) {
    case 'top_line':
      return [...row0];
    case 'middle_line':
      return [...row1];
    case 'bottom_line':
      return [...row2];
    case 'corners': {
      const corners = [row0[0], row0[row0.length - 1], row2[0], row2[row2.length - 1]];
      return [...new Set(corners.filter(Boolean))];
    }
    case 'star': {
      const corners = [row0[0], row0[row0.length - 1], row2[0], row2[row2.length - 1]];
      const center = row1.length >= 3 ? row1[2] : null;
      return [...new Set([...corners, center].filter(Boolean))];
    }
    case 'box_bonus': {
      return [row0[0], row0[1], row1[0], row1[1], row2[0], row2[1]].filter(Boolean);
    }
    case 'quick_five':
      return allNums.slice(0, 5);
    case 'quick_six':
      return allNums.slice(0, 6);
    case 'quick_seven':
      return allNums.slice(0, 7);
    case 'full_house_1':
    case 'full_house_2':
    case 'full_house_3':
      return [...allNums];
    default:
      return [...allNums];
  }
};

/**
 * Deterministic Sequence Builder with Candidate Holdbacks & Competitor Isolation
 */
const _buildDeterministicSequence = (tickets, activeDividends, sheetWindows, targets) => {
  const calledList = [];
  const calledSet = new Set();
  const availableSet = new Set();
  for (let n = 1; n <= 90; n++) availableSet.add(n);

  const wonDividends = new Set();
  const retiredTicketIds = new Set();

  const addCall = (num) => {
    if (!availableSet.has(num)) return false;
    calledList.push(num);
    calledSet.add(num);
    availableSet.delete(num);
    return true;
  };

  // ── Step 1: Assign a winning ticket/window to each active dividend ──────────
  const orderRank = (patternType) => {
    if (patternType === 'full_sheet_bonus') return 1;
    if (patternType === 'half_seat_bonus')  return 2;
    if (patternType === 'quick_five')       return 10;
    if (patternType === 'quick_six')        return 11;
    if (patternType === 'quick_seven')      return 12;
    if (patternType === 'corners')          return 20;
    if (patternType === 'star')             return 21;
    if (patternType === 'box_bonus')        return 22;
    if (patternType === 'top_line')         return 30;
    if (patternType === 'middle_line')      return 31;
    if (patternType === 'bottom_line')      return 32;
    if (patternType === 'full_house_1')     return 50;
    if (patternType === 'full_house_2')     return 51;
    if (patternType === 'full_house_3')     return 52;
    return 40;
  };

  const sortedDividends = [...activeDividends].sort(
    (a, b) => orderRank(a.pattern_type) - orderRank(b.pattern_type)
  );

  // Tickets explicitly targeted for regular dividends
  const reservedTicketIds = new Set();
  for (const [, targetObj] of targets.entries()) {
    if (targetObj.type === 'ticket') {
      reservedTicketIds.add(targetObj.entity.id);
    }
  }

  // Pre-assign winners for regular dividends that do not have a target
  const assignedWinners = new Map(); // dividendId -> { type, entity }

  for (const d of sortedDividends) {
    if (targets.has(d.id)) {
      assignedWinners.set(d.id, targets.get(d.id));
    } else if (SHEET_BONUS_TYPES.includes(d.pattern_type)) {
      const windows =
        d.pattern_type === 'full_sheet_bonus' ? sheetWindows.full : sheetWindows.half;
      if (windows && windows.length > 0) {
        assignedWinners.set(d.id, { type: 'window', entity: windows[0], dividend: d });
      }
    } else {
      // Find an available ticket not reserved for any other target
      const candidate = tickets.find((t) => {
        if (reservedTicketIds.has(t.id)) return false;
        // Don't reuse a ticket already assigned to an earlier regular dividend
        for (const [assignedDivId, assignedObj] of assignedWinners.entries()) {
          const assignedDiv = sortedDividends.find((x) => x.id === assignedDivId);
          if (
            assignedDiv &&
            !SHEET_BONUS_TYPES.includes(assignedDiv.pattern_type) &&
            assignedObj.type === 'ticket' &&
            assignedObj.entity.id === t.id
          ) {
            return false;
          }
        }
        return true;
      });

      if (candidate) {
        assignedWinners.set(d.id, { type: 'ticket', entity: candidate, dividend: d });
      } else {
        // Fallback to any ticket
        assignedWinners.set(d.id, { type: 'ticket', entity: tickets[0], dividend: d });
      }
    }
  }

  // ── Step 2: Establish Reverse Holdbacks ──────────────────────────────────────
  // 1. For EVERY Full House candidate (FH1, FH2, FH3):
  //    Withhold 3 numbers: 1 on row 0, 1 on row 1 (center), 1 on row 2 (last).
  //    This makes it impossible for them to win any Line, Corner, Star, or FH prematurely.
  // 2. For ALL OTHER tickets:
  //    Withhold 1 number on row 2 so they cannot accidentally complete all 15 before FH!
  const holdbackNumbersByTicket = new Map(); // ticketId -> Set<number>
  const allHoldbacks = new Set();

  for (const t of tickets) {
    const row0 = t.grid[0].filter((n) => n > 0);
    const row1 = t.grid[1].filter((n) => n > 0);
    const row2 = t.grid[2].filter((n) => n > 0);

    // Check if this ticket is assigned to any Full House
    const isFhCandidate = sortedDividends.some((d) => {
      if (!d.pattern_type.startsWith('full_house_')) return false;
      const w = assignedWinners.get(d.id);
      return w && w.type === 'ticket' && w.entity.id === t.id;
    });

    if (isFhCandidate) {
      const h0 = row0[row0.length - 1]; // last cell of row 0
      const h1 = row1.length >= 3 ? row1[2] : row1[1]; // center of row 1 (protects star)
      const h2 = row2[row2.length - 1]; // last cell of row 2 (protects corners)
      const hb = new Set([h0, h1, h2].filter(Boolean));
      holdbackNumbersByTicket.set(t.id, hb);
      for (const n of hb) allHoldbacks.add(n);
    } else {
      // General ticket holdback: 1 number on row 2 prevents accidental full house
      const h2 = row2[row2.length - 1] || row2[0];
      if (h2) {
        holdbackNumbersByTicket.set(t.id, new Set([h2]));
        allHoldbacks.add(h2);
      }
    }
  }

  // ── Competitor Sheet Isolation Holdbacks ────────────────────────────────────
  // When a Sheet Bonus is being resolved, withhold ALL numbers appearing on the
  // first ticket of every competitor sheet so competitors stay at 0 numbers called.
  const sheetCompetitorHoldbacks = new Set();

  const setupSheetCompetitorHoldbacks = (targetDividend, targetWindow) => {
    sheetCompetitorHoldbacks.clear();
    const windows =
      targetDividend.pattern_type === 'full_sheet_bonus'
        ? sheetWindows.full
        : sheetWindows.half;

    const targetStart = targetWindow[0].ticket_number;

    for (const w of windows) {
      if (w[0].ticket_number === targetStart) continue; // skip target window
      const blockingTicket = w[0];
      const nums = _ticketNumbers(blockingTicket.grid);
      for (const n of nums) {
        sheetCompetitorHoldbacks.add(n);
      }
    }
  };

  // ── Simulation Engine: Check if calling a number is safe ───────────────────
  const checkCallSafety = (num, allowedWin = null) => {
    const testSet = new Set(calledSet);
    testSet.add(num);

    for (const d of sortedDividends) {
      if (wonDividends.has(d.id)) continue;

      if (SHEET_BONUS_TYPES.includes(d.pattern_type)) {
        const windows =
          d.pattern_type === 'half_seat_bonus' ? sheetWindows.half : sheetWindows.full;
        for (const w of windows) {
          if (_isSheetWindowComplete(w, testSet)) {
            const winTicketNum = w[0].ticket_number;
            if (
              !allowedWin ||
              allowedWin.dividendId !== d.id ||
              allowedWin.expectedNumber !== winTicketNum
            ) {
              return false; // Accidental competitor sheet win!
            }
            break;
          }
        }
      } else {
        for (const t of tickets) {
          if (retiredTicketIds.has(t.id)) continue;
          if (isPatternComplete(d.pattern_type, t.grid, testSet)) {
            if (
              !allowedWin ||
              allowedWin.dividendId !== d.id ||
              allowedWin.expectedTicketId !== t.id
            ) {
              return false; // Accidental competitor pattern win!
            }
            break;
          }
        }
      }
    }

    return true; // Completely safe
  };

  // Helper to add filler calls for natural pacing
  const insertFillers = (count) => {
    const pool = _shuffle(Array.from(availableSet));
    let added = 0;
    for (const n of pool) {
      if (added >= count) break;
      if (allHoldbacks.has(n)) continue;
      if (sheetCompetitorHoldbacks.has(n)) continue;
      if (checkCallSafety(n, null)) {
        addCall(n);
        added++;
      }
    }
  };

  // ── Step 3: Process Dividends in Winning Hierarchy ──────────────────────────

  for (const d of sortedDividends) {
    const winnerObj = assignedWinners.get(d.id);
    if (!winnerObj) continue;

    if (d.pattern_type === 'full_sheet_bonus' || d.pattern_type === 'half_seat_bonus') {
      // ── Sheet Bonus: Isolate competitors & satisfy target window ───────────
      const window = winnerObj.entity;
      setupSheetCompetitorHoldbacks(d, window);

      // Ensure each ticket in target window has >= 2 numbers called
      for (const t of window) {
        const ticketNums = _ticketNumbers(t.grid);
        const calledOnTicket = ticketNums.filter((n) => calledSet.has(n));
        const needed = 2 - calledOnTicket.length;

        if (needed > 0) {
          const candidateNums = ticketNums.filter(
            (n) => availableSet.has(n) && !allHoldbacks.has(n) && !sheetCompetitorHoldbacks.has(n)
          );

          let addedForTicket = 0;
          for (const n of candidateNums) {
            if (addedForTicket >= needed) break;
            if (checkCallSafety(n, { dividendId: d.id, expectedNumber: window[0].ticket_number })) {
              addCall(n);
              addedForTicket++;
            }
          }

          // Fallback if candidate was restricted: allow any available number on this ticket
          if (addedForTicket < needed) {
            const fallbackNums = ticketNums.filter((n) => availableSet.has(n));
            for (const n of fallbackNums) {
              if (addedForTicket >= needed) break;
              if (checkCallSafety(n, { dividendId: d.id, expectedNumber: window[0].ticket_number })) {
                addCall(n);
                addedForTicket++;
              }
            }
          }
        }
      }

      wonDividends.add(d.id);
      sheetCompetitorHoldbacks.clear();
      insertFillers(3);

    } else if (d.pattern_type.startsWith('quick_')) {
      // ── Quick Prize: 5, 6, or 7 numbers on winner ─────────────────────────
      const t = winnerObj.entity;
      const neededCount =
        d.pattern_type === 'quick_five' ? 5 : d.pattern_type === 'quick_six' ? 6 : 7;
      const allNums = _ticketNumbers(t.grid);

      insertFillers(2);

      for (const n of allNums) {
        const currentCount = allNums.filter((x) => calledSet.has(x)).length;
        if (currentCount >= neededCount) break;
        if (availableSet.has(n)) {
          const isTrigger = currentCount === neededCount - 1;
          const allowed = isTrigger
            ? { dividendId: d.id, expectedTicketId: t.id }
            : null;

          if (checkCallSafety(n, allowed)) {
            addCall(n);
          }
        }
      }

      wonDividends.add(d.id);
      retiredTicketIds.add(t.id);
      insertFillers(2);

    } else if (
      d.pattern_type.includes('line') ||
      d.pattern_type === 'corners' ||
      d.pattern_type === 'star' ||
      d.pattern_type === 'box_bonus'
    ) {
      // ── Line / Corner Prize ────────────────────────────────────────────────
      const t = winnerObj.entity;
      const pNums = _getPatternNumbers(d.pattern_type, t.grid);

      insertFillers(3);

      const uncalledPNums = pNums.filter((n) => availableSet.has(n));
      const remainingPNums = [...uncalledPNums];

      // Call non-trigger numbers first
      while (remainingPNums.length > 1) {
        let chosenIdx = remainingPNums.findIndex((n) => checkCallSafety(n, null));
        if (chosenIdx === -1) chosenIdx = 0;
        const [numToCall] = remainingPNums.splice(chosenIdx, 1);
        addCall(numToCall);
      }

      // Final trigger call
      if (remainingPNums.length === 1) {
        const triggerNum = remainingPNums[0];
        addCall(triggerNum);
      }

      wonDividends.add(d.id);
      retiredTicketIds.add(t.id);
      insertFillers(3);

    } else if (d.pattern_type.startsWith('full_house_')) {
      // ── Full House (1, 2, or 3) ────────────────────────────────────────────
      const t = winnerObj.entity;

      insertFillers(4);

      const ticketNums = _ticketNumbers(t.grid);
      const ticketHoldbacks = holdbackNumbersByTicket.get(t.id) || new Set();

      // 1. Call all non-holdback numbers for this ticket
      for (const n of ticketNums) {
        if (!ticketHoldbacks.has(n) && availableSet.has(n)) {
          addCall(n);
        }
      }

      // 2. Call holdback numbers one by one, with the last holdback triggering the Full House!
      const hbList = Array.from(ticketHoldbacks).filter((n) => availableSet.has(n));
      for (let i = 0; i < hbList.length; i++) {
        const n = hbList[i];
        const isTrigger = i === hbList.length - 1;
        const allowed = isTrigger
          ? { dividendId: d.id, expectedTicketId: t.id }
          : null;

        if (checkCallSafety(n, allowed)) {
          addCall(n);
        } else {
          addCall(n);
        }
      }

      wonDividends.add(d.id);
      retiredTicketIds.add(t.id);
      insertFillers(4);
    }
  }

  // ── Step 4: Fill remaining calls to reach 90 ────────────────────────────────
  const remaining = _shuffle(Array.from(availableSet));
  for (const n of remaining) {
    addCall(n);
  }

  return calledList;
};

/**
 * Plans the 90-number call sequence and verifies 100% of targets match.
 *
 * @param {Array} tickets - All booked tickets
 * @param {Array} dividends - Active dividends with target_ticket_number
 * @param {Object} sheetWindows - Full and half sheet windows
 * @returns {number[]|null} Planned 90-number sequence, or null if no targets set
 */
const planCallSequence = (tickets, dividends, sheetWindows) => {
  const activeDividends = (dividends ?? []).filter((d) => d.active !== false);
  const targets = _resolveTargets(activeDividends, tickets, sheetWindows);

  if (targets.size === 0) {
    return null;
  }

  console.log(
    `[SequencePlanner] Building deterministic call sequence for ${targets.size} targeted dividend(s)...`
  );

  const startTime = Date.now();

  for (let attempt = 0; attempt < 25; attempt++) {
    const sequence = _buildDeterministicSequence(
      tickets,
      activeDividends,
      sheetWindows,
      targets
    );

    if (sequence && sequence.length === 90) {
      // ── Simulation Verification ───────────────────────────────────────────
      const verifyWon = new Map();
      const verifyRetired = new Set();
      const verifySet = new Set();
      const winCallIndices = new Map();

      for (let callIdx = 0; callIdx < sequence.length; callIdx++) {
        const num = sequence[callIdx];
        verifySet.add(num);

        for (const d of activeDividends) {
          if (verifyWon.has(d.id)) continue;

          if (SHEET_BONUS_TYPES.includes(d.pattern_type)) {
            const windows =
              d.pattern_type === 'full_sheet_bonus' ? sheetWindows.full : sheetWindows.half;
            for (const w of windows) {
              if (_isSheetWindowComplete(w, verifySet)) {
                verifyWon.set(d.id, w[0].ticket_number);
                winCallIndices.set(d.id, callIdx + 1);
                break;
              }
            }
          } else {
            for (const t of tickets) {
              if (verifyRetired.has(t.id)) continue;
              if (isPatternComplete(d.pattern_type, t.grid, verifySet)) {
                verifyWon.set(d.id, t.ticket_number);
                winCallIndices.set(d.id, callIdx + 1);
                verifyRetired.add(t.id);
                break;
              }
            }
          }
        }
      }

      // Check all targets matched!
      let allTargetsMatched = true;
      const targetResults = [];

      for (const [divId, targetObj] of targets.entries()) {
        const actualWinner = verifyWon.get(divId);
        const expected = targetObj.targetNumber;
        const callNumber = winCallIndices.get(divId) || '?';

        targetResults.push({
          dividend: targetObj.dividend.name,
          expected,
          actual: actualWinner,
          callNumber,
          matched: actualWinner === expected,
        });

        if (actualWinner !== expected) {
          allTargetsMatched = false;
        }
      }

      if (allTargetsMatched) {
        const elapsed = Date.now() - startTime;
        console.log(
          `[SequencePlanner] ✅ 100% Verified Call Sequence Generated in ${elapsed}ms (attempt #${attempt + 1}):`
        );
        for (const r of targetResults) {
          console.log(
            `  • '${r.dividend}': Expected #${r.expected} → Won by #${r.actual} at Call #${r.callNumber} [MATCHED]`
          );
        }
        return sequence;
      }
    }
  }

  console.warn(
    `[SequencePlanner] ⚠️ Deterministic sequence could not satisfy all target constraints after 25 passes. Falling back to live random draws.`
  );
  return null;
};

module.exports = { planCallSequence };
