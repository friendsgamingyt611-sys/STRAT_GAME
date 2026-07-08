/**
 * Player.js — Shoot Or Shield
 *
 * profilePts: persistent earned points (Computer Mode). Stored in localStorage.
 * matchPts:   points accumulated in the current match only (resets each match).
 * units:      resource units; gain 1/round, spend 1 for SHOOT or SHIELD.
 * alive:      set to false when killed.
 */

import { Rules } from './Rules.js';

const PROFILE_KEY = 'sos_profile_pts';

export class Player {
  constructor(name = 'Player') {
    this.name = name;

    // Load profile pts from localStorage (human player only)
    const saved = localStorage.getItem(PROFILE_KEY);
    this.profilePts = saved !== null ? parseInt(saved, 10) : 0;

    this.matchPts  = 0;
    this.units     = 0;
    this.alive     = true;
    this.history   = [];
  }

  // ─── Profile ───────────────────────────────────────
  addToProfile(pts) {
    this.profilePts += pts;
    localStorage.setItem(PROFILE_KEY, this.profilePts);
  }

  resetProfile() {
    this.profilePts = 0;
    localStorage.removeItem(PROFILE_KEY);
  }

  // ─── Match ─────────────────────────────────────────
  startMatch() {
    this.matchPts = 0;
    this.units    = 0;
    this.alive    = true;
    this.history  = [];
  }

  gainUnit()  { this.units += 1; }

  commitMove(move) {
    if (Rules.costsUnit(move)) this.units = Math.max(0, this.units - 1);
  }

  canAfford(move) {
    return Rules.costsUnit(move) ? this.units >= 1 : true;
  }

  addMatchPt()  { this.matchPts++; }
  die()         { this.alive = false; }

  recordRound(move, outcome) {
    this.history.push({ move, outcome });
  }

  getMoveFrequency() {
    const freq = {};
    for (const h of this.history) freq[h.move] = (freq[h.move] ?? 0) + 1;
    return freq;
  }
}
