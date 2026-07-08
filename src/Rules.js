/**
 * Rules.js — Shoot Or Shield
 * Pure logic, no DOM. Single source of truth for all matchup outcomes.
 *
 * WIN CONDITION: Kill the opponent (SHOOT vs IDLE).
 * POINTS are the pot — accumulated in-match. Winner claims both pools.
 * STANDOFF (SHIELD-SHIELD, IDLE-IDLE) = no points, next round, no death.
 * DUAL DEFEAT (SHOOT-SHOOT) = both die, nobody claims anything.
 */

export const MOVES = {
  SHOOT:  'shoot',
  SHIELD: 'shield',
  IDLE:   'idle',
};

export const OUTCOMES = {
  KILL_PLAYER:  'kill_player',   // player shot CPU while CPU was idle → player kills CPU
  KILL_CPU:     'kill_cpu',      // CPU shot player while player was idle → CPU kills player
  DUAL_DEFEAT:  'dual_defeat',   // both shot → both die
  POINT_PLAYER: 'point_player',  // player gains 1 pt (no death)
  POINT_CPU:    'point_cpu',     // CPU gains 1 pt (no death)
  STANDOFF:     'standoff',      // no points, no death, next round
};

const TABLE = {
  //           player  cpu     outcome               playerDies cpuDies  playerPt cpuPt  desc
  'shoot-idle':    { outcome: OUTCOMES.KILL_PLAYER, playerDies: false, cpuDies: true,  playerPt: true,  cpuPt: false, desc: 'Direct hit — CPU eliminated!' },
  'idle-shoot':    { outcome: OUTCOMES.KILL_CPU,    playerDies: true,  cpuDies: false, playerPt: false, cpuPt: true,  desc: 'You were shot — Eliminated!' },
  'shoot-shoot':   { outcome: OUTCOMES.DUAL_DEFEAT, playerDies: true,  cpuDies: true,  playerPt: false, cpuPt: false, desc: 'Mutual destruction — Dual Defeat!' },
  'shoot-shield':  { outcome: OUTCOMES.POINT_CPU,   playerDies: false, cpuDies: false, playerPt: false, cpuPt: true,  desc: 'Shot deflected — CPU scores.' },
  'shield-shoot':  { outcome: OUTCOMES.POINT_PLAYER,playerDies: false, cpuDies: false, playerPt: true,  cpuPt: false, desc: 'Shot deflected — You score.' },
  'shield-idle':   { outcome: OUTCOMES.POINT_CPU,   playerDies: false, cpuDies: false, playerPt: false, cpuPt: true,  desc: 'Wasted shield — CPU scores the punishment.' },
  'idle-shield':   { outcome: OUTCOMES.POINT_PLAYER,playerDies: false, cpuDies: false, playerPt: true,  cpuPt: false, desc: 'CPU wasted shield — You score.' },
  'shield-shield': { outcome: OUTCOMES.STANDOFF,    playerDies: false, cpuDies: false, playerPt: false, cpuPt: false, desc: 'Both shielded — Standoff. Next round.' },
  'idle-idle':     { outcome: OUTCOMES.STANDOFF,    playerDies: false, cpuDies: false, playerPt: false, cpuPt: false, desc: 'Both idle — Standoff. Next round.' },
};

export class Rules {
  static resolve(playerMove, cpuMove) {
    return TABLE[`${playerMove}-${cpuMove}`]
      ?? { outcome: OUTCOMES.STANDOFF, playerDies: false, cpuDies: false, playerPt: false, cpuPt: false, desc: '—' };
  }

  /** Does this move cost 1 resource unit? */
  static costsUnit(move) {
    return move === MOVES.SHOOT || move === MOVES.SHIELD;
  }

  static isTerminal(outcome) {
    return outcome === OUTCOMES.KILL_PLAYER
        || outcome === OUTCOMES.KILL_CPU
        || outcome === OUTCOMES.DUAL_DEFEAT;
  }
}
