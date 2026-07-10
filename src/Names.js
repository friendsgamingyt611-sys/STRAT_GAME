/**
 * Names.js — Shoot Or Shield
 * Unique default nickname generator for P2P matches.
 * Players can edit and save their nicknames.
 */

import { Storage } from './Storage.js';

const ADJECTIVES = [
  'Shadow', 'Iron', 'Crimson', 'Phantom', 'Frost',
  'Silent', 'Rapid', 'Neon', 'Dark', 'Swift',
  'Storm', 'Blaze', 'Ghost', 'Steel', 'Void',
  'Pixel', 'Cyber', 'Astral', 'Hyper', 'Nova',
  'Rogue', 'Apex', 'Prism', 'Ember', 'Onyx',
  'Solar', 'Lunar', 'Jade', 'Ruby', 'Cobalt',
];

const NOUNS = [
  'Viper', 'Wolf', 'Hawk', 'Sage', 'Knight',
  'Striker', 'Ace', 'Bolt', 'Blade', 'Raven',
  'Fox', 'Titan', 'Spark', 'Wraith', 'Lynx',
  'Dagger', 'Comet', 'Serpent', 'Falcon', 'Zenith',
  'Hunter', 'Orbit', 'Flux', 'Cipher', 'Specter',
  'Phoenix', 'Fang', 'Drift', 'Pulse', 'Crest',
];

const NICK_KEY = 'sos_p2p_nickname';

export class Names {
  /**
   * Get the player's saved nickname, or generate and save a new one.
   * @returns {string}
   */
  static get() {
    const saved = Storage.getItem(NICK_KEY);
    if (saved) return saved;
    const name = Names.generate();
    Names.save(name);
    return name;
  }

  /**
   * Generate a random unique nickname.
   * @returns {string}
   */
  static generate() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}${noun}${num}`;
  }

  /**
   * Save the player's nickname.
   * @param {string} name
   */
  static save(name) {
    const trimmed = (name || '').trim().slice(0, 20);
    if (trimmed) {
      Storage.setItem(NICK_KEY, trimmed);
    }
  }

  /**
   * Get the currently saved nickname (may be null).
   * @returns {string|null}
   */
  static getSaved() {
    return Storage.getItem(NICK_KEY);
  }
}
