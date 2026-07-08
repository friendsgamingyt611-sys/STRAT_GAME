/**
 * AI.js — Shoot Or Shield
 *
 * Single adaptive CPU. No personalities. Pure learning.
 *
 * MEMORY (persisted in localStorage across all matches):
 *   - freq:   how often the player picks each move overall
 *   - after:  given player's last move, what do they tend to do next?
 *             (transition matrix — the core of pattern recognition)
 *
 * PREDICTION:
 *   1. If < 4 data points → random (no data yet)
 *   2. Blend: 60% transition prob (based on last move) + 40% overall freq
 *   3. Predict player's most likely next move
 *   4. Pick the counter move
 *   5. If confidence is low (< 40%) → default SHIELD (safest, never dies)
 *
 * COUNTER MAP:
 *   player IDLE   → CPU SHOOT  (kill attempt)
 *   player SHOOT  → CPU SHIELD (deflect, score, never dies)
 *   player SHIELD → CPU IDLE   (score punishment, free)
 *
 * UNIT AWARENESS:
 *   SHOOT/SHIELD cost 1 unit. If CPU has 0 units, it must IDLE.
 */

import { MOVES } from './Rules.js';

const MEMORY_KEY = 'sos_cpu_memory';

const MOVES_LIST = [MOVES.SHOOT, MOVES.SHIELD, MOVES.IDLE];

const COUNTER = {
  [MOVES.IDLE]:   MOVES.SHOOT,   // punish idler → shoot
  [MOVES.SHOOT]:  MOVES.SHIELD,  // block shooter → shield
  [MOVES.SHIELD]: MOVES.IDLE,    // punish wasted shield → idle
};

const FALLBACK_SAFE = MOVES.SHIELD;  // safest when uncertain — never gets killed

function emptyFreq()  { return { shoot: 0, shield: 0, idle: 0 }; }
function emptyAfter() {
  return {
    shoot:  emptyFreq(),
    shield: emptyFreq(),
    idle:   emptyFreq(),
  };
}

const CPU_PROFILE_KEY = 'sos_cpu_profile_pts';

export class AI {
  constructor() {
    this.units    = 0;
    this.matchPts = 0;
    this.alive    = true;
    this._lastCpuMove = null;
    this._mem     = this._loadMemory();

    // Load profile pts from localStorage (CPU player)
    const saved = localStorage.getItem(CPU_PROFILE_KEY);
    this.profilePts = saved !== null ? parseInt(saved, 10) : 0;
  }

  addToProfile(pts) {
    this.profilePts += pts;
    localStorage.setItem(CPU_PROFILE_KEY, this.profilePts);
  }

  resetProfile() {
    this.profilePts = 0;
    localStorage.removeItem(CPU_PROFILE_KEY);
  }

  // ─── Match lifecycle ────────────────────────────────────
  startMatch() {
    this.units    = 0;
    this.matchPts = 0;
    this.alive    = true;
    this._lastCpuMove = null;
    // Memory is NOT reset between matches — it persists
  }

  gainUnit()   { this.units += 1; }
  addMatchPt() { this.matchPts++; }
  die()        { this.alive = false; }

  commitMove(move) {
    if (move === MOVES.SHOOT || move === MOVES.SHIELD) {
      this.units = Math.max(0, this.units - 1);
    }
    this._lastCpuMove = move;
  }

  // ─── Learning: record what player did ───────────────────
  /**
   * Call after each round with the player's actual move.
   * @param {string} playerMove  - what the player chose this round
   * @param {string|null} prevPlayerMove - what player chose last round (for transition)
   */
  learn(playerMove, prevPlayerMove) {
    // Update overall frequency
    this._mem.freq[playerMove] = (this._mem.freq[playerMove] ?? 0) + 1;
    this._mem.total++;

    // Update transition: what player does AFTER their previous move
    if (prevPlayerMove) {
      this._mem.after[prevPlayerMove][playerMove] =
        (this._mem.after[prevPlayerMove][playerMove] ?? 0) + 1;
    }

    this._saveMemory();
  }

  // ─── Decision ───────────────────────────────────────────
  /**
   * @param {string|null} lastPlayerMove  - player's move from the previous round
   * @returns {string}  chosen move
   */
  chooseMove(lastPlayerMove) {
    const canAct = this.units >= 1;

    // Not enough data yet → fallback
    if (this._mem.total < 4) {
      return canAct ? FALLBACK_SAFE : MOVES.IDLE;
    }

    const predicted = this._predict(lastPlayerMove);
    const counter   = COUNTER[predicted.move];

    // If counter requires a unit but we're broke, IDLE (accumulate)
    const counterNeedsUnit = (counter === MOVES.SHOOT || counter === MOVES.SHIELD);
    if (counterNeedsUnit && !canAct) return MOVES.IDLE;

    // If confidence is low, prefer SHIELD (safe — we never die from SHIELD)
    if (predicted.confidence < 0.40 && canAct) return FALLBACK_SAFE;

    return counter;
  }

  // ─── Prediction ─────────────────────────────────────────
  _predict(lastPlayerMove) {
    const totalData = this._mem.total;

    // Overall frequency probabilities
    const freqProb = this._toProb(this._mem.freq, totalData);

    // Transition probabilities (what player does after lastMove)
    let transProb = null;
    if (lastPlayerMove && this._mem.after[lastPlayerMove]) {
      const transTotal = Object.values(this._mem.after[lastPlayerMove]).reduce((a, b) => a + b, 0);
      if (transTotal >= 2) {
        transProb = this._toProb(this._mem.after[lastPlayerMove], transTotal);
      }
    }

    // Blend: 60% transition + 40% freq (if transition data exists), else 100% freq
    let blended;
    if (transProb) {
      blended = {};
      for (const m of MOVES_LIST) {
        blended[m] = 0.6 * (transProb[m] ?? 0) + 0.4 * (freqProb[m] ?? 0);
      }
    } else {
      blended = freqProb;
    }

    // Find most likely player move
    const top = MOVES_LIST.reduce((best, m) =>
      (blended[m] > blended[best] ? m : best), MOVES_LIST[0]);

    return { move: top, confidence: blended[top] };
  }

  _toProb(counts, total) {
    if (total === 0) return { shoot: 0.333, shield: 0.333, idle: 0.333 };
    const prob = {};
    for (const m of MOVES_LIST) {
      prob[m] = (counts[m] ?? 0) / total;
    }
    return prob;
  }

  // ─── Memory persistence ─────────────────────────────────
  _loadMemory() {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Validate structure
        if (parsed.freq && parsed.after && typeof parsed.total === 'number') {
          return parsed;
        }
      }
    } catch (_) {}
    return this._freshMemory();
  }

  _freshMemory() {
    return { freq: emptyFreq(), after: emptyAfter(), total: 0 };
  }

  _saveMemory() {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(this._mem)); } catch (_) {}
  }

  /** Wipe all learned data */
  resetMemory() {
    this._mem = this._freshMemory();
    localStorage.removeItem(MEMORY_KEY);
  }

  getMemorySize() { return this._mem.total; }
}
