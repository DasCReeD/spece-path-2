// touchControls.js — Individual button touch control system
// Each button is independently positionable with tight bounding boxes.
// Customizer mode isolates the active button so only it receives events.
//
// Integrates with:
//   KeyboardController  (physics.js) — setTouchState, setTouchSteerAmount, setTouchJoystickY
//   GraphicsEngine       (graphics.js) — toggleCameraMode, cycleTrackCurvature, cycleZoomLevel
//   App                  (app.js) — toggleSettingsMenu

// ─── CONSTANTS ───────────────────────────────────────────────
const STORAGE_KEY = 'skyroads_touch_v2';
const CONFIG_VERSION = 2;
const MIN_BUTTON_SCALE = 0.5;
const MAX_BUTTON_SCALE = 2.0;
const SCALE_STEP = 0.1;
const JOYSTICK_DEADZONE = 0.15;
const RESIZE_DEBOUNCE_MS = 150;
const ORIENTATION_SETTLE_MS = 300;

/**
 * TouchControlManager — manages the mobile touch HUD, joystick,
 * d-pad, per-button drag-customisation, and config persistence.
 */
export class TouchControlManager {
  constructor() {
    /** @type {import('./physics.js').KeyboardController|null} */
    this.keyboard = null;
    /** @type {object|null} GraphicsEngine reference */
    this.graphics = null;
    /** @type {object|null} App reference (for toggleSettingsMenu) */
    this.app = null;
    /** @type {HTMLElement|null} #mobile-touch-hud */
    this.hudElement = null;

    this.customizing = false;
    /** During customisation only this button receives events */
    this.activeButtonId = null;
    /** 'stick' | 'dpad' */
    this.steerType = 'stick';
    /** Global scale multiplier (reserved for future use) */
    this.ctrlScale = 1.0;

    /**
     * Button registry — populated from DOM elements that carry
     * a `data-touch-id` attribute.
     * @type {Map<string, {element: HTMLElement, action: string|null}>}
     */
    this.buttons = new Map();

    // Joystick drag state
    this.joystickDragging = false;
    this.joystickPointerId = null;

    // Default positions using anchor system
    // anchor: 'bl'=bottom-left, 'br'=bottom-right,
    //         'tl'=top-left,    'tr'=top-right,    'tc'=top-center
    // x,y are offsets from the anchor corner in pixels
    this.defaultConfig = Object.freeze({
      version: CONFIG_VERSION,
      steerType: 'stick',
      buttons: {
        'steer':    { x: 30,   y: -30,  anchor: 'bl', scale: 1.0 },
        'thrust':   { x: -30,  y: -30,  anchor: 'br', scale: 1.0 },
        'brake':    { x: -130, y: -30,  anchor: 'br', scale: 1.0 },
        'jump':     { x: -80,  y: -130, anchor: 'br', scale: 1.0 },
        'rewind':   { x: 20,   y: 70,   anchor: 'tl', scale: 0.85 },
        'cam':      { x: -20,  y: 70,   anchor: 'tr', scale: 0.85 },
        'curve':    { x: -20,  y: 130,  anchor: 'tr', scale: 0.85 },
        'zoom-in':  { x: -80,  y: 70,   anchor: 'tr', scale: 0.75 },
        'zoom-out': { x: -140, y: 70,   anchor: 'tr', scale: 0.75 },
        'pause':    { x: -20,  y: 15,   anchor: 'tr', scale: 0.85 }
      }
    });

    /** @type {object|null} Live mutable config */
    this.config = null;
  }

  // ─── PUBLIC API ──────────────────────────────────────────────

  /**
   * Initialise the touch manager. Called once after DOM is ready.
   * @param {object} keyboard - KeyboardController instance
   * @param {object} graphics - GraphicsEngine instance
   * @param {object} app      - App instance (for toggleSettingsMenu etc.)
   */
  init(keyboard, graphics, app) {
    if (!keyboard || !graphics || !app) {
      throw new Error('TouchControlManager.init requires keyboard, graphics, and app');
    }
    this.keyboard = keyboard;
    this.graphics = graphics;
    this.app = app;
    this.hudElement = document.getElementById('mobile-touch-hud');

    if (!this.hudElement) {
      throw new Error('TouchControlManager: #mobile-touch-hud not found in DOM');
    }

    this.loadConfig();
    this.registerButtons();
    this.applyConfig();
    this.bindGameEvents();
    this.bindCustomizerEvents();
    this.bindResizeHandler();
  }

  /** Show the touch HUD overlay */
  show() {
    if (this.hudElement) this.hudElement.classList.remove('hidden');
  }

  /** Hide the touch HUD overlay */
  hide() {
    if (this.hudElement) this.hudElement.classList.add('hidden');
  }

  // ─── BUTTON REGISTRATION ──────────────────────────────────

  /**
   * Scan the HUD element for children carrying `data-touch-id`
   * and register them in the button map.
   */
  registerButtons() {
    const btnElements = this.hudElement.querySelectorAll('[data-touch-id]');
    for (const el of btnElements) {
      const touchId = el.dataset.touchId;
      this.buttons.set(touchId, {
        element: el,
        action: el.dataset.action || null
      });
    }
  }

  // ─── CONFIG PERSISTENCE ────────────────────────────────────

  /** Load config from localStorage, falling back to defaults. */
  loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.version === CONFIG_VERSION) {
          this.config = parsed;
          this.steerType = parsed.steerType || 'stick';
          return;
        }
      } catch {
        // Corrupted data — fall through to defaults
      }
    }
    this.config = JSON.parse(JSON.stringify(this.defaultConfig));
    this.steerType = this.config.steerType;
  }

  /** Persist current config to localStorage. */
  saveConfig() {
    const snapshot = { ...this.config, steerType: this.steerType };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  /** Reset config to factory defaults and re-apply. */
  resetConfig() {
    this.config = JSON.parse(JSON.stringify(this.defaultConfig));
    this.steerType = this.config.steerType;
    this.applyConfig();
    this.saveConfig();
  }

  // ─── ANCHOR POSITIONING ────────────────────────────────────

  /**
   * Convert anchor-based position to absolute CSS left/top.
   * @param {'bl'|'br'|'tl'|'tr'|'tc'} anchor - Screen corner
   * @param {number} x        - Horizontal offset (positive = inward)
   * @param {number} y        - Vertical offset (positive = inward for top, negative for bottom)
   * @param {number} elWidth  - Element width in px
   * @param {number} elHeight - Element height in px
   * @returns {{left: number, top: number}}
   */
  anchorToCSS(anchor, x, y, elWidth, elHeight) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left, top;

    switch (anchor) {
      case 'bl':
        left = x;
        top = vh + y - elHeight;
        break;
      case 'br':
        left = vw + x - elWidth;
        top = vh + y - elHeight;
        break;
      case 'tl':
        left = x;
        top = y;
        break;
      case 'tr':
        left = vw + x - elWidth;
        top = y;
        break;
      case 'tc':
        left = (vw / 2) + x - (elWidth / 2);
        top = y;
        break;
      default:
        left = x;
        top = y;
    }

    // Clamp to viewport so buttons never escape off-screen
    left = Math.max(0, Math.min(vw - elWidth, left));
    top = Math.max(0, Math.min(vh - elHeight, top));

    return { left, top };
  }

  /**
   * Inverse of anchorToCSS — convert absolute left/top back to
   * anchor-relative offsets for config persistence.
   * @param {'bl'|'br'|'tl'|'tr'|'tc'} anchor
   * @param {number} left
   * @param {number} top
   * @param {number} elWidth
   * @param {number} elHeight
   * @returns {{x: number, y: number}}
   */
  cssToAnchor(anchor, left, top, elWidth, elHeight) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    switch (anchor) {
      case 'bl': return { x: left, y: top - vh + elHeight };
      case 'br': return { x: left - vw + elWidth, y: top - vh + elHeight };
      case 'tl': return { x: left, y: top };
      case 'tr': return { x: left - vw + elWidth, y: top };
      case 'tc': return { x: left - (vw / 2) + (elWidth / 2), y: top };
      default:   return { x: left, y: top };
    }
  }

  /**
   * Apply the current config to every registered button:
   * set scale via CSS transform and position via anchor math.
   * Also toggles stick/dpad visibility.
   */
  applyConfig() {
    for (const [touchId, btnInfo] of this.buttons) {
      const cfg = this.config.buttons[touchId];
      if (!cfg) continue;

      const el = btnInfo.element;
      const scale = cfg.scale || 1.0;
      el.style.transform = `scale(${scale})`;

      // Measure element size (post-scale)
      const rect = el.getBoundingClientRect();
      const w = rect.width || 60;
      const h = rect.height || 60;

      const pos = this.anchorToCSS(cfg.anchor, cfg.x, cfg.y, w, h);
      
      // Adjust layout box left/top so visual box is at pos.left/pos.top
      const layoutLeft = pos.left - el.offsetWidth / 2 + w / 2;
      const layoutTop = pos.top - el.offsetHeight / 2 + h / 2;

      el.style.left = `${layoutLeft}px`;
      el.style.top = `${layoutTop}px`;
    }

    this.applySteerTypeVisibility();
  }

  /** Toggle visibility of joystick-base vs touch-dpad-view. */
  applySteerTypeVisibility() {
    const joystickBase = document.getElementById('joystick-base');
    const dpadView = document.getElementById('touch-dpad-view');

    if (!joystickBase || !dpadView) return;

    if (this.steerType === 'dpad') {
      joystickBase.classList.add('hidden');
      dpadView.classList.remove('hidden');
    } else {
      joystickBase.classList.remove('hidden');
      dpadView.classList.add('hidden');
    }
  }

  // ─── GAME INPUT EVENTS ─────────────────────────────────────

  /**
   * Wire up pointer/touch listeners for every registered button,
   * the d-pad, the pause button, and the analogue joystick.
   */
  bindGameEvents() {
    this.bindActionButtons();
    this.bindDPadButtons();
    this.bindPauseButton();
    this.bindJoystick();
  }

  /** Bind physics-state and UI-action buttons. */
  bindActionButtons() {
    for (const [, btnInfo] of this.buttons) {
      const el = btnInfo.element;
      const action = btnInfo.action;
      if (!action) continue;

      // UI-only actions — single pointerdown, no hold state
      if (this.isUIAction(action)) {
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.customizing) return;
          this.handleUIAction(action);
        }, { passive: false });
        continue;
      }

      // Physics state actions (forward, backward, jump, rewind)
      this.bindHoldButton(el, action);
    }
  }

  /**
   * @param {string} action
   * @returns {boolean} true if this action is a one-shot UI toggle
   */
  isUIAction(action) {
    return ['cam', 'curve', 'zoom-in', 'zoom-out'].includes(action);
  }

  /**
   * Wire a "hold" button that sets touch state on press and clears on release.
   * Listens to both touch* and pointer* for simulator / desktop compatibility.
   * @param {HTMLElement} el
   * @param {string} action
   */
  bindHoldButton(el, action) {
    const onDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.customizing) return;
      el.classList.add('pressed');
      this.keyboard.setTouchState(action, true);
    };

    const onUp = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      this.keyboard.setTouchState(action, false);
    };

    // Touch events (primary on real devices)
    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('touchend', onUp, { passive: false });
    el.addEventListener('touchcancel', onUp, { passive: false });

    // Pointer events (desktop fallback / simulator)
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: false });
    el.addEventListener('pointerleave', onUp, { passive: false });
  }

  /** Bind d-pad directional buttons (left, right, forward, backward). */
  bindDPadButtons() {
    const dpadBtns = this.hudElement.querySelectorAll('.dpad-btn');
    for (const btn of dpadBtns) {
      const action = btn.dataset.action;
      if (!action) continue;
      this.bindHoldButton(btn, action);
    }
  }

  /** Bind the pause button to toggle the settings menu. */
  bindPauseButton() {
    const pauseBtn = document.getElementById('touch-btn-pause');
    if (!pauseBtn) return;

    pauseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.customizing) return;
      if (this.app && typeof this.app.toggleSettingsMenu === 'function') {
        this.app.toggleSettingsMenu();
      }
    });
  }

  /**
   * Dispatch a one-shot UI action (camera mode, curvature, zoom).
   * @param {string} action
   */
  handleUIAction(action) {
    if (!this.graphics) return;

    switch (action) {
      case 'cam':
        this.graphics.toggleCameraMode();
        this.updateHUDLabel('hud-cam-mode', () =>
          this.graphics.cameraMode ? this.graphics.cameraMode.toUpperCase() : ''
        );
        break;

      case 'curve':
        this.handleCurveCycle();
        break;

      case 'zoom-in':
        this.graphics.cycleZoomLevel(-1);
        break;

      case 'zoom-out':
        this.graphics.cycleZoomLevel(1);
        break;

      default:
        break;
    }
  }

  /** Cycle track curvature and update related HUD elements. */
  handleCurveCycle() {
    const label = this.graphics.cycleTrackCurvature();

    this.updateHUDLabel('hud-track-curve', () => label);

    const slider = document.getElementById('hud-curve-slider');
    if (slider) slider.value = String(this.graphics.trackCurvatureRadius);

    const valEl = document.getElementById('hud-curve-val');
    if (valEl) valEl.innerText = String(Math.round(this.graphics.trackCurvatureRadius));
  }

  /**
   * Safely update a HUD label element's text content.
   * @param {string} elementId
   * @param {() => string} valueFn - Deferred value getter
   */
  updateHUDLabel(elementId, valueFn) {
    const el = document.getElementById(elementId);
    if (el) el.innerText = valueFn();
  }

  // ─── JOYSTICK ──────────────────────────────────────────────

  /** Wire the analogue joystick with pointer capture for smooth dragging. */
  bindJoystick() {
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');
    if (!joystickBase || !joystickKnob) return;

    let centerX = 0;
    let centerY = 0;

    const onStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.customizing) return;

      this.joystickDragging = true;
      this.joystickPointerId = e.pointerId;
      joystickBase.setPointerCapture(e.pointerId);

      const rect = joystickBase.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
    };

    const onMove = (e) => {
      if (!this.joystickDragging || e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();

      const rect = joystickBase.getBoundingClientRect();
      const maxDist = rect.width / 2 * 0.8;

      let dx = e.clientX - centerX;
      let dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Clamp to circular boundary
      if (dist > maxDist) {
        dx = dx / dist * maxDist;
        dy = dy / dist * maxDist;
      }

      // Divide by active steer scale to offset knob centering drift
      const scale = (this.config && this.config.buttons && this.config.buttons['steer'] && this.config.buttons['steer'].scale) || 1.0;
      const localDx = dx / scale;
      const localDy = dy / scale;

      joystickKnob.style.transform = `translate(calc(-50% + ${localDx}px), calc(-50% + ${localDy}px))`;

      // Normalise to -1..1
      const normX = dx / maxDist;
      const normY = dy / maxDist;

      this.keyboard.setTouchSteerAmount(normX);

      // Joystick Y → forward/backward (when enabled in settings)
      if (this.keyboard.touchJoystickThrottleEnabled) {
        this.keyboard.setTouchJoystickY(normY);
      }

      // Binary left/right with deadzone
      this.keyboard.touch.left = normX < -JOYSTICK_DEADZONE;
      this.keyboard.touch.right = normX > JOYSTICK_DEADZONE;
    };

    const onEnd = (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickDragging = false;
      this.joystickPointerId = null;

      // Spring knob back to centre
      joystickKnob.style.transform = 'translate(-50%, -50%)';
      this.keyboard.setTouchSteerAmount(0);
      this.keyboard.touch.left = false;
      this.keyboard.touch.right = false;

      if (this.keyboard.touchJoystickThrottleEnabled) {
        this.keyboard.touch.forward = false;
        this.keyboard.touch.backward = false;
      }
    };

    joystickBase.addEventListener('pointerdown', onStart, { passive: false });
    joystickBase.addEventListener('pointermove', onMove, { passive: false });
    joystickBase.addEventListener('pointerup', onEnd, { passive: false });
    joystickBase.addEventListener('pointercancel', onEnd, { passive: false });
  }

  // ─── CUSTOMISER MODE ───────────────────────────────────────

  /** Wire the customiser toolbar (edit, type, scale, reset, done). */
  bindCustomizerEvents() {
    this.bindEditToggle();
    this.bindTypeToggle();
    this.bindScaleButtons();
    this.bindResetButton();
    this.bindDoneButton();

    // Bind dragging handlers exactly once during initialization
    for (const [touchId, btnInfo] of this.buttons) {
      this.makeButtonDraggable(touchId, btnInfo.element);
    }
  }

  /** Toggle customise mode via the pencil/check button. */
  bindEditToggle() {
    const editBtn = document.getElementById('touch-btn-edit');
    if (!editBtn) return;

    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.customizing) {
        this.exitCustomizeMode();
      } else {
        this.enterCustomizeMode();
      }
    });
  }

  /** Toggle between stick and d-pad steering. */
  bindTypeToggle() {
    const typeBtn = document.getElementById('btn-cust-type');
    if (!typeBtn) return;

    typeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.steerType = this.steerType === 'stick' ? 'dpad' : 'stick';
      typeBtn.textContent = this.steerType === 'stick' ? '🕹️ STICK' : '✚ DPAD';
      this.applyConfig();
    });
  }

  /** Wire scale-decrease and scale-increase buttons. */
  bindScaleButtons() {
    const scaleDecBtn = document.getElementById('btn-cust-scale-dec');
    const scaleIncBtn = document.getElementById('btn-cust-scale-inc');

    if (scaleDecBtn) {
      scaleDecBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.adjustActiveButtonScale(-SCALE_STEP);
      });
    }

    if (scaleIncBtn) {
      scaleIncBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.adjustActiveButtonScale(SCALE_STEP);
      });
    }
  }

  /**
   * Adjust the scale of the currently selected button.
   * @param {number} delta - Positive to grow, negative to shrink
   */
  adjustActiveButtonScale(delta) {
    if (!this.activeButtonId) return;
    const cfg = this.config.buttons[this.activeButtonId];
    if (!cfg) return;

    const current = cfg.scale || 1.0;
    cfg.scale = Math.max(MIN_BUTTON_SCALE, Math.min(MAX_BUTTON_SCALE, current + delta));
    this.applyConfig();
  }

  /** Wire the reset-to-defaults button. */
  bindResetButton() {
    const resetBtn = document.getElementById('btn-cust-reset');
    if (!resetBtn) return;

    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.resetConfig();
    });
  }

  /** Wire the "done" button to exit customise mode. */
  bindDoneButton() {
    const doneBtn = document.getElementById('btn-cust-done');
    if (!doneBtn) return;

    doneBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.exitCustomizeMode();
    });
  }

  /** Enter customise mode — show overlay, make buttons draggable. */
  enterCustomizeMode() {
    this.customizing = true;
    this.hudElement.classList.add('customizing');

    const overlay = document.getElementById('touch-customizer-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const editBtn = document.getElementById('touch-btn-edit');
    if (editBtn) {
      editBtn.innerHTML = `
        <svg class="touch-icon" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    }
  }

  /** Exit customise mode — hide overlay, persist config. */
  exitCustomizeMode() {
    this.customizing = false;
    this.activeButtonId = null;
    this.hudElement.classList.remove('customizing');

    const overlay = document.getElementById('touch-customizer-overlay');
    if (overlay) overlay.classList.add('hidden');

    const editBtn = document.getElementById('touch-btn-edit');
    if (editBtn) {
      editBtn.innerHTML = `
        <svg class="touch-icon" viewBox="0 0 24 24">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
      `;
    }

    // Clear visual selection from all buttons
    for (const [, btnInfo] of this.buttons) {
      btnInfo.element.classList.remove('dragging');
    }

    this.saveConfig();
  }

  /**
   * Attach pointer-capture drag handlers to a button for repositioning.
   * @param {string} touchId - Button identifier
   * @param {HTMLElement} el - Button DOM element
   */
  makeButtonDraggable(touchId, el) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;
    let dragPointerId = null;

    const onDown = (e) => {
      if (!this.customizing) return;
      e.preventDefault();
      e.stopPropagation();

      dragging = true;
      dragPointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);

      // Add dragging-active class to hudElement to isolate other buttons
      if (this.hudElement) {
        this.hudElement.classList.add('dragging-active');
      }

      // Select this button (isolate it visually)
      this.activeButtonId = touchId;
      for (const [id, btn] of this.buttons) {
        btn.element.classList.toggle('dragging', id === touchId);
      }

      startX = e.clientX;
      startY = e.clientY;
      origLeft = el.offsetLeft;
      origTop = el.offsetTop;
    };

    const onMove = (e) => {
      if (!dragging || e.pointerId !== dragPointerId) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const rect = el.getBoundingClientRect();
      const w = rect.width || el.offsetWidth;
      const h = rect.height || el.offsetHeight;

      // Calculate original visual left/top from layout coordinates
      const origVLeft = origLeft + el.offsetWidth / 2 - w / 2;
      const origVTop = origTop + el.offsetHeight / 2 - h / 2;

      // Clamped visual left/top within viewport
      const newVLeft = Math.max(0, Math.min(window.innerWidth - w, origVLeft + dx));
      const newVTop = Math.max(0, Math.min(window.innerHeight - h, origVTop + dy));

      // Translate back to layout coordinates
      const newLeft = newVLeft - el.offsetWidth / 2 + w / 2;
      const newTop = newVTop - el.offsetHeight / 2 + h / 2;

      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;
    };

    const onUp = (e) => {
      if (!dragging || e.pointerId !== dragPointerId) return;
      dragging = false;
      dragPointerId = null;

      // Remove dragging-active class
      if (this.hudElement) {
        this.hudElement.classList.remove('dragging-active');
      }

      // Persist new position as anchor-relative offsets
      const cfg = this.config.buttons[touchId];
      if (cfg) {
        const rect = el.getBoundingClientRect();
        const w = rect.width || el.offsetWidth;
        const h = rect.height || el.offsetHeight;

        // Calculate visual left/top
        const vLeft = el.offsetLeft + el.offsetWidth / 2 - w / 2;
        const vTop = el.offsetTop + el.offsetHeight / 2 - h / 2;

        const pos = this.cssToAnchor(
          cfg.anchor, vLeft, vTop,
          w, h
        );
        cfg.x = pos.x;
        cfg.y = pos.y;
      }
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: false });
    el.addEventListener('pointercancel', onUp, { passive: false });
  }

  // ─── AUTO-RELAYOUT ON RESIZE ───────────────────────────────

  /** Debounced resize + orientation-change handler to re-apply positions. */
  bindResizeHandler() {
    let resizeTimeout = null;

    window.addEventListener('resize', () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.applyConfig();
      }, RESIZE_DEBOUNCE_MS);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.applyConfig(), ORIENTATION_SETTLE_MS);
    });
  }
}
