// ─── Tambola / Housie dividend pattern types ──────────────────────────────────
// Used to validate the patternType field when creating/updating dividends.
// Add new values here — the z.enum() in the route schema will pick them up.

/** @type {readonly string[]} */
const DIVIDEND_PATTERN_TYPES = [
  'top_line',        // all 5 numbers in the first row
  'middle_line',     // all 5 numbers in the second row
  'bottom_line',     // all 5 numbers in the third row
  'full_house_1',    // all 15 numbers — first full house (Housie)
  'full_house_2',    // second full house
  'full_house_3',    // third full house (last person standing)
  'quick_five',      // any 5 numbers on the ticket, claimed early
  'quick_six',       // any 6 numbers on the ticket
  'quick_seven',     // any 7 numbers on the ticket
  'half_seat_bonus', // 3 consecutive tickets with >= 2 marked each
  'full_sheet_bonus',// 6 consecutive tickets with >= 2 marked each
  'corners',         // four corner numbers of the ticket
  'star',            // 4 corners + center of middle row (5 numbers)
  'box_bonus',       // first+last of all 3 rows (6 border numbers)
];

module.exports = { DIVIDEND_PATTERN_TYPES };
