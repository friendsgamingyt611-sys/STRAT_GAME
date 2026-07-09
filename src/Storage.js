/**
 * Storage.js — Shoot Or Shield
 * Centralized localStorage persistence manager.
 * Stores and recovers ALL game state across sessions:
 *   - Computer mode profile points
 *   - CPU profile points
 *   - CPU learned memory
 *   - P2P profile points
 *   - P2P match history leaderboard
 *   - Player nickname
 *   - AI cognition level
 *   - First-time visit flag
 *
 * Provides a single save/load interface; individual modules
 * still use their own localStorage keys for backward compat,
 * but this module manages the P2P leaderboard history.
 */

const P2P_HISTORY_KEY = 'sos_p2p_match_history';
const AI_LEVEL_KEY    = 'sos_ai_level';

export class Storage {
  // ─── AI Level ────────────────────────────────────────
  static getAILevel() {
    const saved = localStorage.getItem(AI_LEVEL_KEY);
    return saved !== null ? parseInt(saved, 10) : 1;
  }

  static setAILevel(level) {
    localStorage.setItem(AI_LEVEL_KEY, level);
  }

  // ─── P2P Match History ───────────────────────────────
  /**
   * Get the full P2P match history.
   * Returns an array of { opponent, result, myPts, oppPts, timestamp }
   * @returns {Array}
   */
  static getP2PHistory() {
    try {
      const raw = localStorage.getItem(P2P_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Record a completed P2P match.
   * @param {object} entry - { opponent, opponentId, result, myPts, oppPts }
   */
  static addP2PMatch(entry) {
    const history = Storage.getP2PHistory();
    history.push({
      ...entry,
      timestamp: Date.now(),
    });
    try {
      localStorage.setItem(P2P_HISTORY_KEY, JSON.stringify(history));
    } catch (_) {}
  }

  /**
   * Update all previous match history entries for a specific opponentId with a new nickname.
   * @param {string} opponentId
   * @param {string} newName
   */
  static updateOpponentName(opponentId, newName) {
    if (!opponentId || opponentId === 'unknown-peer') return;
    const history = Storage.getP2PHistory();
    let updated = false;
    for (const match of history) {
      if (match.opponentId === opponentId && match.opponent !== newName) {
        match.opponent = newName;
        updated = true;
      }
    }
    if (updated) {
      try {
        localStorage.setItem(P2P_HISTORY_KEY, JSON.stringify(history));
      } catch (_) {}
    }
  }

  /**
   * Get a leaderboard from P2P history.
   * Returns sorted array of { name, pts, wins, losses, draws }
   * Includes the local player as well.
   * @param {string} localName - the local player's nickname
   * @returns {Array}
   */
  static getP2PLeaderboard(localName) {
    const history = Storage.getP2PHistory();
    const board = {};

    // Accumulate local player stats
    board['local'] = { name: localName, pts: 0, wins: 0, losses: 0, draws: 0, isLocal: true };

    for (const match of history) {
      const oppKey = match.opponentId || match.opponent || 'Unknown';
      const oppName = match.opponent || 'Unknown';

      // Local player
      board['local'].pts += match.myPts || 0;
      if (match.result === 'win') board['local'].wins++;
      else if (match.result === 'loss') board['local'].losses++;
      else board['local'].draws++;

      // Opponent
      if (!board[oppKey]) {
        board[oppKey] = { name: oppName, pts: 0, wins: 0, losses: 0, draws: 0, isLocal: false };
      }
      board[oppKey].name = oppName; // Keep latest name
      board[oppKey].pts += match.oppPts || 0;
      if (match.result === 'win') board[oppKey].losses++;
      else if (match.result === 'loss') board[oppKey].wins++;
      else board[oppKey].draws++;
    }

    board['local'].name = localName;

    // Sort by pts descending
    return Object.values(board).sort((a, b) => b.pts - a.pts);
  }

  /**
   * Clear all P2P history.
   */
  static resetP2PHistory() {
    localStorage.removeItem(P2P_HISTORY_KEY);
  }
}
