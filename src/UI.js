/**
 * UI.js — Shoot Or Shield
 * All DOM access lives here.
 *
 * TIMING MODEL:
 *   Selection phase : 10 seconds
 *     – Player clicks a button to SELECT (not commit) a move.
 *     – Can change selection any time.
 *     – At 0 s, whatever is selected (or IDLE by default) is submitted.
 *   Reveal phase    : 5 seconds
 *     – Both moves shown, result displayed, score updated.
 *     – Auto-advances after 5 s. Player can SKIP early.
 *   Terminal round  : reveal shows final result → goes to game-over screen.
 *
 * CPU style is NEVER revealed to the player.
 */
import { Phase } from './State.js';
import { MOVES, OUTCOMES, Rules } from './Rules.js';
import { Names } from './Names.js';
import { Storage } from './Storage.js';
import { TacticChart } from './TacticChart.js';
import { AI_LEVELS } from './AI.js';
import { $all, $ } from './ui/DOM.js';
import { NicknameEditor } from './ui/NicknameEditor.js';
import { P2PManager } from './P2PManager.js';

const LABELS = {
  [MOVES.SHOOT]: {
    icon: `<svg class="move-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H9l-3 7H3l2-7H3V8z"></path><path d="M9 14c0 2 2 2 2 0"></path><line x1="6" y1="8" x2="6" y2="12"></line><line x1="8" y1="8" x2="8" y2="12"></line></svg>`,
    label: 'SHOOT',
    sub: '1 unit · kills idler'
  },
  [MOVES.SHIELD]: {
    icon: `<svg class="move-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    label: 'SHIELD',
    sub: '1 unit · deflects shot'
  },
  [MOVES.IDLE]: {
    icon: `<svg class="move-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4"></circle></svg>`,
    label: 'IDLE',
    sub: 'free · carries unit'
  },
};

const OUT_CLASS = {
  [OUTCOMES.KILL_PLAYER]: 'outcome-kill-p',
  [OUTCOMES.KILL_CPU]: 'outcome-kill-cpu',
  [OUTCOMES.DUAL_DEFEAT]: 'outcome-dual',
  [OUTCOMES.POINT_PLAYER]: 'outcome-win',
  [OUTCOMES.POINT_CPU]: 'outcome-lose',
  [OUTCOMES.STANDOFF]: 'outcome-standoff',
};

const SELECT_DURATION = 10;   // seconds for move selection
const REVEAL_DURATION = 5;    // seconds for result display

export class UI {
  constructor(game) {
    this.game = game;
    this.selectedMove = null;   // currently highlighted move (not yet committed)
    this._timer = null;   // active interval handle
    this._timerRemain = 0;

    // Slide & P2P state initialization
    this.currentSlideIndex = 0;
    this.p2p = new P2PManager(this);

    // P2P Nickname & lobby
    this.localNickname = Names.get();
    this.remoteNickname = 'Opponent';

    this._bind();
    this.nicknameEditor = new NicknameEditor({
      inputEl: this.p2pNicknameInput,
      displayEl: this.p2pNicknameDisplay,
      buttonEl: this.btnEditNickname,
      onSave: (name) => {
        this.localNickname = name;
        this.game.player.name = `${this.localNickname} (You)`;
        this._renderP2PLeaderboard();
      },
    });
    this.localNickname = this.nicknameEditor.getNickname();
    this._attachListeners();
    this._placeResourceSettingsCard();
    if (this.resourceUnitsInput) this.resourceUnitsInput.value = this.game.startingUnits;
    this.game.state.subscribe(s => this._onStateChange(s));
    this._showScreen('menu');
    this._renderProfile();

    // Redraw tactic chart on resize/zoom to keep it perfectly crisp
    window.addEventListener('resize', () => {
      if (this.screens.menu && !this.screens.menu.hidden) {
        this._renderPlaystyleTactic();
      }
    });

    // First time entry check
    if (!Storage.getItem('sos_first_time')) {
      Storage.setItem('sos_first_time', 'false');
      setTimeout(() => this._openTutorial(), 500);
    }
  }

  // ─── Element binding ─────────────────────────────────────
  _bind() {
    this.screens = {
      menu: $('screen-menu'),
      game: $('screen-game'),
      gameover: $('screen-gameover'),
    };

    // Menu
    this.elProfilePts = $('profile-pts');
    this.btnStart = $('btn-start');
    this.btnResetProfile = $('btn-reset-profile');
    this.resourceUnitsInput = $('resource-units-input');

    // Leaderboard
    this.elLbPlayerPts = $('lb-player-pts');
    this.elLbCpuPts = $('lb-cpu-pts');
    this.elPlayerCrown = $('player-crown');
    this.elCpuCrown = $('cpu-crown');

    // Tabs
    this.tabComputer          = $('tab-computer');
    this.tabMultiplayer       = $('tab-multiplayer');
    this.modeComputerContent  = $('mode-computer-content');
    this.modeMultiplayerContent = $('mode-multiplayer-content');
    this.menuGameModeSubtitle = $('menu-game-mode-subtitle');
    this.resourceSettingsCard = $('resource-settings-card');
    this.aiLevelCard          = $('ai-level-card');
    this.p2pLeaderboardCard   = $('p2p-leaderboard-card');
    this.p2pMatchmakingCard   = $('p2p-card');

    // P2P Profile & Leaderboard
    this.p2pProfilePts        = $('p2p-profile-pts');
    this.p2pLeaderboardRows   = $('p2p-leaderboard-rows');
    this.btnResetP2P          = $('btn-reset-p2p');

    // P2P Nickname
    this.p2pNicknameInput     = $('p2p-nickname-input');
    this.p2pNicknameDisplay   = $('p2p-nickname-display');
    this.btnEditNickname      = $('btn-edit-nickname');

    // P2P Setup
    this.btnP2PCreate         = $('btn-p2p-create');
    this.p2pCreateStatus      = $('p2p-create-status');
    this.btnP2PJoin           = $('btn-p2p-join');
    this.p2pRoomInput         = $('p2p-room-input');
    this.p2pJoinStatus        = $('p2p-join-status');

    // P2P Match start & countdown states
    this.p2pLocalStart = false;
    this.p2pRemoteStart = false;
    this.p2pCountdownValue = 5;
    this.p2pCountdownInterval = null;

    // Dynamic Labels
    this.playerHudLabel       = $('player-hud-label');
    this.opponentHudLabel     = $('opponent-hud-label');
    this.opponentMoveLabel    = $('opponent-move-label');

    // AI Level UI
    this.aiLevelBtns          = $all('.ai-lvl-btn');
    this.aiLevelName          = $('ai-level-name');
    this.btnAiLevelInfo       = $('btn-ai-level-info');
    this.aiLevelInfoModal     = $('ai-level-info-modal');
    this.btnCloseAiInfo       = $('btn-close-ai-info');

    // Version & Tutorial Modals
    this.btnVersion           = $('btn-version');
    this.versionModal         = $('version-modal');
    this.btnCloseVersion      = $('btn-close-version');
    this.versionSlideStack    = $('version-slide-stack');
    this.btnHowToPlay         = $('btn-how-to-play');
    this.howToPlayModal       = $('how-to-play-modal');
    this.btnCloseTutorial     = $('btn-close-tutorial');
    this.btnTutorialPrev      = $('btn-tutorial-prev');
    this.btnTutorialNext      = $('btn-tutorial-next');
    this.tutorialSlides       = $all('.tutorial-slide');
    this.tutorialDots         = $all('.tut-dot');

    // Timer UI
    this.elTimerBar = $('timer-bar');
    this.elTimerCount = $('timer-count');
    this.elTimerPhase = $('timer-phase');
    this.elTimerSel = $('timer-selection');

    // HUD
    this.elRound = $('hud-round');
    this.elPlayerMatchPts = $('player-match-pts');
    this.elCpuMatchPts = $('cpu-match-pts');
    this.elPot = $('pot-total');
    this.elPlayerUnits = $('player-units');
    this.elCpuUnits = $('cpu-units');
    this.elPlayerStatus = $('player-status');
    this.elCpuStatus = $('cpu-status');

    // Arena
    this.elPlayerMove = $('player-move-display');
    this.elCpuMove = $('cpu-move-display');
    this.elResultText = $('result-text');
    this.elResultDesc = $('result-desc');
    this.elRevealTimer = $('reveal-timer');
    this.btnContinue = $('btn-continue');
    this.btnLeaveMatch = $('btn-leave-match');

    // Move picker
    this.moveBtns = document.querySelectorAll('[data-move]');

    // Log
    this.logList = $('round-log');

    // Game over
    this.elEndTitle = $('end-title');
    this.elEndBody = $('end-body');
    this.elEndProfile = $('end-profile-pts');
    this.btnPlayAgain = $('btn-play-again');
    this.btnMainMenu = $('btn-main-menu');
  }

  // ─── Listeners ───────────────────────────────────────────
  _attachListeners() {
    // Mode tabs selection
    this.tabComputer.addEventListener('click', () => {
      this.tabComputer.classList.add('active');
      this.tabMultiplayer.classList.remove('active');
      this.modeComputerContent.style.display = 'block';
      this.modeMultiplayerContent.style.display = 'none';
      if (this.menuGameModeSubtitle) this.menuGameModeSubtitle.textContent = 'LOCAL';
      this._disconnectP2P();
      this.game.switchToP2P(false);
      this._placeResourceSettingsCard();
      this._renderProfile();
    });

    this.tabMultiplayer.addEventListener('click', () => {
      this.tabMultiplayer.classList.add('active');
      this.tabComputer.classList.remove('active');
      this.modeComputerContent.style.display = 'none';
      this.modeMultiplayerContent.style.display = 'block';
      if (this.menuGameModeSubtitle) this.menuGameModeSubtitle.textContent = 'MULTIPLAYER';
      this._resetP2PLobbyUI();
      this.game.switchToP2P(true);
      this._placeResourceSettingsCard();
      this._renderProfile();
    });

    // P2P Matchmaking
    this.btnP2PCreate.addEventListener('click', () => {
      if (this.p2p.lobbyState === 'idle') {
        this._initP2PAsHost();
        return;
      }
      if (this.p2p.lobbyState === 'waiting') {
        this._disconnectP2P();
        return;
      }
      if (this.p2p.lobbyState === 'connected' && this.p2p.isHost) {
        this._handleP2PStartClick();
        return;
      }
      this._disconnectP2P();
    });

    this.btnP2PJoin.addEventListener('click', () => {
      if (this.p2p.lobbyState === 'idle') {
        this._joinP2P();
        return;
      }
      if (this.p2p.lobbyState === 'waiting') {
        this._disconnectP2P();
        return;
      }
      if (this.p2p.lobbyState === 'connected' && !this.p2p.isHost) {
        this._handleP2PStartClick();
        return;
      }
      this._disconnectP2P();
    });

    this.btnResetP2P.addEventListener('click', () => {
      if (confirm('Reset your Multiplayer points & history?')) {
        this.game.resetP2P();
        this._renderProfile();
        this._renderP2PLeaderboard();
      }
    });

    // Nickname inline editing handled by NicknameEditor.
    // The editor updates this.localNickname and refreshes the leaderboard when a new nickname is saved.

    // AI Level selector
    this.aiLevelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const lvl = parseInt(btn.dataset.level, 10);
        this.game.setAILevel(lvl);
        this.aiLevelBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.level, 10) === lvl));
        if (this.aiLevelName) this.aiLevelName.textContent = AI_LEVELS[lvl - 1]?.name ?? '';
      });
    });
    // Init AI level display
    const savedLvl = this.game.getAILevel();
    this.aiLevelBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.level, 10) === savedLvl));
    if (this.aiLevelName) this.aiLevelName.textContent = AI_LEVELS[savedLvl - 1]?.name ?? 'Reactive';

    // AI Level info modal
    this.btnAiLevelInfo?.addEventListener('click', () => {
      if (this.aiLevelInfoModal) this.aiLevelInfoModal.style.display = 'flex';
    });
    this.btnCloseAiInfo?.addEventListener('click', () => {
      if (this.aiLevelInfoModal) this.aiLevelInfoModal.style.display = 'none';
    });

    // Version modal
    this.btnVersion?.addEventListener('click', () => {
      this._openVersionModal();
    });
    this.btnCloseVersion?.addEventListener('click', () => {
      this._closeVersionModal();
    });

    // Tutorial modal
    this.btnHowToPlay.addEventListener('click', () => {
      this._openTutorial();
    });

    this.btnCloseTutorial.addEventListener('click', () => {
      this._closeTutorial();
    });

    this.btnTutorialPrev.addEventListener('click', () => {
      this._showSlide(this.currentSlideIndex - 1);
    });

    this.btnTutorialNext.addEventListener('click', () => {
      if (this.currentSlideIndex === this.tutorialSlides.length - 1) {
        this._closeTutorial();
      } else {
        this._showSlide(this.currentSlideIndex + 1);
      }
    });

    this.tutorialDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const slideIdx = parseInt(dot.dataset.slide, 10);
        this._showSlide(slideIdx);
      });
    });

    // Start local computer match
    this.btnStart.addEventListener('click', () => {
      if (this.game.isP2P) return;
      this.game.start(this._getStartingUnits());
      this._clearLog();
      this._showScreen('game');
      if (this.playerHudLabel) this.playerHudLabel.textContent = 'YOU';
      if (this.opponentHudLabel) this.opponentHudLabel.textContent = 'CPU';
      if (this.opponentMoveLabel) this.opponentMoveLabel.textContent = 'CPU MOVE';
      this._renderHUD(this.game.state.snapshot());
      this._beginSelectionPhase();
    });

    this.btnResetProfile?.addEventListener('click', () => {
      const mem = this.game.getCpuMemorySize();
      if (confirm(`Reset your profile points AND wipe all CPU memory (${mem} rounds learned)?`)) {
        this.game.resetAll();
        this._renderProfile();
        this._renderPlaystyleTactic();
      }
    });

    // Move buttons
    this.moveBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('locked') || btn.disabled) return;
        const move = btn.dataset.move;
        if (!this.game.player.canAfford(move)) return;
        this._selectMove(move);
      });
    });

    // SKIP button
    this.btnContinue.addEventListener('click', () => {
      this._clearTimer();
      this._advanceAfterReveal();
    });

    this.btnLeaveMatch?.addEventListener('click', () => {
      this._confirmLeaveMatch();
    });

    this.btnPlayAgain.addEventListener('click', () => {
      if (this.game.isP2P) {
        this.p2p.localReadyRestart = true;
        this.p2p.send({ type: 'PLAY_AGAIN' });
        this.btnPlayAgain.disabled = true;
        this.btnPlayAgain.textContent = 'WAITING...';
        if (this.p2p.opponentReadyRestart) {
          this._restartP2PGame();
        }
      } else {
        this.game.start(this._getStartingUnits());
        this._clearLog();
        this._showScreen('game');
        if (this.playerHudLabel) this.playerHudLabel.textContent = 'YOU';
        if (this.opponentHudLabel) this.opponentHudLabel.textContent = 'CPU';
        if (this.opponentMoveLabel) this.opponentMoveLabel.textContent = 'CPU MOVE';
        this._renderHUD(this.game.state.snapshot());
        this._beginSelectionPhase();
      }
    });

    this.btnMainMenu.addEventListener('click', () => {
      this._clearTimer();
      if (this.game.isP2P) {
        this._disconnectP2P();
      }
      this._renderProfile();
      this._showScreen('menu');
    });
  }

  // ─── State change handler ────────────────────────────────
  _onStateChange(state) {
    // Game-over is handled directly by _advanceAfterReveal
    // Selecting phase is started by _advanceAfterReveal too
    // This callback mainly keeps HUD in sync
    if (state.phase === Phase.SELECTING) {
      this._renderHUD(state);
      this._refreshMoveBtns();
    }
  }

  // ─── Selection Phase (10 s) ──────────────────────────────
  _beginSelectionPhase() {
    this.selectedMove = null;
    this._lockMoveButtons(false);
    this._refreshMoveBtns();
    this._resetArena();
    this._hideSkip();
    this._setTimerPhase('SELECT YOUR MOVE');
    this._updateSelectionLabel();

    this._runTimer(SELECT_DURATION, (remaining) => {
      // update bar & count each tick
      this.elTimerCount.textContent = remaining;
      this.elTimerCount.classList.toggle('urgent', remaining <= 3);
      this.elTimerBar.classList.toggle('urgent', remaining <= 3);
      const pct = (remaining / SELECT_DURATION) * 100;
      this.elTimerBar.style.width = `${pct}%`;
    }, () => {
      // timer expired — commit selected move (default IDLE)
      this._commitMove(this.selectedMove ?? MOVES.IDLE);
    });
  }

  _selectMove(move) {
    this.selectedMove = move;
    // Update button highlights
    this.moveBtns.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.move === move);
    });
    this._updateSelectionLabel();
  }

  _updateSelectionLabel() {
    if (!this.elTimerSel) return;
    if (this.selectedMove) {
      const l = LABELS[this.selectedMove];
      this.elTimerSel.innerHTML = `Selected: ${l.icon} ${l.label}`;
    } else {
      this.elTimerSel.textContent = 'No move selected — IDLE will be chosen';
    }
  }

  _commitMove(move) {
    this._clearTimer();
    this._lockMoveButtons(true);

    // Visual: highlight the committed button briefly
    this.moveBtns.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.move === move);
    });

    // Set timer UI to "processing"
    this.elTimerCount.textContent = '…';
    this.elTimerBar.style.width = '0%';
    this._setTimerPhase('REVEALING');
    if (this.elTimerSel) this.elTimerSel.textContent = '';

    if (this.game.isP2P) {
      this.p2p.localMove = move;
      this.p2p.send({ type: 'MOVE', move: move });
      this._setTimerPhase('WAITING FOR PEER');
      if (this.elTimerSel) this.elTimerSel.textContent = 'Waiting for opponent…';
      if (this.p2p.remoteMove !== null) {
        this._resolveP2PTurn();
      }
    } else {
      // Small delay for dramatic effect, then resolve
      setTimeout(() => {
        const snap = this.game.playTurn(move);
        if (snap) this._showReveal(snap);
      }, 200);
    }
  }

  // ─── Reveal Phase (5 s) ──────────────────────────────────
  _showReveal(snap) {
    const pm = LABELS[snap.playerMove];
    const cm = LABELS[snap.cpuMove];

    this.elPlayerMove.innerHTML = `${pm.icon} ${pm.label}`;
    this.elCpuMove.innerHTML = `${cm.icon} ${cm.label}`;

    const cls = OUT_CLASS[snap.lastOutcome] ?? '';
    this.elResultText.className = `result-text ${cls}`;
    this.elResultText.textContent = this._headline(snap.lastOutcome);
    
    let desc = snap.lastDesc;
    if (this.game.isP2P) {
      desc = desc.replace(/CPU/g, this.remoteNickname);
    }
    this.elResultDesc.textContent = desc;

    this._renderHUD(snap);
    this._appendLog(snap);
    this._playTone(snap.lastOutcome);

    const isDrawEnding = snap.playerUnits === 0 && snap.cpuUnits === 0 && snap.playerAlive && snap.cpuAlive;
    const isTerminal = Rules.isTerminal(snap.lastOutcome) || isDrawEnding;

    if (isTerminal) {
      // Game over — show skip button but no countdown
      this._setTimerPhase('MATCH OVER');
      this.elTimerCount.textContent = '';
      this.elTimerBar.style.width = '0%';
      if (this.elTimerSel) this.elTimerSel.textContent = 'Proceeding to results…';
      this._showSkip();

      // Auto go to game over after REVEAL_DURATION
      this._runTimer(REVEAL_DURATION, (r) => {
        if (this.elRevealTimer) this.elRevealTimer.textContent = `Opening Results screen in ${r}s`;
      }, () => {
        this._advanceAfterReveal();
      });
    } else {
      // Normal round — show countdown to next round
      this._setTimerPhase('RESULT');
      this.elTimerCount.textContent = REVEAL_DURATION;
      this.elTimerBar.style.width = '100%';
      if (this.elTimerSel) this.elTimerSel.textContent = 'Next round starting…';
      this._showSkip();

      this._runTimer(REVEAL_DURATION, (r) => {
        this.elTimerCount.textContent = r;
        const pct = (r / REVEAL_DURATION) * 100;
        this.elTimerBar.style.width = `${pct}%`;
        if (this.elRevealTimer) this.elRevealTimer.textContent = `Next round in ${r}s`;
      }, () => {
        this._advanceAfterReveal();
      });
    }
  }

  _advanceAfterReveal() {
    this._clearTimer();
    this._hideSkip();
    if (this.elRevealTimer) this.elRevealTimer.textContent = '';

    if (this.game.isP2P) {
      const snap = this.game.state.snapshot();
      const isDrawEnding = snap.playerUnits === 0 && snap.cpuUnits === 0 && snap.playerAlive && snap.cpuAlive;
      const isTerminal = Rules.isTerminal(snap.lastOutcome) || isDrawEnding;
      if (isTerminal) {
        this.game.advance();
        setTimeout(() => this._showGameOver(this.game.state.snapshot()), 50);
        return;
      }

      this.p2p.localReady = true;
      this._setTimerPhase('WAITING FOR OPPONENT');
      this.elTimerCount.textContent = '…';
      if (this.elTimerSel) this.elTimerSel.textContent = 'Waiting for opponent to ready up…';
      this.p2p.send({ type: 'READY' });
      if (this.p2p.opponentReady) {
        this._advanceP2PRound();
      }
    } else {
      this.game.advance();   // updates state (SELECTING or GAME_OVER)

      if (this.game.state.phase === 'game_over') {
        setTimeout(() => this._showGameOver(this.game.state.snapshot()), 50);
      } else {
        // New selection phase
        this._beginSelectionPhase();
      }
    }
  }

  // ─── Timer engine ────────────────────────────────────────
  /**
   * Run a countdown timer.
   * @param {number}   duration  - seconds
   * @param {Function} onTick    - called each second with (remaining)
   * @param {Function} onExpire  - called when hits 0
   */
  _runTimer(duration, onTick, onExpire) {
    this._clearTimer();
    let remaining = duration;
    onTick(remaining);   // immediate first tick

    this._timer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this._clearTimer();
        onExpire();
      } else {
        onTick(remaining);
      }
    }, 1000);
  }

  _clearTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _setTimerPhase(label) {
    if (this.elTimerPhase) this.elTimerPhase.textContent = label;
  }

  // ─── HUD & UI helpers ────────────────────────────────────
  // ─── HUD & UI helpers ────────────────────────────────────
  _renderProfile() {
    const pPts = this.game.getProfilePts();
    const cPts = this.game.getCpuProfilePts();

    if (this.elProfilePts) this.elProfilePts.textContent = pPts;

    // Show how much the CPU has learned
    const memEl = document.getElementById('cpu-memory-size');
    if (memEl) memEl.textContent = this.game.getCpuMemorySize();

    // Leaderboard rendering
    if (this.elLbPlayerPts) this.elLbPlayerPts.textContent = pPts;
    if (this.elLbCpuPts) this.elLbCpuPts.textContent = cPts;

    // Crown logic
    if (this.elPlayerCrown && this.elCpuCrown) {
      if (pPts > cPts) {
        this.elPlayerCrown.style.display = 'inline';
        this.elCpuCrown.style.display = 'none';
      } else if (cPts > pPts) {
        this.elPlayerCrown.style.display = 'none';
        this.elCpuCrown.style.display = 'inline';
      } else {
        // Equal
        if (pPts > 0) {
          this.elPlayerCrown.style.display = 'inline';
          this.elCpuCrown.style.display = 'inline';
        } else {
          // Equal and 0
          this.elPlayerCrown.style.display = 'none';
          this.elCpuCrown.style.display = 'none';
        }
      }
    }

    // P2P Profile Pts rendering
    const p2pSaved = Storage.getItem('sos_p2p_profile_pts');
    const p2pPts = p2pSaved !== null ? parseInt(p2pSaved, 10) : 0;
    if (this.p2pProfilePts) this.p2pProfilePts.textContent = p2pPts;

    if (this.p2pNicknameDisplay && this.nicknameMode !== 'edit') {
      this.p2pNicknameDisplay.textContent = this.localNickname;
    }

    // Render dynamic P2P leaderboard
    this._renderP2PLeaderboard();

    // ARM Mobile Detection display check
    const isArmUi = document.body.classList.contains('phone-arm-ui');
    if (this.elArmBadgeMenu) {
      this.elArmBadgeMenu.style.display = isArmUi ? 'inline-block' : 'none';
    }
    if (this.elArmBadgeGame) {
      this.elArmBadgeGame.style.display = isArmUi ? 'block' : 'none';
    }

    // Render Playstyle/Tactic Chart
    this._renderPlaystyleTactic();
  }

  _renderP2PLeaderboard() {
    if (!this.p2pLeaderboardRows) return;
    const localSaved = Storage.getItem('sos_p2p_profile_pts');
    const localPts = localSaved !== null ? parseInt(localSaved, 10) : 0;
    
    // Get the board from Storage
    const leaderboard = Storage.getP2PLeaderboard(this.localNickname);
    
    // Sync local nickname points
    const localEntry = leaderboard.find(e => e.isLocal);
    if (localEntry) {
      localEntry.pts = localPts;
    }
    
    // Re-sort
    leaderboard.sort((a, b) => b.pts - a.pts);

    this.p2pLeaderboardRows.innerHTML = '';
    leaderboard.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      if (entry.isLocal) {
        row.id = 'lb-row-p2p-player';
      }
      
      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = `#${idx + 1}`;
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'lb-name';
      nameSpan.textContent = entry.isLocal ? `${entry.name} (YOU)` : entry.name;
      
      if (idx === 0 && entry.pts > 0) {
        const crown = document.createElement('span');
        crown.className = 'lb-crown';
        crown.textContent = ' 👑';
        nameSpan.appendChild(crown);
      }
      
      const score = document.createElement('span');
      score.className = 'lb-score';
      score.textContent = `${entry.pts} pts`;
      
      row.appendChild(rank);
      row.appendChild(nameSpan);
      row.appendChild(score);
      this.p2pLeaderboardRows.appendChild(row);
    });
  }

  _renderPlaystyleTactic() {
    const currentTacticEl = document.getElementById('current-tactic');
    const tacticRoundsEl = document.getElementById('tactic-rounds');
    const canvas = document.getElementById('tactic-chart');

    if (!this.game.cpu || !this.game.cpu._mem) {
      if (currentTacticEl) currentTacticEl.textContent = 'MULTIPLAYER';
      if (tacticRoundsEl) tacticRoundsEl.textContent = 'N/A';
      return;
    }

    const freq = this.game.cpu._mem.freq;
    const total = this.game.cpu._mem.total;

    if (tacticRoundsEl) tacticRoundsEl.textContent = total;

    // Identify current tactic
    let tactic = 'Not Enough Data,Please play few games and recheck';
    let badgeColor = 'var(--accent)';
    let badgeBg = '#191714';
    let badgeBorder = 'rgba(200, 169, 110, 0.4)';

    if (total >= 3) {
      const sRate = (freq.shoot ?? 0) / total;
      const shRate = (freq.shield ?? 0) / total;
      const iRate = (freq.idle ?? 0) / total;

      if (sRate > 0.45) {
        tactic = 'SLAYER';
        badgeColor = 'var(--shoot)';
        badgeBg = '#1c1414';
        badgeBorder = 'rgba(217, 95, 95, 0.4)';
      } else if (shRate > 0.45) {
        tactic = 'GUARDIAN';
        badgeColor = 'var(--shield)';
        badgeBg = '#12161c';
        badgeBorder = 'rgba(74, 140, 196, 0.4)';
      } else if (iRate > 0.45) {
        tactic = 'HOARDER';
        badgeColor = 'var(--idle)';
        badgeBg = '#151515';
        badgeBorder = 'rgba(122, 122, 122, 0.4)';
      } else {
        tactic = 'TACTICIAN';
        badgeColor = 'var(--accent)';
        badgeBg = '#191714';
        badgeBorder = 'rgba(200, 169, 110, 0.4)';
      }
    }

    if (currentTacticEl) {
      currentTacticEl.textContent = tactic;
    }

    TacticChart.draw(canvas, freq, total);
  }

  _renderHUD(state) {
    this.elRound.textContent = `Round ${state.round}`;
    this.elPlayerMatchPts.textContent = state.playerMatchPts;
    this.elCpuMatchPts.textContent = state.cpuMatchPts;
    if (this.elPot) this.elPot.textContent = state.playerMatchPts + state.cpuMatchPts;
    this._renderResourceBar(this.elPlayerUnits, state.playerUnits);
    this._renderResourceBar(this.elCpuUnits, state.cpuUnits);
    this.elPlayerStatus.textContent = state.playerAlive ? 'ALIVE' : 'DEAD';
    this.elPlayerStatus.className = `status-badge ${state.playerAlive ? 'alive' : 'dead'}`;
    this.elCpuStatus.textContent = state.cpuAlive ? 'ALIVE' : 'DEAD';
    this.elCpuStatus.className = `status-badge ${state.cpuAlive ? 'alive' : 'dead'}`;
  }

  _renderResourceBar(el, count) {
    if (!el) return;
    el.innerHTML = '';

    if (count <= 0) {
      const pip = document.createElement('div');
      pip.className = 'unit-pip empty';
      el.appendChild(pip);
      return;
    }

    const maxPips = Math.min(count, 8);
    for (let i = 0; i < maxPips; i++) {
      const pip = document.createElement('div');
      pip.className = 'unit-pip';
      el.appendChild(pip);
    }

    if (count > 8) {
      const more = document.createElement('span');
      more.style.fontSize = '9px';
      more.style.color = 'var(--muted)';
      more.style.marginLeft = '2px';
      more.textContent = `+${count - 8}`;
      el.appendChild(more);
    }
  }

  _getStartingUnits() {
    if (!this.resourceUnitsInput) return this.game.startingUnits;
    const parsed = parseInt(this.resourceUnitsInput.value, 10);
    const value = Number.isFinite(parsed) ? parsed : 10;
    return Math.max(1, Math.min(30, value));
  }

  _placeResourceSettingsCard() {
    if (!this.resourceSettingsCard) return;
    if (this.tabComputer.classList.contains('active') && this.aiLevelCard) {
      this.aiLevelCard.insertAdjacentElement('afterend', this.resourceSettingsCard);
      return;
    }
    if (this.p2pLeaderboardCard) {
      this.p2pLeaderboardCard.insertAdjacentElement('afterend', this.resourceSettingsCard);
    }
  }

  _renderVersionSlides() {
    if (!this.versionSlideStack || this.versionSlideStack.children.length) return;

    const versions = [
      {
        version: 'v3.1',
        title: 'Release v3.1',
        details: [
          'Match Resource units is now the menu label and appears under CPU COGNITION LEVEL in local mode.',
          'In multiplayer mode the same panel is shown below Leaderboard and above Matchmaking.',
          'A dedicated How to Play slide now explains the version 3.1 fixed-resource match flow.'
        ]
      },
      {
        version: 'v3.0',
        title: 'Release v3.0',
        details: [
          'Fixed starting units: each match begins with a chosen resource pool, and once it is spent idle is the only option left.',
          'Draw rule: if both players exhaust their units while still alive, the match ends in a draw.',
          'Leave-match handling now counts as a self-defeat and ends the match for both sides.',
          'Results flow now opens the results screen immediately with a manual skip option.'
        ]
      }
    ];

    versions.forEach(release => {
      const slide = document.createElement('div');
      slide.className = 'version-slide';

      const title = document.createElement('h4');
      title.textContent = release.title;
      slide.appendChild(title);

      const body = document.createElement('div');
      release.details.forEach(detail => {
        const item = document.createElement('div');
        item.textContent = detail;
        body.appendChild(item);
      });
      slide.appendChild(body);
      this.versionSlideStack.appendChild(slide);
    });
  }

  _openVersionModal() {
    this._renderVersionSlides();
    if (this.versionModal) this.versionModal.style.display = 'flex';
  }

  _closeVersionModal() {
    if (this.versionModal) this.versionModal.style.display = 'none';
  }

  _confirmLeaveMatch() {
    const explanation = this.game.isP2P
      ? 'Leaving now ends the match for both players and counts as a self-defeat. Your opponent receives the win and the full pot.'
      : 'Leaving now ends the match and counts as a self-defeat. The computer wins and takes the full pot.';

    if (!confirm(`Leave this match?\n\n${explanation}`)) return;
    this._resolveLeaveMatch();
  }

  _resolveLeaveMatch() {
    this._clearTimer();
    this._hideSkip();
    const pot = this.game.state.playerMatchPts + this.game.state.cpuMatchPts;

    if (this.game.isP2P) {
      this.p2p.send({ type: 'LEAVE_MATCH' });
      this.game.finishMatch('cpu', pot);
    } else {
      this.game.finishMatch('cpu', pot);
    }

    this._showGameOver(this.game.state.snapshot());
  }

  _refreshMoveBtns() {
    this.moveBtns.forEach(btn => {
      const move = btn.dataset.move;
      const canAct = this.game.player.canAfford(move);
      btn.disabled = !canAct;
      btn.classList.toggle('unaffordable', !canAct);
      btn.classList.toggle('selected', btn.dataset.move === this.selectedMove);
    });
  }

  _lockMoveButtons(locked) {
    this.moveBtns.forEach(btn => {
      btn.classList.toggle('locked', locked);
      btn.disabled = locked;
    });
  }

  _resetArena() {
    this.elPlayerMove.textContent = '?';
    this.elCpuMove.textContent = '?';
    this.elResultText.textContent = '';
    this.elResultDesc.textContent = '';
    this.elResultText.className = 'result-text';
    if (this.elRevealTimer) this.elRevealTimer.textContent = '';
    // Reset timer bar
    this.elTimerBar.style.width = '100%';
    this.elTimerBar.classList.remove('urgent');
    this.elTimerCount.classList.remove('urgent');
    this.elTimerCount.textContent = SELECT_DURATION;
    this.moveBtns.forEach(b => b.classList.remove('selected', 'chosen'));
  }

  _showSkip() { this.btnContinue.hidden = false; }
  _hideSkip() { this.btnContinue.hidden = true; }

  // ─── Headline ────────────────────────────────────────────
  _headline(outcome) {
    const isP2P = this.game.isP2P;
    const oppName = isP2P ? this.remoteNickname : 'CPU';
    switch (outcome) {
      case OUTCOMES.KILL_PLAYER: return `▶ YOU ELIMINATED ${oppName}`;
      case OUTCOMES.KILL_CPU: return `▶ ${oppName} ELIMINATED YOU`;
      case OUTCOMES.DUAL_DEFEAT: return '✕ DUAL DEFEAT';
      case OUTCOMES.POINT_PLAYER: return '+ YOU SCORE';
      case OUTCOMES.POINT_CPU: return `+ ${oppName} SCORES`;
      case OUTCOMES.STANDOFF: return '— STANDOFF';
      default: return '';
    }
  }

  // ─── Round log ───────────────────────────────────────────
  _appendLog(snap) {
    const entry = snap.log[0];
    if (!entry) return;

    // Helper: returns an opaque coloured badge for a move
    const chip = (move) => {
      const cls = move === 'shoot' ? 'chip-shoot' : move === 'shield' ? 'chip-shield' : 'chip-idle';
      return `<span class="log-chip ${cls}">${move.toUpperCase()}</span>`;
    };

    const row = document.createElement('div');
    row.className = `log-row ${OUT_CLASS[entry.outcome] ?? ''}`;
    row.innerHTML =
      `<span class="log-round">R${entry.round}</span>` +
      `<span class="log-moves">${chip(entry.playerMove)}<em>vs</em>${chip(entry.cpuMove)}</span>` +
      `<span class="log-result">${this._headline(entry.outcome)}</span>`;

    this.logList.prepend(row);
    if (this.logList.children.length > 14) this.logList.lastChild?.remove();
  }

  _clearLog() { if (this.logList) this.logList.innerHTML = ''; }

  // ─── Game Over ───────────────────────────────────────────
  _showGameOver(state) {
    const isP2P = this.game.isP2P;
    
    if (isP2P && !this.p2p.historyRecorded) {
      this.p2p.historyRecorded = true;
      const result = state.winner === 'player' ? 'win' : (state.winner === 'cpu' ? 'loss' : 'draw');
      let myPts = 0;
      let oppPts = 0;
      if (state.winner === 'player') {
        myPts = state.ptsAwarded;
      } else if (state.winner === 'cpu') {
        oppPts = state.ptsAwarded;
      }
      
      Storage.addP2PMatch({
        opponent: this.remoteNickname,
        opponentId: this.p2p.conn ? this.p2p.conn.peer : 'unknown-peer',
        result: result,
        myPts: myPts,
        oppPts: oppPts
      });
    }

    this._renderProfile();  // refresh points and memory counter

    let profilePts = 0;
    if (isP2P) {
      const pSaved = Storage.getItem('sos_p2p_profile_pts');
      profilePts = pSaved !== null ? parseInt(pSaved, 10) : 0;

      // Reset P2P Play Again button states
      this.btnPlayAgain.disabled = false;
      this.btnPlayAgain.textContent = 'PLAY AGAIN';
      this.p2p.localReadyRestart = false;
      this.p2p.opponentReadyRestart = false;

      const profileLabelEl = document.getElementById('end-profile-label');
      if (profileLabelEl) profileLabelEl.textContent = `${this.localNickname.toUpperCase()} (MULTIPLAYER PROFILE)`;
    } else {
      profilePts = this.game.getProfilePts();
      const profileLabelEl = document.getElementById('end-profile-label');
      if (profileLabelEl) profileLabelEl.textContent = 'COMPUTER MODE PROFILE';
    }

    const pot = state.playerMatchPts + state.cpuMatchPts;
    const titleMap = {
      player: '— VICTORY —',
      cpu: '— DEFEATED —',
      dual_defeat: '— DUAL DEFEAT —',
      draw: '— DRAW —'
    };
    const clsMap = { player: 'end-win', cpu: 'end-lose', dual_defeat: 'end-dual', draw: 'end-draw' };

    this.elEndTitle.textContent = titleMap[state.winner] ?? 'GAME OVER';
    this.elEndTitle.className = `end-title ${clsMap[state.winner] ?? ''}`;

    const ptsLine = state.winner === 'player'
      ? `<tr class="pts-row"><td>Points Claimed</td><td class="col-win">+${state.ptsAwarded}</td></tr>`
      : state.winner === 'dual_defeat'
        ? `<tr class="pts-row"><td>Pot Burned</td><td class="col-dual">${pot} pts lost</td></tr>`
        : state.winner === 'draw'
          ? `<tr class="pts-row"><td>Points Kept</td><td class="col-win">${state.playerMatchPts} / ${state.cpuMatchPts}</td></tr>`
          : `<tr class="pts-row"><td>Points Lost</td><td class="col-lose">${state.playerMatchPts}</td></tr>`;

    const oppLabel = isP2P ? 'Opponent' : 'CPU';
    const learnRow = isP2P 
      ? '' 
      : `<tr><td>CPU Rounds Learned</td><td>${this.game.getCpuMemorySize()}</td></tr>`;

    this.elEndBody.innerHTML = `
      <table class="stat-table">
        <tr><td>Your Match Pts</td><td>${state.playerMatchPts}</td></tr>
        <tr><td>${oppLabel} Match Pts</td><td>${state.cpuMatchPts}</td></tr>
        <tr><td>Rounds Played</td><td>${state.round}</td></tr>
        ${ptsLine}
        ${learnRow}
      </table>`;

    if (this.elEndProfile) this.elEndProfile.textContent = profilePts;

    this._showScreen('gameover');
  }

  // ─── Screen switch ────────────────────────────────────────
  _showScreen(name) {
    Object.entries(this.screens).forEach(([key, el]) => {
      if (el) el.hidden = key !== name;
    });
  }

  // ─── Sound ───────────────────────────────────────────────
  _playTone(outcome) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const c = {
        [OUTCOMES.KILL_PLAYER]: { f: 620, t: 'sine', d: 0.45 },
        [OUTCOMES.KILL_CPU]: { f: 180, t: 'sawtooth', d: 0.55 },
        [OUTCOMES.DUAL_DEFEAT]: { f: 130, t: 'square', d: 0.7 },
        [OUTCOMES.POINT_PLAYER]: { f: 510, t: 'sine', d: 0.18 },
        [OUTCOMES.POINT_CPU]: { f: 240, t: 'triangle', d: 0.18 },
        [OUTCOMES.STANDOFF]: { f: 350, t: 'sine', d: 0.1 },
      }[outcome] ?? { f: 350, t: 'sine', d: 0.15 };
      osc.type = c.t;
      osc.frequency.setValueAtTime(c.f, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + c.d);
      osc.start(); osc.stop(ctx.currentTime + c.d);
    } catch (_) { }
  }

  // ─── P2P Multiplayer Handlers ─────────────────────────────
  _resolveP2PTurn() {
    this._clearTimer();
    this.elTimerCount.textContent = '…';
    this.elTimerBar.style.width = '0%';
    this._setTimerPhase('REVEALING');
    
    setTimeout(() => {
      const snap = this.game.playP2PTurn(this.p2p.localMove, this.p2p.remoteMove);
      this.p2p.localMove = null;
      this.p2p.remoteMove = null;
      if (snap) this._showReveal(snap);
    }, 200);
  }

  _advanceP2PRound() {
    this.p2p.localReady = false;
    this.p2p.opponentReady = false;
    this.game.advance();

    if (this.game.state.phase === 'game_over') {
      setTimeout(() => this._showGameOver(this.game.state.snapshot()), 50);
    } else {
      this._beginSelectionPhase();
    }
  }

  _restartP2PGame() {
    this.p2p.localReadyRestart = false;
    this.p2p.opponentReadyRestart = false;
    this.game.start(this._getStartingUnits());
    this._clearLog();
    this._showScreen('game');
    this._renderHUD(this.game.state.snapshot());
    this._beginSelectionPhase();
  }

  _initP2PAsHost() {
    this.p2pCreateStatus.style.display = 'block';
    this.p2pCreateStatus.textContent = 'Creating Room...';
    
    if (this.p2pNicknameInput) this.p2pNicknameInput.disabled = true;
    if (this.btnEditNickname) this.btnEditNickname.disabled = true;
    if (this.p2pRoomInput) this.p2pRoomInput.disabled = true;
    this.btnP2PJoin.style.display = 'none';

    this.p2p.initHost(
      this.localNickname,
      (code) => {
        this._updateP2PLobbyUI();
        this.p2pCreateStatus.innerHTML = `ROOM CODE: <strong style="font-size:1.15rem; color:var(--accent);">${code}</strong><br><span style="font-size:0.75rem; color:var(--muted)">Waiting for opponent to join...</span>`;
      },
      (conn) => {
        this._setupP2PConnection(conn);
      },
      (err) => {
        console.error(err);
        this.p2pCreateStatus.textContent = 'Connection Error. Retrying...';
        this._disconnectP2P();
      }
    );
  }

  _joinP2P() {
    const code = this.p2pRoomInput.value.trim();
    if (!code || code.length !== 4) {
      this.p2pJoinStatus.style.display = 'block';
      this.p2pJoinStatus.textContent = 'Enter a valid 4-digit code.';
      return;
    }

    this.p2pJoinStatus.style.display = 'block';
    this.p2pJoinStatus.textContent = `Connecting to room ${code}...`;
    
    if (this.p2pNicknameInput) this.p2pNicknameInput.disabled = true;
    if (this.btnEditNickname) this.btnEditNickname.disabled = true;
    if (this.p2pRoomInput) this.p2pRoomInput.disabled = true;
    this.btnP2PCreate.style.display = 'none';

    this.p2p.joinRoom(
      code,
      this.localNickname,
      (roomCode) => {
        // Connected to peer server
      },
      (conn) => {
        this._setupP2PConnection(conn);
      },
      (err) => {
        console.error(err);
        this.p2pJoinStatus.textContent = 'Failed to connect. Try again.';
        this._disconnectP2P();
      }
    );
  }

  _setupP2PConnection(conn) {
    this.game.player.name = `${this.localNickname} (You)`;
    this.game.cpu.name = `${this.remoteNickname} (Opponent)`;

    if (this.playerHudLabel) this.playerHudLabel.textContent = this.game.player.name;
    if (this.opponentHudLabel) this.opponentHudLabel.textContent = this.game.cpu.name;
    if (this.opponentMoveLabel) this.opponentMoveLabel.textContent = `${this.game.cpu.name.toUpperCase()} MOVE`;
    
    this._renderP2PLeaderboard();
    this._updateP2PLobbyUI();
  }

  handleP2PMessage(data) {
    if (data.type === 'NICKNAME') {
      this.remoteNickname = data.nickname || 'Opponent';
      
      if (this.p2p.conn && this.p2p.conn.peer) {
        Storage.updateOpponentName(this.p2p.conn.peer, this.remoteNickname);
      }

      this.game.player.name = `${this.localNickname} (You)`;
      this.game.cpu.name = `${this.remoteNickname} (Opponent)`;

      if (this.playerHudLabel) this.playerHudLabel.textContent = this.game.player.name;
      if (this.opponentHudLabel) this.opponentHudLabel.textContent = this.game.cpu.name;
      if (this.opponentMoveLabel) this.opponentMoveLabel.textContent = `${this.game.cpu.name.toUpperCase()} MOVE`;
      
      this._renderP2PLeaderboard();
      this._updateP2PLobbyUI();
    } else if (data.type === 'START_CLICK') {
      this.p2p.remoteStart = data.start;
      this._checkP2PStartCountdown();
      this._updateP2PLobbyUI();
    } else if (data.type === 'MOVE') {
      this.p2p.remoteMove = data.move;
      if (this.p2p.localMove !== null) {
        this._resolveP2PTurn();
      }
    } else if (data.type === 'READY') {
      this.p2p.opponentReady = true;
      if (this.p2p.localReady) {
        this._advanceP2PRound();
      }
    } else if (data.type === 'PLAY_AGAIN') {
      this.p2p.opponentReadyRestart = true;
      if (this.p2p.localReadyRestart) {
        this._restartP2PGame();
      }
    } else if (data.type === 'LEAVE_MATCH') {
      const pot = this.game.state.playerMatchPts + this.game.state.cpuMatchPts;
      this.game.finishMatch('player', pot);
      this._showGameOver(this.game.state.snapshot());
    } else if (data.type === 'DISCONNECT') {
      this.handleP2PDisconnect();
    }
  }

  handleP2PDisconnect() {
    this._handleP2PDisconnect();
  }

  _handleP2PStartClick() {
    this.p2p.localStart = !this.p2p.localStart;

    this.p2p.send({
      type: 'START_CLICK',
      start: this.p2p.localStart
    });

    this._checkP2PStartCountdown();
    this._updateP2PLobbyUI();
  }

  _checkP2PStartCountdown() {
    if (this.p2p.localStart && this.p2p.remoteStart) {
      this._startP2PCountdown();
    } else {
      this._stopP2PCountdown();
    }
  }

  _startP2PCountdown() {
    if (this.p2pCountdownInterval) return;

    const banner = document.getElementById('top-notch-banner');
    const textEl = document.getElementById('top-notch-text');

    this.p2pCountdownValue = 5;
    if (banner && textEl) {
      banner.style.display = 'block';
      textEl.textContent = `Starting match in ${this.p2pCountdownValue}...`;
    }

    this.p2pCountdownInterval = setInterval(() => {
      this.p2pCountdownValue--;
      if (this.p2pCountdownValue <= 0) {
        this._stopP2PCountdown();
        if (banner) banner.style.display = 'none';

        this.p2p.localMove = null;
        this.p2p.remoteMove = null;
        this.p2p.localReady = false;
        this.p2p.opponentReady = false;
        this.p2p.localReadyRestart = false;
        this.p2p.opponentReadyRestart = false;
        this.p2p.historyRecorded = false;

        this.game.switchToP2P(true);
        this.game.player.name = `${this.localNickname} (You)`;
        this.game.cpu.name = `${this.remoteNickname} (Opponent)`;
        this.game.start(this._getStartingUnits());

        if (this.playerHudLabel) this.playerHudLabel.textContent = this.game.player.name;
        if (this.opponentHudLabel) this.opponentHudLabel.textContent = this.game.cpu.name;
        if (this.opponentMoveLabel) this.opponentMoveLabel.textContent = `${this.game.cpu.name.toUpperCase()} MOVE`;

        this._clearLog();
        this._showScreen('game');
        this._renderHUD(this.game.state.snapshot());
        this._beginSelectionPhase();
      } else {
        if (textEl) {
          textEl.textContent = `Starting match in ${this.p2pCountdownValue}...`;
        }
      }
    }, 1000);
  }

  _stopP2PCountdown() {
    if (this.p2pCountdownInterval) {
      clearInterval(this.p2pCountdownInterval);
      this.p2pCountdownInterval = null;
    }
    const banner = document.getElementById('top-notch-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  _updateP2PLobbyUI() {
    if (this.p2p.lobbyState !== 'idle') {
      this.p2pRoomInput.style.display = 'none';
      this.nicknameEditor?.setDisabled(true);
      const separator = document.querySelector('.p2p-separator');
      if (separator) separator.style.display = 'none';
    }

    if (this.p2p.lobbyState === 'waiting') {
      if (this.p2p.isHost) {
        this.btnP2PCreate.style.display = 'block';
        this.btnP2PCreate.disabled = false;
        this.btnP2PCreate.textContent = 'DESTROY MATCH';
        this.btnP2PCreate.className = 'btn-secondary';
        this.btnP2PJoin.style.display = 'none';
      } else {
        this.btnP2PJoin.style.display = 'block';
        this.btnP2PJoin.disabled = false;
        this.btnP2PJoin.textContent = 'CANCEL';
        this.btnP2PJoin.className = 'btn-secondary';
        this.btnP2PCreate.style.display = 'none';
      }
      return;
    }

    if (this.p2p.lobbyState === 'connected') {
      const totalReady = (this.p2p.localStart ? 1 : 0) + (this.p2p.remoteStart ? 1 : 0);
      const nameText = this.remoteNickname || 'Opponent';

      if (this.p2p.isHost) {
        this.btnP2PCreate.style.display = 'block';
        this.btnP2PCreate.disabled = false;
        this.btnP2PJoin.style.display = 'block';
        this.btnP2PJoin.disabled = false;
        this.btnP2PJoin.textContent = 'EXIT MATCH';
        this.btnP2PJoin.className = 'btn-ghost';

        this.p2pCreateStatus.style.display = 'block';

        if (this.p2p.localStart) {
          this.btnP2PCreate.textContent = 'STOP';
          this.btnP2PCreate.className = 'btn-secondary';
          if (!this.p2p.remoteStart) {
            this.p2pCreateStatus.innerHTML = `<span style="color: var(--accent);">Waiting for ${nameText} to start (${totalReady}/2 ready)</span>`;
          } else {
            this.p2pCreateStatus.innerHTML = `<span style="color: var(--win);">Match starting! (${totalReady}/2 ready)</span>`;
          }
        } else {
          this.btnP2PCreate.textContent = 'START GAME';
          this.btnP2PCreate.className = 'btn-primary';
          if (this.p2p.remoteStart) {
            this.p2pCreateStatus.innerHTML = `<span style="color: var(--accent);">${nameText} is waiting for you... (${totalReady}/2 ready)</span>`;
          } else {
            this.p2pCreateStatus.innerHTML = `<span style="color: var(--win);">${nameText.toUpperCase()} CONNECTED! (${totalReady}/2 ready)</span>`;
          }
        }
      } else {
        this.btnP2PJoin.style.display = 'block';
        this.btnP2PJoin.disabled = false;
        this.btnP2PCreate.style.display = 'block';
        this.btnP2PCreate.disabled = false;
        this.btnP2PCreate.textContent = 'EXIT MATCH';
        this.btnP2PCreate.className = 'btn-ghost';

        this.p2pJoinStatus.style.display = 'block';

        if (this.p2p.localStart) {
          this.btnP2PJoin.textContent = 'STOP';
          this.btnP2PJoin.className = 'btn-secondary';
          if (!this.p2p.remoteStart) {
            this.p2pJoinStatus.innerHTML = `<span style="color: var(--accent);">Waiting for host to start (${totalReady}/2 ready)</span>`;
          } else {
            this.p2pJoinStatus.innerHTML = `<span style="color: var(--win);">Match starting! (${totalReady}/2 ready)</span>`;
          }
        } else {
          this.btnP2PJoin.textContent = 'START GAME';
          this.btnP2PJoin.className = 'btn-primary';
          if (this.p2p.remoteStart) {
            this.p2pJoinStatus.innerHTML = `<span style="color: var(--accent);">Host is waiting for you... (${totalReady}/2 ready)</span>`;
          } else {
            this.p2pJoinStatus.innerHTML = `<span style="color: var(--win);">CONNECTED TO HOST! (${totalReady}/2 ready)</span>`;
          }
        }
      }
    }
  }

  _resetP2PLobbyUI() {
    this.p2p.localStart = false;
    this.p2p.remoteStart = false;
    this.p2p.lobbyState = 'idle';
    this._stopP2PCountdown();

    this.p2pRoomInput.value = '';
    this.p2pRoomInput.style.display = 'block';
    this.p2pRoomInput.disabled = false;

    this.nicknameEditor?.setDisabled(false);

    const separator = document.querySelector('.p2p-separator');
    if (separator) separator.style.display = 'block';

    this.btnP2PCreate.style.display = 'block';
    this.btnP2PCreate.disabled = false;
    this.btnP2PCreate.textContent = 'CREATE MATCH';
    this.btnP2PCreate.className = 'btn-primary';

    this.btnP2PJoin.style.display = 'block';
    this.btnP2PJoin.disabled = false;
    this.btnP2PJoin.textContent = 'JOIN MATCH';
    this.btnP2PJoin.className = 'btn-secondary';

    this.p2pCreateStatus.style.display = 'none';
    this.p2pJoinStatus.style.display = 'none';
  }

  _disconnectP2P() {
    this._stopP2PCountdown();
    this.p2p.disconnect();
    this.game.switchToP2P(false);
    this._resetP2PLobbyUI();
  }

  _handleP2PDisconnect() {
    const activeMatch = this.game.isP2P && [Phase.SELECTING, Phase.REVEALING].includes(this.game.state.phase);
    if (activeMatch) {
      this.p2p.disconnect();
      const pot = this.game.state.playerMatchPts + this.game.state.cpuMatchPts;
      this.game.finishMatch('player', pot);
      this._showGameOver(this.game.state.snapshot());
      return;
    }

    alert('Opponent disconnected or left match.');
    this._disconnectP2P();
    this._renderProfile();
    this._showScreen('menu');
  }

  // ─── Tutorial Slideshow ───────────────────────────────────
  _showSlide(index) {
    if (index < 0 || index >= this.tutorialSlides.length) return;
    this.tutorialSlides.forEach((slide, idx) => {
      slide.style.display = idx === index ? 'block' : 'none';
      slide.classList.toggle('active', idx === index);
    });
    this.tutorialDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === index);
    });
    this.btnTutorialPrev.disabled = (index === 0);
    this.btnTutorialNext.textContent = (index === this.tutorialSlides.length - 1) ? 'Finish' : 'Next →';
    this.currentSlideIndex = index;
  }


  _openTutorial() {
    if (this.howToPlayModal) {
      this.howToPlayModal.style.display = 'flex';
      this._showSlide(0);
    }
  }

  _closeTutorial() {
    if (this.howToPlayModal) {
      this.howToPlayModal.style.display = 'none';
    }
  }
}
