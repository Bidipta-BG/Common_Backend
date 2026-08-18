// ─── Tambola Pattern Matching ─────────────────────────────────────────────────
//
// Each function takes:
//   grid         — 3×9 number[][] (0 = blank cell, >0 = printed number)
//   calledSet    — Set<number>  of numbers called so far (O(1) lookup)
//   calledOrdered — number[]   called numbers in sequence order (for quick_five,
//                              half_seat_bonus — we need "first N called" semantics)
//
// Pattern semantics used in this implementation:
//
//   top_line        — all 5 numbers in row 0 called
//   middle_line     — all 5 numbers in row 1 called
//   bottom_line     — all 5 numbers in row 2 called
//   full_house_1/2/3— all 15 numbers on the ticket called (1st/2nd/3rd to achieve)
//   quick_five      — the first ticket to have ANY 5 of its numbers called
//   corners         — the first and last filled cells of row 0 AND row 2 (4 numbers)
//   half_seat_bonus — any 8 of the ticket's 15 numbers called
//                     TODO: Confirm this definition with product owner. The most
//                     common interpretation is "first half of a full house" = 8+ called.
//
// For unknown pattern_type values, isPatternComplete returns false and logs a warning.
// This makes adding new types safe: they simply don't win until implemented.

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All non-blank numbers in a specific row. */
const _rowNums = (grid, row) => grid[row].filter((n) => n > 0);

/** All 15 non-blank numbers across all 3 rows. */
const _ticketNums = (grid) => grid.flat().filter((n) => n > 0);

/**
 * The four "corner" numbers of a ticket:
 *   • first filled cell and last filled cell of row 0 (top)
 *   • first filled cell and last filled cell of row 2 (bottom)
 *
 * If a row happens to have only one filled cell in the corner columns,
 * that same number counts for both corners of that row. The Set deduplication
 * below handles this edge-case gracefully.
 */
const _cornerNums = (grid) => {
  const top    = _rowNums(grid, 0);
  const bottom = _rowNums(grid, 2);
  return [
    ...new Set([
      top[0],    top[top.length - 1],
      bottom[0], bottom[bottom.length - 1],
    ].filter(Boolean)),
  ];
};

// ─── isPatternComplete ────────────────────────────────────────────────────────
/**
 * Returns true if the given pattern is fully satisfied by the current
 * called numbers for this ticket.
 *
 * @param {string}    patternType
 * @param {number[][]} grid        — 3×9
 * @param {Set<number>} calledSet
 * @returns {boolean}
 */
const isPatternComplete = (patternType, grid, calledSet) => {
  switch (patternType) {
    case 'top_line':
      return _rowNums(grid, 0).every((n) => calledSet.has(n));

    case 'middle_line':
      return _rowNums(grid, 1).every((n) => calledSet.has(n));

    case 'bottom_line':
      return _rowNums(grid, 2).every((n) => calledSet.has(n));

    case 'full_house_1':
    case 'full_house_2':
    case 'full_house_3':
      return _ticketNums(grid).every((n) => calledSet.has(n));

    case 'quick_five':
      return _ticketNums(grid).filter((n) => calledSet.has(n)).length >= 5;

    case 'corners':
      return _cornerNums(grid).every((n) => calledSet.has(n));

    case 'half_seat_bonus':
      // TODO: Confirm with product owner — current: any 8 of 15 numbers called.
      return _ticketNums(grid).filter((n) => calledSet.has(n)).length >= 8;

    default:
      console.warn(`[PatternMatcher] Unknown pattern_type '${patternType}' — returning false. Add implementation above.`);
      return false;
  }
};

// ─── getMatchedNumbers ────────────────────────────────────────────────────────
/**
 * Returns the specific numbers that SATISFIED the pattern for this ticket.
 * Stored on the winners row as `matched_numbers` for the "proof" UI.
 *
 * @param {string}    patternType
 * @param {number[][]} grid
 * @param {Set<number>} calledSet
 * @param {number[]}  calledOrdered — called numbers in sequence (used for
 *                                    ordered patterns like quick_five)
 * @returns {number[]}
 */
const getMatchedNumbers = (patternType, grid, calledSet, calledOrdered = []) => {
  switch (patternType) {
    case 'top_line':
      return _rowNums(grid, 0).filter((n) => calledSet.has(n));

    case 'middle_line':
      return _rowNums(grid, 1).filter((n) => calledSet.has(n));

    case 'bottom_line':
      return _rowNums(grid, 2).filter((n) => calledSet.has(n));

    case 'full_house_1':
    case 'full_house_2':
    case 'full_house_3':
      return _ticketNums(grid).filter((n) => calledSet.has(n));

    case 'quick_five': {
      // Return the FIRST 5 numbers called that are on this ticket
      // (preserves the "proof" chronology — not just any 5)
      const onTicket = new Set(_ticketNums(grid));
      return calledOrdered.filter((n) => onTicket.has(n)).slice(0, 5);
    }

    case 'corners':
      return _cornerNums(grid).filter((n) => calledSet.has(n));

    case 'half_seat_bonus': {
      // First 8 numbers called that are on this ticket
      const onTicket = new Set(_ticketNums(grid));
      return calledOrdered.filter((n) => onTicket.has(n)).slice(0, 8);
    }

    default:
      return [];
  }
};

module.exports = { isPatternComplete, getMatchedNumbers };
