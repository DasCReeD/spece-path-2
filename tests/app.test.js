// Tests for the GameManager class in app.js
// GameManager is not exported and instantiated on DOMContentLoaded.
// We mock all dependency modules and test behavior through DOM interactions.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// ── Mock Level Data ────────────────────────────────────────────────────────────

const MOCK_STANDARD_LEVELS = [
  { level_index: 0, gravity: 8, fuel: 100, oxygen: 60, rows: [[null, null, null, null, null, null, null]], palette: [] },
  { level_index: 1, gravity: 8, fuel: 120, oxygen: 70, rows: [[null, null, null, null, null, null, null]], palette: [] },
  { level_index: 2, gravity: 10, fuel: 80, oxygen: 50, rows: [[null, null, null, null, null, null, null]], palette: [] }
];

const MOCK_XMAS_LEVELS = [
  { level_index: 0, gravity: 6, fuel: 90, oxygen: 55, rows: [[null, null, null, null, null, null, null]], palette: [] },
  { level_index: 1, gravity: 7, fuel: 110, oxygen: 65, rows: [[null, null, null, null, null, null, null]], palette: [] }
];

const MOCK_PACKS = {
  standard: MOCK_STANDARD_LEVELS,
  xmas: MOCK_XMAS_LEVELS
};

// ── Mock Dependencies ──────────────────────────────────────────────────────────

vi.mock('../levels.js', () => ({
  loadLevelPack: vi.fn(async (packName) => MOCK_PACKS[packName]),
  getCachedPack: vi.fn((packName) => MOCK_PACKS[packName])
}));

const mockGraphicsInstance = {
  init: vi.fn(),
  clearLevel: vi.fn(),
  spawnCityScenery: vi.fn(),
  loadLevelSceneryModels: vi.fn((index, resolve) => { if (resolve) resolve(); }),
  scene: { add: vi.fn(), remove: vi.fn() },
  starField: { rotation: { y: 0 } },
  render: vi.fn(),
  update: vi.fn(),
  triggerExplosion: vi.fn()
};

vi.mock('../graphics.js', () => ({
  GraphicsEngine: vi.fn(() => mockGraphicsInstance)
}));

const mockPhysicsInstance = {
  reset: vi.fn(),
  update: vi.fn(),
  position: { x: 0, y: 0.2, z: -50, set: vi.fn(function(x, y, z) { this.x = x; this.y = y; this.z = z; }), clone: () => ({ x: 0, y: 0.2, z: -50 }) },
  velocity: { x: 0, y: 0, z: -15, set: vi.fn() },
  maxSpeedNormal: 32,
  maxSpeedBoost: 60,
  isDead: false,
  deathReason: '',
  activeEffects: { boost: false, sticky: false, slippery: false, burning: false },
  oxygen: 80,
  fuel: 3500,
  triggerRefillAudio: false,
  settings: {
    bounceFactor: 1.0,
    gravityFactor: 1.0,
    jumpFactor: 1.0
  }
};

const mockKeyboardInstance = {
  forward: false, backward: false,
  left: false, right: false,
  jump: false, rewind: false, resetJump: vi.fn()
};

vi.mock('../physics.js', () => ({
  PhysicsEngine: vi.fn(() => mockPhysicsInstance),
  KeyboardController: vi.fn(() => mockKeyboardInstance),
  SHIP_LENGTH: 1.8
}));

const mockBuildLevelResult = {
  trackLength: 100,
  collidables: [],
  specialTiles: [],
  finishZ: -102,
  gravity: 24,
  fuel: 100,
  oxygen: 60,
  roadMeshes: []
};

vi.mock('../levelLoader.js', () => ({
  buildLevel: vi.fn(() => ({ ...mockBuildLevelResult })),
  buildLevelAsync: vi.fn(async (_data, _scene, onProgress) => {
    if (onProgress) onProgress(100);
    return { ...mockBuildLevelResult };
  }),
  disposeUnusedThemes: vi.fn(),
  getActiveThemeIndex: vi.fn(() => 0)
}));

vi.mock('../audio.js', () => ({
  gameAudio: {
    playClick: vi.fn(),
    startEngine: vi.fn(),
    stopEngine: vi.fn(),
    updateEngineSpeed: vi.fn(),
    playRefill: vi.fn(),
    playExplosion: vi.fn(),
    playWin: vi.fn(),
    playWallCollision: vi.fn(),
    playLandingRebound: vi.fn(),
    playSteer: vi.fn(),
    startMusic: vi.fn(),
    stopMusic: vi.fn(),
    setMusicEnabled: vi.fn(),
    setMusicVolume: vi.fn(),
    setSfxVolume: vi.fn(),
    setSoundMode: vi.fn(),
    musicSequencer: { musicEnabled: true }
  }
}));

// ── DOM Setup Helper ───────────────────────────────────────────────────────────

function createMinimalDOM() {
  document.body.innerHTML = `
    <div id="canvas-container" style="width:800px;height:600px;"></div>

    <button id="btn-settings-gear" class="btn-settings-gear-trigger"></button>
    <button id="btn-settings-physics" class="btn-settings-physics-trigger"></button>
    <button id="btn-in-game-pause" class="btn-pause-trigger hidden"></button>

    <div id="settings-screen" class="overlay-screen hidden">
      <button id="btn-settings-calibrator"></button>
      <button id="btn-settings-close"></button>
      <button id="btn-settings-rewind"></button>
      <button id="btn-settings-lane-snap"></button>
      <div id="settings-paused-actions" class="hidden"></div>
    </div>

    <div id="physics-calibrator-screen" class="physics-floating-calibrator glass-card">
      <div id="calibrator-status-alert" style="opacity: 0"></div>
      <button id="preset-btn-vga"></button>
      <button id="preset-btn-snappy"></button>
      <button id="preset-btn-lunar"></button>
      <button id="preset-btn-custom"></button>

      <div class="calibrator-group-card">
        <div class="group-header">1. THROTTLE</div>
        <div class="sliders-list">
          <input type="range" id="input-maxSpeedNormal" value="32">
          <span id="val-maxSpeedNormal">32.0</span>
        </div>
      </div>

      <div class="calibrator-group-card">
        <div class="group-header">5. DAMAGE & WEIGHT TUNING</div>
        <div class="sliders-list">
          <input type="range" id="input-damageModifier" value="1.0">
          <span id="val-damageModifier">1.0</span>
          <input type="range" id="input-shipMass" value="1.0">
          <span id="val-shipMass">1.0</span>
        </div>
      </div>


      <button id="btn-calibrator-reset"></button>
      <button id="btn-calibrator-save-default"></button>
      <button id="btn-calibrator-close"></button>
    </div>

    <div id="menu-screen" class="overlay-screen active">
      <button id="btn-play-standard"></button>
      <button id="btn-play-generated"></button>
      <button id="btn-play-xmas"></button>
      <button id="btn-how-to"></button>
    </div>

    <div id="how-to-screen" class="overlay-screen hidden">
      <button id="btn-how-to-back"></button>
    </div>

    <div id="loading-screen" class="overlay-screen hidden">
      <span id="loading-status"></span>
      <div id="loading-progress-bar" style="width:0%"></div>
    </div>

    <div id="level-screen" class="overlay-screen hidden">
      <h2 id="level-pack-title"></h2>
      <div id="level-grid"></div>
      <button id="btn-level-back"></button>
    </div>

    <div id="death-screen" class="overlay-screen hidden">
      <p id="death-reason"></p>
      <p id="death-rewind-prompt" class="hidden">HOLD <span class="rewind-key">R</span> TO REWIND</p>
      <p id="death-rewind-depleted" class="hidden">REWIND DEPLETED</p>
      <div class="menu-buttons">
        <button id="btn-death-retry"></button>
        <button id="btn-death-menu"></button>
      </div>
    </div>

    <div id="success-screen" class="overlay-screen hidden">
      <span id="score-val-time"></span>
      <span id="score-val-speed"></span>
      <span id="score-val-collisions"></span>
      <span id="score-val-speed-bonus"></span>
      <span id="score-val-time-bonus"></span>
      <span id="score-val-penalty"></span>
      <div id="score-row-perfect-bonus"></div>
      <span id="score-val-final"></span>

      <div id="leaderboard-input-box">
        <input type="text" id="input-score-initials">
        <button id="btn-score-submit"></button>
      </div>
      <table>
        <tbody id="leaderboard-table-body"></tbody>
      </table>

      <button id="btn-success-next"></button>
      <button id="btn-success-menu"></button>
    </div>

    <div id="hud" class="hidden">
      <!-- Legacy compatibility elements for unit tests -->
      <div id="hud-speed-bar" style="width:0%"></div>
      <div id="hud-oxygen-bar" style="width:0%"></div>
      <div id="hud-fuel-bar" style="width:0%"></div>
      <div id="hud-progress-bar" style="width:0%"></div>
      <div id="hud-progress-marker" style="left:0%"></div>

      <!-- New Cockpit Panel Elements -->
      <span id="hud-speed-text">000</span>
      <span id="hud-oxygen-text">000</span>
      <span id="hud-fuel-text">00000</span>
      <div id="hud-gravity-text">0800</div>
      <div id="hud-pack-name">STANDARD PACK</div>
      <div id="hud-road-name">DEMO ROAD</div>
      <span id="hud-score-text">000000</span>
      <div id="gauge-speed-ring" style="stroke-dashoffset: 565.48px;"></div>
      <div id="gauge-oxygen-arc" style="stroke-dashoffset: 0px;"></div>
      <div id="gauge-fuel-arc" style="stroke-dashoffset: 0px;"></div>
      <div id="status-boost"></div>
      <div id="status-sticky"></div>
      <div id="status-slippery"></div>
    </div>

    <!-- Mobile Touch Controls HUD -->
    <div id="mobile-touch-hud" class="touch-hud hidden">
      <div class="touch-top-bar">
        <button id="touch-btn-pause" data-touch-id="pause">⚙️</button>
        <button id="touch-btn-edit" class="touch-edit-btn">✏️</button>
      </div>
      <button id="touch-btn-cam" data-touch-id="cam" data-action="cam">📷</button>
      <button id="touch-btn-curve" data-touch-id="curve" data-action="curve">🌀</button>
      <button id="touch-btn-zoom-in" data-touch-id="zoom-in" data-action="zoom-in">🔍+</button>
      <button id="touch-btn-zoom-out" data-touch-id="zoom-out" data-action="zoom-out">🔍−</button>
      <button id="touch-btn-rewind" data-touch-id="rewind" data-action="rewind">⏪</button>

      <div id="touch-btn-steer" data-touch-id="steer">
        <div id="joystick-base">
          <div id="joystick-knob"></div>
        </div>
        <div id="touch-dpad-view" class="hidden">
          <button class="dpad-btn dpad-up" data-action="forward">▲</button>
          <button class="dpad-btn dpad-left" data-action="left">◀</button>
          <button class="dpad-btn dpad-right" data-action="right">▶</button>
          <button class="dpad-btn dpad-down" data-action="backward">▼</button>
        </div>
      </div>

      <button id="touch-btn-thrust" data-touch-id="thrust" data-action="forward">▲</button>
      <button id="touch-btn-brake" data-touch-id="brake" data-action="backward">▼</button>
      <button id="touch-btn-jump" data-touch-id="jump" data-action="jump">⬆</button>

      <div id="touch-customizer-overlay" class="hidden">
        <button id="btn-cust-type">🕹️ STICK</button>
        <button id="btn-cust-scale-dec">➖</button>
        <button id="btn-cust-scale-inc">➕</button>
        <button id="btn-cust-reset">↩️ RESET</button>
        <button id="btn-cust-done">✅ DONE</button>
      </div>
    </div>

    <!-- HUD labels that touch controls update -->
    <span id="hud-cam-mode"></span>
    <span id="hud-track-curve"></span>
    <input type="range" id="hud-curve-slider">
    <span id="hud-curve-val"></span>
  `;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Flush all pending microtasks and promises */
function flushPromises() {
  return new Promise(resolve => {
    queueMicrotask(resolve);
  });
}

/** Import app.js and fire DOMContentLoaded */
async function loadApp() {
  await import('../app.js');
  window.dispatchEvent(new Event('DOMContentLoaded'));
  await flushPromises();
}

/** Click a button and wait for async handlers to resolve */
async function clickAndFlush(elementId) {
  document.getElementById(elementId).click();
  await flushPromises();
  await flushPromises();
}

/** Click a DOM element and wait for async handlers */
async function clickElementAndFlush(element) {
  element.click();
  await flushPromises();
  await flushPromises();
}

// ── Test Suites ─────────────────────────────────────────────────────────────────

describe('GameManager (app.js)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);

    createMinimalDOM();
    vi.clearAllMocks();

    // Reset mutable mock state each test
    mockPhysicsInstance.isDead = false;
    mockPhysicsInstance.deathReason = '';
    mockPhysicsInstance.position.z = -50;
    mockPhysicsInstance.velocity.z = -15;
    mockPhysicsInstance.oxygen = 80;
    mockPhysicsInstance.fuel = 3500;
    mockPhysicsInstance.triggerRefillAudio = false;
    mockPhysicsInstance.activeEffects.boost = false;
    mockKeyboardInstance.rewind = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // ── showScreen behavior ──────────────────────────────────────────────────

  describe('showScreen()', () => {
    it('should hide all overlay screens and show the target screen', async () => {
      await loadApp();
      await clickAndFlush('btn-how-to');

      const menuScreen = document.getElementById('menu-screen');
      const howToScreen = document.getElementById('how-to-screen');
      const levelScreen = document.getElementById('level-screen');

      expect(menuScreen.classList.contains('hidden')).toBe(true);
      expect(menuScreen.classList.contains('active')).toBe(false);

      expect(howToScreen.classList.contains('hidden')).toBe(false);
      expect(howToScreen.classList.contains('active')).toBe(true);

      expect(levelScreen.classList.contains('hidden')).toBe(true);
      expect(levelScreen.classList.contains('active')).toBe(false);
    });

    it('should play click sound when navigating screens', async () => {
      const { gameAudio } = await import('../audio.js');
      await loadApp();
      await clickAndFlush('btn-how-to');

      expect(gameAudio.playClick).toHaveBeenCalled();
    });

    it('should return to menu screen when how-to back button is clicked', async () => {
      await loadApp();
      await clickAndFlush('btn-how-to');
      await clickAndFlush('btn-how-to-back');

      const menuScreen = document.getElementById('menu-screen');
      expect(menuScreen.classList.contains('active')).toBe(true);
      expect(menuScreen.classList.contains('hidden')).toBe(false);
    });
  });

  // ── showLevelSelection behavior ──────────────────────────────────────────

  describe('showLevelSelection()', () => {
    it('should populate level grid with correct count for standard pack', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');

      const grid = document.getElementById('level-grid');
      const items = grid.querySelectorAll('.level-item');
      expect(items.length).toBe(MOCK_STANDARD_LEVELS.length);
    });

    it('should populate level grid with correct count for xmas pack', async () => {
      await loadApp();
      await clickAndFlush('btn-play-xmas');

      const grid = document.getElementById('level-grid');
      const items = grid.querySelectorAll('.level-item');
      expect(items.length).toBe(MOCK_XMAS_LEVELS.length);
    });

    it('should set pack title to STANDARD PACK for standard', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');

      const title = document.getElementById('level-pack-title');
      expect(title.innerText).toBe('STANDARD PACK');
    });

    it('should set pack title to XMAS SPECIAL for xmas', async () => {
      await loadApp();
      await clickAndFlush('btn-play-xmas');

      const title = document.getElementById('level-pack-title');
      expect(title.innerText).toBe('XMAS SPECIAL');
    });

    it('should show level screen after populating grid', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');

      const levelScreen = document.getElementById('level-screen');
      expect(levelScreen.classList.contains('active')).toBe(true);
      expect(levelScreen.classList.contains('hidden')).toBe(false);
    });

    it('should display level numbers and names in each grid item', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');

      const grid = document.getElementById('level-grid');
      const items = grid.querySelectorAll('.level-item');

      // Check second item (idx=1) since jsdom has a known quirk where
      // innerText = 0 (falsy number) produces empty text
      const secondNum = items[1].querySelector('.level-num');
      const secondName = items[1].querySelector('.level-name');

      // jsdom's innerText setter populates innerText, not innerHTML
      expect(secondNum.innerText).toBe(1);
      expect(secondName.innerText).toBe('RED HEAT');
    });

    it('should call loadLevelPack with the correct pack name', async () => {
      const { loadLevelPack } = await import('../levels.js');
      await loadApp();
      await clickAndFlush('btn-play-standard');

      expect(loadLevelPack).toHaveBeenCalledWith('standard');
    });

    it('should clear previous grid items when switching packs', async () => {
      await loadApp();

      await clickAndFlush('btn-play-standard');
      await clickAndFlush('btn-level-back');
      await clickAndFlush('btn-play-xmas');

      const grid = document.getElementById('level-grid');
      const items = grid.querySelectorAll('.level-item');
      expect(items.length).toBe(MOCK_XMAS_LEVELS.length);
    });
  });

  // ── startLevel behavior ──────────────────────────────────────────────────

  describe('startLevel()', () => {
    async function navigateToLevelAndStart(levelIndex = 0) {
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      const items = grid.querySelectorAll('.level-item');
      await clickElementAndFlush(items[levelIndex]);
    }

    it('should show HUD and hide all overlay screens when starting a level', async () => {
      await loadApp();
      await navigateToLevelAndStart();

      const hud = document.getElementById('hud');
      expect(hud.classList.contains('hidden')).toBe(false);
    });

    it('should call graphics.clearLevel when starting a level', async () => {
      await loadApp();
      await navigateToLevelAndStart();

      expect(mockGraphicsInstance.clearLevel).toHaveBeenCalled();
    });

    it('should call buildLevelAsync with the selected level data', async () => {
      const { buildLevelAsync } = await import('../levelLoader.js');
      await loadApp();
      await navigateToLevelAndStart();

      expect(buildLevelAsync).toHaveBeenCalledWith(
        MOCK_STANDARD_LEVELS[0],
        expect.anything(),
        expect.any(Function)
      );
    });

    it('should call physics.reset with fuel and oxygen from levelInfo', async () => {
      await loadApp();
      await navigateToLevelAndStart();

      expect(mockPhysicsInstance.reset).toHaveBeenCalledWith(
        mockBuildLevelResult.fuel,
        mockBuildLevelResult.oxygen
      );
    });

    it('should start engine audio on level start', async () => {
      const { gameAudio } = await import('../audio.js');
      await loadApp();
      await navigateToLevelAndStart();

      expect(gameAudio.startEngine).toHaveBeenCalled();
    });

    it('should set window globals for currentGamePack and currentLevelIndex', async () => {
      await loadApp();
      await navigateToLevelAndStart();

      expect(window.currentGamePack).toBe('standard');
      expect(window.currentLevelIndex).toBe(0);
      expect(window.currentLevelData).toBe(MOCK_STANDARD_LEVELS[0]);
    });
  });

  // ── returnToMenu behavior ────────────────────────────────────────────────

  describe('returnToMenu()', () => {
    it('should hide HUD and show menu screen', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      await clickAndFlush('btn-success-menu');

      const hud = document.getElementById('hud');
      expect(hud.classList.contains('hidden')).toBe(true);

      const menuScreen = document.getElementById('menu-screen');
      expect(menuScreen.classList.contains('active')).toBe(true);
    });

    it('should stop engine audio when returning to menu', async () => {
      const { gameAudio } = await import('../audio.js');
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      await clickAndFlush('btn-success-menu');

      expect(gameAudio.stopEngine).toHaveBeenCalled();
    });
  });

  // ── handleDeath behavior ─────────────────────────────────────────────────

  describe('handleDeath()', () => {
    async function startLevelAndTriggerDeath(reason = 'COLLIDED WITH BLOCK') {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      mockPhysicsInstance.isDead = true;
      mockPhysicsInstance.deathReason = reason;

      const lastCall = window.requestAnimationFrame.mock.calls;
      const rafCallback = lastCall[lastCall.length - 1]?.[0];
      if (rafCallback) {
        performance.now.mockReturnValue(16);
        rafCallback(16);
      }
    }

    it('should show death screen after timeout when physics.isDead is true', async () => {
      await startLevelAndTriggerDeath();

      vi.advanceTimersByTime(1200);

      const deathScreen = document.getElementById('death-screen');
      expect(deathScreen.classList.contains('active')).toBe(true);
    });

    it('should play explosion audio on death', async () => {
      const { gameAudio } = await import('../audio.js');
      await startLevelAndTriggerDeath('FELL OFF ROAD');

      expect(gameAudio.playExplosion).toHaveBeenCalled();
      expect(gameAudio.stopEngine).toHaveBeenCalled();
    });

    it('should trigger graphics explosion at physics position', async () => {
      await startLevelAndTriggerDeath();

      expect(mockGraphicsInstance.triggerExplosion).toHaveBeenCalledWith(
        mockPhysicsInstance.position
      );
    });
  });

  // ── handleDeath Rewind Mechanic behavior ──────────────────────────────────

  describe('handleDeath() Rewind Mechanic', () => {
    it('should record snapshots during active play frames up to 10000 frames', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      const manager = window.gameManagerInstance;
      expect(manager.stateHistory.length).toBe(0);

      // Run multiple frames
      for (let i = 1; i <= 10005; i++) {
        manager.animate(i * 16);
      }
      // Should be capped at 10000
      expect(manager.stateHistory.length).toBe(10000);
      expect(manager.stateHistory[0].timestamp).toBe(6 * 16); // 1 to 5 should have been shifted out
    });

    it('should show the rewind prompt after 1 second if rewind is available on death', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      const manager = window.gameManagerInstance;
      manager.rewindEnabled = true;
      manager.stateHistory = [{ timestamp: 1000, position: new THREE.Vector3(0,0,0), velocity: new THREE.Vector3(0,0,0), activeEffects: {} }];

      manager.handleDeath();

      const promptEl = document.getElementById('death-rewind-prompt');
      expect(promptEl.classList.contains('hidden')).toBe(true);

      // Advance by 1 second
      vi.advanceTimersByTime(1000);
      expect(promptEl.classList.contains('hidden')).toBe(false);
    });

    it('should show retry/menu buttons after 4 seconds if no rewind action is taken', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      const manager = window.gameManagerInstance;
      manager.rewindEnabled = true;
      manager.stateHistory = [{ timestamp: 1000, position: new THREE.Vector3(0,0,0), velocity: new THREE.Vector3(0,0,0), activeEffects: {} }];

      manager.handleDeath();

      const deathScreen = document.getElementById('death-screen');
      const deathButtons = deathScreen.querySelector('.menu-buttons');
      expect(deathButtons.style.display).toBe('none');

      // Advance by 4 seconds
      vi.advanceTimersByTime(4000);
      expect(deathButtons.style.display).toBe('');
    });

    it('should toggle rewind toggle button class and text on click', async () => {
      await loadApp();
      const btn = document.getElementById('btn-settings-rewind');
      expect(btn).not.toBeNull();

      const manager = window.gameManagerInstance;
      
      // Defaults to true
      expect(manager.rewindEnabled).toBe(true);
      expect(btn.innerText).toBe('REWIND: ON');
      expect(btn.classList.contains('btn-primary')).toBe(true);

      // Toggle OFF
      await clickAndFlush('btn-settings-rewind');
      expect(manager.rewindEnabled).toBe(false);
      expect(btn.innerText).toBe('REWIND: OFF');
      expect(btn.classList.contains('btn-info')).toBe(true);

      // Toggle ON
      await clickAndFlush('btn-settings-rewind');
      expect(manager.rewindEnabled).toBe(true);
      expect(btn.innerText).toBe('REWIND: ON');
      expect(btn.classList.contains('btn-primary')).toBe(true);
    });
  });

  // ── Death reason messages ────────────────────────────────────────────────

  describe('death reason messages', () => {
    const deathReasonCases = [
      ['FELL OFF ROAD', 'You steered off the edge and plummeted into the deep abyss.'],
      ['OUT OF FUEL', 'Your thrusters sputtered out of fuel and shut down.'],
      ['OUT OF OXYGEN', 'Life support systems failed. You ran out of oxygen.'],
      ['BURNED TO CRIPPLES', 'Your hull melted immediately on contact with a burning tile.'],
      ['COLLIDED WITH BLOCK', 'Your ship crashed into a wall of solid block.']
    ];

    it.each(deathReasonCases)(
      'should display correct message for death reason "%s"',
      async (reason, expectedMessage) => {
        await loadApp();
        await clickAndFlush('btn-play-standard');
        const grid = document.getElementById('level-grid');
        await clickElementAndFlush(grid.querySelector('.level-item'));

        mockPhysicsInstance.isDead = true;
        mockPhysicsInstance.deathReason = reason;

        const lastCall = window.requestAnimationFrame.mock.calls;
        const rafCallback = lastCall[lastCall.length - 1]?.[0];
        if (rafCallback) {
          performance.now.mockReturnValue(16);
          rafCallback(16);
        }

        const deathReasonEl = document.getElementById('death-reason');
        expect(deathReasonEl.innerText).toBe(expectedMessage);

        mockPhysicsInstance.isDead = false;
        mockPhysicsInstance.deathReason = '';
      }
    );
  });

  // ── handleSuccess behavior ───────────────────────────────────────────────

  describe('handleSuccess()', () => {
    async function startLevelAndTriggerSuccess(levelIndex = 0) {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      const items = grid.querySelectorAll('.level-item');
      await clickElementAndFlush(items[levelIndex]);

      mockPhysicsInstance.isDead = false;
      mockPhysicsInstance.position.z = mockBuildLevelResult.finishZ;

      const lastCall = window.requestAnimationFrame.mock.calls;
      const rafCallback = lastCall[lastCall.length - 1]?.[0];
      if (rafCallback) {
        performance.now.mockReturnValue(16);
        rafCallback(16);
      }
    }

    it('should show success screen when crossing finish line', async () => {
      const { gameAudio } = await import('../audio.js');
      await startLevelAndTriggerSuccess();

      const successScreen = document.getElementById('success-screen');
      expect(successScreen.classList.contains('active')).toBe(true);

      expect(gameAudio.stopEngine).toHaveBeenCalled();
      expect(gameAudio.playWin).toHaveBeenCalled();
    });

    it('should show next button when not on last level', async () => {
      await startLevelAndTriggerSuccess(0);

      const nextBtn = document.getElementById('btn-success-next');
      expect(nextBtn.classList.contains('hidden')).toBe(false);
    });

    it('should hide next button on the last level of the pack', async () => {
      await startLevelAndTriggerSuccess(MOCK_STANDARD_LEVELS.length - 1);

      const nextBtn = document.getElementById('btn-success-next');
      expect(nextBtn.classList.contains('hidden')).toBe(true);
    });
  });

  // ── HUD update calculations ──────────────────────────────────────────────

  describe('updateHUD()', () => {
    async function startAndGetFrameRunner() {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));
    }

    function runOneFrame() {
      const lastCall = window.requestAnimationFrame.mock.calls;
      const rafCallback = lastCall[lastCall.length - 1]?.[0];
      if (rafCallback) {
        performance.now.mockReturnValue(16);
        rafCallback(16);
      }
    }

    it('should display speed as velocity.z * 10 floored and padded to 3 digits', async () => {
      await startAndGetFrameRunner();
      mockPhysicsInstance.velocity.z = -15;
      mockPhysicsInstance.isDead = false;
      mockPhysicsInstance.position.z = -50;
      runOneFrame();

      expect(document.getElementById('hud-speed-text').innerText).toBe('150');
    });

    it('should pad speed to 3 digits with leading zeros for small values', async () => {
      await startAndGetFrameRunner();
      mockPhysicsInstance.velocity.z = -0.5;
      mockPhysicsInstance.isDead = false;
      mockPhysicsInstance.position.z = -10;
      runOneFrame();

      expect(document.getElementById('hud-speed-text').innerText).toBe('005');
    });

    it('should display oxygen value ceiled and padded to 3 digits', async () => {
      await startAndGetFrameRunner();
      mockPhysicsInstance.oxygen = 73.2;
      mockPhysicsInstance.isDead = false;
      mockPhysicsInstance.position.z = -10;
      runOneFrame();

      expect(document.getElementById('hud-oxygen-text').innerText).toBe('074');
    });

    it('should set oxygen bar width to the oxygen percentage', async () => {
      await startAndGetFrameRunner();
      mockPhysicsInstance.oxygen = 50;
      mockPhysicsInstance.isDead = false;
      mockPhysicsInstance.position.z = -10;
      runOneFrame();

      expect(document.getElementById('hud-oxygen-bar').style.width).toBe('50%');
    });

    it('should display fuel value ceiled and padded to 5 digits', async () => {
      await startAndGetFrameRunner();
      mockPhysicsInstance.fuel = 3500;
      mockPhysicsInstance.isDead = false;
      mockPhysicsInstance.position.z = -10;
      runOneFrame();

      expect(document.getElementById('hud-fuel-text').innerText).toBe('03500');
    });

    it('should calculate progress bar based on ship position vs track length', async () => {
      await startAndGetFrameRunner();
      mockPhysicsInstance.position.z = -50; // absoluteZ=50, trackLength=100 => 50%
      mockPhysicsInstance.isDead = false;
      runOneFrame();

      expect(document.getElementById('hud-progress-bar').style.width).toBe('50%');
      expect(document.getElementById('hud-progress-marker').style.left).toBe('50%');
    });

    it('should clamp progress bar to 100% when beyond track', async () => {
      await startAndGetFrameRunner();
      mockPhysicsInstance.position.z = -200;
      mockPhysicsInstance.isDead = false;
      runOneFrame();

      expect(document.getElementById('hud-progress-bar').style.width).toBe('100%');
    });
  });

  // ── Retry / navigation buttons ───────────────────────────────────────────

  describe('retry and navigation buttons', () => {
    it('should restart the same level when death retry is clicked', async () => {
      const { buildLevelAsync } = await import('../levelLoader.js');
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      const callCountBefore = buildLevelAsync.mock.calls.length;
      await clickAndFlush('btn-death-retry');

      expect(buildLevelAsync.mock.calls.length).toBeGreaterThan(callCountBefore);
    });

    it('should return to menu when death menu button is clicked', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      await clickAndFlush('btn-death-menu');

      const menuScreen = document.getElementById('menu-screen');
      expect(menuScreen.classList.contains('active')).toBe(true);
    });
  });

  // ── Initialization ──────────────────────────────────────────────────────

  describe('initialization', () => {
    it('should call graphics.init with the canvas container', async () => {
      await loadApp();

      expect(mockGraphicsInstance.init).toHaveBeenCalled();
      const arg = mockGraphicsInstance.init.mock.calls[0][0];
      expect(arg).toBe(document.getElementById('canvas-container'));
    });

    it('should start the animation loop via requestAnimationFrame', async () => {
      await loadApp();

      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });
  });

  // ── Floating Collapsible Physics Calibrator Tests ───────────────────────

  describe('Floating & Collapsible Physics Calibrator', () => {
    it('should toggle physics calibrator panel open and close on btn-settings-physics click', async () => {
      await loadApp();
      
      const panel = document.getElementById('physics-calibrator-screen');
      const btn = document.getElementById('btn-settings-physics');
      
      expect(panel.classList.contains('active')).toBe(false);
      expect(btn.classList.contains('active')).toBe(false);

      // Toggle Open
      await clickAndFlush('btn-settings-physics');
      expect(panel.classList.contains('active')).toBe(true);
      expect(btn.classList.contains('active')).toBe(true);

      // Toggle Close
      await clickAndFlush('btn-settings-physics');
      expect(panel.classList.contains('active')).toBe(false);
      expect(btn.classList.contains('active')).toBe(false);
    });

    it('should close the settings menu and show physics floating panel when settings calibrator button is clicked', async () => {
      await loadApp();
      
      const settingsScreen = document.getElementById('settings-screen');
      const calibratorPanel = document.getElementById('physics-calibrator-screen');
      
      // Open Settings Menu first
      await clickAndFlush('btn-settings-gear');
      expect(settingsScreen.classList.contains('active')).toBe(true);
      
      // Click on PHYSICS CALIBRATOR button in Settings Menu
      await clickAndFlush('btn-settings-calibrator');
      
      // Settings menu should be closed (class active is removed) and calibratorPanel shown (active)
      expect(settingsScreen.classList.contains('active')).toBe(false);
      expect(calibratorPanel.classList.contains('active')).toBe(true);
    });

    it('should close the calibrator panel when btn-calibrator-close is clicked', async () => {
      await loadApp();
      const calibratorPanel = document.getElementById('physics-calibrator-screen');
      
      await clickAndFlush('btn-settings-physics');
      expect(calibratorPanel.classList.contains('active')).toBe(true);
      
      await clickAndFlush('btn-calibrator-close');
      expect(calibratorPanel.classList.contains('active')).toBe(false);
    });

    it('should toggle collapsed class on calibrator-group-card when group-header is clicked', async () => {
      await loadApp();
      
      const header = document.querySelector('#physics-calibrator-screen .group-header');
      const card = header.closest('.calibrator-group-card');
      
      expect(card.classList.contains('collapsed')).toBe(false);
      
      // Click to collapse
      header.click();
      await flushPromises();
      expect(card.classList.contains('collapsed')).toBe(true);
      
      // Click again to expand
      header.click();
      await flushPromises();
      expect(card.classList.contains('collapsed')).toBe(false);
    });

    it('should blur input focus when standard game movement key is pressed on a slider', async () => {
      await loadApp();
      
      const slider = document.getElementById('input-maxSpeedNormal');
      slider.focus();
      expect(document.activeElement).toBe(slider);
      
      // Dispatch standard KeyW keydown event
      const keyWEvent = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true });
      slider.dispatchEvent(keyWEvent);
      await flushPromises();
      
      // Focus should be blurred from the slider (body should get focus)
      expect(document.activeElement).not.toBe(slider);
    });

    it('should save current tuned active preset as baseline default and isolate from other presets', async () => {
      localStorage.clear();

      await loadApp();

      // Open the physics calibrator panel
      await clickAndFlush('btn-settings-physics');

      // Click snappy preset button to select snappy preset
      await clickAndFlush('preset-btn-snappy');

      // Verify snappy is active. Since maxSpeedNormal is a range input, let's change it.
      const maxSpeedInput = document.getElementById('input-maxSpeedNormal');
      expect(maxSpeedInput).not.toBeNull();
      
      // Tune the maxSpeedNormal slider to 45.0
      maxSpeedInput.value = '45';
      maxSpeedInput.dispatchEvent(new Event('input'));
      await flushPromises();

      // Ensure the tuned value is stored in snappy's localStorage active configuration
      const activeSnappyTuned = JSON.parse(localStorage.getItem('skyroads_physics_preset_snappy'));
      expect(activeSnappyTuned.maxSpeedNormal).toBe(45);

      // Verify the baseline default has not been created yet in localStorage
      expect(localStorage.getItem('skyroads_physics_preset_baseline_snappy')).toBeNull();

      // Click "SAVE CURRENT AS DEFAULT" button
      await clickAndFlush('btn-calibrator-save-default');

      // Verify that the baseline default override for snappy is now saved in localStorage
      const snappyBaseline = JSON.parse(localStorage.getItem('skyroads_physics_preset_baseline_snappy'));
      expect(snappyBaseline).not.toBeNull();
      expect(snappyBaseline.maxSpeedNormal).toBe(45);

      // Tune the slider to a different value (e.g. 50) simulating further adjustment
      maxSpeedInput.value = '50';
      maxSpeedInput.dispatchEvent(new Event('input'));
      await flushPromises();

      // Reset the calibrator preset
      await clickAndFlush('btn-calibrator-reset');

      // It should reset to our custom default (45) instead of the factory default (which is not 45)
      const snappyResetConfig = JSON.parse(localStorage.getItem('skyroads_physics_preset_snappy'));
      expect(snappyResetConfig.maxSpeedNormal).toBe(45);
      expect(maxSpeedInput.value).toBe('45');

      // Now verify preset isolation: check that VGA baseline remains unaffected
      expect(localStorage.getItem('skyroads_physics_preset_baseline_vga')).toBeNull();
    });
  });

  // ── Manual Rewind Key / Loop-Break Tests ─────────────────────────────────

  describe('Manual Rewind Key (R / X button)', () => {
    async function startLevel() {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));
    }

    it('should start manual rewinding when rewind is pressed during death state', async () => {
      await startLevel();
      const manager = window.gameManagerInstance;
      manager.rewindEnabled = true;
      manager.gameState = 'death';
      manager.stateHistory = [
        { timestamp: 1000, position: new THREE.Vector3(1, 0, 0), velocity: new THREE.Vector3(0, 0, 0), activeEffects: {} },
        { timestamp: 2000, position: new THREE.Vector3(2, 0, 0), velocity: new THREE.Vector3(0, 0, 0), activeEffects: {} }
      ];

      // Simulate R key pressed
      manager.rewindPressedLastFrame = false;
      manager.keyboard.rewind = true;

      // Run one animate frame while in death state
      manager.animate(3000);

      expect(manager.isRewinding).toBe(true);
      expect(document.querySelector('.rewind-active-overlay')).not.toBeNull();
      // Should have cleared rewindTimeoutId
      expect(manager.rewindTimeoutId).toBeNull();
    });

    it('should step backwards through history during active rewind', async () => {
      await startLevel();
      const manager = window.gameManagerInstance;
      manager.physics.difficulty = 'easy';
      manager.rewindBudgetMax = Infinity;
      manager.rewindBudget = Infinity;
      manager.rewindEnabled = true;
      manager.gameState = 'death';
      manager.stateHistory = Array.from({ length: 10 }, (_, i) => ({
        timestamp: (i + 1) * 1000,
        position: new THREE.Vector3(i, 0, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        activeEffects: {}
      }));

      // Press and hold R key
      manager.rewindPressedLastFrame = false;
      manager.keyboard.rewind = true;
      manager.animate(11000); // Trigger rewind starts

      expect(manager.isRewinding).toBe(true);
      // Starts at 9, but immediately steps backwards 3 steps on the first animate frame, ending at 6
      expect(manager.rewindHistoryIndex).toBe(6);
      expect(manager.physics.position.x).toBe(6);

      // Run another frame holding R
      manager.rewindPressedLastFrame = true;
      manager.animate(12000);

      // Decrements by another 3 steps per frame, ending at 3
      expect(manager.rewindHistoryIndex).toBe(3);
      expect(manager.physics.position.x).toBe(3);
    });

    it('should finish rewinding and resume gameplay when rewind key is released', async () => {
      await startLevel();
      const manager = window.gameManagerInstance;
      manager.rewindEnabled = true;
      manager.gameState = 'death';
      manager.stateHistory = [
        { timestamp: 1000, position: new THREE.Vector3(1, 0, 0), velocity: new THREE.Vector3(0, 0, 0), activeEffects: {} },
        { timestamp: 2000, position: new THREE.Vector3(2, 0, 0), velocity: new THREE.Vector3(0, 0, 0), activeEffects: {} }
      ];

      // Start rewind
      manager.rewindPressedLastFrame = false;
      manager.keyboard.rewind = true;
      manager.animate(3000);
      expect(manager.isRewinding).toBe(true);

      // Release rewind key
      manager.rewindPressedLastFrame = true;
      manager.keyboard.rewind = false;
      manager.animate(4000);

      expect(manager.isRewinding).toBe(false);
      expect(document.querySelector('.rewind-active-overlay')).toBeNull();
      expect(manager.gameState).toBe('playing');
    });
  });

  // ── Level Scoring and Leaderboard Tests ───────────────────────────────────

  describe('Level Scoring and Leaderboards', () => {
    async function startAndGetFrameRunner() {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));
    }

    function runOneFrame() {
      const lastCall = window.requestAnimationFrame.mock.calls;
      const rafCallback = lastCall[lastCall.length - 1]?.[0];
      if (rafCallback) {
        performance.now.mockReturnValue(16);
        rafCallback(16);
      }
    }

    it('should calculate and display real-time score correctly on updateHUD', async () => {
      await startAndGetFrameRunner();
      
      // Test at standard easy difficulty (multiplier 1.0)
      mockPhysicsInstance.difficulty = 'easy';
      mockPhysicsInstance.position.set(0, 0.2, -20);
      mockPhysicsInstance.isDead = false;
      
      const manager = window.gameManagerInstance;
      manager.wallHits = 1;
      
      runOneFrame();
      
      // distanceScore = 20 * 100 = 2000
      // collisionPenalty = 1 * 800 = 800
      // liveScore = Math.max(0, 2000 * 1.0 - 800) = 1200
      expect(document.getElementById('hud-score-text').innerText).toBe('001200');
    });

    it('should scale live score correctly based on difficulty multiplier', async () => {
      await startAndGetFrameRunner();
      
      // Test at normal difficulty (multiplier 1.5)
      mockPhysicsInstance.difficulty = 'normal';
      mockPhysicsInstance.position.set(0, 0.2, -30);
      mockPhysicsInstance.isDead = false;
      
      const manager = window.gameManagerInstance;
      manager.wallHits = 2;
      
      runOneFrame();
      
      // distanceScore = 30 * 100 = 3000
      // collisionPenalty = 2 * 800 = 1600
      // liveScore = Math.max(0, 3000 * 1.5 - 1600) = 4500 - 1600 = 2900
      expect(document.getElementById('hud-score-text').innerText).toBe('002900');
    });

    it('should compute accurate score breakdown at level completion', async () => {
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      const manager = window.gameManagerInstance;
      expect(manager).not.toBeNull();

      // Configure mock level run metrics
      manager.totalTime = 4.0;
      manager.speedAccumulator = 300;
      manager.speedTicks = 10;
      manager.wallHits = 0;
      mockPhysicsInstance.difficulty = 'normal'; // multiplier 1.5

      // Call handleSuccess directly to process score calculations and populate DOM
      manager.handleSuccess();

      // Verify the success screen is active
      const successScreen = document.getElementById('success-screen');
      expect(successScreen.classList.contains('active')).toBe(true);

      // Verify exact calculations in the DOM
      // avgSpeedKmh = 300; speedBonus = 300 * 150 = 45000;
      // targetTime = 100 / 18 = 5.5555...; timeBonus = (5.5555... - 4) * 300 = 466;
      // perfectBonus = 5000; raw = 10000 + 45000 + 466 + 5000 = 60466;
      // final = Math.floor(60466 * 1.5) = 90699;
      expect(document.getElementById('score-val-time').innerText).toBe('4.00s');
      expect(document.getElementById('score-val-speed').innerText).toBe('300 km/h');
      expect(document.getElementById('score-val-collisions').innerText).toBe('0');
      expect(document.getElementById('score-val-speed-bonus').innerText).toBe('+45,000');
      expect(document.getElementById('score-val-time-bonus').innerText).toBe('+466');
      expect(document.getElementById('score-val-penalty').innerText).toBe('-0');
      expect(document.getElementById('score-row-perfect-bonus').style.display).toBe('flex');
      expect(document.getElementById('score-val-final').innerText).toBe('090699');
    });

    it('should save score to leaderboard on submit, sort top 5, highlight entry, and save personal best', async () => {
      localStorage.clear();
      await loadApp();
      await clickAndFlush('btn-play-standard');
      const grid = document.getElementById('level-grid');
      await clickElementAndFlush(grid.querySelector('.level-item'));

      const manager = window.gameManagerInstance;
      manager.totalTime = 10.0;
      manager.speedAccumulator = 100;
      manager.speedTicks = 10;
      manager.wallHits = 1;
      mockPhysicsInstance.difficulty = 'easy'; // mult 1.0

      // Call handleSuccess directly
      manager.handleSuccess();

      // base 10000 + speed 15000 + time 0 - penalty 800 + perfect 0 = 24200 * 1.0 = 24200
      expect(document.getElementById('score-val-final').innerText).toBe('024200');

      // Populate initials
      const input = document.getElementById('input-score-initials');
      input.value = 'WIN';
      
      // Submit score
      await clickAndFlush('btn-score-submit');

      // Verify localStorage entries
      const leaderboardKey = `skyroads_leaderboard_standard_0`;
      const leaderboard = JSON.parse(localStorage.getItem(leaderboardKey));
      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].initials).toBe('WIN');
      expect(leaderboard[0].score).toBe(24200);

      // Verify personal best badge was updated in localStorage
      const bestScoreKey = `skyroads_best_score_standard_0`;
      expect(localStorage.getItem(bestScoreKey)).toBe('24200');

      // Submit a lower score to test sorting and top 5 preservation
      manager.wallHits = 5; // higher penalty -> lower score
      manager.handleSuccess();
      
      input.value = 'LOS';
      await clickAndFlush('btn-score-submit');

      const updatedLeaderboard = JSON.parse(localStorage.getItem(leaderboardKey));
      expect(updatedLeaderboard).toHaveLength(2);
      expect(updatedLeaderboard[0].initials).toBe('WIN'); // Higher score first
      expect(updatedLeaderboard[1].initials).toBe('LOS'); // Lower score second

      // Personal best should still remain WIN's score since it was higher
      expect(localStorage.getItem(bestScoreKey)).toBe('24200');
    });
  });
});
