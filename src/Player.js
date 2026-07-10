/**
 * Player.js — Shoot Or Shield
 *
 * profilePts: persistent earned points (Computer Mode). Stored in localStorage.
 * matchPts:   points accumulated in the current match only (resets each match).
 * units:      resource units; gain 1/round, spend 1 for SHOOT or SHIELD.
 * alive:      set to false when killed.
 */

import { Rules } from './Rules.js';
import { Storage } from './Storage.js';

export class Player {
  constructor(name = 'Player', profileKey = 'sos_profile_pts') {
    this.name = name;
    this.profileKey = profileKey;

    // Load profile pts from localStorage (human player only)
    const saved = Storage.getItem(this.profileKey);
    this.profilePts = saved !== null ? parseInt(saved, 10) : 0;

    this.matchPts  = 0;
    this.units     = 0;
    this.alive     = true;
    this.history   = [];
  }

  // ─── Profile ───────────────────────────────────────
  addToProfile(pts) {
    this.profilePts += pts;
    Storage.setItem(this.profileKey, this.profilePts);
  }

  resetProfile() {
    this.profilePts = 0;
    Storage.removeItem(this.profileKey);
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
