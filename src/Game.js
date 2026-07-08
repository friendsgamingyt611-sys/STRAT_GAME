/**
 * Game.js — Shoot Or Shield
 *
 * Orchestrates Player + AI + Rules + State.
 * The CPU learns from every round across all matches (memory persists).
 * No personalities — pure adaptive opponent.
 *
 * Win: kill the opponent (SHOOT vs IDLE) → winner claims both match point pools.
 * Dual Defeat (SHOOT vs SHOOT) → nobody claims anything.
 */

import { Player }                  from './Player.js';
import { AI }                      from './AI.js';
import { Rules, MOVES, OUTCOMES }  from './Rules.js';
import { State, Phase }            from './State.js';

export class Game {
  constructor() {
    this.player          = new Player('You');
    this.cpu             = new AI();
    this.state           = new State();
    this._lastPlayerMove = null;   // for transition learning
  }

  /** Start / restart a match (CPU memory is NOT cleared here) */
  start() {
    this.player.startMatch();
    this.cpu.startMatch();
    this._lastPlayerMove = null;

    this.state.reset();
    this.state.phase = Phase.SELECTING;

    this._grantUnits();
    this.state._notify();
  }

  /** Grant +1 unit to both at the start of every round */
  _grantUnits() {
    this.player.gainUnit();
    this.cpu.gainUnit();
    this.state.playerUnits = this.player.units;
    this.state.cpuUnits    = this.cpu.units;
  }

  /**
   * Called by UI when player commits a move (at timer expiry or explicit submit).
   * @param {string} playerMove
   * @returns {object|null}  state snapshot
   */
  playTurn(playerMove) {
    if (this.state.phase !== Phase.SELECTING) return null;
    if (!this.player.canAfford(playerMove)) return null;

    this.state.setPhase(Phase.REVEALING);

    // CPU decision — uses last player move for transition prediction
    const cpuMove = this.cpu.alive
      ? this.cpu.chooseMove(this._lastPlayerMove)
      : MOVES.IDLE;   // dead CPU = ghost

    // Deduct units
    this.player.commitMove(playerMove);
    this.cpu.commitMove(cpuMove);
    this.state.playerUnits = this.player.units;
    this.state.cpuUnits    = this.cpu.units;

    // Resolve
    const result = Rules.resolve(playerMove, cpuMove);

    // Apply points
    if (result.playerPt) { this.player.addMatchPt(); this.state.playerMatchPts++; }
    if (result.cpuPt)    { this.cpu.addMatchPt();    this.state.cpuMatchPts++;    }

    // Apply deaths
    if (result.playerDies) this.player.die();
    if (result.cpuDies)    this.cpu.die();

    // CPU learns from player's actual move (BEFORE updating _lastPlayerMove)
    this.cpu.learn(playerMove, this._lastPlayerMove);

    // Record for next round's transition prediction
    this._lastPlayerMove = playerMove;

    // Push to state (pts already applied above)
    this.state.applyRound({
      playerMove, cpuMove,
      outcome:    result.outcome,
      desc:       result.desc,
      playerPt:   false,
      cpuPt:      false,
      playerDies: result.playerDies,
      cpuDies:    result.cpuDies,
    });

    return this.state.snapshot();
  }

  /**
   * Called by UI after the reveal timer expires.
   * Resolves game-over OR starts the next round.
   */
  advance() {
    // Dual Defeat
    if (!this.player.alive && !this.cpu.alive) {
      this.state.endMatch('dual_defeat', 0);
      return;
    }

    // Player killed CPU
    if (!this.cpu.alive) {
      const pot = this.player.matchPts + this.cpu.matchPts;
      this.player.addToProfile(pot);
      this.state.endMatch('player', pot);
      return;
    }

    // CPU killed player
    if (!this.player.alive) {
      const pot = this.player.matchPts + this.cpu.matchPts;
      this.cpu.addToProfile(pot);
      this.state.endMatch('cpu', pot);
      return;
    }

    // Continue — advance to next round
    this.state.advanceRound();
    this._grantUnits();
    this.state.setPhase(Phase.SELECTING);
  }

  // ─── Profile & memory ────────────────────────────────────
  getProfilePts() { return this.player.profilePts; }
  getCpuProfilePts() { return this.cpu.profilePts; }

  getCpuMemorySize() { return this.cpu.getMemorySize(); }

  /**
   * Reset BOTH player profile AND CPU learned memory AND CPU profile pts.
   * This is the "wipe" option on the menu.
   */
  resetAll() {
    this.player.resetProfile();
    this.cpu.resetProfile();
    this.cpu.resetMemory();
  }
}
