/**
 * AI.js — Shoot Or Shield
 *
 * 7-Level Cognition System:
 *   L1 Reactive     – Based only on opponent's very last move
 *   L2 Rule-Based   – Follows optimal rules for current game state
 *   L3 Predictive   – Models future, blends history + transitions
 *   L4 Meta-Reactive  – Thinks about how opponent thinks, misleads
 *   L5 Meta-Predictive – 2nd/3rd order reasoning, counters traps
 *   L6 Adaptive     – Learns during game, evolves, compares past
 *   L7 Awakening    – Self-aware of influence, prunes prediction branches
 *
 * MEMORY (persisted in localStorage across all matches):
 *   - freq:   how often the player picks each move overall
 *   - after:  given player's last move, what do they tend to do next?
 *
 * UNIT AWARENESS:
 *   SHOOT/SHIELD cost 1 unit. If CPU has 0 units, it must IDLE.
 */

import { MOVES } from './Rules.js';
import { Storage } from './Storage.js';

const MEMORY_KEY = 'sos_cpu_memory';
const MOVES_LIST = [MOVES.SHOOT, MOVES.SHIELD, MOVES.IDLE];

const COUNTER = {
  [MOVES.IDLE]:   MOVES.SHOOT,
  [MOVES.SHOOT]:  MOVES.SHIELD,
  [MOVES.SHIELD]: MOVES.IDLE,
};

// What beats the counter (double-counter for meta levels)
const COUNTER2 = {
  [MOVES.IDLE]:   MOVES.SHIELD,  // counter of SHOOT is SHIELD
  [MOVES.SHOOT]:  MOVES.IDLE,    // counter of SHIELD is IDLE
  [MOVES.SHIELD]: MOVES.SHOOT,   // counter of IDLE is SHOOT
};

const FALLBACK_SAFE = MOVES.SHIELD;

function emptyFreq()  { return { shoot: 0, shield: 0, idle: 0 }; }
function emptyAfter() {
  return {
    shoot:  emptyFreq(),
    shield: emptyFreq(),
    idle:   emptyFreq(),
  };
}

const CPU_PROFILE_KEY = 'sos_cpu_profile_pts';

/**
 * Level descriptions for the info popup.
 */
export const AI_LEVELS = [
  { level: 1, name: 'Reactive',        desc: 'Reacts based only on your very last move.' },
  { level: 2, name: 'Rule-Based',      desc: 'Follows optimal rules for the current game state.' },
  { level: 3, name: 'Predictive',      desc: 'Models your future moves using history and transition patterns.' },
  { level: 4, name: 'Meta-Reactive',   desc: 'Thinks about how you think. Can mislead or exploit your reasoning.' },
  { level: 5, name: 'Meta-Predictive', desc: 'Multi-layered reasoning. Plans ahead, identifies and counters traps.' },
  { level: 6, name: 'Adaptive',        desc: 'Learns during the match. Compares live behaviour to your history to find new patterns.' },
  { level: 7, name: 'Awakening',       desc: 'Fully self-aware. Observes its own influence on you, prunes incorrect prediction branches.' },
];

export class AI {
  constructor() {
    this.units    = 0;
    this.matchPts = 0;
    this.alive    = true;
    this._lastCpuMove = null;
    this._mem     = this._loadMemory();
    this._level   = 1;

    // In-match tracking for adaptive/awakening levels
    this._matchFreq   = emptyFreq();
    this._matchTotal  = 0;
    this._correctPredictions = 0;
    this._totalPredictions   = 0;
    this._lastPredicted = null;

    const saved = Storage.getItem(CPU_PROFILE_KEY);
    this.profilePts = saved !== null ? parseInt(saved, 10) : 0;
  }

  setLevel(level) {
    this._level = Math.max(1, Math.min(7, level));
  }

  getLevel() { return this._level; }

  addToProfile(pts) {
    this.profilePts += pts;
    Storage.setItem(CPU_PROFILE_KEY, this.profilePts);
  }

  resetProfile() {
    this.profilePts = 0;
    Storage.removeItem(CPU_PROFILE_KEY);
  }

  // ─── Match lifecycle ────────────────────────────────────
  startMatch() {
    this.units    = 0;
    this.matchPts = 0;
    this.alive    = true;
    this._lastCpuMove = null;
    this._matchFreq   = emptyFreq();
    this._matchTotal  = 0;
    this._correctPredictions = 0;
    this._totalPredictions   = 0;
    this._lastPredicted = null;
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
  learn(playerMove, prevPlayerMove) {
    // Track prediction accuracy for awakening level
    if (this._lastPredicted !== null) {
      this._totalPredictions++;
      if (this._lastPredicted === playerMove) {
        this._correctPredictions++;
      }
    }

    this._mem.freq[playerMove] = (this._mem.freq[playerMove] ?? 0) + 1;
    this._mem.total++;

    if (prevPlayerMove) {
      this._mem.after[prevPlayerMove][playerMove] =
        (this._mem.after[prevPlayerMove][playerMove] ?? 0) + 1;
    }

    // In-match frequency for adaptive level
    this._matchFreq[playerMove] = (this._matchFreq[playerMove] ?? 0) + 1;
    this._matchTotal++;

    this._saveMemory();
  }

  // ─── Decision (dispatches to level-specific logic) ──────
  chooseMove(lastPlayerMove) {
    const canAct = this.units >= 1;

    let move;
    switch (this._level) {
      case 1:  move = this._chooseL1(lastPlayerMove, canAct); break;
      case 2:  move = this._chooseL2(lastPlayerMove, canAct); break;
      case 3:  move = this._chooseL3(lastPlayerMove, canAct); break;
      case 4:  move = this._chooseL4(lastPlayerMove, canAct); break;
      case 5:  move = this._chooseL5(lastPlayerMove, canAct); break;
      case 6:  move = this._chooseL6(lastPlayerMove, canAct); break;
      case 7:  move = this._chooseL7(lastPlayerMove, canAct); break;
      default: move = this._chooseL3(lastPlayerMove, canAct); break;
    }

    // Store what we predicted for accuracy tracking
    const predicted = this._predict(lastPlayerMove);
    this._lastPredicted = predicted.move;

    return this._enforceCost(move, canAct);
  }

  _enforceCost(move, canAct) {
    if ((move === MOVES.SHOOT || move === MOVES.SHIELD) && !canAct) {
      return MOVES.IDLE;
    }
    return move;
  }

  // ─── L1: Reactive (last move only) ─────────────────────
  _chooseL1(lastPlayerMove, canAct) {
    if (!lastPlayerMove) return canAct ? FALLBACK_SAFE : MOVES.IDLE;
    return COUNTER[lastPlayerMove];
  }

  // ─── L2: Rule-Based ────────────────────────────────────
  _chooseL2(lastPlayerMove, canAct) {
    if (!canAct) return MOVES.IDLE;

    // Simple state-aware rules
    if (this.units >= 3) return MOVES.SHOOT; // Accumulated enough, attack
    if (this.units === 1) return MOVES.SHIELD; // Protect when low
    if (lastPlayerMove === MOVES.IDLE) return MOVES.SHOOT; // Punish idle
    if (lastPlayerMove === MOVES.SHOOT) return MOVES.SHIELD; // Block shot
    return MOVES.IDLE; // Accumulate
  }

  // ─── L3: Predictive (original blend logic) ─────────────
  _chooseL3(lastPlayerMove, canAct) {
    if (this._mem.total < 4) return canAct ? FALLBACK_SAFE : MOVES.IDLE;

    const predicted = this._predict(lastPlayerMove);
    const counter   = COUNTER[predicted.move];

    if (predicted.confidence < 0.40 && canAct) return FALLBACK_SAFE;
    return counter;
  }

  // ─── L4: Meta-Reactive ─────────────────────────────────
  // "They know I predict them, so I mislead or exploit"
  _chooseL4(lastPlayerMove, canAct) {
    if (this._mem.total < 6) return this._chooseL3(lastPlayerMove, canAct);

    const predicted = this._predict(lastPlayerMove);
    const counter = COUNTER[predicted.move];

    // If player likely expects us to counter, they'll counter our counter
    // So we go one level deeper: counter the counter-counter
    if (predicted.confidence > 0.55) {
      // Player is predictable — they might adapt and counter our counter
      // Use double-counter (what beats what they'd switch to)
      const theirAdapt = COUNTER[counter]; // what beats our counter
      return COUNTER[theirAdapt]; // counter that adaptation
    }

    // Low confidence — use random weighted approach
    if (predicted.confidence < 0.35 && canAct) {
      const rand = Math.random();
      if (rand < 0.4) return MOVES.SHOOT;
      if (rand < 0.7) return MOVES.SHIELD;
      return MOVES.IDLE;
    }

    return counter;
  }

  // ─── L5: Meta-Predictive ───────────────────────────────
  // Multi-layered reasoning with trap detection
  _chooseL5(lastPlayerMove, canAct) {
    if (this._mem.total < 8) return this._chooseL4(lastPlayerMove, canAct);

    const predicted = this._predict(lastPlayerMove);

    // Check if player has been alternating (possible trap pattern)
    const transData = lastPlayerMove ? this._mem.after[lastPlayerMove] : null;
    let isTrapPattern = false;

    if (transData) {
      const vals = Object.values(transData);
      const transTotal = vals.reduce((a, b) => a + b, 0);
      if (transTotal >= 4) {
        const maxTrans = Math.max(...vals);
        // If one transition dominates > 70%, it could be a deliberate trap
        if (maxTrans / transTotal > 0.7) {
          isTrapPattern = true;
        }
      }
    }

    if (isTrapPattern) {
      // Player might be setting a pattern trap — counter the expected counter
      const likelyPlayerMove = predicted.move;
      const ourObviousCounter = COUNTER[likelyPlayerMove];
      const theirTrapMove = COUNTER[ourObviousCounter]; // what beats our obvious play
      return COUNTER[theirTrapMove]; // we counter their trap
    }

    // Use L4 logic as fallback
    return this._chooseL4(lastPlayerMove, canAct);
  }

  // ─── L6: Adaptive ──────────────────────────────────────
  // "Their behaviour changed, my strategy changes too"
  _chooseL6(lastPlayerMove, canAct) {
    if (this._matchTotal < 3) return this._chooseL5(lastPlayerMove, canAct);

    // Compare in-match frequency to historical frequency
    const histTotal = this._mem.total;
    const mTotal = this._matchTotal;

    let maxDrift = 0;
    let driftMove = null;

    for (const m of MOVES_LIST) {
      const histRate = histTotal > 0 ? (this._mem.freq[m] ?? 0) / histTotal : 0.333;
      const matchRate = mTotal > 0 ? (this._matchFreq[m] ?? 0) / mTotal : 0.333;
      const drift = Math.abs(matchRate - histRate);

      if (drift > maxDrift) {
        maxDrift = drift;
        driftMove = m;
      }
    }

    // If player significantly changed behavior (drift > 15%), counter new pattern
    if (maxDrift > 0.15 && driftMove) {
      // Player shifted to this move more — counter it
      const matchPredicted = this._predictFromFreq(this._matchFreq, mTotal);
      return COUNTER[matchPredicted.move];
    }

    // No significant drift — fall back to L5
    return this._chooseL5(lastPlayerMove, canAct);
  }

  // ─── L7: Awakening ─────────────────────────────────────
  // Self-aware: observes own influence, prunes bad prediction branches
  _chooseL7(lastPlayerMove, canAct) {
    if (this._matchTotal < 4) return this._chooseL6(lastPlayerMove, canAct);

    const accuracy = this._totalPredictions > 0
      ? this._correctPredictions / this._totalPredictions
      : 0;

    // If our predictions have been accurate (> 55%), trust them fully
    if (accuracy > 0.55) {
      return this._chooseL3(lastPlayerMove, canAct); // Pure prediction works
    }

    // If predictions are poor (< 35%), player is unpredictable or adapting to us
    // Switch to randomized anti-prediction strategy
    if (accuracy < 0.35) {
      // Be deliberately unpredictable
      const rand = Math.random();
      if (!canAct) return MOVES.IDLE;
      if (rand < 0.35) return MOVES.SHOOT;
      if (rand < 0.65) return MOVES.SHIELD;
      return MOVES.IDLE;
    }

    // Medium accuracy — blend adaptive and meta-predictive
    return this._chooseL6(lastPlayerMove, canAct);
  }

  // ─── Prediction helpers ─────────────────────────────────
  _predict(lastPlayerMove) {
    const totalData = this._mem.total;
    if (totalData < 2) return { move: MOVES.IDLE, confidence: 0.333 };

    const freqProb = this._toProb(this._mem.freq, totalData);

    let transProb = null;
    if (lastPlayerMove && this._mem.after[lastPlayerMove]) {
      const transTotal = Object.values(this._mem.after[lastPlayerMove]).reduce((a, b) => a + b, 0);
      if (transTotal >= 2) {
        transProb = this._toProb(this._mem.after[lastPlayerMove], transTotal);
      }
    }

    let blended;
    if (transProb) {
      blended = {};
      for (const m of MOVES_LIST) {
        blended[m] = 0.6 * (transProb[m] ?? 0) + 0.4 * (freqProb[m] ?? 0);
      }
    } else {
      blended = freqProb;
    }

    const top = MOVES_LIST.reduce((best, m) =>
      (blended[m] > blended[best] ? m : best), MOVES_LIST[0]);

    return { move: top, confidence: blended[top] };
  }

  _predictFromFreq(freq, total) {
    if (total < 1) return { move: MOVES.IDLE, confidence: 0.333 };
    const prob = this._toProb(freq, total);
    const top = MOVES_LIST.reduce((best, m) =>
      (prob[m] > prob[best] ? m : best), MOVES_LIST[0]);
    return { move: top, confidence: prob[top] };
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
      const raw = Storage.getItem(MEMORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
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
    try { Storage.setItem(MEMORY_KEY, JSON.stringify(this._mem)); } catch (_) {}
  }

  /** Wipe all learned data */
  resetMemory() {
    this._mem = this._freshMemory();
    Storage.removeItem(MEMORY_KEY);
  }

  getMemorySize() { return this._mem.total; }
}
