// ─── Standard Tambola (Housie/Bingo) Ticket Generator ────────────────────────
//
// Ticket structure: 3 rows × 9 columns, 27 cells total.
//   • Exactly 15 cells are filled (5 per row, 4 blank per row).
//   • Each column maps to a fixed number range.
//   • Every column must contain at least 1 number (at most 3).
//   • Numbers within a column are sorted ascending top → bottom.
//
// Column → number range:
//   Col 0 → 1–9   (9  candidates)
//   Col 1 → 10–19 (10 candidates)
//   Col 2 → 20–29 (10 candidates)
//   Col 3 → 30–39 (10 candidates)
//   Col 4 → 40–49 (10 candidates)
//   Col 5 → 50–59 (10 candidates)
//   Col 6 → 60–69 (10 candidates)
//   Col 7 → 70–79 (10 candidates)
//   Col 8 → 80–90 (11 candidates, includes 90)
//
// Grid representation: grid[row][col]
//   0  = blank cell
//   >0 = the number printed in that cell

// ─── Column ranges ────────────────────────────────────────────────────────────
const COL_RANGES = [
  { min: 1,  max: 9  },
  { min: 10, max: 19 },
  { min: 20, max: 29 },
  { min: 30, max: 39 },
  { min: 40, max: 49 },
  { min: 50, max: 59 },
  { min: 60, max: 69 },
  { min: 70, max: 79 },
  { min: 80, max: 90 }, // 11 candidates (80–90 inclusive)
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — returns a new shuffled array, does not mutate. */
const _shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Picks `count` distinct random integers from [min, max] (inclusive),
 * returned in ascending order.
 */
const _pickSorted = (min, max, count) => {
  const pool = [];
  for (let n = min; n <= max; n++) pool.push(n);
  return _shuffle(pool).slice(0, count).sort((a, b) => a - b);
};

// ─── generateTambolaTicket ────────────────────────────────────────────────────
/**
 * Generates a single valid Tambola ticket.
 *
 * Algorithm:
 *   Phase 1 — Layout (which cells are filled):
 *     For each of 3 rows, randomly choose 5 of 9 columns to fill.
 *     Retry if any column ends up completely empty across all 3 rows.
 *     (The retry converges quickly — ~10–15% of random layouts are invalid.)
 *
 *   Phase 2 — Numbers (which number goes in each filled cell):
 *     For each column, pick N distinct random numbers from its range,
 *     where N = how many rows have a filled cell in that column.
 *     Assign the smallest number to the topmost filled row,
 *     ensuring ascending order top → bottom in every column.
 *
 * @returns {number[][]} grid — 3×9 array; 0 = blank, >0 = printed number
 */
const generateTambolaTicket = () => {
  // ── Phase 1: Layout ─────────────────────────────────────────────────────────
  // mask[row][col] === true  →  this cell is filled
  let mask;

  for (;;) { // retry until valid (fast: usually 1–2 attempts)
    mask = [
      new Array(9).fill(false),
      new Array(9).fill(false),
      new Array(9).fill(false),
    ];

    // Each row gets exactly 5 random columns filled
    for (let r = 0; r < 3; r++) {
      const cols = _shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 5);
      for (const c of cols) mask[r][c] = true;
    }

    // Reject if any column is completely blank (violates standard rules)
    const allColsCovered = [0,1,2,3,4,5,6,7,8].every(
      c => mask[0][c] || mask[1][c] || mask[2][c]
    );
    if (allColsCovered) break;
  }

  // ── Phase 2: Numbers ─────────────────────────────────────────────────────────
  const grid = [
    new Array(9).fill(0),
    new Array(9).fill(0),
    new Array(9).fill(0),
  ];

  for (let c = 0; c < 9; c++) {
    // Rows that have a filled cell in this column, sorted top → bottom
    const filledRows = [0, 1, 2].filter(r => mask[r][c]); // already ascending
    if (filledRows.length === 0) continue; // shouldn't happen post-validation

    const { min, max } = COL_RANGES[c];
    const numbers = _pickSorted(min, max, filledRows.length);

    // Assign smallest number to top-most filled row (ascending constraint)
    for (let i = 0; i < filledRows.length; i++) {
      grid[filledRows[i]][c] = numbers[i];
    }
  }

  return grid;
};

// ─── generateTicketBatch ──────────────────────────────────────────────────────
/**
 * Generates an array of N Tambola tickets, each independently random.
 * Each call to generateTambolaTicket() is O(1) and fast.
 *
 * @param {number} count  — number of tickets to generate
 * @returns {number[][][]} array of count grids (3×9 each)
 */
const generateTicketBatch = (count) => {
  const tickets = [];
  for (let i = 0; i < count; i++) {
    tickets.push(generateTambolaTicket());
  }
  return tickets;
};

module.exports = { generateTambolaTicket, generateTicketBatch };
