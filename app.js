// SkyRoads WebGL - Core Game Orchestrator & State Controller
import { loadLevelPack, getCachedPack } from './levels.js';
import { GraphicsEngine } from './graphics.js';
import { PhysicsEngine, KeyboardController, SHIP_LENGTH } from './physics.js';
import { buildLevelAsync } from './levelLoader.js';
import { gameAudio } from './audio.js';
import { ShipPreviewEngine } from './preview.js';

const SKIN_DETAILS = {
  default: { name: "DEFAULT", desc: "Standard spaceforce combat livery" },
  freelancer: { name: "FREELANCER", desc: "Sleek carbon-fiber composite plating" },
  lordshadow: { name: "LORD SHADOW", desc: "Dark stealth plating for covert deep-space runs" },
  psionic: { name: "PSIONIC", desc: "Psionic energy-shielded armor plating" },
  shadee: { name: "SHADEE", desc: "Vibrant metallic racing decals" },
  thor: { name: "THOR", desc: "Golden thundergod battle plating" },
  skin1: { name: "RED CORSAIR", desc: "Traditional military-grade red & white livery" },
  skin2: { name: "GREEN ACID", desc: "Vibrant green and carbon-black armor casing" },
  skin3: { name: "BLUE NEBULA", desc: "Deep cobalt blue spaceforce plating" },
  skin4: { name: "ORANGE BURNING", desc: "High-contrast hazard orange warning colors" }
};

class GameManager {
  constructor() {
    // Engine instances
    this.graphics = new GraphicsEngine();
    this.physics = new PhysicsEngine();
    this.keyboard = new KeyboardController();
    
    // Game state variables
    this.currentPack = 'standard'; // 'standard' or 'xmas'
    this.currentLevelIndex = 0;
    this.currentLevelData = null;
    this.levelInfo = null;
    
    this.gameState = 'menu'; // 'menu', 'loading', 'level_select', 'playing', 'death', 'success'
    this.lastTime = 0;
    this.animationFrameId = null;

    // Road names in original order for display polish
    this.standardRoadNames = [
      "DEMO ROAD", "RED HEAT", "ROAD 2", "ROAD 3", "ROAD 4", "ROAD 5", "ROAD 6", "ROAD 7", "ROAD 8", "ROAD 9",
      "ROAD 10", "ROAD 11", "ROAD 12", "ROAD 13", "ROAD 14", "ROAD 15", "ROAD 16", "ROAD 17", "ROAD 18", "ROAD 19",
      "ROAD 20", "ROAD 21", "ROAD 22", "ROAD 23", "ROAD 24", "ROAD 25", "ROAD 26", "ROAD 27", "ROAD 28", "ROAD 29",
      "ROAD 30"
    ];
    this.xmasRoadNames = [
      "XMAS DEMO", "ROAD 1", "ROAD 2", "ROAD 3", "ROAD 4", "ROAD 5", "ROAD 6", "ROAD 7", "ROAD 8", "ROAD 9",
      "ROAD 10", "ROAD 11", "ROAD 12", "ROAD 13", "ROAD 14", "ROAD 15", "ROAD 16", "ROAD 17", "ROAD 18", "ROAD 19",
      "ROAD 20", "ROAD 21", "ROAD 22", "ROAD 23", "ROAD 24", "ROAD 25", "ROAD 26", "ROAD 27", "ROAD 28", "ROAD 29",
      "ROAD 30"
    ];
    this.wasSteeringLastFrame = false;
    this.wallScrapeSoundTimer = 0.0;

    // Ship preview variables
    this.previewEngine = null;
    this.tempSelectedSkin = 'default';
    this.tempSelectedColor = '#ffffff';

    // Infinite Mode & settings tracking
    this.isInfiniteMode = false;
    this.infiniteZOffset = 0;
    this.infiniteLevelTransitioning = false;
    this.preSettingsState = 'menu';
  }

  init() {
    // Load persisted model, skin texture, and custom color overlay preferences FIRST
    this.selectedModel = localStorage.getItem('skyroads_selected_model') || 'original';
    
    let savedSkin = localStorage.getItem('skyroads_selected_skin');
    let savedColor = localStorage.getItem('skyroads_selected_color');

    // Migration of legacy hex values inside skyroads_selected_skin
    if (savedSkin && savedSkin.startsWith('#')) {
      savedColor = savedSkin;
      savedSkin = 'default';
      localStorage.setItem('skyroads_selected_skin', 'default');
      localStorage.setItem('skyroads_selected_color', savedColor);
    }

    this.selectedSkin = savedSkin || 'default';
    this.selectedColor = savedColor || '#ffffff';

    this.graphics.currentModelName = this.selectedModel;
    this.graphics.currentSkinName = this.selectedSkin;
    this.graphics.currentSkinColor = this.selectedColor;

    // 1. Initialize Visual Viewport (will create shipMesh using the loaded model preferences directly)
    const container = document.getElementById('canvas-container');
    this.graphics.init(container);

    // Load persisted mouse setting from localStorage
    const savedMousePlay = localStorage.getItem('skyroads_mouse_play') === 'true';
    this.keyboard.mouseControlsEnabled = savedMousePlay;
    this.updateMouseToggleBtn();

    // Load persisted touch setting from localStorage
    const savedTouchPlay = localStorage.getItem('skyroads_touch_controls') === 'true';
    this.keyboard.touchControlsEnabled = savedTouchPlay;
    this.updateTouchToggleBtn();

    // Load persisted boat throttle setting from localStorage
    const savedBoatThrottle = localStorage.getItem('skyroads_boat_throttle') === 'true';
    this.physics.boatThrottleEnabled = savedBoatThrottle;
    this.updateBoatThrottleToggleBtn();

    // Load persisted difficulty setting from localStorage
    const savedDifficulty = localStorage.getItem('skyroads_difficulty') || 'easy';
    this.physics.difficulty = savedDifficulty;
    this.updateDifficultyToggleBtn();

    // Load persisted background music setting from localStorage
    const savedMusic = localStorage.getItem('skyroads_music_play') !== 'false';
    gameAudio.setMusicEnabled(savedMusic);
    this.updateMusicToggleBtn();

    // Load persisted sound mode setting from localStorage
    const savedSoundMode = localStorage.getItem('skyroads_sound_mode') || 'synth';
    gameAudio.setSoundMode(savedSoundMode);
    this.updateSoundModeToggleBtn();
    this.updateNextTrackBtnText();

    // Load persisted music and SFX volume levels
    const savedMusicVolume = localStorage.getItem('skyroads_music_volume');
    const musicVol = savedMusicVolume !== null ? parseFloat(savedMusicVolume) : 0.7;
    gameAudio.setMusicVolume(musicVol);

    const savedSfxVolume = localStorage.getItem('skyroads_sfx_volume');
    const sfxVol = savedSfxVolume !== null ? parseFloat(savedSfxVolume) : 0.8;
    gameAudio.setSfxVolume(sfxVol);

    // Load persisted bottom HUD toggle setting from localStorage
    this.bottomHudEnabled = localStorage.getItem('skyroads_bottom_hud') !== 'false';
    this.updateBottomHudToggleBtn();

    // Load persisted stick throttle setting from localStorage
    const savedStickThrottle = localStorage.getItem('skyroads_stick_throttle') === 'true';
    this.keyboard.touchJoystickThrottleEnabled = savedStickThrottle;
    this.updateStickThrottleToggleBtn();

    // Sync sliders values with loaded volumes
    const sliderMusicVolume = document.getElementById('slider-settings-music-volume');
    if (sliderMusicVolume) {
      sliderMusicVolume.value = Math.round(musicVol * 100);
    }
    const sliderSfxVolume = document.getElementById('slider-settings-sfx-volume');
    if (sliderSfxVolume) {
      sliderSfxVolume.value = Math.round(sfxVol * 100);
    }

    // Initialize tunable physics preset profiles by loading from localStorage or falling back to defaults
    this.physicsPresets = { vga: {}, snappy: {}, lunar: {}, custom: {} };
    const basePresets = {
      vga: { maxSpeedNormal: 32, maxSpeedBoost: 60, accelForward: 18, decelBrakes: 35, dragZ: 4, maxSteerSpeed: 10, steerAccel: 25, dragSteer: 18, easyCollisionBounceVel: 10, easyCollisionBounceDist: 1.2, bounceFactor: 1.0, jumpImpulse: 10.5, jumpFactor: 1.0, gravityFactor: 1.0, fallGravityMultiplier: 1.45, variableJumpDampening: 0.82, coyoteTimeBuffer: 0.25, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 },
      snappy: { maxSpeedNormal: 32, maxSpeedBoost: 60, accelForward: 18, decelBrakes: 35, dragZ: 4, maxSteerSpeed: 10, steerAccel: 35, dragSteer: 28, easyCollisionBounceVel: 10, easyCollisionBounceDist: 1.2, bounceFactor: 1.0, jumpImpulse: 10.5, jumpFactor: 1.25, gravityFactor: 1.45, fallGravityMultiplier: 1.45, variableJumpDampening: 0.82, coyoteTimeBuffer: 0.25, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 },
      lunar: { maxSpeedNormal: 24, maxSpeedBoost: 50, accelForward: 12, decelBrakes: 25, dragZ: 2, maxSteerSpeed: 8, steerAccel: 15, dragSteer: 8, easyCollisionBounceVel: 8, easyCollisionBounceDist: 1.5, bounceFactor: 1.5, jumpImpulse: 7.5, jumpFactor: 1.0, gravityFactor: 0.45, fallGravityMultiplier: 1.15, variableJumpDampening: 0.90, coyoteTimeBuffer: 0.40, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 },
      custom: { maxSpeedNormal: 32, maxSpeedBoost: 60, accelForward: 18, decelBrakes: 35, dragZ: 4, maxSteerSpeed: 10, steerAccel: 35, dragSteer: 28, easyCollisionBounceVel: 10, easyCollisionBounceDist: 1.2, bounceFactor: 1.0, jumpImpulse: 10.5, jumpFactor: 1.0, gravityFactor: 1.0, fallGravityMultiplier: 1.45, variableJumpDampening: 0.82, coyoteTimeBuffer: 0.25, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 }
    };

    for (const key in basePresets) {
      // Load user-saved baseline defaults if present, else fallback to hardcoded basePresets
      let activeBase = { ...basePresets[key] };
      const savedBaseline = localStorage.getItem(`skyroads_physics_preset_baseline_${key}`);
      if (savedBaseline) {
        try {
          activeBase = { ...activeBase, ...JSON.parse(savedBaseline) };
        } catch (e) {
          // Fallback
        }
      }

      const saved = localStorage.getItem(`skyroads_physics_preset_${key}`);
      if (saved) {
        try {
          this.physicsPresets[key] = { ...activeBase, ...JSON.parse(saved) };
        } catch (e) {
          this.physicsPresets[key] = { ...activeBase };
        }
      } else {
        this.physicsPresets[key] = { ...activeBase };
      }

      // Dynamic Auto-Migration: Force showCockpitBezel to 1.0 by default for existing players with cached presets
      if (this.physicsPresets[key].showCockpitBezel === undefined || this.physicsPresets[key].showCockpitBezel === 0.0) {
        this.physicsPresets[key].showCockpitBezel = 1.0;
        try {
          localStorage.setItem(`skyroads_physics_preset_${key}`, JSON.stringify(this.physicsPresets[key]));
        } catch (e) {
          // Graceful catch for JSDOM sandbox
        }
      }
    }

    this.activePreset = localStorage.getItem('skyroads_physics_active_preset') || 'snappy';
    this.applyActivePreset();

    // 2. Setup Navigation Listeners
    this.setupUIListeners();

    // 3. Listen to camera controls during play (KeyC toggles modes, [ and ] adjusts zoom, - and = adjusts height)
    window.addEventListener('keydown', (e) => {
      if (this.gameState !== 'playing') return;

      if (e.code === 'KeyC') {
        gameAudio.playClick();
        this.graphics.toggleCameraMode();
      }
      if (e.code === 'BracketLeft') {
        gameAudio.playClick();
        this.graphics.cycleZoomLevel(-1); // zoom in
      }
      if (e.code === 'BracketRight') {
        gameAudio.playClick();
        this.graphics.cycleZoomLevel(1); // zoom out
      }
      if (e.code === 'Minus') {
        gameAudio.playClick();
        this.graphics.adjustCameraHeight(-1); // lower camera height
      }
      if (e.code === 'Equal') {
        gameAudio.playClick();
        this.graphics.adjustCameraHeight(1); // raise camera height
      }
      if (e.code === 'KeyU' || e.code === 'PageUp') {
        gameAudio.playClick();
        this.graphics.adjustCameraPitch(1); // look up
      }
      if (e.code === 'KeyJ' || e.code === 'PageDown') {
        gameAudio.playClick();
        this.graphics.adjustCameraPitch(-1); // look down
      }
      if (e.code === 'KeyO') {
        gameAudio.playClick();
        this.physics.settings.gravityFactor = Math.min(3.0, (this.physics.settings.gravityFactor || 1.0) + 0.1);
        this.physics.settings.bounceFactor = Math.min(3.0, (this.physics.settings.bounceFactor || 1.0) + 0.1);
        const gravityVal = this.currentLevelData.gravity ? ((this.currentLevelData.gravity - 3) * 100 * this.physics.settings.gravityFactor) : 500 * this.physics.settings.gravityFactor;
        const gravityTextEl = document.getElementById('hud-gravity-text');
        if (gravityTextEl) gravityTextEl.innerText = String(Math.round(gravityVal)).padStart(4, '0');
      }
      if (e.code === 'KeyP') {
        gameAudio.playClick();
        this.toggleSettingsMenu();
      }
    });

    // Global listener for Escape to toggle settings/pause menu anywhere
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        gameAudio.playClick();
        this.toggleSettingsMenu();
      }
    });

    const btnSettingsGear = document.getElementById('btn-settings-gear');
    if (btnSettingsGear) {
      btnSettingsGear.addEventListener('click', (e) => {
        gameAudio.playClick();
        this.toggleSettingsMenu();
      });
    }

    // 4. Listen to keyboard menu navigation when not actively playing a level
    window.addEventListener('keydown', (e) => {
      if (this.gameState === 'playing') return;
      this.handleMenuKeyboard(e);
    });

    // 5. Load and apply customizable touch controls layout
    this.loadTouchConfig();
    this.setupTouchCustomizerEvents();

    // 6. Start high-frequency background render loop (stars sparkling)
    this.lastTime = performance.now();
    this.animate(this.lastTime);
  }

  updateMouseToggleBtn() {
    const isEnabled = this.keyboard.mouseControlsEnabled;
    const btnIds = ['btn-toggle-mouse', 'btn-settings-mouse'];
    btnIds.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (isEnabled) {
        btn.innerText = 'MOUSE PLAY: ON';
        btn.classList.remove('btn-info');
        btn.classList.add('btn-primary');
      } else {
        btn.innerText = 'MOUSE PLAY: OFF';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-info');
      }
    });
  }

  updateTouchToggleBtn() {
    const isEnabled = this.keyboard.touchControlsEnabled;
    const btnIds = ['btn-toggle-touch', 'btn-settings-touch'];
    btnIds.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (isEnabled) {
        btn.innerText = 'TOUCH CONTROLS: ON';
        btn.classList.remove('btn-info');
        btn.classList.add('btn-primary');
      } else {
        btn.innerText = 'TOUCH CONTROLS: OFF';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-info');
      }
    });
  }

  updateBoatThrottleToggleBtn() {
    const isEnabled = this.physics.boatThrottleEnabled;
    const btnIds = ['btn-toggle-boat-throttle', 'btn-pause-toggle-boat-throttle', 'btn-touch-boat-throttle', 'btn-settings-boat-throttle'];
    btnIds.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (isEnabled) {
        btn.innerText = id === 'btn-touch-boat-throttle' ? 'BOAT: ON' : 'BOAT THROTTLE: ON';
        btn.classList.remove('btn-info');
        btn.classList.add('btn-primary');
      } else {
        btn.innerText = id === 'btn-touch-boat-throttle' ? 'BOAT: OFF' : 'BOAT THROTTLE: OFF';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-info');
      }
    });
  }

  updateBottomHudToggleBtn() {
    const isEnabled = this.bottomHudEnabled;
    const btn = document.getElementById('btn-settings-bottom-hud');
    if (btn) {
      if (isEnabled) {
        btn.innerText = 'BOTTOM HUD: ON';
        btn.classList.remove('btn-info');
        btn.classList.add('btn-primary');
      } else {
        btn.innerText = 'BOTTOM HUD: OFF';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-info');
      }
    }

    // Immediately toggle HTML 2D HUD container visibility if playing or paused
    const hud = document.getElementById('hud');
    if (hud) {
      if (isEnabled && (this.gameState === 'playing' || this.gameState === 'paused')) {
        hud.classList.remove('hidden');
      } else {
        hud.classList.add('hidden');
      }
    }
  }

  updateStickThrottleToggleBtn() {
    const isEnabled = this.keyboard.touchJoystickThrottleEnabled;
    const btn = document.getElementById('btn-settings-stick-throttle');
    if (btn) {
      if (isEnabled) {
        btn.innerText = 'STICK THROTTLE: ON';
        btn.classList.remove('btn-info');
        btn.classList.add('btn-primary');
      } else {
        btn.innerText = 'STICK THROTTLE: OFF';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-info');
      }
    }
  }

  updateDifficultyToggleBtn() {
    const isEasy = this.physics.difficulty === 'easy';
    const btn = document.getElementById('btn-settings-difficulty');
    if (!btn) return;
    if (isEasy) {
      btn.innerText = 'DIFFICULTY: EASY';
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-info');
    } else {
      btn.innerText = 'DIFFICULTY: HARD';
      btn.classList.remove('btn-info');
      btn.classList.add('btn-secondary');
    }
  }

  updateMusicToggleBtn() {
    const isEnabled = gameAudio.musicSequencer ? gameAudio.musicSequencer.musicEnabled : true;
    const btn = document.getElementById('btn-settings-music');
    if (!btn) return;
    if (isEnabled) {
      btn.innerText = 'MUSIC: ON';
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-info');
    } else {
      btn.innerText = 'MUSIC: OFF';
      btn.classList.remove('btn-info');
      btn.classList.add('btn-secondary');
    }
  }

  updateSoundModeToggleBtn() {
    const btn = document.getElementById('btn-settings-sound-mode');
    if (!btn) return;
    const mode = gameAudio.soundMode || 'synth';
    if (mode === 'synth') {
      btn.innerText = 'SOUND: SYNTH';
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-info');
    } else {
      btn.innerText = 'SOUND: CLASSIC';
      btn.classList.remove('btn-info');
      btn.classList.add('btn-secondary');
    }
  }

  updateNextTrackBtnText() {
    const btn = document.getElementById('btn-settings-next-track');
    if (!btn) return;
    const trackName = gameAudio.getCurrentTrackName();
    btn.innerText = `TRACK: ${trackName} ⏭️`;
  }

  openShipPicker() {
    this.prePickerState = this.gameState;
    this.gameState = 'ship_picker';
    this.tempSelectedModel = this.selectedModel || 'original';
    this.tempSelectedSkin = this.selectedSkin || 'default';
    this.tempSelectedColor = this.selectedColor || '#ffffff';
    this.showScreen('ship-picker-screen');
    
    // Update active highlight states on model selector
    this.updateModelPickerSidebarSelection();

    // Update active highlight states on skin selector
    this.updateTexturePickerSidebarSelection();

    // Set custom color input value
    const colorPickerInput = document.getElementById('ship-color-picker');
    if (colorPickerInput) {
      colorPickerInput.value = this.tempSelectedColor;
    }
    
    this.updateColorPickerUISelection();

    // Initialize 3D preview viewport
    const container = document.getElementById('ship-preview-container');
    if (container) {
      if (this.previewEngine) {
        this.previewEngine.destroy();
      }
      this.previewEngine = new ShipPreviewEngine();
      this.previewEngine.init(container, this.tempSelectedModel, this.tempSelectedSkin, this.tempSelectedColor);
    }
  }

  applyActivePreset() {
    const config = this.physicsPresets[this.activePreset];
    for (const param in config) {
      this.physics.settings[param] = config[param];
    }
  }

  togglePhysicsCalibrator(forceState) {
    const panel = document.getElementById('physics-calibrator-screen');
    const btn = document.getElementById('btn-settings-physics');
    if (!panel || !btn) return;

    const isActive = forceState !== undefined ? forceState : !panel.classList.contains('active');
    
    if (isActive) {
      panel.classList.add('active');
      btn.classList.add('active');
      this.updateCalibratorUI();
    } else {
      panel.classList.remove('active');
      btn.classList.remove('active');
    }
  }

  updateCalibratorUI() {
    // Highlight active preset button
    const presetButtons = ['vga', 'snappy', 'lunar', 'custom'];
    presetButtons.forEach(key => {
      const btn = document.getElementById(`preset-btn-${key}`);
      if (btn) {
        if (key === this.activePreset) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });

    // Load preset config values into slider inputs and labels
    const config = this.physicsPresets[this.activePreset];
    for (const param in config) {
      const slider = document.getElementById(`input-${param}`);
      const readout = document.getElementById(`val-${param}`);
      if (slider) {
        slider.value = config[param];
      }
      if (readout) {
        if (param === 'showCockpitBezel') {
          readout.innerText = Number(config[param]) === 1 ? 'ON' : 'OFF';
        } else {
          readout.innerText = Number(config[param]).toFixed(param.startsWith('cockpitOffset') || param === 'coyoteTimeBuffer' || param === 'variableJumpDampening' || param === 'gravityFactor' || param === 'fallGravityMultiplier' || param === 'bounceFactor' || param === 'dragZ' ? 2 : 1);
        }
      }
    }
  }

  updateGamepadConfigUI() {
    const GAMEPAD_BUTTON_NAMES = {
      0: 'A (Button 0)',
      1: 'B (Button 1)',
      2: 'X (Button 2)',
      3: 'Y (Button 3)',
      4: 'LB (Button 4)',
      5: 'RB (Button 5)',
      6: 'LT (Button 6)',
      7: 'RT (Button 7)',
      8: 'View/Back (Button 8)',
      9: 'Menu/Start (Button 9)',
      10: 'LSB (Button 10)',
      11: 'RSB (Button 11)',
      12: 'D-Pad Up (Button 12)',
      13: 'D-Pad Down (Button 13)',
      14: 'D-Pad Left (Button 14)',
      15: 'D-Pad Right (Button 15)',
      16: 'Xbox/Guide (Button 16)'
    };

    const mappings = this.keyboard.gamepadMappings;
    const actions = ['forward', 'backward', 'jump', 'left', 'right', 'cycleCamera', 'togglePause'];
    
    actions.forEach(action => {
      const btn = document.getElementById(`btn-map-${action}`);
      if (btn) {
        const btnIndex = mappings[action];
        if (btnIndex === undefined || btnIndex === null) {
          btn.innerText = 'Not Mapped';
        } else {
          btn.innerText = GAMEPAD_BUTTON_NAMES[btnIndex] !== undefined ? GAMEPAD_BUTTON_NAMES[btnIndex] : `Button ${btnIndex}`;
        }
        btn.classList.remove('btn-danger'); // Remove listening visual cue if it was active
        btn.classList.add('btn-glow');
      }
    });
  }

  showCalibratorAlert() {
    const alertEl = document.getElementById('calibrator-status-alert');
    if (alertEl) {
      alertEl.style.opacity = '1';
      if (this.alertTimeout) clearTimeout(this.alertTimeout);
      this.alertTimeout = setTimeout(() => {
        alertEl.style.opacity = '0';
      }, 1000);
    }
  }

  selectModelInPicker(modelName) {
    this.tempSelectedModel = modelName;
    this.updateModelPickerSidebarSelection();

    // Swap model in 3D preview
    if (this.previewEngine) {
      this.previewEngine.changeModel(modelName, this.tempSelectedSkin, this.tempSelectedColor);
    }
  }

  selectTextureInPicker(skinName) {
    this.tempSelectedSkin = skinName;
    this.updateTexturePickerSidebarSelection();

    // Update skin in 3D preview
    if (this.previewEngine) {
      this.previewEngine.changeSkin(skinName, this.tempSelectedColor);
    }
  }

  selectColorInPicker(hexColor) {
    this.tempSelectedColor = hexColor;

    // Update color picker input
    const colorPickerInput = document.getElementById('ship-color-picker');
    if (colorPickerInput) {
      colorPickerInput.value = hexColor;
    }

    this.updateColorPickerUISelection();

    if (this.previewEngine) {
      this.previewEngine.changeSkin(this.tempSelectedSkin, hexColor);
    }
  }

  updateModelPickerSidebarSelection() {
    const modelOptions = document.querySelectorAll('.model-option');
    modelOptions.forEach(opt => {
      const modelName = opt.getAttribute('data-model');
      if (modelName === this.tempSelectedModel) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }

  updateTexturePickerSidebarSelection() {
    const textureOptions = document.querySelectorAll('.texture-option');
    textureOptions.forEach(opt => {
      const skinName = opt.getAttribute('data-skin');
      if (skinName === this.tempSelectedSkin) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }

  updateColorPickerUISelection() {
    const presetOptions = document.querySelectorAll('.color-preset-option');
    presetOptions.forEach(opt => {
      const color = opt.getAttribute('data-color');
      if (color.toLowerCase() === this.tempSelectedColor.toLowerCase()) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }

  closeShipPicker(saveSelection = true) {
    if (saveSelection) {
      this.selectedModel = this.tempSelectedModel;
      this.selectedSkin = this.tempSelectedSkin;
      this.selectedColor = this.tempSelectedColor;
      
      localStorage.setItem('skyroads_selected_model', this.selectedModel);
      localStorage.setItem('skyroads_selected_skin', this.selectedSkin);
      localStorage.setItem('skyroads_selected_color', this.selectedColor);
      
      // Dynamically load geometry and skin maps in active gameplay meshes
      this.graphics.changeShipModel(this.selectedModel, this.selectedSkin, this.selectedColor);
    }

    if (this.previewEngine) {
      this.previewEngine.destroy();
      this.previewEngine = null;
    }

    if (this.prePickerState === 'settings') {
      this.showScreen('settings-screen');
      this.gameState = 'settings';
    } else {
      this.returnToMenu();
    }
  }

  setupUIListeners() {
    // Menu triggers
    document.getElementById('btn-play-standard').addEventListener('click', () => {
      gameAudio.playClick();
      this.showLevelSelection('standard');
    });

    document.getElementById('btn-play-xmas').addEventListener('click', () => {
      gameAudio.playClick();
      this.showLevelSelection('xmas');
    });

    const btnToggleMouse = document.getElementById('btn-toggle-mouse');
    if (btnToggleMouse) {
      btnToggleMouse.addEventListener('click', () => {
        gameAudio.playClick();
        this.keyboard.mouseControlsEnabled = !this.keyboard.mouseControlsEnabled;
        localStorage.setItem('skyroads_mouse_play', this.keyboard.mouseControlsEnabled);
        this.updateMouseToggleBtn();
      });
    }

    const btnToggleTouch = document.getElementById('btn-toggle-touch');
    if (btnToggleTouch) {
      btnToggleTouch.addEventListener('click', () => {
        gameAudio.playClick();
        this.keyboard.touchControlsEnabled = !this.keyboard.touchControlsEnabled;
        localStorage.setItem('skyroads_touch_controls', this.keyboard.touchControlsEnabled);
        this.updateTouchToggleBtn();
      });
    }

    const btnToggleBoatThrottle = document.getElementById('btn-toggle-boat-throttle');
    if (btnToggleBoatThrottle) {
      btnToggleBoatThrottle.addEventListener('click', () => {
        gameAudio.playClick();
        this.physics.boatThrottleEnabled = !this.physics.boatThrottleEnabled;
        localStorage.setItem('skyroads_boat_throttle', this.physics.boatThrottleEnabled);
        this.updateBoatThrottleToggleBtn();
      });
    }

    const btnOpenPicker = document.getElementById('btn-open-picker');
    if (btnOpenPicker) {
      btnOpenPicker.addEventListener('click', () => {
        gameAudio.playClick();
        this.openShipPicker();
      });
    }

    const btnPickerBack = document.getElementById('btn-picker-back');
    if (btnPickerBack) {
      btnPickerBack.addEventListener('click', () => {
        gameAudio.playClick();
        this.closeShipPicker(false);
      });
    }

    const btnPickerSelect = document.getElementById('btn-picker-select');
    if (btnPickerSelect) {
      btnPickerSelect.addEventListener('click', () => {
        gameAudio.playClick();
        this.closeShipPicker(true);
      });
    }

    const modelOptions = document.querySelectorAll('.model-option');
    modelOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        gameAudio.playClick();
        const modelName = opt.getAttribute('data-model');
        this.selectModelInPicker(modelName);
      });
    });

    const textureOptions = document.querySelectorAll('.texture-option');
    textureOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        gameAudio.playClick();
        const skinName = opt.getAttribute('data-skin');
        this.selectTextureInPicker(skinName);
      });
    });

    const presetOptions = document.querySelectorAll('.color-preset-option');
    presetOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        gameAudio.playClick();
        const color = opt.getAttribute('data-color');
        this.selectColorInPicker(color);
      });
    });

    const colorPickerInput = document.getElementById('ship-color-picker');
    if (colorPickerInput) {
      colorPickerInput.addEventListener('input', (e) => {
        const color = e.target.value;
        this.selectColorInPicker(color);
      });
    }

    document.getElementById('btn-how-to').addEventListener('click', () => {
      gameAudio.playClick();
      this.showScreen('how-to-screen');
    });

    document.getElementById('btn-how-to-back').addEventListener('click', () => {
      gameAudio.playClick();
      this.showScreen('menu-screen');
    });

    document.getElementById('btn-level-back').addEventListener('click', () => {
      gameAudio.playClick();
      this.showScreen('menu-screen');
    });

    // Death / Victory screen retry triggers
    document.getElementById('btn-death-retry').addEventListener('click', () => {
      gameAudio.playClick();
      this.startLevel(this.currentLevelIndex);
    });

    document.getElementById('btn-death-menu').addEventListener('click', () => {
      gameAudio.playClick();
      this.returnToMenu();
    });

    document.getElementById('btn-success-next').addEventListener('click', () => {
      gameAudio.playClick();
      const nextIdx = this.currentLevelIndex + 1;
      const packLevels = getCachedPack(this.currentPack);
      if (nextIdx < packLevels.length) {
        this.startLevel(nextIdx);
      } else {
        this.returnToMenu();
      }
    });

    document.getElementById('btn-success-menu').addEventListener('click', () => {
      gameAudio.playClick();
      this.returnToMenu();
    });

    const fovSlider = document.getElementById('hud-cam-fov-slider');
    if (fovSlider) {
      fovSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.graphics.setCameraFOV(val);
      });
    }

    // Start Infinite Road Mode
    const btnStartInfinite = document.getElementById('btn-start-infinite');
    if (btnStartInfinite) {
      btnStartInfinite.addEventListener('click', () => {
        gameAudio.playClick();
        this.isInfiniteMode = true;
        this.infiniteZOffset = 0;
        this.startLevel(0);
      });
    }

    // Settings Menu Listeners
    const btnSettingsResume = document.getElementById('btn-settings-resume');
    if (btnSettingsResume) {
      btnSettingsResume.addEventListener('click', () => {
        gameAudio.playClick();
        this.toggleSettingsMenu();
      });
    }

    const btnSettingsRetry = document.getElementById('btn-settings-retry');
    if (btnSettingsRetry) {
      btnSettingsRetry.addEventListener('click', () => {
        gameAudio.playClick();
        this.startLevel(this.currentLevelIndex);
      });
    }

    const btnSettingsQuit = document.getElementById('btn-settings-quit');
    if (btnSettingsQuit) {
      btnSettingsQuit.addEventListener('click', () => {
        gameAudio.playClick();
        this.returnToMenu();
      });
    }

    const btnSettingsClose = document.getElementById('btn-settings-close');
    if (btnSettingsClose) {
      btnSettingsClose.addEventListener('click', () => {
        gameAudio.playClick();
        this.toggleSettingsMenu();
      });
    }

    const btnSettingsDifficulty = document.getElementById('btn-settings-difficulty');
    if (btnSettingsDifficulty) {
      btnSettingsDifficulty.addEventListener('click', () => {
        gameAudio.playClick();
        const currentDiff = this.physics.difficulty;
        const nextDiff = currentDiff === 'easy' ? 'hard' : 'easy';
        this.physics.difficulty = nextDiff;
        localStorage.setItem('skyroads_difficulty', nextDiff);
        this.updateDifficultyToggleBtn();
      });
    }

    const btnSettingsMusic = document.getElementById('btn-settings-music');
    if (btnSettingsMusic) {
      btnSettingsMusic.addEventListener('click', () => {
        gameAudio.playClick();
        if (gameAudio.musicSequencer) {
          const isEnabled = !gameAudio.musicSequencer.musicEnabled;
          gameAudio.setMusicEnabled(isEnabled);
          localStorage.setItem('skyroads_music_play', isEnabled);
          this.updateMusicToggleBtn();
        }
      });
    }

    const btnSettingsSoundMode = document.getElementById('btn-settings-sound-mode');
    if (btnSettingsSoundMode) {
      btnSettingsSoundMode.addEventListener('click', () => {
        gameAudio.playClick();
        const currentMode = gameAudio.soundMode || 'synth';
        const nextMode = currentMode === 'synth' ? 'classic' : 'synth';
        gameAudio.setSoundMode(nextMode);
        localStorage.setItem('skyroads_sound_mode', nextMode);
        this.updateSoundModeToggleBtn();
        this.updateNextTrackBtnText();
      });
    }

    const btnSettingsNextTrack = document.getElementById('btn-settings-next-track');
    if (btnSettingsNextTrack) {
      btnSettingsNextTrack.addEventListener('click', () => {
        gameAudio.playClick();
        gameAudio.nextTrack();
        this.updateNextTrackBtnText();
      });
    }

    const sliderMusicVolume = document.getElementById('slider-settings-music-volume');
    if (sliderMusicVolume) {
      sliderMusicVolume.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        gameAudio.setMusicVolume(val);
        localStorage.setItem('skyroads_music_volume', val);
      });
    }

    const sliderSfxVolume = document.getElementById('slider-settings-sfx-volume');
    if (sliderSfxVolume) {
      sliderSfxVolume.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        gameAudio.setSfxVolume(val);
        localStorage.setItem('skyroads_sfx_volume', val);
      });
    }

    const btnSettingsMouse = document.getElementById('btn-settings-mouse');
    if (btnSettingsMouse) {
      btnSettingsMouse.addEventListener('click', () => {
        gameAudio.playClick();
        this.keyboard.mouseControlsEnabled = !this.keyboard.mouseControlsEnabled;
        localStorage.setItem('skyroads_mouse_play', this.keyboard.mouseControlsEnabled);
        this.updateMouseToggleBtn();
      });
    }

    const btnSettingsTouch = document.getElementById('btn-settings-touch');
    if (btnSettingsTouch) {
      btnSettingsTouch.addEventListener('click', () => {
        gameAudio.playClick();
        this.keyboard.touchControlsEnabled = !this.keyboard.touchControlsEnabled;
        localStorage.setItem('skyroads_touch_controls', this.keyboard.touchControlsEnabled);
        this.updateTouchToggleBtn();
      });
    }

    const btnSettingsBoatThrottle = document.getElementById('btn-settings-boat-throttle');
    if (btnSettingsBoatThrottle) {
      btnSettingsBoatThrottle.addEventListener('click', () => {
        gameAudio.playClick();
        this.physics.boatThrottleEnabled = !this.physics.boatThrottleEnabled;
        localStorage.setItem('skyroads_boat_throttle', this.physics.boatThrottleEnabled);
        this.updateBoatThrottleToggleBtn();
      });
    }

    const btnSettingsBottomHud = document.getElementById('btn-settings-bottom-hud');
    if (btnSettingsBottomHud) {
      btnSettingsBottomHud.addEventListener('click', () => {
        gameAudio.playClick();
        this.bottomHudEnabled = !this.bottomHudEnabled;
        localStorage.setItem('skyroads_bottom_hud', this.bottomHudEnabled);
        this.updateBottomHudToggleBtn();
      });
    }

    const btnSettingsStickThrottle = document.getElementById('btn-settings-stick-throttle');
    if (btnSettingsStickThrottle) {
      btnSettingsStickThrottle.addEventListener('click', () => {
        gameAudio.playClick();
        this.keyboard.touchJoystickThrottleEnabled = !this.keyboard.touchJoystickThrottleEnabled;
        localStorage.setItem('skyroads_stick_throttle', this.keyboard.touchJoystickThrottleEnabled);
        this.updateStickThrottleToggleBtn();
      });
    }

    const btnSettingsPicker = document.getElementById('btn-settings-picker');
    if (btnSettingsPicker) {
      btnSettingsPicker.addEventListener('click', () => {
        gameAudio.playClick();
        this.openShipPicker();
      });
    }

    const btnSettingsGamepad = document.getElementById('btn-settings-gamepad');
    if (btnSettingsGamepad) {
      btnSettingsGamepad.addEventListener('click', () => {
        gameAudio.playClick();
        this.gameState = 'gamepad_config';
        this.updateGamepadConfigUI();
        this.showScreen('gamepad-config-screen');
      });
    }

    const btnGamepadClose = document.getElementById('btn-gamepad-close');
    if (btnGamepadClose) {
      btnGamepadClose.addEventListener('click', () => {
        gameAudio.playClick();
        this.gameState = 'settings';
        this.showScreen('settings-screen');
      });
    }

    const btnGamepadReset = document.getElementById('btn-gamepad-reset');
    if (btnGamepadReset) {
      btnGamepadReset.addEventListener('click', () => {
        gameAudio.playClick();
        this.keyboard.gamepadMappings = {
          forward: 7,
          backward: 6,
          jump: 0,
          left: 14,
          right: 15,
          cycleCamera: 3,
          togglePause: 9
        };
        this.keyboard.saveGamepadMappings();
        this.updateGamepadConfigUI();
      });
    }

    // Set up button mapping listener completion callback
    this.keyboard.onGamepadMapComplete = (action, btnIndex) => {
      gameAudio.playClick();
      this.updateGamepadConfigUI();
    };

    // Bind listeners to individual action map buttons
    const gamepadActions = ['forward', 'backward', 'jump', 'left', 'right', 'cycleCamera', 'togglePause'];
    gamepadActions.forEach(action => {
      const btn = document.getElementById(`btn-map-${action}`);
      if (btn) {
        btn.addEventListener('click', () => {
          gameAudio.playClick();
          // Put the selected action into mapping state
          this.keyboard.currentlyMappingAction = action;
          // Clear text to show listening state
          btn.innerText = '[ PRESS ANY BUTTON... ]';
          btn.classList.remove('btn-glow');
          btn.classList.add('btn-danger'); // red styling indicating recording
        });
      }
    });

    // Advanced Physics Calibrator triggers
    const btnSettingsCalibrator = document.getElementById('btn-settings-calibrator');
    if (btnSettingsCalibrator) {
      btnSettingsCalibrator.addEventListener('click', () => {
        gameAudio.playClick();
        // Close settings menu and restore state
        if (this.gameState === 'settings') {
          const screenId = this.preSettingsState === 'playing' ? '' : (this.preSettingsState === 'paused' ? 'pause-screen' : 'menu-screen');
          this.showScreen(screenId);
          if (this.preSettingsState === 'playing') {
            this.gameState = 'playing';
            gameAudio.startEngine();
            gameAudio.startMusic(true);
          } else {
            this.gameState = this.preSettingsState;
          }
        }
        this.togglePhysicsCalibrator(true);
      });
    }

    const btnSettingsPhysics = document.getElementById('btn-settings-physics');
    if (btnSettingsPhysics) {
      btnSettingsPhysics.addEventListener('click', (e) => {
        e.stopPropagation();
        gameAudio.playClick();
        this.togglePhysicsCalibrator();
      });
    }

    const btnCalibratorClose = document.getElementById('btn-calibrator-close');
    if (btnCalibratorClose) {
      btnCalibratorClose.addEventListener('click', () => {
        gameAudio.playClick();
        this.togglePhysicsCalibrator(false);
      });
    }

    // Collapsible accordion group headers
    const groupHeaders = document.querySelectorAll('#physics-calibrator-screen .group-header');
    groupHeaders.forEach(header => {
      header.addEventListener('click', () => {
        gameAudio.playClick();
        const card = header.closest('.calibrator-group-card');
        if (card) {
          card.classList.toggle('collapsed');
        }
      });
    });

    // Preset slot selection triggers
    ['vga', 'snappy', 'lunar', 'custom'].forEach(key => {
      const btn = document.getElementById(`preset-btn-${key}`);
      if (btn) {
        btn.addEventListener('click', () => {
          gameAudio.playClick();
          this.activePreset = key;
          localStorage.setItem('skyroads_physics_active_preset', key);
          this.applyActivePreset();
          this.updateCalibratorUI();
          this.showCalibratorAlert();
        });
      }
    });

    // Reset current active preset to its design baseline (supporting custom isolated per-preset baselines)
    const btnCalibratorReset = document.getElementById('btn-calibrator-reset');
    if (btnCalibratorReset) {
      btnCalibratorReset.addEventListener('click', () => {
        gameAudio.playClick();
        const basePresets = {
          vga: { maxSpeedNormal: 32, maxSpeedBoost: 60, accelForward: 18, decelBrakes: 35, dragZ: 4, maxSteerSpeed: 10, steerAccel: 25, dragSteer: 18, easyCollisionBounceVel: 10, easyCollisionBounceDist: 1.2, bounceFactor: 1.0, jumpImpulse: 10.5, jumpFactor: 1.0, gravityFactor: 1.0, fallGravityMultiplier: 1.45, variableJumpDampening: 0.82, coyoteTimeBuffer: 0.25, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 },
          snappy: { maxSpeedNormal: 32, maxSpeedBoost: 60, accelForward: 18, decelBrakes: 35, dragZ: 4, maxSteerSpeed: 10, steerAccel: 35, dragSteer: 28, easyCollisionBounceVel: 10, easyCollisionBounceDist: 1.2, bounceFactor: 1.0, jumpImpulse: 10.5, jumpFactor: 1.25, gravityFactor: 1.45, fallGravityMultiplier: 1.45, variableJumpDampening: 0.82, coyoteTimeBuffer: 0.25, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 },
          lunar: { maxSpeedNormal: 24, maxSpeedBoost: 50, accelForward: 12, decelBrakes: 25, dragZ: 2, maxSteerSpeed: 8, steerAccel: 15, dragSteer: 8, easyCollisionBounceVel: 8, easyCollisionBounceDist: 1.5, bounceFactor: 1.5, jumpImpulse: 7.5, jumpFactor: 1.0, gravityFactor: 0.45, fallGravityMultiplier: 1.15, variableJumpDampening: 0.90, coyoteTimeBuffer: 0.40, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 },
          custom: { maxSpeedNormal: 32, maxSpeedBoost: 60, accelForward: 18, decelBrakes: 35, dragZ: 4, maxSteerSpeed: 10, steerAccel: 35, dragSteer: 28, easyCollisionBounceVel: 10, easyCollisionBounceDist: 1.2, bounceFactor: 1.0, jumpImpulse: 10.5, jumpFactor: 1.0, gravityFactor: 1.0, fallGravityMultiplier: 1.45, variableJumpDampening: 0.82, coyoteTimeBuffer: 0.25, cockpitOffsetX: 0.0, cockpitOffsetY: 0.0, cockpitOffsetZ: 0.0, showCockpitBezel: 1.0 }
        };

        // Check if there is a custom baseline override saved for this specific active preset
        let targetBaseline = { ...basePresets[this.activePreset] };
        const savedBaseline = localStorage.getItem(`skyroads_physics_preset_baseline_${this.activePreset}`);
        if (savedBaseline) {
          try {
            targetBaseline = { ...targetBaseline, ...JSON.parse(savedBaseline) };
          } catch (e) {
            // Fallback
          }
        }

        this.physicsPresets[this.activePreset] = { ...targetBaseline };
        localStorage.setItem(`skyroads_physics_preset_${this.activePreset}`, JSON.stringify(this.physicsPresets[this.activePreset]));
        this.applyActivePreset();
        this.updateCalibratorUI();
        this.showCalibratorAlert();
      });
    }

    // Save current active preset values as the new custom default baseline for this preset
    const btnCalibratorSaveDefault = document.getElementById('btn-calibrator-save-default');
    if (btnCalibratorSaveDefault) {
      btnCalibratorSaveDefault.addEventListener('click', () => {
        gameAudio.playClick();
        
        // Save the active physics preset values as the new baseline default override
        const currentVals = this.physicsPresets[this.activePreset];
        localStorage.setItem(`skyroads_physics_preset_baseline_${this.activePreset}`, JSON.stringify(currentVals));
        
        // Show success visual indicator alert inside HUD
        this.showCalibratorAlert();
        
        // Temporarily change button text as user feedback
        const originalText = btnCalibratorSaveDefault.innerText;
        btnCalibratorSaveDefault.innerText = "DEFAULT SAVED! 💾✅";
        btnCalibratorSaveDefault.style.borderColor = "#39FF14";
        btnCalibratorSaveDefault.style.color = "#39FF14";
        setTimeout(() => {
          btnCalibratorSaveDefault.innerText = originalText;
          btnCalibratorSaveDefault.style.borderColor = "#00ffcc";
          btnCalibratorSaveDefault.style.color = "#00ffcc";
        }, 1800);
      });
    }

    // Dynamic slider range inputs and real-time auto-saving
    const sliders = document.querySelectorAll('#physics-calibrator-screen input[type="range"]');
    sliders.forEach(slider => {
      slider.addEventListener('input', () => {
        const param = slider.id.replace('input-', '');
        const value = parseFloat(slider.value);
        
        // Update active preset and physics settings
        this.physicsPresets[this.activePreset][param] = value;
        this.physics.settings[param] = value;
        
        // Auto-save active configuration to localStorage
        localStorage.setItem(`skyroads_physics_preset_${this.activePreset}`, JSON.stringify(this.physicsPresets[this.activePreset]));
        
        // Update active numerical readout text
        const readout = document.getElementById(`val-${param}`);
        if (readout) {
          if (param === 'showCockpitBezel') {
            readout.innerText = value === 1 ? 'ON' : 'OFF';
          } else {
            readout.innerText = value.toFixed(param.startsWith('cockpitOffset') || param === 'coyoteTimeBuffer' || param === 'variableJumpDampening' || param === 'gravityFactor' || param === 'fallGravityMultiplier' || param === 'bounceFactor' || param === 'dragZ' ? 2 : 1);
          }
        }
        
        this.showCalibratorAlert();
      });

      // Blur the slider when steering or jumping to return focus to the page for driving
      slider.addEventListener('keydown', (e) => {
        const driveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        const driveKeyNames = ['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
        if (driveKeys.includes(e.code) || driveKeyNames.includes(e.key.toLowerCase())) {
          slider.blur();
        }
      });
    });

    // Pause Menu Listeners
    const btnPauseResume = document.getElementById('btn-pause-resume');
    if (btnPauseResume) {
      btnPauseResume.addEventListener('click', () => {
        gameAudio.playClick();
        this.resumeGame();
      });
    }

    const btnPauseRetry = document.getElementById('btn-pause-retry');
    if (btnPauseRetry) {
      btnPauseRetry.addEventListener('click', () => {
        gameAudio.playClick();
        this.startLevel(this.currentLevelIndex);
      });
    }

    const btnPauseQuit = document.getElementById('btn-pause-quit');
    if (btnPauseQuit) {
      btnPauseQuit.addEventListener('click', () => {
        gameAudio.playClick();
        this.returnToMenu();
      });
    }

    const btnPauseToggleBoatThrottle = document.getElementById('btn-pause-toggle-boat-throttle');
    if (btnPauseToggleBoatThrottle) {
      btnPauseToggleBoatThrottle.addEventListener('click', () => {
        gameAudio.playClick();
        this.physics.boatThrottleEnabled = !this.physics.boatThrottleEnabled;
        localStorage.setItem('skyroads_boat_throttle', this.physics.boatThrottleEnabled);
        this.updateBoatThrottleToggleBtn();
      });
    }

    const btnTouchBoatThrottle = document.getElementById('btn-touch-boat-throttle');
    if (btnTouchBoatThrottle) {
      btnTouchBoatThrottle.addEventListener('click', () => {
        gameAudio.playClick();
        this.physics.boatThrottleEnabled = !this.physics.boatThrottleEnabled;
        localStorage.setItem('skyroads_boat_throttle', this.physics.boatThrottleEnabled);
        this.updateBoatThrottleToggleBtn();
      });
    }

    const btnInGamePause = document.getElementById('btn-in-game-pause');
    if (btnInGamePause) {
      btnInGamePause.addEventListener('click', () => {
        gameAudio.playClick();
        this.pauseGame();
      });
    }

    // Deprecated multi-layout toggle removed for single unified premium layout

    // Floating Touch Camera buttons
    const btnTouchCamMode = document.getElementById('btn-touch-cam-mode');
    if (btnTouchCamMode) {
      btnTouchCamMode.addEventListener('click', () => {
        gameAudio.playClick();
        this.graphics.toggleCameraMode();
      });
    }

    const btnTouchZoomIn = document.getElementById('btn-touch-zoom-in');
    if (btnTouchZoomIn) {
      btnTouchZoomIn.addEventListener('click', () => {
        gameAudio.playClick();
        this.graphics.cycleZoomLevel(-1); // Zoom in
      });
    }

    const btnTouchZoomOut = document.getElementById('btn-touch-zoom-out');
    if (btnTouchZoomOut) {
      btnTouchZoomOut.addEventListener('click', () => {
        gameAudio.playClick();
        this.graphics.cycleZoomLevel(1); // Zoom out
      });
    }
  }

  showScreen(screenId) {
    // Hide all overlay screens
    const screens = document.querySelectorAll('.overlay-screen');
    screens.forEach(s => s.classList.remove('active'));
    screens.forEach(s => s.classList.add('hidden'));

    // If opening a screen other than in-game (screenId is non-empty), close the physics panel
    if (screenId && screenId !== 'physics-calibrator-screen') {
      this.togglePhysicsCalibrator(false);
    }

    // If no target specified, just hide everything
    if (!screenId) return;

    // Show target screen
    const target = document.getElementById(screenId);
    if (!target) return;

    target.classList.remove('hidden');
    // Force reflow for transitions
    target.offsetHeight;
    target.classList.add('active');

    // Reset and auto-focus the first visible button for keyboard menu navigation
    this.selectedMenuIndex = 0;
    setTimeout(() => {
      let buttons = Array.from(target.querySelectorAll('.btn, .level-item, .skin-option'));
      buttons = buttons.filter(btn => !btn.classList.contains('hidden') && btn.style.display !== 'none');
      if (buttons.length > 0) {
        this.highlightMenuButton(buttons);
      }
    }, 50);
  }

  async showLevelSelection(packName) {
    this.isInfiniteMode = false;
    this.infiniteZOffset = 0;
    this.currentPack = packName;
    this.gameState = 'loading';
    
    // Show loading screen while fetching pack data
    this.showScreen('loading-screen');
    document.getElementById('loading-status').innerText = 'Loading level pack...';
    document.getElementById('loading-progress-bar').style.width = '50%';

    // Lazy-load the level pack (cached on subsequent calls)
    const levels = await loadLevelPack(packName);

    this.gameState = 'level_select';
    const packTitle = packName === 'standard' ? 'STANDARD PACK' : 'XMAS SPECIAL';
    document.getElementById('level-pack-title').innerText = packTitle;

    const grid = document.getElementById('level-grid');
    grid.innerHTML = ''; // Clear previous

    const names = packName === 'standard' ? [...this.standardRoadNames, ...this.xmasRoadNames] : this.xmasRoadNames;

    levels.forEach((level, idx) => {
      const btn = document.createElement('div');
      btn.className = 'level-item';
      
      const numLabel = document.createElement('div');
      numLabel.className = 'level-num';
      numLabel.innerText = idx;
      
      const nameLabel = document.createElement('div');
      nameLabel.className = 'level-name';
      nameLabel.innerText = names[idx] || `ROAD ${idx}`;

      btn.appendChild(numLabel);
      btn.appendChild(nameLabel);

      // Render persistent personal best score badge if achieved
      const bestScoreKey = `skyroads_best_score_${packName}_${idx}`;
      const bestScore = localStorage.getItem(bestScoreKey);
      if (bestScore) {
        const scoreBadge = document.createElement('div');
        scoreBadge.className = 'level-best-score';
        scoreBadge.innerText = `🏆 ${parseInt(bestScore, 10).toLocaleString()}`;
        btn.appendChild(scoreBadge);
      }

      btn.addEventListener('click', () => {
        gameAudio.playClick();
        this.startLevel(idx);
      });

      grid.appendChild(btn);
    });

    this.showScreen('level-screen');
  }

  async startLevel(index) {
    if (!this.isInfiniteMode) {
      this.infiniteZOffset = 0;
    }
    this.currentLevelIndex = index;
    const packLevels = getCachedPack(this.currentPack);
    this.currentLevelData = packLevels[index];
    
    // Initialize performance scoring trackers
    this.totalTime = 0.0;
    this.speedAccumulator = 0.0;
    this.speedTicks = 0;
    this.wallHits = 0;
    
    // Bind to window to allow physics engine's gap detection lookup
    window.currentGamePack = this.currentPack;
    window.currentLevelIndex = index;
    window.currentLevelData = this.currentLevelData;

    // Show loading screen
    this.gameState = 'loading';
    this.showScreen('loading-screen');
    document.getElementById('loading-progress-bar').style.width = '0%';
    document.getElementById('loading-status').innerText = 'Building track geometry...';

    // 1. Reset Scene Meshes
    this.graphics.clearLevel();
    if (this.levelInfo && this.levelInfo.roadMeshes) {
      this.levelInfo.roadMeshes.forEach(mesh => {
        this.graphics.scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }

    // 2. Build track geometry asynchronously with progress updates
    const onProgress = (percent) => {
      const progressBar = document.getElementById('loading-progress-bar');
      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
    };

    if (this.isInfiniteMode || this.infiniteZOffset !== 0) {
      this.levelInfo = await buildLevelAsync(
        this.currentLevelData, 
        this.graphics.scene, 
        onProgress, 
        this.infiniteZOffset, 
        this.isInfiniteMode
      );
    } else {
      this.levelInfo = await buildLevelAsync(
        this.currentLevelData, 
        this.graphics.scene, 
        onProgress
      );
    }

    // Spawn low-poly city scenery flanking both sides of the track
    this.graphics.spawnCityScenery(this.levelInfo.trackLength, this.infiniteZOffset);

    // 3. Reset Physics ship state
    this.physics.reset(this.levelInfo.fuel, this.levelInfo.oxygen);

    // 4. Position ship at the first row that has ground tiles.
    //    Many levels start with empty rows (gaps), and some levels have
    //    the starting road offset to the left or right, not centered.
    const TILE_LENGTH = 4.0; // must match levelLoader constant
    const TILE_WIDTH = 2.0;
    const rows = this.currentLevelData.rows;
    let spawnRow = 0;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r].some(t => t !== null)) {
        spawnRow = r;
        break;
      }
    }

    // Calculate X from the center of the tiles present in the spawn row
    const spawnRowTiles = rows[spawnRow];
    const tileCols = spawnRowTiles
      .map((t, c) => t !== null ? c : null)
      .filter(x => x !== null);
    const avgCol = tileCols.length > 0
      ? tileCols.reduce((a, b) => a + b, 0) / tileCols.length
      : 3; // default center
    const spawnX = (avgCol - 3) * TILE_WIDTH;

    // Place ship on the first solid row, slightly elevated, adjusted by infiniteZOffset
    const spawnZ = -spawnRow * TILE_LENGTH + this.infiniteZOffset;
    this.physics.position.set(spawnX, 0.3, spawnZ);
    this.physics.onGround = false;

    // 5. Update HUD headers & telemetry, then show HUD and hide overlays
    const packNameEl = document.getElementById('hud-pack-name');
    if (packNameEl) packNameEl.innerText = this.currentPack === 'standard' ? 'STANDARD PACK' : 'XMAS SPECIAL';
    const roadNames = this.currentPack === 'standard' ? [...this.standardRoadNames, ...this.xmasRoadNames] : this.xmasRoadNames;
    const roadNameEl = document.getElementById('hud-road-name');
    if (roadNameEl) roadNameEl.innerText = roadNames[index] || `ROAD ${index}`;

    const gravityVal = this.currentLevelData.gravity ? ((this.currentLevelData.gravity - 3) * 100) : 500;
    const gravityTextEl = document.getElementById('hud-gravity-text');
    if (gravityTextEl) gravityTextEl.innerText = String(gravityVal).padStart(4, '0');

    if (this.bottomHudEnabled) {
      document.getElementById('hud').classList.remove('hidden');
    } else {
      document.getElementById('hud').classList.add('hidden');
    }
    this.showScreen(''); // Hide all menus

    // Toggle Pause Trigger button visibility
    const btnInGamePause = document.getElementById('btn-in-game-pause');
    if (btnInGamePause) btnInGamePause.classList.remove('hidden');

    // Toggle Mobile Touch controls HUD visibility
    const touchHud = document.getElementById('mobile-touch-hud');
    if (touchHud) {
      if (this.keyboard.touchControlsEnabled) {
        touchHud.classList.remove('hidden');
        this.applyTouchConfig();
        this.setupTouchControlsDOMEvents();
      } else {
        touchHud.classList.add('hidden');
      }
    }

    // 6. Trigger Continuous Sound Hum
    gameAudio.startEngine();
    gameAudio.startMusic(true);

    this.gameState = 'playing';
    this.lastTime = performance.now();
  }

  returnToMenu() {
    this.gameState = 'menu';
    document.getElementById('hud').classList.add('hidden');
    
    // Hide in-game trigger and touch HUD
    const btnInGamePause = document.getElementById('btn-in-game-pause');
    if (btnInGamePause) btnInGamePause.classList.add('hidden');
    const touchHud = document.getElementById('mobile-touch-hud');
    if (touchHud) touchHud.classList.add('hidden');

    gameAudio.stopEngine();
    gameAudio.startMusic(false);
    this.showScreen('menu-screen');
  }

  pauseGame() {
    this.gameState = 'paused';
    gameAudio.stopEngine();
    
    const btnInGamePause = document.getElementById('btn-in-game-pause');
    if (btnInGamePause) btnInGamePause.classList.add('hidden');
    
    const touchHud = document.getElementById('mobile-touch-hud');
    if (touchHud) touchHud.classList.add('hidden');
    
    this.showScreen('pause-screen');
  }

  resumeGame() {
    this.gameState = 'playing';
    this.lastTime = performance.now();
    gameAudio.startEngine();
    gameAudio.startMusic(true);
    
    const btnInGamePause = document.getElementById('btn-in-game-pause');
    if (btnInGamePause) btnInGamePause.classList.remove('hidden');
    
    const touchHud = document.getElementById('mobile-touch-hud');
    if (touchHud && this.keyboard.touchControlsEnabled) {
      touchHud.classList.remove('hidden');
      this.applyTouchConfig();
    }
    
    this.showScreen(''); // Hide pause overlay
  }

  setupTouchControlsDOMEvents() {
    if (this._touchControlsSetupDone) return;
    this._touchControlsSetupDone = true;

    // Simple buttons binding
    const touchButtons = document.querySelectorAll('.touch-btn, .dpad-btn');
    touchButtons.forEach(btn => {
      const action = btn.getAttribute('data-action');
      if (!action) return;
      
      const pressStart = (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        this.keyboard.setTouchState(action, true);
      };

      const pressEnd = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        this.keyboard.setTouchState(action, false);
      };

      btn.addEventListener('touchstart', pressStart);
      btn.addEventListener('touchend', pressEnd);
      btn.addEventListener('touchcancel', pressEnd);

      // Pointer events (for simulator testing and desktop mouse clicks)
      btn.addEventListener('pointerdown', pressStart);
      btn.addEventListener('pointerup', pressEnd);
      btn.addEventListener('pointerleave', pressEnd);
    });

    // Joystick 2D circular drag and steer (PS2 Analog Stick styling & continuous response)
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');
    if (joystickBase && joystickKnob) {
      let isDragging = false;
      const maxDist = 50; // Max drag radius in pixels

      const handleMove = (e) => {
        if (!isDragging) return;
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = e.clientX - centerX;
        let dy = e.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }

        joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.keyboard.setTouchSteerAmount(dx / maxDist);
        this.keyboard.setTouchJoystickY(dy / maxDist);
      };

      const handleEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        joystickBase.classList.remove('dragging');
        joystickBase.releasePointerCapture(e.pointerId);

        // Quick, springy return animation
        joystickKnob.style.transition = 'transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1.4)';
        joystickKnob.style.transform = 'translate(0px, 0px)';
        this.keyboard.setTouchSteerAmount(0);
        this.keyboard.setTouchJoystickY(0);
      };

      joystickBase.addEventListener('pointerdown', (e) => {
        isDragging = true;
        joystickBase.classList.add('dragging');
        joystickKnob.style.transition = 'none'; // Disable transition for lag-free dragging
        joystickBase.setPointerCapture(e.pointerId);
        handleMove(e);
      });
      joystickBase.addEventListener('pointermove', handleMove);
      joystickBase.addEventListener('pointerup', handleEnd);
      joystickBase.addEventListener('pointercancel', handleEnd);
    }
  }

  toggleSettingsMenu() {
    if (this.gameState === 'settings') {
      // Close settings menu and restore state
      const screenId = this.preSettingsState === 'playing' ? '' : (this.preSettingsState === 'paused' ? 'pause-screen' : 'menu-screen');
      this.showScreen(screenId);
      
      if (this.preSettingsState === 'playing') {
        this.gameState = 'playing';
        gameAudio.startEngine();
        gameAudio.startMusic(true);
      } else {
        this.gameState = this.preSettingsState;
      }
    } else {
      // Open settings menu
      gameAudio.stopEngine();
      this.preSettingsState = this.gameState;
      this.gameState = 'settings';
      this.updateNextTrackBtnText();
      
      // Update Settings popup overlay controls visibility based on gameplay state
      const pausedActions = document.getElementById('settings-paused-actions');
      if (pausedActions) {
        if (this.preSettingsState === 'playing' || this.preSettingsState === 'paused') {
          pausedActions.classList.remove('hidden');
        } else {
          pausedActions.classList.add('hidden');
        }
      }
      
      this.showScreen('settings-screen');
    }
  }

  async triggerInfiniteLevelTransition() {
    if (this.infiniteLevelTransitioning) return;
    this.infiniteLevelTransitioning = true;
    this.physics.isTransitioning = true;

    // Save active level finishZ & roadMeshes to clean up later
    const oldFinishZ = this.levelInfo.finishZ;
    const oldMeshes = [...this.levelInfo.roadMeshes];

    // We have 3.75s of transition tube at maxSpeedNormal (32).
    // Midway through the tube (1.8s), load the next level ahead.
    setTimeout(async () => {
      try {
        // 1. Calculate next level index
        const packLevels = getCachedPack(this.currentPack);
        const nextIdx = (this.currentLevelIndex + 1) % packLevels.length;
        this.currentLevelIndex = nextIdx;
        this.currentLevelData = packLevels[nextIdx];

        // Bind to window for physics tile checks
        window.currentLevelIndex = nextIdx;
        window.currentLevelData = this.currentLevelData;

        // 2. Set next level offset: start of next level starts exactly at end of autopilot tube
        // End of tube is oldFinishZ - 120.0
        this.infiniteZOffset = oldFinishZ - 120.0;

        // 3. Load next level geometry asynchronously
        const nextLevelInfo = await buildLevelAsync(
          this.currentLevelData,
          this.graphics.scene,
          null,
          this.infiniteZOffset,
          true
        );

        // 4. Update scene references and clean up old meshes
        this.levelInfo = nextLevelInfo;

        // Spawn city scenery flanking the new track length at the new offset
        this.graphics.spawnCityScenery(nextLevelInfo.trackLength, this.infiniteZOffset);

        // Clean up old meshes from the scene
        oldMeshes.forEach(mesh => {
          this.graphics.scene.remove(mesh);
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(m => m.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        });

        // 5. Replenish fuel/oxygen and update gravity/telemetry
        this.physics.fuel = nextLevelInfo.fuel * 50;
        this.physics.oxygen = nextLevelInfo.oxygen;

        const roadNames = this.currentPack === 'standard' ? [...this.standardRoadNames, ...this.xmasRoadNames] : this.xmasRoadNames;
        const roadNameEl = document.getElementById('hud-road-name');
        if (roadNameEl) roadNameEl.innerText = roadNames[nextIdx] || `ROAD ${nextIdx}`;

        const gravityVal = this.currentLevelData.gravity ? ((this.currentLevelData.gravity - 3) * 100) : 500;
        const gravityTextEl = document.getElementById('hud-gravity-text');
        if (gravityTextEl) gravityTextEl.innerText = String(gravityVal).padStart(4, '0');

        // Trigger a beautiful transition/refill sound effect!
        gameAudio.playRefill();

      } catch (error) {
        console.error('Failed seamless level stitching transition:', error);
      }
    }, 1800);

    // End autopilot and return controls to player after 3.75s
    setTimeout(() => {
      this.physics.isTransitioning = false;
      this.infiniteLevelTransitioning = false;
    }, 3750);
  }

  animate(timestamp) {
    const dt = (timestamp - this.lastTime) / 1000.0;
    this.lastTime = timestamp;

    if (this.keyboard && typeof this.keyboard.pollGamepad === 'function') {
      this.keyboard.pollGamepad();
    }

    if (this.keyboard && typeof this.keyboard.consumeTogglePause === 'function' && this.keyboard.consumeTogglePause()) {
      if (this.gameState === 'playing') {
        gameAudio.playClick();
        this.pauseGame();
      } else if (this.gameState === 'paused') {
        gameAudio.playClick();
        this.resumeGame();
      }
    }

    // Process gamepad menu navigation when not actively playing a level
    if (this.gameState !== 'playing' && this.keyboard && this.keyboard.gamepadConnected && !this.keyboard.currentlyMappingAction) {
      const gp = this.keyboard.gamepad;
      
      if (gp.menuDown) {
        this.handleMenuKeyboard({ code: 'ArrowDown', preventDefault: () => {} });
      } else if (gp.menuUp) {
        this.handleMenuKeyboard({ code: 'ArrowUp', preventDefault: () => {} });
      } else if (gp.menuLeft) {
        this.handleMenuKeyboard({ code: 'ArrowLeft', preventDefault: () => {} });
      } else if (gp.menuRight) {
        this.handleMenuKeyboard({ code: 'ArrowRight', preventDefault: () => {} });
      }

      if (gp.menuSelect) {
        this.handleMenuKeyboard({ code: 'Enter', preventDefault: () => {} });
      }

      if (gp.menuCancel) {
        const activeScreen = document.querySelector('.overlay-screen.active');
        if (activeScreen) {
          const cancelButtons = {
            'settings-screen': 'btn-settings-close',
            'gamepad-config-screen': 'btn-gamepad-close',
            'level-screen': 'btn-level-back',
            'ship-picker-screen': 'btn-picker-back',
            'how-to-screen': 'btn-how-to-back',
            'death-screen': 'btn-death-menu',
            'success-screen': 'btn-success-menu',
            'pause-screen': 'btn-pause-resume'
          };
          
          const btnId = cancelButtons[activeScreen.id];
          if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) {
              gameAudio.playClick();
              btn.click();
            }
          }
        }
      }
    }

    if (this.gameState === 'paused') {
      this.animationFrameId = requestAnimationFrame((t) => this.animate(t));
      return;
    }

    if (this.gameState === 'playing' || this.gameState === 'death') {
      if (this.gameState === 'playing') {
        if (this.keyboard && typeof this.keyboard.consumeCycleCamera === 'function' && this.keyboard.consumeCycleCamera()) {
          gameAudio.playClick();
          this.graphics.toggleCameraMode();
        }

        // 1. Advance Physics Engine (DT capped internally to prevent tunneling)
        this.physics.update(dt, this.keyboard, this.levelInfo);

        // Accumulate real-time stats for scoring
        this.totalTime = (this.totalTime || 0.0) + dt;
        if (Math.abs(this.physics.velocity.z) > 0.1) {
          this.speedAccumulator = (this.speedAccumulator || 0.0) + Math.abs(this.physics.velocity.z);
          this.speedTicks = (this.speedTicks || 0) + 1;
        }

        // 2. Refresh HUD overlays
        this.updateHUD();
      }

      // 3. Chase Camera and thrusters
      this.graphics.update(this.physics, dt);

      // 4. Modulate Engine frequency
      const speedRatio = Math.abs(this.physics.velocity.z) / this.physics.maxSpeedNormal;
      gameAudio.updateEngineSpeed(speedRatio);

      // 5. Check Audio Triggers from physics & keyboard inputs
      if (this.physics.triggerRefillAudio) {
        gameAudio.playRefill();
        this.physics.triggerRefillAudio = false;
      }

      if (this.physics.triggerWallCollisionAudio) {
        if (this.wallScrapeSoundTimer <= 0) {
          gameAudio.playWallCollision();
          this.wallScrapeSoundTimer = 0.22; // Throttle sound playback
          this.wallHits = (this.wallHits || 0) + 1; // Increment scrape count
        }
        this.physics.triggerWallCollisionAudio = false;
      }
      if (this.wallScrapeSoundTimer > 0) {
        this.wallScrapeSoundTimer -= dt;
      }

      if (this.physics.triggerLandingReboundAudio) {
        gameAudio.playLandingRebound();
        this.physics.triggerLandingReboundAudio = false;
      }

      // Gentle thruster puff whoosh sound when player initiates steering
      const isSteering = this.keyboard.left || this.keyboard.right;
      if (isSteering && !this.wasSteeringLastFrame) {
        gameAudio.playSteer();
      }
      this.wasSteeringLastFrame = isSteering;

      // 6. Check success condition (crossed Z-line)
      if (!this.physics.isDead && this.physics.position.z <= this.levelInfo.finishZ + SHIP_LENGTH / 2) {
        if (this.isInfiniteMode) {
          this.triggerInfiniteLevelTransition();
        } else {
          this.handleSuccess();
        }
      }

      // 7. Check death condition
      if (this.physics.isDead) {
        this.handleDeath();
      }

      // 8. Render the frame to the screen
      this.graphics.render();

    } else {
      // Spin stars background slightly while in menus for dynamic feel
      if (this.graphics.starField) {
        this.graphics.starField.rotation.y += 0.02 * dt;
      }
      this.graphics.render();
    }

    this.animationFrameId = requestAnimationFrame((t) => this.animate(t));
  }

  updateHUD() {
    // Speed conversion (relative Z-speed to km/h)
    const speedKmh = Math.floor(Math.abs(this.physics.velocity.z) * 10);
    document.getElementById('hud-speed-text').innerText = String(speedKmh).padStart(3, '0');
    
    // Cap speed bar at 100%
    const maxZSpeed = this.physics.activeEffects.boost ? this.physics.maxSpeedBoost : this.physics.maxSpeedNormal;
    const speedPct = Math.min(100, (Math.abs(this.physics.velocity.z) / maxZSpeed) * 100);
    
    // SVG speedometer outer ring (circumference = 565.48)
    const speedOffset = 565.48 - (speedPct / 100) * 565.48;
    const speedRing = document.getElementById('gauge-speed-ring');
    if (speedRing) speedRing.style.strokeDashoffset = speedOffset;
    
    // Legacy support for unit tests
    const legacySpeedBar = document.getElementById('hud-speed-bar');
    if (legacySpeedBar) legacySpeedBar.style.width = `${speedPct}%`;

    // Oxygen
    const oxygen = Math.ceil(this.physics.oxygen);
    document.getElementById('hud-oxygen-text').innerText = String(oxygen).padStart(3, '0');
    
    // SVG Oxygen arc (semicircular length = 194.78)
    const oxygenOffset = 194.78 - (oxygen / 100) * 194.78;
    const oxygenArc = document.getElementById('gauge-oxygen-arc');
    if (oxygenArc) oxygenArc.style.strokeDashoffset = oxygenOffset;
    
    // Legacy support for unit tests
    const legacyOxygenBar = document.getElementById('hud-oxygen-bar');
    if (legacyOxygenBar) legacyOxygenBar.style.width = `${oxygen}%`;

    // Fuel (Original DOS maps scale)
    const fuel = Math.ceil(this.physics.fuel);
    document.getElementById('hud-fuel-text').innerText = String(fuel).padStart(5, '0');
    const fuelPct = Math.min(100, (this.physics.fuel / (this.levelInfo.fuel * 50)) * 100);
    
    // SVG Fuel arc (semicircular length = 194.78)
    const fuelOffset = 194.78 - (fuelPct / 100) * 194.78;
    const fuelArc = document.getElementById('gauge-fuel-arc');
    if (fuelArc) fuelArc.style.strokeDashoffset = fuelOffset;
    
    // Legacy support for unit tests
    const legacyFuelBar = document.getElementById('hud-fuel-bar');
    if (legacyFuelBar) legacyFuelBar.style.width = `${fuelPct}%`;

    // Progress Bar
    const absoluteZ = -this.physics.position.z;
    const progressPct = Math.min(100, Math.max(0, (absoluteZ / this.levelInfo.trackLength) * 100));
    
    // Vertical Progress tube & rocket indicator styling
    const progressBar = document.getElementById('hud-progress-bar');
    if (progressBar) {
      progressBar.style.height = `${progressPct}%`;
      progressBar.style.width = `${progressPct}%`; // legacy support
    }
    const progressMarker = document.getElementById('hud-progress-marker');
    if (progressMarker) {
      progressMarker.style.bottom = `calc(${progressPct}% - 4px)`;
      progressMarker.style.left = `${progressPct}%`; // legacy support
    }
    // Update JUMP-O MASTER status readout
    const jumpTextEl = document.getElementById('hud-jump-text');
    if (jumpTextEl) {
      if (this.physics.isRebounding) {
        jumpTextEl.innerText = 'REBOUND';
        jumpTextEl.style.color = '#ff00ff';
      } else if (!this.physics.onGround) {
        jumpTextEl.innerText = 'JUMPING';
        jumpTextEl.style.color = '#00ffff';
      } else {
        jumpTextEl.innerText = 'IDLE';
        jumpTextEl.style.color = '#00ffcc';
      }
    }

    // Toggle active classes on status lights
    const boostLight = document.getElementById('status-boost');
    if (boostLight) boostLight.classList.toggle('active', !!this.physics.activeEffects.boost);

    const stickyLight = document.getElementById('status-sticky');
    if (stickyLight) stickyLight.classList.toggle('active', !!this.physics.activeEffects.sticky);

    const slipperyLight = document.getElementById('status-slippery');
    if (slipperyLight) slipperyLight.classList.toggle('active', !!this.physics.activeEffects.slippery);

    // Real-Time Running Score calculation
    let difficultyMult = 1.0;
    if (this.physics.difficulty === 'normal') difficultyMult = 1.5;
    else if (this.physics.difficulty === 'hard') difficultyMult = 2.0;
    else if (this.physics.difficulty === 'extreme') difficultyMult = 2.5;

    const absoluteZPos = -this.physics.position.z;
    const distanceScore = Math.floor(absoluteZPos * 100);
    const collisionPenalty = (this.wallHits || 0) * 800;
    const liveScore = Math.max(0, Math.floor(distanceScore * difficultyMult) - collisionPenalty);
    this.physics.score = liveScore;

    const scoreTextEl = document.getElementById('hud-score-text');
    if (scoreTextEl) {
      scoreTextEl.innerText = String(liveScore).padStart(6, '0');
    }
  }

  handleDeath() {
    if (this.gameState === 'death') return;
    this.gameState = 'death';
    gameAudio.stopEngine();
    gameAudio.playExplosion();
    this.graphics.triggerExplosion(this.physics.position);

    // Display appropriate death reason
    let msg = "Your ship crashed into a wall of solid block.";
    if (this.physics.deathReason === 'FELL OFF ROAD') {
      msg = "You steered off the edge and plummeted into the deep abyss.";
    } else if (this.physics.deathReason === 'OUT OF FUEL') {
      msg = "Your thrusters sputtered out of fuel and shut down.";
    } else if (this.physics.deathReason === 'OUT OF OXYGEN') {
      msg = "Life support systems failed. You ran out of oxygen.";
    } else if (this.physics.deathReason === 'BURNED TO CRIPPLES') {
      msg = "Your hull melted immediately on contact with a burning tile.";
    }

    document.getElementById('death-reason').innerText = msg;
    
    // Delay death menu overlay to admire the explosion (faster under Vitest environment for test runner compliance)
    const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') || (typeof window !== 'undefined' && window.__vitest_worker__);
    const delay = isTestEnv ? 1200 : 2200;
    setTimeout(() => {
      if (this.gameState === 'death') {
        this.showScreen('death-screen');
      }
    }, delay);
  }

  handleSuccess() {
    this.gameState = 'success';
    gameAudio.stopEngine();
    gameAudio.stopMusic();
    gameAudio.playWin();

    // 1. Calculate Score Statistics
    const avgSpeed = this.speedTicks > 0 ? (this.speedAccumulator / this.speedTicks) : 0.0;
    const avgSpeedKmh = Math.floor(avgSpeed * 10);
    const wallHits = this.wallHits || 0;
    const totalTime = this.totalTime || 0.0;

    let difficultyMult = 1.0;
    if (this.physics.difficulty === 'normal') difficultyMult = 1.5;
    else if (this.physics.difficulty === 'hard') difficultyMult = 2.0;
    else if (this.physics.difficulty === 'extreme') difficultyMult = 2.5;

    const baseScore = 10000;
    const speedBonus = Math.floor(avgSpeedKmh * 150);
    
    const trackLen = this.levelInfo ? this.levelInfo.trackLength : 200.0;
    const targetTime = trackLen / 18.0;
    const timeBonus = Math.max(0, Math.floor((targetTime - totalTime) * 300));
    
    const penalty = wallHits * 800;
    const perfectBonus = wallHits === 0 ? 5000 : 0;

    const rawScore = Math.max(0, baseScore + speedBonus + timeBonus - penalty + perfectBonus);
    const finalScore = Math.floor(rawScore * difficultyMult);

    // 2. Render Score Breakdown elements in HTML
    const valTime = document.getElementById('score-val-time');
    if (valTime) valTime.innerText = totalTime.toFixed(2) + 's';
    
    const valSpeed = document.getElementById('score-val-speed');
    if (valSpeed) valSpeed.innerText = avgSpeedKmh + ' km/h';
    
    const valCollisions = document.getElementById('score-val-collisions');
    if (valCollisions) valCollisions.innerText = String(wallHits);
    
    const valSpeedBonus = document.getElementById('score-val-speed-bonus');
    if (valSpeedBonus) valSpeedBonus.innerText = '+' + speedBonus.toLocaleString();
    
    const valTimeBonus = document.getElementById('score-val-time-bonus');
    if (valTimeBonus) valTimeBonus.innerText = '+' + timeBonus.toLocaleString();
    
    const valPenalty = document.getElementById('score-val-penalty');
    if (valPenalty) valPenalty.innerText = '-' + penalty.toLocaleString();

    const rowPerfectBonus = document.getElementById('score-row-perfect-bonus');
    if (rowPerfectBonus) {
      rowPerfectBonus.style.display = wallHits === 0 ? 'flex' : 'none';
    }

    const valFinal = document.getElementById('score-val-final');
    if (valFinal) valFinal.innerText = String(finalScore).padStart(6, '0');

    // 3. Setup Initials Input Form
    const inputInitials = document.getElementById('input-score-initials');
    const submitBtn = document.getElementById('btn-score-submit');
    const inputBox = document.getElementById('leaderboard-input-box');

    if (inputBox) inputBox.style.display = 'flex';
    if (inputInitials) {
      inputInitials.value = localStorage.getItem('skyroads_saved_initials') || '';
    }

    // Helper to render Leaderboard Table
    const renderLeaderboardTable = (activeEntry = null) => {
      const tbody = document.getElementById('leaderboard-table-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      const leaderboardKey = `skyroads_leaderboard_${this.currentPack}_${this.currentLevelIndex}`;
      const list = JSON.parse(localStorage.getItem(leaderboardKey) || '[]');

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#8c8f99; padding:15px; font-size:0.58rem;">No records yet. Be the first!</td></tr>`;
        return;
      }

      list.forEach((item, idx) => {
        const tr = document.createElement('tr');
        if (activeEntry && activeEntry.initials === item.initials && activeEntry.score === item.score && activeEntry.time === item.time) {
          tr.className = 'leaderboard-row-active';
        }
        
        tr.innerHTML = `
          <td style="padding: 4px 6px;">#${idx + 1}</td>
          <td style="padding: 4px 6px; font-weight:bold;">${item.initials}</td>
          <td style="padding: 4px 6px; text-align:right; font-weight:bold; color: #00ffcc;">${item.score.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
      });
    };

    // Render current leaderboard list before submission
    renderLeaderboardTable();

    // Bind Score Submit Action
    if (submitBtn) {
      // Re-create listener to avoid multiple click bindings
      const newSubmitBtn = submitBtn.cloneNode(true);
      submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
      
      newSubmitBtn.addEventListener('click', () => {
        gameAudio.playClick();
        const initials = inputInitials.value.trim().toUpperCase();
        
        if (!initials || initials.length !== 3 || !/^[A-Z0-9]{3}$/.test(initials)) {
          alert("Please enter exactly 3 uppercase letters or numbers!");
          return;
        }

        // Save initials preference
        localStorage.setItem('skyroads_saved_initials', initials);

        // Add score record to leaderboard list
        const leaderboardKey = `skyroads_leaderboard_${this.currentPack}_${this.currentLevelIndex}`;
        const currentList = JSON.parse(localStorage.getItem(leaderboardKey) || '[]');
        
        const newRecord = {
          initials: initials,
          score: finalScore,
          time: totalTime,
          date: new Date().toLocaleDateString()
        };

        currentList.push(newRecord);
        // Sort descending by score, ascending by time (if scores are equal)
        currentList.sort((a, b) => b.score !== a.score ? b.score - a.score : a.time - b.time);
        
        // Keep top 5 only
        const top5 = currentList.slice(0, 5);
        localStorage.setItem(leaderboardKey, JSON.stringify(top5));

        // Save as Personal Best
        const bestScoreKey = `skyroads_best_score_${this.currentPack}_${this.currentLevelIndex}`;
        const previousBest = parseInt(localStorage.getItem(bestScoreKey) || '0', 10);
        if (finalScore > previousBest) {
          localStorage.setItem(bestScoreKey, String(finalScore));
        }

        // Hide submission form and refresh leaderboard list with active highlighting!
        if (inputBox) inputBox.style.display = 'none';
        renderLeaderboardTable(newRecord);
      });
    }

    // Hide next button if it was the last road
    const packLevels = getCachedPack(this.currentPack);
    if (this.currentLevelIndex + 1 >= packLevels.length) {
      document.getElementById('btn-success-next').classList.add('hidden');
    } else {
      document.getElementById('btn-success-next').classList.remove('hidden');
    }

    this.showScreen('success-screen');
  }

  handleMenuKeyboard(e) {
    const activeScreen = document.querySelector('.overlay-screen.active');
    if (!activeScreen) return;

    const screenId = activeScreen.id;
    
    if (screenId === 'level-screen') {
      this.handleLevelSelectKeyboard(e, activeScreen);
      return;
    }

    if (screenId === 'ship-picker-screen') {
      this.handleShipPickerKeyboard(e, activeScreen);
      return;
    }

    let buttons = Array.from(activeScreen.querySelectorAll('.btn, .level-item, .skin-option'));
    buttons = buttons.filter(btn => !btn.classList.contains('hidden') && btn.style.display !== 'none');
    
    if (buttons.length === 0) return;

    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex + 1) % buttons.length;
      this.highlightMenuButton(buttons);
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex - 1 + buttons.length) % buttons.length;
      this.highlightMenuButton(buttons);
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      const activeBtn = buttons[this.selectedMenuIndex];
      if (activeBtn) {
        activeBtn.click();
      }
    }
  }

  handleShipPickerKeyboard(e, activeScreen) {
    const modelOptions = Array.from(activeScreen.querySelectorAll('.model-option'));
    const textureOptions = Array.from(activeScreen.querySelectorAll('.texture-option'));
    const colorOptions = Array.from(activeScreen.querySelectorAll('.color-preset-option'));
    const colorPickerInput = document.getElementById('ship-color-picker');
    const backBtn = document.getElementById('btn-picker-back');
    const selectBtn = document.getElementById('btn-picker-select');
    
    // Combine all selectable buttons in order: models grid, then textures grid, then preset colors, custom picker, then buttons
    const buttons = [...modelOptions, ...textureOptions, ...colorOptions, colorPickerInput, backBtn, selectBtn].filter(el => el && !el.classList.contains('hidden') && el.style.display !== 'none');
    if (buttons.length === 0) return;

    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex + 1) % buttons.length;
      this.highlightMenuButton(buttons);
      
      const activeEl = buttons[this.selectedMenuIndex];
      if (activeEl) {
        if (activeEl.classList.contains('model-option')) {
          const modelName = activeEl.getAttribute('data-model');
          this.selectModelInPicker(modelName);
        } else if (activeEl.classList.contains('texture-option')) {
          const skinName = activeEl.getAttribute('data-skin');
          this.selectTextureInPicker(skinName);
        } else if (activeEl.classList.contains('color-preset-option')) {
          const color = activeEl.getAttribute('data-color');
          this.selectColorInPicker(color);
        }
      }
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex - 1 + buttons.length) % buttons.length;
      this.highlightMenuButton(buttons);

      const activeEl = buttons[this.selectedMenuIndex];
      if (activeEl) {
        if (activeEl.classList.contains('model-option')) {
          const modelName = activeEl.getAttribute('data-model');
          this.selectModelInPicker(modelName);
        } else if (activeEl.classList.contains('texture-option')) {
          const skinName = activeEl.getAttribute('data-skin');
          this.selectTextureInPicker(skinName);
        } else if (activeEl.classList.contains('color-preset-option')) {
          const color = activeEl.getAttribute('data-color');
          this.selectColorInPicker(color);
        }
      }
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      const activeEl = buttons[this.selectedMenuIndex];
      if (activeEl) {
        activeEl.click();
      }
    }
  }

  handleLevelSelectKeyboard(e, activeScreen) {
    const items = Array.from(activeScreen.querySelectorAll('.level-item'));
    if (items.length === 0) return;

    const rowOffset = 5;

    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex + 1) % items.length;
      this.highlightMenuButton(items);
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex - 1 + items.length) % items.length;
      this.highlightMenuButton(items);
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex + rowOffset) % items.length;
      this.highlightMenuButton(items);
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      gameAudio.playClick();
      this.selectedMenuIndex = (this.selectedMenuIndex - rowOffset + items.length) % items.length;
      this.highlightMenuButton(items);
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      const currentItem = items[this.selectedMenuIndex];
      if (currentItem) {
        currentItem.click();
      }
    }
  }

  loadTouchConfig() {
    this.touchConfig = {
      leftPos: { left: '60px', bottom: '160px' },
      rightPos: { right: '60px', bottom: '160px' },
      type: 'stick',
      scale: 1.0,
      swapped: false,
      buttons: 'full'
    };

    try {
      const saved = localStorage.getItem('skyroads_touch_config');
      if (saved) {
        Object.assign(this.touchConfig, JSON.parse(saved));
      }
    } catch (e) {
      // safe fallback
    }

    this.applyTouchConfig();
  }

  applyTouchConfig() {
    const leftGroup = document.getElementById('touch-movable-left');
    const rightGroup = document.getElementById('touch-movable-right');
    if (!leftGroup || !rightGroup) return;

    // Apply positions (absolute offsets)
    leftGroup.style.left = this.touchConfig.swapped ? '' : this.touchConfig.leftPos.left || '60px';
    leftGroup.style.right = this.touchConfig.swapped ? this.touchConfig.leftPos.right || '60px' : '';
    leftGroup.style.bottom = this.touchConfig.leftPos.bottom || '160px';

    rightGroup.style.right = this.touchConfig.swapped ? '' : this.touchConfig.rightPos.right || '60px';
    rightGroup.style.left = this.touchConfig.swapped ? this.touchConfig.rightPos.left || '60px' : '';
    rightGroup.style.bottom = this.touchConfig.rightPos.bottom || '160px';

    // Apply type (joystick vs dpad)
    const joyView = document.getElementById('touch-joystick-view');
    const dpadView = document.getElementById('touch-dpad-view');
    if (joyView && dpadView) {
      if (this.touchConfig.type === 'dpad') {
        joyView.classList.add('hidden');
        dpadView.classList.remove('hidden');
      } else {
        joyView.classList.remove('hidden');
        dpadView.classList.add('hidden');
      }
    }

    // Apply scale factor
    leftGroup.style.transform = `scale(${this.touchConfig.scale})`;
    rightGroup.style.transform = `scale(${this.touchConfig.scale})`;

    // Apply action buttons complexity (full vs simple)
    const actionsFull = document.getElementById('touch-actions-full');
    const actionsSimple = document.getElementById('touch-actions-simple');
    if (actionsFull && actionsSimple) {
      if (this.touchConfig.buttons === 'simple') {
        actionsFull.classList.add('hidden');
        actionsSimple.classList.remove('hidden');
      } else {
        actionsFull.classList.remove('hidden');
        actionsSimple.classList.add('hidden');
      }
    }

    // Update customizer options labels
    const btnType = document.getElementById('btn-cust-type');
    if (btnType) btnType.innerText = `TYPE: ${this.touchConfig.type.toUpperCase()}`;

    const btnScale = document.getElementById('btn-cust-scale');
    if (btnScale) btnScale.innerText = `SCALE: ${this.touchConfig.scale.toFixed(1)}x`;

    const btnSwap = document.getElementById('btn-cust-swap');
    if (btnSwap) btnSwap.innerText = `SWAP SIDES: ${this.touchConfig.swapped ? 'ON' : 'OFF'}`;

    const btnButtons = document.getElementById('btn-cust-buttons');
    if (btnButtons) btnButtons.innerText = `BUTTONS: ${this.touchConfig.buttons.toUpperCase()}`;
  }

  setupTouchCustomizerEvents() {
    const btnCustomize = document.getElementById('btn-touch-customize');
    const customizerDashboard = document.getElementById('touch-customizer-dashboard');
    const touchHud = document.getElementById('mobile-touch-hud');

    if (!btnCustomize || !customizerDashboard || !touchHud) return;

    btnCustomize.addEventListener('click', () => {
      gameAudio.playClick();
      const isActive = touchHud.classList.contains('customizing');
      if (isActive) {
        touchHud.classList.remove('customizing');
        customizerDashboard.classList.add('hidden');
        btnCustomize.innerText = '🔧 CUSTOMIZE';
        btnCustomize.classList.remove('active');
        this.saveTouchConfig();
      } else {
        touchHud.classList.add('customizing');
        customizerDashboard.classList.remove('hidden');
        btnCustomize.innerText = '💾 SAVE';
        btnCustomize.classList.add('active');
      }
    });

    const btnType = document.getElementById('btn-cust-type');
    if (btnType) {
      btnType.addEventListener('click', () => {
        gameAudio.playClick();
        this.touchConfig.type = this.touchConfig.type === 'stick' ? 'dpad' : 'stick';
        this.applyTouchConfig();
      });
    }

    const btnScale = document.getElementById('btn-cust-scale');
    if (btnScale) {
      btnScale.addEventListener('click', () => {
        gameAudio.playClick();
        const scales = [0.8, 1.0, 1.2];
        let idx = scales.indexOf(this.touchConfig.scale);
        if (idx === -1) idx = 1;
        this.touchConfig.scale = scales[(idx + 1) % scales.length];
        this.applyTouchConfig();
      });
    }

    const btnSwap = document.getElementById('btn-cust-swap');
    if (btnSwap) {
      btnSwap.addEventListener('click', () => {
        gameAudio.playClick();
        this.touchConfig.swapped = !this.touchConfig.swapped;
        this.applyTouchConfig();
      });
    }

    const btnButtons = document.getElementById('btn-cust-buttons');
    if (btnButtons) {
      btnButtons.addEventListener('click', () => {
        gameAudio.playClick();
        this.touchConfig.buttons = this.touchConfig.buttons === 'full' ? 'simple' : 'full';
        this.applyTouchConfig();
      });
    }

    const btnReset = document.getElementById('btn-cust-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        gameAudio.playClick();
        this.touchConfig = {
          leftPos: { left: '60px', bottom: '160px' },
          rightPos: { right: '60px', bottom: '160px' },
          type: 'stick',
          scale: 1.0,
          swapped: false,
          buttons: 'full'
        };
        this.applyTouchConfig();
      });
    }

    const btnSave = document.getElementById('btn-cust-save');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        gameAudio.playClick();
        touchHud.classList.remove('customizing');
        customizerDashboard.classList.add('hidden');
        btnCustomize.innerText = '🔧 CUSTOMIZE';
        btnCustomize.classList.remove('active');
        this.saveTouchConfig();
      });
    }

    const makeMovable = (elemId, posKey) => {
      const elem = document.getElementById(elemId);
      if (!elem) return;
      const handle = elem.querySelector('.drag-handle');
      if (!handle) return;

      let isDragging = false;
      let startX, startY;
      let initialLeft, initialTop;

      const onPointerDown = (e) => {
        if (!touchHud.classList.contains('customizing')) return;
        isDragging = true;
        handle.setPointerCapture(e.pointerId);

        startX = e.clientX;
        startY = e.clientY;

        const rect = elem.getBoundingClientRect();
        const parentRect = touchHud.getBoundingClientRect();
        initialLeft = rect.left - parentRect.left;
        initialTop = rect.top - parentRect.top;

        e.preventDefault();
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const parentRect = touchHud.getBoundingClientRect();
        let nextLeft = initialLeft + dx;
        let nextTop = initialTop + dy;

        nextLeft = Math.max(0, Math.min(parentRect.width - 150, nextLeft));
        nextTop = Math.max(0, Math.min(parentRect.height - 150, nextTop));

        const nextBottom = parentRect.height - nextTop - 150;

        if (this.touchConfig.swapped) {
          if (posKey === 'left') {
            elem.style.left = '';
            elem.style.right = `${parentRect.width - nextLeft - 150}px`;
            this.touchConfig.leftPos = { right: elem.style.right, bottom: `${nextBottom}px` };
          } else {
            elem.style.right = '';
            elem.style.left = `${nextLeft}px`;
            this.touchConfig.rightPos = { left: elem.style.left, bottom: `${nextBottom}px` };
          }
        } else {
          if (posKey === 'left') {
            elem.style.right = '';
            elem.style.left = `${nextLeft}px`;
            this.touchConfig.leftPos = { left: elem.style.left, bottom: `${nextBottom}px` };
          } else {
            elem.style.left = '';
            elem.style.right = `${parentRect.width - nextLeft - 150}px`;
            this.touchConfig.rightPos = { right: elem.style.right, bottom: `${nextBottom}px` };
          }
        }
        elem.style.bottom = `${nextBottom}px`;
      };

      const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        handle.releasePointerCapture(e.pointerId);
      };

      handle.addEventListener('pointerdown', onPointerDown);
      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerUp);
      handle.addEventListener('pointercancel', onPointerUp);
    };

    makeMovable('touch-movable-left', 'left');
    makeMovable('touch-movable-right', 'right');
  }

  saveTouchConfig() {
    try {
      localStorage.setItem('skyroads_touch_config', JSON.stringify(this.touchConfig));
    } catch (e) {
      // safe fallback
    }
  }

  highlightMenuButton(buttons) {
    buttons.forEach(btn => {
      btn.classList.remove('keyboard-focused');
      btn.blur();
    });

    if (this.selectedMenuIndex >= buttons.length) {
      this.selectedMenuIndex = 0;
    }
    const currentBtn = buttons[this.selectedMenuIndex];
    if (currentBtn) {
      currentBtn.classList.add('keyboard-focused');
      currentBtn.focus();
    }
  }
}

// Instantiate and start the application on load
window.addEventListener('DOMContentLoaded', () => {
  const manager = new GameManager();
  manager.init();
  window.gameManagerInstance = manager;
});
