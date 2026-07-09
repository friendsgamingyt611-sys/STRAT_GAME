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

const LABELS = {
  [MOVES.SHOOT]: { icon: '⚡', label: 'SHOOT', sub: '1 unit · kills idler' },
  [MOVES.SHIELD]: { icon: '🛡', label: 'SHIELD', sub: '1 unit · deflects shot' },
  [MOVES.IDLE]: { icon: '◎', label: 'IDLE', sub: 'free · carries unit' },
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
    this.p2pPeer = null;
    this.p2pConn = null;
    this.p2pLocalMove = null;
    this.p2pRemoteMove = null;
    this.p2pIsHost = false;
    this.p2pOpponentReady = false;
    this.p2pLocalReady = false;
    this.p2pLocalReadyRestart = false;
    this.p2pOpponentReadyRestart = false;

    this._bind();
    this._attachListeners();
    this.game.state.subscribe(s => this._onStateChange(s));
    this._showScreen('menu');
    this._renderProfile();

    // First time entry check
    if (!localStorage.getItem('sos_first_time')) {
      localStorage.setItem('sos_first_time', 'false');
      setTimeout(() => this._openTutorial(), 500);
    }
  }

  // ─── Element binding ─────────────────────────────────────
  _bind() {
    const $ = id => document.getElementById(id);

    this.screens = {
      menu: $('screen-menu'),
      game: $('screen-game'),
      gameover: $('screen-gameover'),
    };

    // Menu
    this.elProfilePts = $('profile-pts');
    this.btnStart = $('btn-start');
    this.btnResetProfile = $('btn-reset-profile');

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

    // P2P Profile & Leaderboard
    this.p2pProfilePts        = $('p2p-profile-pts');
    this.lbP2PPlayerPts       = $('lb-p2p-player-pts');
    this.lbP2POpponentPts     = $('lb-p2p-opponent-pts');
    this.p2pPlayerCrown       = $('p2p-player-crown');
    this.p2pOpponentCrown     = $('p2p-opponent-crown');
    this.btnResetP2P          = $('btn-reset-p2p');

    // P2P Setup
    this.btnP2PCreate         = $('btn-p2p-create');
    this.p2pCreateStatus      = $('p2p-create-status');
    this.btnP2PJoin           = $('btn-p2p-join');
    this.p2pRoomInput         = $('p2p-room-input');
    this.p2pJoinStatus = $('p2p-join-status');

    // P2P Match start & countdown states
    this.p2pLocalStart = false;
    this.p2pRemoteStart = false;
    this.p2pCountdownValue = 5;
    this.p2pCountdownInterval = null;

    // Dynamic Labels
    this.opponentHudLabel     = $('opponent-hud-label');
    this.opponentMoveLabel    = $('opponent-move-label');

    // Tutorial Modal
    this.btnHowToPlay         = $('btn-how-to-play');
    this.howToPlayModal       = $('how-to-play-modal');
    this.btnCloseTutorial     = $('btn-close-tutorial');
    this.btnTutorialPrev      = $('btn-tutorial-prev');
    this.btnTutorialNext      = $('btn-tutorial-next');
    this.tutorialSlides       = document.querySelectorAll('.tutorial-slide');
    this.tutorialDots         = document.querySelectorAll('.tut-dot');

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
      if (this.menuGameModeSubtitle) this.menuGameModeSubtitle.textContent = 'VS COMPUTER';
      this._disconnectP2P();
      this.game.switchToP2P(false);
      this._renderProfile();
    });

    this.tabMultiplayer.addEventListener('click', () => {
      this.tabMultiplayer.classList.add('active');
      this.tabComputer.classList.remove('active');
      this.modeComputerContent.style.display = 'none';
      this.modeMultiplayerContent.style.display = 'block';
      if (this.menuGameModeSubtitle) this.menuGameModeSubtitle.textContent = 'VS PLAYER (P2P)';
      this._resetP2PLobbyUI();
      this.game.switchToP2P(true);
      this._renderProfile();
    });

    // P2P Matchmaking
    this.btnP2PCreate.addEventListener('click', () => {
      if (this.p2pConn) {
        this._handleP2PStartClick();
      } else {
        this._initP2PAsHost();
      }
    });

    this.btnP2PJoin.addEventListener('click', () => {
      if (this.p2pConn) {
        this._handleP2PStartClick();
      } else {
        this._joinP2P();
      }
    });

    this.btnResetP2P.addEventListener('click', () => {
      if (confirm('Reset your Multiplayer points?')) {
        this.game.resetP2P();
        this._renderProfile();
      }
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
      this.game.start();
      this._clearLog();
      this._showScreen('game');
      // Set Labels to Computer Mode default
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
      }
    });

    // Move buttons: click = SELECT (not commit), can change before timer fires
    this.moveBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('locked') || btn.disabled) return;
        const move = btn.dataset.move;
        if (!this.game.player.canAfford(move)) return;
        this._selectMove(move);
      });
    });

    // SKIP button: skip the 5-second reveal early
    this.btnContinue.addEventListener('click', () => {
      this._clearTimer();
      this._advanceAfterReveal();
    });

    this.btnPlayAgain.addEventListener('click', () => {
      if (this.game.isP2P) {
        this.p2pLocalReadyRestart = true;
        this.p2pConn.send({ type: 'PLAY_AGAIN' });
        this.btnPlayAgain.disabled = true;
        this.btnPlayAgain.textContent = 'WAITING...';
        if (this.p2pOpponentReadyRestart) {
          this._restartP2PGame();
        }
      } else {
        this.game.start();
        this._clearLog();
        this._showScreen('game');
        // Set Labels
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
      this.elTimerSel.textContent = `Selected: ${l.icon} ${l.label}`;
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
      this.p2pLocalMove = move;
      try {
        this.p2pConn.send({ type: 'MOVE', move: move });
      } catch (err) {
        console.error("Error sending move:", err);
      }
      this._setTimerPhase('WAITING FOR PEER');
      if (this.elTimerSel) this.elTimerSel.textContent = 'Waiting for opponent…';
      if (this.p2pRemoteMove !== null) {
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

    this.elPlayerMove.textContent = `${pm.icon} ${pm.label}`;
    this.elCpuMove.textContent = `${cm.icon} ${cm.label}`;

    const cls = OUT_CLASS[snap.lastOutcome] ?? '';
    this.elResultText.className = `result-text ${cls}`;
    this.elResultText.textContent = this._headline(snap.lastOutcome);
    this.elResultDesc.textContent = snap.lastDesc;

    this._renderHUD(snap);
    this._appendLog(snap);
    this._playTone(snap.lastOutcome);

    const isTerminal = Rules.isTerminal(snap.lastOutcome);

    if (isTerminal) {
      // Game over — show skip button but no countdown
      this._setTimerPhase('MATCH OVER');
      this.elTimerCount.textContent = '';
      this.elTimerBar.style.width = '0%';
      if (this.elTimerSel) this.elTimerSel.textContent = 'Proceeding to results…';
      this._showSkip();

      // Auto go to game over after REVEAL_DURATION
      this._runTimer(REVEAL_DURATION, (r) => {
        if (this.elRevealTimer) this.elRevealTimer.textContent = `→ results in ${r}s`;
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
      this.p2pLocalReady = true;
      this._setTimerPhase('WAITING FOR OPPONENT');
      this.elTimerCount.textContent = '…';
      if (this.elTimerSel) this.elTimerSel.textContent = 'Waiting for opponent to ready up…';
      try {
        this.p2pConn.send({ type: 'READY' });
      } catch (err) {
        console.error("Error sending READY:", err);
      }
      if (this.p2pOpponentReady) {
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
          this.elPlayerCrown.style.display = 'none';
          this.elCpuCrown.style.display = 'none';
        }
      }
    }

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

  _renderPlaystyleTactic() {
    const currentTacticEl = document.getElementById('current-tactic');
    const tacticRoundsEl = document.getElementById('tactic-rounds');
    const canvas = document.getElementById('tactic-chart');

    const freq = this.game.cpu._mem.freq;
    const total = this.game.cpu._mem.total;

    if (tacticRoundsEl) tacticRoundsEl.textContent = total;

    // Identify current tactic
    let tactic = 'ANALYZING...';
    let badgeColor = 'var(--accent)';
    let badgeBg = 'rgba(234, 179, 8, 0.15)';
    let badgeBorder = 'rgba(234, 179, 8, 0.3)';

    if (total >= 3) {
      const sRate = (freq.shoot ?? 0) / total;
      const shRate = (freq.shield ?? 0) / total;
      const iRate = (freq.idle ?? 0) / total;

      if (sRate > 0.45) {
        tactic = 'SLAYER ⚡';
        badgeColor = 'var(--shoot)';
        badgeBg = 'rgba(239, 68, 68, 0.15)';
        badgeBorder = 'rgba(239, 68, 68, 0.3)';
      } else if (shRate > 0.45) {
        tactic = 'GUARDIAN 🛡';
        badgeColor = 'var(--shield)';
        badgeBg = 'rgba(14, 165, 233, 0.15)';
        badgeBorder = 'rgba(14, 165, 233, 0.3)';
      } else if (iRate > 0.45) {
        tactic = 'HOARDER ◎';
        badgeColor = 'var(--idle)';
        badgeBg = 'rgba(34, 197, 94, 0.15)';
        badgeBorder = 'rgba(34, 197, 94, 0.3)';
      } else {
        tactic = 'TACTICIAN 🧠';
        badgeColor = 'var(--accent)';
        badgeBg = 'rgba(234, 179, 8, 0.15)';
        badgeBorder = 'rgba(234, 179, 8, 0.3)';
      }
    }

    if (currentTacticEl) {
      currentTacticEl.textContent = tactic;
      currentTacticEl.style.color = badgeColor;
      currentTacticEl.style.backgroundColor = badgeBg;
      currentTacticEl.style.borderColor = badgeBorder;
    }

    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 220;
    const displayHeight = 190;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const w = displayWidth;
    const h = displayHeight;

    // Center & radius of radar chart
    const cx = w / 2;
    const cy = h / 2 + 10;
    const r = 60;

    // Angles for the 3 pure tactic vertices
    const angles = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];
    const vertices = angles.map(a => ({
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a)
    }));

    // Draw background concentric web triangles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let factor = 0.25; factor <= 1; factor += 0.25) {
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = cx + r * factor * Math.cos(a);
        const y = cy + r * factor * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }

    // Draw axis lines from center to vertices
    ctx.beginPath();
    vertices.forEach(v => {
      ctx.moveTo(cx, cy);
      ctx.lineTo(v.x, v.y);
    });
    ctx.stroke();

    // Draw label text at vertices
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top: Slayer (Shoot)
    ctx.fillText('SLAYER (⚡)', vertices[0].x, vertices[0].y - 12);
    // Bottom Right: Guardian (Shield)
    ctx.textAlign = 'left';
    ctx.fillText('GUARDIAN (🛡)', vertices[1].x + 5, vertices[1].y + 5);
    // Bottom Left: Hoarder (Idle)
    ctx.textAlign = 'right';
    ctx.fillText('HOARDER (◎)', vertices[2].x - 5, vertices[2].y + 5);

    // Calculate rates and plot player playstyle state on the spider web
    if (total >= 3) {
      const sRate = (freq.shoot ?? 0) / total;
      const shRate = (freq.shield ?? 0) / total;
      const iRate = (freq.idle ?? 0) / total;

      // Plot area connecting points on the 3 axes
      ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
      ctx.strokeStyle = 'var(--accent)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      // Shoot point
      ctx.moveTo(cx + r * sRate * Math.cos(angles[0]), cy + r * sRate * Math.sin(angles[0]));
      // Shield point
      ctx.lineTo(cx + r * shRate * Math.cos(angles[1]), cy + r * shRate * Math.sin(angles[1]));
      // Idle point
      ctx.lineTo(cx + r * iRate * Math.cos(angles[2]), cy + r * iRate * Math.sin(angles[2]));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw dot markers at each axis value
      const rates = [sRate, shRate, iRate];
      const colors = ['var(--shoot)', 'var(--shield)', 'var(--idle)'];
      rates.forEach((rate, idx) => {
        ctx.beginPath();
        const dx = cx + r * rate * Math.cos(angles[idx]);
        const dy = cy + r * rate * Math.sin(angles[idx]);
        ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = colors[idx];
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      });
    } else {
      // Draw a default small pulse in the center (uninitialized/analyzing)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
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
    switch (outcome) {
      case OUTCOMES.KILL_PLAYER: return '▶ YOU ELIMINATED CPU';
      case OUTCOMES.KILL_CPU: return '▶ CPU ELIMINATED YOU';
      case OUTCOMES.DUAL_DEFEAT: return '✕ DUAL DEFEAT';
      case OUTCOMES.POINT_PLAYER: return '+ YOU SCORE';
      case OUTCOMES.POINT_CPU: return '+ CPU SCORES';
      case OUTCOMES.STANDOFF: return '— STANDOFF';
      default: return '';
    }
  }

  // ─── Round log ───────────────────────────────────────────
  _appendLog(snap) {
    const entry = snap.log[0];
    if (!entry) return;
    const pm = LABELS[entry.playerMove];
    const cm = LABELS[entry.cpuMove];

    const row = document.createElement('div');
    row.className = `log-row ${OUT_CLASS[entry.outcome] ?? ''}`;
    row.innerHTML =
      `<span class="log-round">R${entry.round}</span>` +
      `<span class="log-moves">${pm.icon}${pm.label} <em>vs</em> ${cm.icon}${cm.label}</span>` +
      `<span class="log-result">${this._headline(entry.outcome)}</span>`;

    this.logList.prepend(row);
    if (this.logList.children.length > 14) this.logList.lastChild?.remove();
  }

  _clearLog() { if (this.logList) this.logList.innerHTML = ''; }

  // ─── Game Over ───────────────────────────────────────────
  _showGameOver(state) {
    this._renderProfile();  // refresh points and memory counter

    const isP2P = this.game.isP2P;
    let profilePts = 0;
    if (isP2P) {
      const pSaved = localStorage.getItem('sos_p2p_profile_pts');
      profilePts = pSaved !== null ? parseInt(pSaved, 10) : 0;

      // Reset P2P Play Again button states
      this.btnPlayAgain.disabled = false;
      this.btnPlayAgain.textContent = 'PLAY AGAIN';
      this.p2pLocalReadyRestart = false;
      this.p2pOpponentReadyRestart = false;

      const profileLabelEl = document.getElementById('end-profile-label');
      if (profileLabelEl) profileLabelEl.textContent = 'MULTIPLAYER P2P PROFILE';
    } else {
      profilePts = this.game.getProfilePts();
      const profileLabelEl = document.getElementById('end-profile-label');
      if (profileLabelEl) profileLabelEl.textContent = 'COMPUTER MODE PROFILE';
    }

    const pot = state.playerMatchPts + state.cpuMatchPts;
    const titleMap = { 
      player: '— VICTORY —', 
      cpu: '— DEFEATED —', 
      dual_defeat: '— DUAL DEFEAT —' 
    };
    const clsMap = { player: 'end-win', cpu: 'end-lose', dual_defeat: 'end-dual' };

    this.elEndTitle.textContent = titleMap[state.winner] ?? 'GAME OVER';
    this.elEndTitle.className = `end-title ${clsMap[state.winner] ?? ''}`;

    const ptsLine = state.winner === 'player'
      ? `<tr class="pts-row"><td>Points Claimed</td><td class="col-win">+${state.ptsAwarded}</td></tr>`
      : state.winner === 'dual_defeat'
        ? `<tr class="pts-row"><td>Pot Burned</td><td class="col-dual">${pot} pts lost</td></tr>`
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
      const snap = this.game.playP2PTurn(this.p2pLocalMove, this.p2pRemoteMove);
      this.p2pLocalMove = null;
      this.p2pRemoteMove = null;
      if (snap) this._showReveal(snap);
    }, 200);
  }

  _advanceP2PRound() {
    this.p2pLocalReady = false;
    this.p2pOpponentReady = false;
    this.game.advance();

    if (this.game.state.phase === 'game_over') {
      setTimeout(() => this._showGameOver(this.game.state.snapshot()), 50);
    } else {
      this._beginSelectionPhase();
    }
  }

  _restartP2PGame() {
    this.p2pLocalReadyRestart = false;
    this.p2pOpponentReadyRestart = false;
    this.game.start();
    this._clearLog();
    this._showScreen('game');
    this._renderHUD(this.game.state.snapshot());
    this._beginSelectionPhase();
  }

  _initP2PAsHost() {
    this.p2pIsHost = true;
    this.p2pCreateStatus.style.display = 'block';
    this.p2pCreateStatus.textContent = 'Initializing PeerJS...';
    this.btnP2PCreate.disabled = true;
    this.btnP2PJoin.disabled = true;

    // Use PeerJS with random 4-digit code ID mapping
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // We append prefix to peer ID to make it distinct on global directory
    this.p2pPeer = new Peer('sos-room-' + code);

    this.p2pPeer.on('open', () => {
      this.p2pCreateStatus.innerHTML = `ROOM CODE: <strong style="font-size:1.15rem; color:var(--accent);">${code}</strong><br><span style="font-size:0.75rem; color:var(--muted)">Waiting for opponent to join...</span>`;
    });

    this.p2pPeer.on('connection', (conn) => {
      this.p2pConn = conn;
      this._setupP2PConnection(conn);
    });

    this.p2pPeer.on('error', (err) => {
      console.error(err);
      this.p2pCreateStatus.textContent = 'Connection Error. Retrying...';
      this.btnP2PCreate.disabled = false;
      this.btnP2PJoin.disabled = false;
    });
  }

  _joinP2P() {
    const code = this.p2pRoomInput.value.trim();
    if (!code || code.length !== 4) {
      this.p2pJoinStatus.style.display = 'block';
      this.p2pJoinStatus.textContent = 'Enter a valid 4-digit code.';
      return;
    }

    this.p2pIsHost = false;
    this.p2pJoinStatus.style.display = 'block';
    this.p2pJoinStatus.textContent = `Connecting to room ${code}...`;
    this.btnP2PCreate.disabled = true;
    this.btnP2PJoin.disabled = true;

    this.p2pPeer = new Peer();

    this.p2pPeer.on('open', () => {
      const conn = this.p2pPeer.connect('sos-room-' + code);
      this.p2pConn = conn;
      this._setupP2PConnection(conn);
    });

    this.p2pPeer.on('error', (err) => {
      console.error(err);
      this.p2pJoinStatus.textContent = 'Failed to connect. Try again.';
      this.btnP2PCreate.disabled = false;
      this.btnP2PJoin.disabled = false;
    });
  }

  _setupP2PConnection(conn) {
    conn.on('open', () => {
      this.p2pLocalStart = false;
      this.p2pRemoteStart = false;
      this._stopP2PCountdown();

      this.p2pLocalMove = null;
      this.p2pRemoteMove = null;
      this.p2pLocalReady = false;
      this.p2pOpponentReady = false;
      this.p2pLocalReadyRestart = false;
      this.p2pOpponentReadyRestart = false;

      this._updateP2PLobbyUI();
    });

    conn.on('data', (data) => {
      if (data.type === 'START_CLICK') {
        this.p2pRemoteStart = data.start;
        this._checkP2PStartCountdown();
        this._updateP2PLobbyUI();
      } else if (data.type === 'MOVE') {
        this.p2pRemoteMove = data.move;
        if (this.p2pLocalMove !== null) {
          this._resolveP2PTurn();
        }
      } else if (data.type === 'READY') {
        this.p2pOpponentReady = true;
        if (this.p2pLocalReady) {
          this._advanceP2PRound();
        }
      } else if (data.type === 'PLAY_AGAIN') {
        this.p2pOpponentReadyRestart = true;
        if (this.p2pLocalReadyRestart) {
          this._restartP2PGame();
        }
      } else if (data.type === 'DISCONNECT') {
        this._handleP2PDisconnect();
      }
    });

    conn.on('close', () => {
      this._handleP2PDisconnect();
    });
  }

  _handleP2PStartClick() {
    this.p2pLocalStart = !this.p2pLocalStart;

    if (this.p2pConn) {
      try {
        this.p2pConn.send({
          type: 'START_CLICK',
          start: this.p2pLocalStart
        });
      } catch (e) {
        console.error("Error sending start click to remote:", e);
      }
    }

    this._checkP2PStartCountdown();
    this._updateP2PLobbyUI();
  }

  _checkP2PStartCountdown() {
    if (this.p2pLocalStart && this.p2pRemoteStart) {
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

        this.p2pLocalMove = null;
        this.p2pRemoteMove = null;
        this.p2pLocalReady = false;
        this.p2pOpponentReady = false;
        this.p2pLocalReadyRestart = false;
        this.p2pOpponentReadyRestart = false;

        this.game.switchToP2P(true);
        this.game.start();

        if (this.opponentHudLabel) this.opponentHudLabel.textContent = 'PLAYER 2';
        if (this.opponentMoveLabel) this.opponentMoveLabel.textContent = 'OPPONENT MOVE';

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
    if (!this.p2pConn) return;

    this.p2pRoomInput.style.display = 'none';
    const separator = document.querySelector('.p2p-separator');
    if (separator) separator.style.display = 'none';

    const totalReady = (this.p2pLocalStart ? 1 : 0) + (this.p2pRemoteStart ? 1 : 0);

    if (this.p2pIsHost) {
      this.btnP2PCreate.style.display = 'block';
      this.btnP2PCreate.disabled = false;
      this.btnP2PJoin.style.display = 'none';
      this.p2pCreateStatus.style.display = 'block';

      if (this.p2pLocalStart) {
        this.btnP2PCreate.textContent = 'STOP';
        this.btnP2PCreate.className = 'btn-secondary';
        if (!this.p2pRemoteStart) {
          this.p2pCreateStatus.innerHTML = `<span style="color: var(--accent);">Waiting for the other player to start the game (${totalReady}/2 ready)</span>`;
        } else {
          this.p2pCreateStatus.innerHTML = `<span style="color: var(--win);">Match starting! (${totalReady}/2 ready)</span>`;
        }
      } else {
        this.btnP2PCreate.textContent = 'START GAME';
        this.btnP2PCreate.className = 'btn-primary';
        if (this.p2pRemoteStart) {
          this.p2pCreateStatus.innerHTML = `<span style="color: var(--accent);">Please click start, the other player is waiting... (${totalReady}/2 ready)</span>`;
        } else {
          this.p2pCreateStatus.innerHTML = `<span style="color: var(--win);">OPPONENT CONNECTED! (${totalReady}/2 ready)</span>`;
        }
      }
    } else {
      this.btnP2PJoin.style.display = 'block';
      this.btnP2PJoin.disabled = false;
      this.btnP2PCreate.style.display = 'none';
      this.p2pJoinStatus.style.display = 'block';

      if (this.p2pLocalStart) {
        this.btnP2PJoin.textContent = 'STOP';
        this.btnP2PJoin.className = 'btn-secondary';
        if (!this.p2pRemoteStart) {
          this.p2pJoinStatus.innerHTML = `<span style="color: var(--accent);">Waiting for the other player to start the game (${totalReady}/2 ready)</span>`;
        } else {
          this.p2pJoinStatus.innerHTML = `<span style="color: var(--win);">Match starting! (${totalReady}/2 ready)</span>`;
        }
      } else {
        this.btnP2PJoin.textContent = 'START GAME';
        this.btnP2PJoin.className = 'btn-primary';
        if (this.p2pRemoteStart) {
          this.p2pJoinStatus.innerHTML = `<span style="color: var(--accent);">Please click start, the other player is waiting... (${totalReady}/2 ready)</span>`;
        } else {
          this.p2pJoinStatus.innerHTML = `<span style="color: var(--win);">CONNECTED TO HOST! (${totalReady}/2 ready)</span>`;
        }
      }
    }
  }

  _resetP2PLobbyUI() {
    this.p2pLocalStart = false;
    this.p2pRemoteStart = false;
    this._stopP2PCountdown();

    this.p2pRoomInput.value = '';
    this.p2pRoomInput.style.display = 'block';

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
    this.p2pLocalStart = false;
    this.p2pRemoteStart = false;
    this._stopP2PCountdown();

    if (this.p2pConn) {
      try {
        this.p2pConn.send({ type: 'DISCONNECT' });
        this.p2pConn.close();
      } catch (e) { }
      this.p2pConn = null;
    }
    if (this.p2pPeer) {
      try { this.p2pPeer.destroy(); } catch (e) { }
      this.p2pPeer = null;
    }
    this.game.switchToP2P(false);
    this._resetP2PLobbyUI();
  }

  _handleP2PDisconnect() {
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
