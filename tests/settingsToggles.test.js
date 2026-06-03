import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { KeyboardController } from '../physics.js';
import { CockpitConsole3D } from '../cockpitConsole.js';

// Mock canvas and 2D context
const mockCtx2d = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  shadowColor: '',
  shadowBlur: 0
};

const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...args) {
  if (type === '2d') return mockCtx2d;
  return originalGetContext.call(this, type, ...args);
};

describe('Settings Toggles & Mobile Features', () => {
  let keyboard;
  let camera;
  let cockpit;

  beforeEach(() => {
    vi.clearAllMocks();
    keyboard = new KeyboardController();
    camera = new THREE.PerspectiveCamera(65, 800 / 600, 0.1, 1000);
    cockpit = new CockpitConsole3D(camera);
    
    // Clear localStorage Mock
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Stick Throttle Option', () => {
    it('should initialize with touchJoystickThrottleEnabled as false', () => {
      expect(keyboard.touchJoystickThrottleEnabled).toBe(false);
    });

    it('should not set forward/backward flags when touchJoystickThrottleEnabled is false', () => {
      keyboard.setTouchJoystickY(-0.8); // Dragged forward (up)
      expect(keyboard.touch.forward).toBe(false);
      expect(keyboard.touch.backward).toBe(false);

      keyboard.setTouchJoystickY(0.8); // Dragged backward (down)
      expect(keyboard.touch.forward).toBe(false);
      expect(keyboard.touch.backward).toBe(false);
    });

    it('should set forward/backward flags correctly when touchJoystickThrottleEnabled is true', () => {
      keyboard.touchJoystickThrottleEnabled = true;

      // Dragged forward (up) -> acceleration (forward) active
      keyboard.setTouchJoystickY(-0.8);
      expect(keyboard.touch.forward).toBe(true);
      expect(keyboard.touch.backward).toBe(false);

      // Dragged backward (down) -> braking (backward) active
      keyboard.setTouchJoystickY(0.8);
      expect(keyboard.touch.forward).toBe(false);
      expect(keyboard.touch.backward).toBe(true);

      // Joystick near center -> coasting (neither active)
      keyboard.setTouchJoystickY(-0.1);
      expect(keyboard.touch.forward).toBe(false);
      expect(keyboard.touch.backward).toBe(false);

      keyboard.setTouchJoystickY(0.1);
      expect(keyboard.touch.forward).toBe(false);
      expect(keyboard.touch.backward).toBe(false);
    });
  });

  describe('3D Cockpit Console Visibility Toggle', () => {
    const mockPhysics = {
      velocity: new THREE.Vector3(0, 0, 0),
      activeEffects: {}
    };

    it('should default bottomHudEnabled to true when gameManagerInstance or localStorage is missing', () => {
      if (typeof window !== 'undefined') {
        delete window.gameManagerInstance;
      }
      cockpit.update(mockPhysics, null, 'follow');
      expect(cockpit.group.visible).toBe(true);
    });

    it('should hide the 3D cockpit console group when bottomHudEnabled is false via window.gameManagerInstance', () => {
      if (typeof window !== 'undefined') {
        window.gameManagerInstance = { bottomHudEnabled: false };
      }
      cockpit.update(mockPhysics, null, 'follow');
      expect(cockpit.group.visible).toBe(false);
    });

    it('should show the 3D cockpit console group when bottomHudEnabled is true via window.gameManagerInstance', () => {
      if (typeof window !== 'undefined') {
        window.gameManagerInstance = { bottomHudEnabled: true };
      }
      cockpit.update(mockPhysics, null, 'follow');
      expect(cockpit.group.visible).toBe(true);
    });
  });
});
