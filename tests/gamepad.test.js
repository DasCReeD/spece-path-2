import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardController } from '../physics.js';

describe('Gamepad Controller Integration', () => {
  let keyboard;
  let mockGamepads;
  let mockLocalStorage;

  beforeEach(() => {
    // Mock navigator.getGamepads
    mockGamepads = [];
    vi.stubGlobal('navigator', {
      getGamepads: () => mockGamepads
    });

    // Mock localStorage
    const store = {};
    mockLocalStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, val) => { store[key] = String(val); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { for (const k in store) { delete store[k]; } })
    };
    vi.stubGlobal('localStorage', mockLocalStorage);

    keyboard = new KeyboardController();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize with default gamepad settings', () => {
    expect(keyboard.gamepadConnected).toBe(false);
    expect(keyboard.gamepad.forward).toBe(false);
    expect(keyboard.gamepad.backward).toBe(false);
    expect(keyboard.gamepad.jump).toBe(false);
    expect(keyboard.gamepad.left).toBe(false);
    expect(keyboard.gamepad.right).toBe(false);
    expect(keyboard.gamepad.steerAmount).toBe(0);
  });

  it('should detect a connected gamepad on poll', () => {
    // Mock a connected gamepad
    mockGamepads = [
      {
        buttons: Array(17).fill(null).map(() => ({ pressed: false })),
        axes: [0, 0]
      }
    ];

    keyboard.pollGamepad();

    expect(keyboard.gamepadConnected).toBe(true);
  });

  it('should map gamepad button states to digital controls', () => {
    // RT (button 7) is Accelerate, LT (button 6) is Brake, A (button 0) is Jump, D-pad Left (button 14), D-pad Right (button 15)
    mockGamepads = [
      {
        buttons: Array(17).fill(null).map((_, i) => ({ pressed: i === 7 || i === 0 })),
        axes: [0, 0]
      }
    ];

    keyboard.pollGamepad();
    keyboard.updateCombinedState();

    expect(keyboard.gamepad.forward).toBe(true);
    expect(keyboard.gamepad.jump).toBe(true);
    expect(keyboard.gamepad.backward).toBe(false);
    expect(keyboard.forward).toBe(true);
    expect(keyboard.jump).toBe(true);
  });

  it('should apply deadzone to left stick analog steering axis', () => {
    // Axis 0 is steering. Max analog is -1 to 1.
    // Case 1: Within deadzone (e.g. 0.10, deadzone is 0.15)
    mockGamepads = [
      {
        buttons: Array(17).fill(null).map(() => ({ pressed: false })),
        axes: [0.10]
      }
    ];

    keyboard.pollGamepad();
    expect(keyboard.gamepad.steerAmount).toBe(0);
    expect(keyboard.gamepad.left).toBe(false);
    expect(keyboard.gamepad.right).toBe(false);

    // Case 2: Outside deadzone positive (steer right)
    mockGamepads[0].axes[0] = 0.5;
    keyboard.pollGamepad();
    expect(keyboard.gamepad.steerAmount).toBe(0.5);
    expect(keyboard.gamepad.right).toBe(true);
    expect(keyboard.gamepad.left).toBe(false);

    // Case 3: Outside deadzone negative (steer left)
    mockGamepads[0].axes[0] = -0.8;
    keyboard.pollGamepad();
    expect(keyboard.gamepad.steerAmount).toBe(-0.8);
    expect(keyboard.gamepad.left).toBe(true);
    expect(keyboard.gamepad.right).toBe(false);
  });

  it('should capture mapped gamepad buttons in custom mapper mode', () => {
    // Mock a connected gamepad
    mockGamepads = [
      {
        buttons: Array(17).fill(null).map(() => ({ pressed: false })),
        axes: [0, 0]
      }
    ];

    const mapCompleteSpy = vi.fn();
    keyboard.onGamepadMapComplete = mapCompleteSpy;

    // Start mapping "forward" (Accelerate) action
    keyboard.currentlyMappingAction = 'forward';

    // Simulate pressing Button 5 (RB)
    mockGamepads[0].buttons[5] = { pressed: true };
    
    keyboard.pollGamepad();

    // Verify it updated the mapping
    expect(keyboard.gamepadMappings.forward).toBe(5);
    expect(keyboard.currentlyMappingAction).toBeNull();
    expect(mapCompleteSpy).toHaveBeenCalledWith('forward', 5);

    // Verify it saved the mappings to localStorage
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'skyroads_gamepad_mappings',
      expect.stringContaining('"forward":5')
    );
  });

  it('should load saved mappings from localStorage if they exist', () => {
    // Seed localStorage mock
    const customMappings = {
      forward: 5,
      backward: 4,
      jump: 1
    };
    mockLocalStorage.getItem.mockReturnValueOnce(JSON.stringify(customMappings));

    const newKeyboard = new KeyboardController();
    expect(newKeyboard.gamepadMappings.forward).toBe(5);
    expect(newKeyboard.gamepadMappings.backward).toBe(4);
    expect(newKeyboard.gamepadMappings.jump).toBe(1);
    expect(newKeyboard.gamepadMappings.left).toBe(14); // Remains default
  });

  it('should consume single-trigger actions cycleCamera and togglePause correctly', () => {
    mockGamepads = [
      {
        buttons: Array(17).fill(null).map(() => ({ pressed: false })),
        axes: [0, 0]
      }
    ];

    // Press Cycle Camera (Y / Button 3)
    mockGamepads[0].buttons[3] = { pressed: true };
    keyboard.pollGamepad();
    expect(keyboard.gamepad.cycleCameraPressed).toBe(true);

    // Should consume the action only once
    expect(keyboard.consumeCycleCamera()).toBe(true);
    expect(keyboard.gamepad.cycleCameraPressed).toBe(false);
    expect(keyboard.consumeCycleCamera()).toBe(false);
  });

  describe('Menu navigation input transitions', () => {
    beforeEach(() => {
      mockGamepads = [
        {
          buttons: Array(17).fill(null).map(() => ({ pressed: false })),
          axes: [0, 0]
        }
      ];
    });

    it('should detect when D-pad menu buttons are just pressed', () => {
      // D-pad Down is button 13
      mockGamepads[0].buttons[13] = { pressed: true };
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(true);

      // Subsequent poll with button still held should not register as menuDown transition
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(false);

      // Releasing button
      mockGamepads[0].buttons[13] = { pressed: false };
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(false);

      // Pressing again
      mockGamepads[0].buttons[13] = { pressed: true };
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(true);
    });

    it('should detect menu directions from analog stick movements', () => {
      // Analog Stick Y axis is index 1. Push stick down (Y > 0.5)
      mockGamepads[0].axes[1] = 0.6;
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(true);

      // Holding stick down should not trigger menuDown again
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(false);

      // Return stick to neutral (Y = 0)
      mockGamepads[0].axes[1] = 0;
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(false);

      // Push stick down again
      mockGamepads[0].axes[1] = 0.7;
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuDown).toBe(true);
    });

    it('should detect when A (Select) and B (Cancel) menu buttons are just pressed', () => {
      // A button (0)
      mockGamepads[0].buttons[0] = { pressed: true };
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuSelect).toBe(true);

      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuSelect).toBe(false);

      // B button (1)
      mockGamepads[0].buttons[1] = { pressed: true };
      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuCancel).toBe(true);

      keyboard.pollGamepad();
      expect(keyboard.gamepad.menuCancel).toBe(false);
    });
  });
});
