// ─── Tambola / Housie dividend pattern types ──────────────────────────────────
// Used to validate the patternType field when creating/updating dividends.
// Add new values here — the z.enum() in the route schema will pick them up.

/** @type {readonly string[]} */
const DIVIDEND_PATTERN_TYPES = [
  'top_line',       // all 5 numbers in the first row
  'middle_line',    // all 5 numbers in the second row
  'bottom_line',    // all 5 numbers in the third row
  'full_house_1',   // all 15 numbers — first full house (Housie)
  'full_house_2',   // second full house
  'full_house_3',   // third full house (last person standing)
  'quick_five',     // any 5 numbers on the ticket, claimed early
  'half_seat_bonus',// first half of the ticket numbers called
  'corners',        // the four corner numbers of the ticket
];

module.exports = { DIVIDEND_PATTERN_TYPES };
