/**
 * State.js — Shoot Or Shield
 * Observable store. UI subscribes and re-renders on every change.
 * No DOM here.
 */

export const Phase = {
  MENU:      'menu',
  SELECTING: 'selecting',
  REVEALING: 'revealing',
  GAME_OVER: 'game_over',
};

export class State {
  constructor() {
    this._listeners = [];
    this._init();
  }

  _init() {
    this.phase        = Phase.MENU;
    this.round        = 1;

    // In-match points (reset each match)
    this.playerMatchPts = 0;
    this.cpuMatchPts    = 0;

    // Resource units
    this.playerUnits  = 0;
    this.cpuUnits     = 0;

    // Alive status
    this.playerAlive  = true;
    this.cpuAlive     = true;

    // Last round
    this.playerMove   = null;
    this.cpuMove      = null;
    this.lastOutcome  = null;
    this.lastDesc     = '';

    // Result
    this.winner       = null;   // 'player' | 'cpu' | 'dual_defeat'
    this.ptsAwarded   = 0;      // pts added to player profile on win

    // Round log
    this.log          = [];
  }

  reset() {
    this._init();
    this._notify();
  }

  subscribe(fn) { this._listeners.push(fn); }
  _notify()     { for (const fn of this._listeners) fn(this); }

  setPhase(p)   { this.phase = p; this._notify(); }

  applyRound({ playerMove, cpuMove, outcome, desc, playerPt, cpuPt, playerDies, cpuDies }) {
    this.playerMove = playerMove;
    this.cpuMove    = cpuMove;
    this.lastOutcome = outcome;
    this.lastDesc    = desc;

    if (playerPt)   this.playerMatchPts++;
    if (cpuPt)      this.cpuMatchPts++;
    if (playerDies) this.playerAlive = false;
    if (cpuDies)    this.cpuAlive    = false;

    this.log.unshift({ round: this.round, playerMove, cpuMove, outcome, desc });

    this._notify();
  }

  advanceRound() {
    this.round++;
    this._notify();
  }

  endMatch(winner, ptsAwarded) {
    this.winner     = winner;
    this.ptsAwarded = ptsAwarded;
    this.phase      = Phase.GAME_OVER;
    this._notify();
  }

  snapshot() {
    return {
      phase:          this.phase,
      round:          this.round,
      playerMatchPts: this.playerMatchPts,
      cpuMatchPts:    this.cpuMatchPts,
      playerUnits:    this.playerUnits,
      cpuUnits:       this.cpuUnits,
      playerAlive:    this.playerAlive,
      cpuAlive:       this.cpuAlive,
      playerMove:     this.playerMove,
      cpuMove:        this.cpuMove,
      lastOutcome:    this.lastOutcome,
      lastDesc:       this.lastDesc,
      winner:         this.winner,
      ptsAwarded:     this.ptsAwarded,
      log:            [...this.log],
    };
  }
}
