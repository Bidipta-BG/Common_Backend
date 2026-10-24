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

// ─── Strip-of-6 (Full Sheet) Generator ────────────────────────────────────────
//
// In authentic Tambola (Housie / 90-ball Bingo):
//   • A Full Sheet (Strip) contains exactly 6 tickets.
//   • Across the 6 tickets, ALL 90 numbers (1 to 90) appear EXACTLY ONCE.
//   • ZERO duplicates across tickets 1 to 6.
//   • Each ticket has 3 rows × 9 columns with exactly 15 numbers (5 per row).
//   • Numbers within each column are sorted ascending top → bottom.

/**
 * Deterministic fallback matrix with random permutations.
 * Base zeros represent columns with single numbers (no extra).
 * Exactly 3 zeros per row (6 extras per row = 15 numbers per ticket).
 * Col 0 has 3 zeros (3 extras = 9 numbers).
 * Cols 1..7 have 2 zeros each (4 extras = 10 numbers each).
 * Col 8 has 1 zero (5 extras = 11 numbers).
 */
const _getFallbackExtrasMatrix = () => {
  const baseZeros = [
    [0, 1, 2],
    [0, 3, 4],
    [0, 5, 6],
    [1, 3, 7],
    [2, 4, 7],
    [5, 6, 8],
  ];

  const rowOrder = _shuffle([0, 1, 2, 3, 4, 5]);
  const middleColMap = _shuffle([1, 2, 3, 4, 5, 6, 7]);
  const extras = Array.from({ length: 6 }, () => new Array(9).fill(1));

  for (let r = 0; r < 6; r++) {
    const origRow = baseZeros[rowOrder[r]];
    for (const c of origRow) {
      let mappedCol = c;
      if (c >= 1 && c <= 7) {
        mappedCol = middleColMap[c - 1];
      }
      extras[r][mappedCol] = 0;
    }
  }

  return extras;
};

/**
 * Generates a 6×9 binary matrix indicating which ticket gets an extra (2nd) number in which column.
 * Row sums = 6 (every ticket gets 9 base numbers + 6 extras = 15 numbers).
 * Column sums = [3, 4, 4, 4, 4, 4, 4, 4, 5] (adding 6 base numbers gives 9, 10, ..., 11).
 */
const _generateExtrasMatrix = () => {
  const colNeeds = [3, 4, 4, 4, 4, 4, 4, 4, 5];

  for (let attempt = 0; attempt < 200; attempt++) {
    const rowCounts = [0, 0, 0, 0, 0, 0];
    const extras = Array.from({ length: 6 }, () => new Array(9).fill(0));

    // Process constrained columns first: Col 8 (5), Col 0 (3), then shuffled Cols 1..7 (4)
    const middleCols = _shuffle([1, 2, 3, 4, 5, 6, 7]);
    const colOrder = [8, 0, ...middleCols];

    let valid = true;
    for (const c of colOrder) {
      const needed = colNeeds[c];
      const candidates = [0, 1, 2, 3, 4, 5]
        .filter((t) => rowCounts[t] < 6)
        .sort((t1, t2) => rowCounts[t1] - rowCounts[t2] || Math.random() - 0.5);

      if (candidates.length < needed) {
        valid = false;
        break;
      }

      const chosen = candidates.slice(0, needed);
      for (const t of chosen) {
        extras[t][c] = 1;
        rowCounts[t]++;
      }
    }

    if (valid && rowCounts.every((r) => r === 6)) {
      return extras;
    }
  }

  return _getFallbackExtrasMatrix();
};

/**
 * Generates a complete authentic Tambola strip of 6 tickets.
 * All 90 numbers from 1 to 90 appear exactly once across the 6 tickets.
 *
 * @returns {number[][][]} Array of 6 grids (each 3×9)
 */
const generateTambolaStrip = () => {
  // 1. Column number pools: Col 0: 1-9, Cols 1..7: 10 each, Col 8: 80-90 (11 total)
  const colPools = COL_RANGES.map(({ min, max }) => {
    const pool = [];
    for (let n = min; n <= max; n++) pool.push(n);
    return _shuffle(pool);
  });

  // 2. Extra numbers matrix (which ticket gets 2 numbers in which column)
  const extras = _generateExtrasMatrix();

  // 3. Partition numbers from colPools into tickets
  // ticketColNumbers[t][c] = sorted array of numbers for ticket t in column c
  const ticketColNumbers = Array.from({ length: 6 }, () =>
    Array.from({ length: 9 }, () => [])
  );

  for (let c = 0; c < 9; c++) {
    const pool = colPools[c];
    let poolIdx = 0;
    for (let t = 0; t < 6; t++) {
      const count = 1 + extras[t][c]; // 1 or 2 numbers
      const assigned = pool.slice(poolIdx, poolIdx + count).sort((a, b) => a - b);
      ticketColNumbers[t][c] = assigned;
      poolIdx += count;
    }
  }

  // 4. Place numbers into the 3×9 grid for each ticket
  const stripGrids = [];

  for (let t = 0; t < 6; t++) {
    const grid = [
      new Array(9).fill(0),
      new Array(9).fill(0),
      new Array(9).fill(0),
    ];

    // Find the 6 columns with 2 numbers and the 3 columns with 1 number
    const colsWith2 = [];
    const colsWith1 = [];
    for (let c = 0; c < 9; c++) {
      if (extras[t][c] === 1) {
        colsWith2.push(c);
      } else {
        colsWith1.push(c);
      }
    }

    // Partition 6 columns with 2 numbers into 3 pairs:
    // Pair 1: placed in Rows 1 & 2 (omits Row 0)
    // Pair 2: placed in Rows 0 & 2 (omits Row 1)
    // Pair 3: placed in Rows 0 & 1 (omits Row 2)
    const shuffledColsWith2 = _shuffle(colsWith2);
    const omitRow0 = shuffledColsWith2.slice(0, 2);
    const omitRow1 = shuffledColsWith2.slice(2, 4);
    const omitRow2 = shuffledColsWith2.slice(4, 6);

    // Partition 3 columns with 1 number:
    // 1 col in Row 0, 1 col in Row 1, 1 col in Row 2
    const shuffledColsWith1 = _shuffle(colsWith1);
    const rowForCol1 = {
      [shuffledColsWith1[0]]: 0,
      [shuffledColsWith1[1]]: 1,
      [shuffledColsWith1[2]]: 2,
    };

    // Assign numbers into the grid
    for (const c of omitRow0) {
      grid[1][c] = ticketColNumbers[t][c][0];
      grid[2][c] = ticketColNumbers[t][c][1];
    }
    for (const c of omitRow1) {
      grid[0][c] = ticketColNumbers[t][c][0];
      grid[2][c] = ticketColNumbers[t][c][1];
    }
    for (const c of omitRow2) {
      grid[0][c] = ticketColNumbers[t][c][0];
      grid[1][c] = ticketColNumbers[t][c][1];
    }
    for (const c of shuffledColsWith1) {
      const r = rowForCol1[c];
      grid[r][c] = ticketColNumbers[t][c][0];
    }

    stripGrids.push(grid);
  }

  return stripGrids;
};

/**
 * Generates an array of N Tambola tickets using authentic 6-ticket strips.
 * Every consecutive block of 6 tickets (1..6, 7..12, etc.) contains all 90 numbers with zero duplicates.
 *
 * @param {number} count — number of tickets to generate (e.g. 900 or 1800)
 * @returns {number[][][]} array of count grids (3×9 each)
 */
const generateStripBatch = (count) => {
  const tickets = [];
  while (tickets.length < count) {
    const strip = generateTambolaStrip();
    for (const grid of strip) {
      tickets.push(grid);
      if (tickets.length === count) break;
    }
  }
  return tickets;
};

module.exports = {
  generateTambolaTicket,
  generateTicketBatch,
  generateTambolaStrip,
  generateStripBatch,
};
