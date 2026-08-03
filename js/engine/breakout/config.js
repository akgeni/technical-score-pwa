// Port of breakout_scan.py's CFG dict — single source of truth for all breakout thresholds.
export const CFG = {
  pivotK: 4,                // bars each side for a swing pivot
  breakoutBuffer: 0.002,    // close must clear pivot by 0.2% to count as a trigger
  volConfirmMult: 1.4,      // breakout-day volume vs 50d average
  extendedPct: 0.06,        // >6% above pivot = chasing, not an entry
  maxBarsSinceTrigger: 7,   // still "actionable" this many bars after trigger
  flatBaseMaxDepth: 0.20,
  flatBaseMinLen: 15,
  flatBaseMaxLen: 130,
  cupMinDepth: 0.10,
  cupMaxDepth: 0.40,
  cupMinLen: 25,
  cupMaxLen: 160,
  handleMaxDepth: 0.15,
  handleMinLen: 4,
  handleMaxLen: 30,
  flagPoleMinMove: 0.18,
  flagPoleMaxBars: 25,
  flagMaxRetrace: 0.40,
  flagMaxLen: 20,
  vcpMaxContractions: 4,
  minBars: 60,
};
