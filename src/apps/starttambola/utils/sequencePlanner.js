// ─── Deterministic Sequence Planner for Tambola Game Engine ──────────────────
//
// Generates an authentic 90-number call order calibrated to real-world
// Tambola / Housie probability benchmarks:
//   1. Half Sheet Bonus:   Won around Call 11–13 (Benchmark: 10–14)
//   2. Full Sheet Bonus:   Won around Call 20–23 (Benchmark: 18–25)
//   3. Quick 5:            Won around Call 11–14 (Benchmark: 8–14)
//   4. Line Prizes:        Won around Calls 28–45 (Staggered naturally: ~29, ~36, ~44)
//   5. Corners / Star:     Won around Calls 26–32
//   6. Full House 1 (FH1): Won around Call 66–68 (Real-world: 65–70)
//   7. Full House 2 (FH2): Won around Call 71–74
//   8. Full House 3 (FH3): Won around Call 76–79
//   9. Remaining calls:    Shuffled naturally up to 90.
//
// Targeted tickets / sheets are 100% guaranteed to win their designated prizes
// without accidental competitor wins or ties.
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

/** Random integer between min and max inclusive */
const _randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

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
 * Computes authentic, randomized call milestones for each active dividend.
 * Simulates real-world Tambola probability distributions:
 *   - Half Sheet:   Random between Calls 11 and 15
 *   - Full Sheet:   Random between Calls 19 and 25
 *   - Quick Prizes: Random between Calls 10 and 14
 *   - Line 1:       Random between Calls 26 and 31
 *   - Line 2:       Random between Calls 33 and 39
 *   - Line 3:       Random between Calls 41 and 47
 *   - Corners/Star: Random between Calls 25 and 33
 *   - Full House 1: Random between Calls 65 and 70
 *   - Full House 2: Dynamically anchored 3–6 calls after FH1 (capped at 76)
 *   - Full House 3: Dynamically anchored 3–6 calls after FH2 (capped at 82)
 *
 * Every game gets a fresh, unique milestone schedule so call numbers vary organically.
 */
const _computeMilestoneSchedule = (sortedDividends) => {
  const schedule = new Map();
  let lineCount = 0;
  let fhCount = 0;
  let fh1Target = 67;
  let fh2Target = 72;

  for (const d of sortedDividends) {
    const pt = d.pattern_type;

    if (pt === 'half_seat_bonus') {
      schedule.set(d.id, _randInt(11, 15));
    } else if (pt === 'full_sheet_bonus') {
      schedule.set(d.id, _randInt(19, 25));
    } else if (pt.startsWith('quick_')) {
      schedule.set(d.id, _randInt(10, 14));
    } else if (pt === 'corners' || pt === 'star' || pt === 'box_bonus') {
      schedule.set(d.id, _randInt(25, 33));
    } else if (pt.includes('line')) {
      lineCount++;
      if (lineCount === 1) schedule.set(d.id, _randInt(26, 31));
      else if (lineCount === 2) schedule.set(d.id, _randInt(33, 39));
      else schedule.set(d.id, _randInt(41, 47));
    } else if (pt.startsWith('full_house_')) {
      fhCount++;
      if (fhCount === 1) {
        fh1Target = _randInt(65, 70);
        schedule.set(d.id, fh1Target);
      } else if (fhCount === 2) {
        fh2Target = Math.min(fh1Target + _randInt(3, 6), 76);
        schedule.set(d.id, fh2Target);
      } else {
        const fh3Target = Math.min(fh2Target + _randInt(3, 6), 82);
        schedule.set(d.id, fh3Target);
      }
    } else {
      schedule.set(d.id, _randInt(48, 54));
    }
  }

  // Ensure milestones are strictly monotonically increasing with natural spacing (minimum 2–4 calls apart)
  let minNext = 1;
  for (const d of sortedDividends) {
    let target = schedule.get(d.id) || minNext + 2;
    if (target <= minNext) {
      target = minNext + _randInt(2, 4);
    }
    target = Math.min(target, 84); // Leave room for end-game calls
    schedule.set(d.id, target);
    minNext = target;
  }

  return schedule;
};

/**
 * Deterministic Sequence Builder with Candidate Holdbacks, Competitor Isolation,
 * and Real-World Call Count Milestone Pacing.
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
    if (patternType === 'half_seat_bonus')  return 1;
    if (patternType === 'full_sheet_bonus') return 2;
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

  const milestoneSchedule = _computeMilestoneSchedule(sortedDividends);

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
      const candidate = tickets.find((t) => {
        if (reservedTicketIds.has(t.id)) return false;
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
        assignedWinners.set(d.id, { type: 'ticket', entity: tickets[0], dividend: d });
      }
    }
  }

  // ── Step 2: Establish Reverse Holdbacks ──────────────────────────────────────
  // 1. For EVERY Full House candidate (FH1, FH2, FH3):
  //    Withhold 3 numbers (1 on row 0, 1 on row 1, 1 on row 2).
  // 2. For ALL OTHER tickets:
  //    Withhold 1 number on row 2 to prevent accidental Full House.
  const holdbackNumbersByTicket = new Map();
  const allHoldbacks = new Set();

  for (const t of tickets) {
    const row0 = t.grid[0].filter((n) => n > 0);
    const row1 = t.grid[1].filter((n) => n > 0);
    const row2 = t.grid[2].filter((n) => n > 0);

    const isFhCandidate = sortedDividends.some((d) => {
      if (!d.pattern_type.startsWith('full_house_')) return false;
      const w = assignedWinners.get(d.id);
      return w && w.type === 'ticket' && w.entity.id === t.id;
    });

    if (isFhCandidate) {
      const h0 = row0[row0.length - 1];
      const h1 = row1.length >= 3 ? row1[2] : row1[1];
      const h2 = row2[row2.length - 1];
      const hb = new Set([h0, h1, h2].filter(Boolean));
      holdbackNumbersByTicket.set(t.id, hb);
      for (const n of hb) allHoldbacks.add(n);
    } else {
      const h2 = row2[row2.length - 1] || row2[0];
      if (h2) {
        holdbackNumbersByTicket.set(t.id, new Set([h2]));
        allHoldbacks.add(h2);
      }
    }
  }

  // ── Competitor Sheet Isolation Holdbacks ────────────────────────────────────
  const sheetCompetitorHoldbacks = new Set();

  const setupSheetCompetitorHoldbacks = (targetDividend, targetWindow) => {
    sheetCompetitorHoldbacks.clear();
    const windows =
      targetDividend.pattern_type === 'full_sheet_bonus'
        ? sheetWindows.full
        : sheetWindows.half;

    const targetStart = targetWindow[0].ticket_number;

    for (const w of windows) {
      if (w[0].ticket_number === targetStart) continue;
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

  // ── Milestone Pacer: Advances the game to target call count using safe neutral calls
  const advanceToMilestone = (targetCount, excludedNumbers = null) => {
    let safetyStuckCount = 0;
    while (calledList.length < targetCount && availableSet.size > 0 && safetyStuckCount < 200) {
      safetyStuckCount++;
      const pool = _shuffle(Array.from(availableSet));
      let calledOne = false;

      for (const n of pool) {
        if (allHoldbacks.has(n)) continue;
        if (sheetCompetitorHoldbacks.has(n)) continue;
        if (excludedNumbers && excludedNumbers.has(n)) continue;

        if (checkCallSafety(n, null)) {
          addCall(n);
          calledOne = true;
          safetyStuckCount = 0; // reset stuck counter
          break;
        }
      }

      if (!calledOne) {
        // No safe non-holdback number found
        break;
      }
    }
  };

  // ── Step 3: Process Dividends with Prime & Deferred Trigger Architecture ───

  for (const d of sortedDividends) {
    const winnerObj = assignedWinners.get(d.id);
    if (!winnerObj) continue;

    const targetMilestone = milestoneSchedule.get(d.id) || (calledList.length + 3);

    if (d.pattern_type === 'full_sheet_bonus' || d.pattern_type === 'half_seat_bonus') {
      // ── Sheet Bonus: Prime window to 1-away, pace to milestone, then trigger ─
      const window = winnerObj.entity;
      setupSheetCompetitorHoldbacks(d, window);

      // The last ticket in the window will hold its 2nd number as the trigger
      const lastTicket = window[window.length - 1];
      const otherTickets = window.slice(0, window.length - 1);

      // 1. Prime all tickets in window except the last one with 2 numbers
      for (const t of otherTickets) {
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
            if (checkCallSafety(n, null)) {
              addCall(n);
              addedForTicket++;
            }
          }
        }
      }

      // 2. Prime last ticket with exactly 1 number
      const lastTicketNums = _ticketNumbers(lastTicket.grid);
      const lastCalled = lastTicketNums.filter((n) => calledSet.has(n));
      if (lastCalled.length === 0) {
        const candidateNums = lastTicketNums.filter(
          (n) => availableSet.has(n) && !allHoldbacks.has(n) && !sheetCompetitorHoldbacks.has(n)
        );
        for (const n of candidateNums) {
          if (checkCallSafety(n, null)) {
            addCall(n);
            break;
          }
        }
      }

      // 3. Select the final trigger number for this sheet bonus
      const uncalledOnLast = lastTicketNums.filter(
        (n) => availableSet.has(n) && !allHoldbacks.has(n) && !sheetCompetitorHoldbacks.has(n)
      );
      const sheetTriggerNum = uncalledOnLast[0] || lastTicketNums.find((n) => availableSet.has(n));

      // 4. Pace with neutral fillers until targetMilestone - 1
      const excludedForPacing = new Set([sheetTriggerNum].filter(Boolean));
      advanceToMilestone(targetMilestone - 1, excludedForPacing);

      // 5. Fire the exact trigger call at the target milestone!
      if (sheetTriggerNum && availableSet.has(sheetTriggerNum)) {
        addCall(sheetTriggerNum);
      }

      wonDividends.add(d.id);
      sheetCompetitorHoldbacks.clear();

    } else if (d.pattern_type.startsWith('quick_')) {
      // ── Quick Prize: Prime to (needed - 1), pace to milestone, trigger ───────
      const t = winnerObj.entity;
      const neededCount =
        d.pattern_type === 'quick_five' ? 5 : d.pattern_type === 'quick_six' ? 6 : 7;
      const allNums = _ticketNumbers(t.grid);

      // 1. Prime ticket to (neededCount - 1) numbers
      for (const n of allNums) {
        const currentCount = allNums.filter((x) => calledSet.has(x)).length;
        if (currentCount >= neededCount - 1) break;
        if (availableSet.has(n) && !allHoldbacks.has(n)) {
          if (checkCallSafety(n, null)) {
            addCall(n);
          }
        }
      }

      // 2. Identify winning trigger number
      const uncalledOnT = allNums.filter((n) => availableSet.has(n) && !allHoldbacks.has(n));
      const quickTriggerNum = uncalledOnT[0] || allNums.find((n) => availableSet.has(n));

      // 3. Pace to milestone - 1
      const excludedForPacing = new Set([quickTriggerNum].filter(Boolean));
      advanceToMilestone(targetMilestone - 1, excludedForPacing);

      // 4. Trigger at milestone!
      if (quickTriggerNum && availableSet.has(quickTriggerNum)) {
        addCall(quickTriggerNum);
      }

      wonDividends.add(d.id);
      retiredTicketIds.add(t.id);

    } else if (
      d.pattern_type.includes('line') ||
      d.pattern_type === 'corners' ||
      d.pattern_type === 'star' ||
      d.pattern_type === 'box_bonus'
    ) {
      // ── Line / Corner Prize: Prime to 1-away, pace to milestone, trigger ─────
      const t = winnerObj.entity;
      const pNums = _getPatternNumbers(d.pattern_type, t.grid);
      const uncalledPNums = pNums.filter((n) => availableSet.has(n));

      // Pick trigger number
      const triggerNum = uncalledPNums[uncalledPNums.length - 1];
      const nonTriggerNums = uncalledPNums.slice(0, uncalledPNums.length - 1);

      // 1. Prime: Call all non-trigger pattern numbers
      for (const n of nonTriggerNums) {
        if (availableSet.has(n)) {
          addCall(n);
        }
      }

      // 2. Pace with neutral fillers until targetMilestone - 1
      const excludedForPacing = new Set([triggerNum].filter(Boolean));
      advanceToMilestone(targetMilestone - 1, excludedForPacing);

      // 3. Fire trigger call at the milestone!
      if (triggerNum && availableSet.has(triggerNum)) {
        addCall(triggerNum);
      }

      wonDividends.add(d.id);
      retiredTicketIds.add(t.id);

    } else if (d.pattern_type.startsWith('full_house_')) {
      // ── Full House: Prime winner to 14/15, pace to call 66+, trigger 15th ───
      const t = winnerObj.entity;
      const ticketNums = _ticketNumbers(t.grid);
      const ticketHoldbacks = holdbackNumbersByTicket.get(t.id) || new Set();

      // 1. Call all non-holdback numbers for this ticket
      for (const n of ticketNums) {
        if (!ticketHoldbacks.has(n) && availableSet.has(n)) {
          addCall(n);
        }
      }

      // 2. Call all holdbacks except the 1 final winning trigger holdback
      const hbList = Array.from(ticketHoldbacks).filter((n) => availableSet.has(n));
      const fhTriggerNum = hbList[hbList.length - 1];
      const primingHbList = hbList.slice(0, hbList.length - 1);

      for (const n of primingHbList) {
        if (availableSet.has(n)) {
          addCall(n);
        }
      }

      // Ticket is now sitting at exactly 14/15 numbers called (primed!)

      // 3. Pace with neutral fillers until targetMilestone - 1 (e.g. Call 66)
      const excludedForPacing = new Set([fhTriggerNum].filter(Boolean));
      advanceToMilestone(targetMilestone - 1, excludedForPacing);

      // 4. Release the 15th number at the exact realistic milestone (e.g. Call 67)!
      if (fhTriggerNum && availableSet.has(fhTriggerNum)) {
        addCall(fhTriggerNum);
      }

      wonDividends.add(d.id);
      retiredTicketIds.add(t.id);
    }
  }

  // ── Step 4: Fill remaining calls up to 90 ────────────────────────────────────
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

  for (let attempt = 0; attempt < 30; attempt++) {
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
          `[SequencePlanner] ✅ 100% Real-World Paced Call Sequence Verified in ${elapsed}ms (attempt #${attempt + 1}):`
        );
        for (const r of targetResults) {
          console.log(
            `  • '${r.dividend}': Target #${r.expected} → Won by Ticket/Sheet #${r.actual} at Call #${r.callNumber} [MATCHED & PACED]`
          );
        }
        return sequence;
      }
    }
  }

  console.warn(
    `[SequencePlanner] ⚠️ Deterministic sequence could not satisfy all target constraints after 30 passes. Falling back to live random draws.`
  );
  return null;
};

module.exports = { planCallSequence };
