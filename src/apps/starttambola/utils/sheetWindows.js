/**
 * Computes Half Sheet and Full Sheet windows based on greedy allocation of 6, then overlapping 3.
 * @param {Array} tickets - Sorted array of tickets (must have ticket_number property)
 * @returns {Object} { half: [ [t1, t2, t3], ... ], full: [ [t1..t6], ... ], halfCount, fullCount }
 */
const computeSheetWindows = (tickets) => {
  const half = [];
  const full = [];
  
  if (!tickets || tickets.length === 0) return { half, full, halfCount: 0, fullCount: 0 };

  // Group into consecutive runs
  const runs = [];
  let currentRun = [tickets[0]];
  for (let i = 1; i < tickets.length; i++) {
    if (tickets[i].ticket_number === tickets[i-1].ticket_number + 1) {
      currentRun.push(tickets[i]);
    } else {
      runs.push(currentRun);
      currentRun = [tickets[i]];
    }
  }
  runs.push(currentRun);

  // Process each run
  for (const run of runs) {
    let remainingRun = run;
    // Greedy Full Sheets
    while (remainingRun.length >= 6) {
      full.push(remainingRun.slice(0, 6));
      remainingRun = remainingRun.slice(6);
    }
    // Overlapping Half Sheets in the remainder
    if (remainingRun.length >= 3) {
      // e.g. length 3 => 1 half, length 4 => 2 halfs, length 5 => 3 halfs
      for (let i = 0; i <= remainingRun.length - 3; i++) {
        half.push(remainingRun.slice(i, i + 3));
      }
    }
  }

  return { 
    half, 
    full,
    halfCount: half.length,
    fullCount: full.length
  };
};

module.exports = { computeSheetWindows };
