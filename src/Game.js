/**
 * Game.js — Shoot Or Shield
 *
 * Orchestrates Player + AI + Rules + State.
 * Supports VS Computer (7 AI levels) and VS Player P2P modes.
 */

import { Player }                  from './Player.js';
import { AI }                      from './AI.js';
import { Rules, MOVES, OUTCOMES }  from './Rules.js';
import { State, Phase }            from './State.js';
import { Storage }                 from './Storage.js';

export class Game {
  constructor() {
    this.player          = new Player('You', 'sos_profile_pts');
    this.cpu             = new AI();
    this.state           = new State();
    this._lastPlayerMove = null;
    this.isP2P           = false;

    // Restore AI level from storage
    this.cpu.setLevel(Storage.getAILevel());
  }

  /** Switch between P2P and Computer Game modes */
  switchToP2P(isP2P) {
    this.isP2P = isP2P;
    if (isP2P) {
      this.player = new Player('You', 'sos_p2p_profile_pts');
      this.cpu    = new Player('Opponent', 'sos_p2p_opponent_pts');
    } else {
      this.player = new Player('You', 'sos_profile_pts');
      this.cpu    = new AI();
      this.cpu.setLevel(Storage.getAILevel());
    }
  }

  /** Set the AI cognition level (1-7) */
  setAILevel(level) {
    Storage.setAILevel(level);
    if (!this.isP2P && this.cpu instanceof AI) {
      this.cpu.setLevel(level);
    }
  }

  getAILevel() {
    return Storage.getAILevel();
  }

  /** Start / restart a match */
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
   * Called by UI when player commits a move (VS Computer).
   * @param {string} playerMove
   * @returns {object|null}  state snapshot
   */
  playTurn(playerMove) {
    if (this.state.phase !== Phase.SELECTING) return null;
    if (!this.player.canAfford(playerMove)) return null;

    this.state.setPhase(Phase.REVEALING);

    // CPU decision
    const cpuMove = this.cpu.alive
      ? this.cpu.chooseMove(this._lastPlayerMove)
      : MOVES.IDLE;

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

    // CPU learns from player's actual move
    this.cpu.learn(playerMove, this._lastPlayerMove);

    // Record for next round's transition prediction
    this._lastPlayerMove = playerMove;

    // Push to state
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
   * Called by UI when both players in P2P mode have committed a move.
   * @param {string} playerMove
   * @param {string} opponentMove
   * @returns {object|null} state snapshot
   */
  playP2PTurn(playerMove, opponentMove) {
    if (this.state.phase !== Phase.SELECTING) return null;

    this.state.setPhase(Phase.REVEALING);

    // Deduct units
    this.player.commitMove(playerMove);
    this.cpu.commitMove(opponentMove);
    this.state.playerUnits = this.player.units;
    this.state.cpuUnits    = this.cpu.units;

    // Resolve win/loss
    const result = Rules.resolve(playerMove, opponentMove);

    // Apply points
    if (result.playerPt) { this.player.addMatchPt(); this.state.playerMatchPts++; }
    if (result.cpuPt)    { this.cpu.addMatchPt();    this.state.cpuMatchPts++;    }

    // Apply deaths
    if (result.playerDies) this.player.die();
    if (result.cpuDies)    this.cpu.die();

    // Push to state
    this.state.applyRound({
      playerMove,
      cpuMove:    opponentMove,
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

    // Player killed Opponent
    if (!this.cpu.alive) {
      const pot = this.player.matchPts + this.cpu.matchPts;
      this.player.addToProfile(pot);
      this.state.endMatch('player', pot);
      return;
    }

    // Opponent killed player
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

  getCpuMemorySize() {
    return this.isP2P ? 0 : this.cpu.getMemorySize();
  }

  resetAll() {
    this.player.resetProfile();
    this.cpu.resetProfile();
    if (!this.isP2P) {
      this.cpu.resetMemory();
    }
  }

  resetP2P() {
    Storage.removeItem('sos_p2p_profile_pts');
    Storage.removeItem('sos_p2p_opponent_pts');
    Storage.resetP2PHistory();
    if (this.isP2P) {
      this.player.resetProfile();
      this.cpu.resetProfile();
    }
  }
}
