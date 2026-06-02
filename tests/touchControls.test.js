import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardController, PhysicsEngine } from '../physics.js';

describe('KeyboardController - Touch Controls Integration', () => {
  let keyboard;

  beforeEach(() => {
    keyboard = new KeyboardController();
    keyboard.touchControlsEnabled = true;
  });

  // 1. Initial State
  describe('Initial state', () => {
    it('should initialize touch states to false', () => {
      expect(keyboard.touch.forward).toBe(false);
      expect(keyboard.touch.backward).toBe(false);
      expect(keyboard.touch.left).toBe(false);
      expect(keyboard.touch.right).toBe(false);
      expect(keyboard.touch.jump).toBe(false);
    });

    it('should start with touch controls disabled by default', () => {
      const freshController = new KeyboardController();
      expect(freshController.touchControlsEnabled).toBe(false);
    });
  });

  // 2. setTouchState
  describe('setTouchState()', () => {
    it('should set individual touch state and update combined state when touchControlsEnabled is true', () => {
      keyboard.setTouchState('forward', true);
      expect(keyboard.touch.forward).toBe(true);
      expect(keyboard.forward).toBe(true);
    });

    it('should clear touch state and update combined state when touch state goes to false', () => {
      keyboard.setTouchState('forward', true);
      expect(keyboard.forward).toBe(true);

      keyboard.setTouchState('forward', false);
      expect(keyboard.touch.forward).toBe(false);
      expect(keyboard.forward).toBe(false);
    });

    it('should NOT affect combined state if touchControlsEnabled is false', () => {
      keyboard.touchControlsEnabled = false;
      keyboard.setTouchState('jump', true);
      
      expect(keyboard.touch.jump).toBe(true);
      expect(keyboard.jump).toBe(false); // Combined state remains false
    });

    it('should support multiple concurrent touch events (multi-touch)', () => {
      keyboard.setTouchState('forward', true);
      keyboard.setTouchState('left', true);
      keyboard.setTouchState('jump', true);

      expect(keyboard.forward).toBe(true);
      expect(keyboard.left).toBe(true);
      expect(keyboard.jump).toBe(true);
    });

    it('should safely ignore invalid actions', () => {
      expect(() => keyboard.setTouchState('invalidAction', true)).not.toThrow();
    });
  });

  // 3. setTouchSteerAmount
  describe('setTouchSteerAmount()', () => {
    it('should update steerAmount proportional analog value', () => {
      keyboard.setTouchSteerAmount(0.75);
      expect(keyboard.steerAmount).toBe(0.75);
    });

    it('should set digital left/right fallbacks appropriately based on steer value (positive = right)', () => {
      keyboard.setTouchSteerAmount(0.5);
      expect(keyboard.touch.right).toBe(true);
      expect(keyboard.touch.left).toBe(false);
      expect(keyboard.right).toBe(true);
      expect(keyboard.left).toBe(false);
    });

    it('should set digital left/right fallbacks appropriately based on steer value (negative = left)', () => {
      keyboard.setTouchSteerAmount(-0.8);
      expect(keyboard.touch.left).toBe(true);
      expect(keyboard.touch.right).toBe(false);
      expect(keyboard.left).toBe(true);
      expect(keyboard.right).toBe(false);
    });

    it('should clear digital left/right fallbacks when steering is centered (0)', () => {
      keyboard.setTouchSteerAmount(0.5);
      keyboard.setTouchSteerAmount(0);
      expect(keyboard.touch.left).toBe(false);
      expect(keyboard.touch.right).toBe(false);
      expect(keyboard.left).toBe(false);
      expect(keyboard.right).toBe(false);
    });
  });

  // 4. Integration with PhysicsEngine steering
  describe('Integration with PhysicsEngine steering', () => {
    let physics;
    let levelInfo;

    beforeEach(() => {
      physics = new PhysicsEngine();
      levelInfo = {
        trackLength: 200,
        gravity: 24.0,
        collidables: [],
        specialTiles: []
      };
    });

    it('should apply analog steering in physics update when touchControlsEnabled is active', () => {
      keyboard.setTouchSteerAmount(-0.5); // 50% left
      
      physics.update(0.016, keyboard, levelInfo);
      
      // Since touch steering is enabled, we use analog lerp velocity logic
      // targetSteerSpeed = -0.5 * maxSteerSpeed (10) = -5.0
      // velocity.x is lerped towards target
      expect(physics.velocity.x).toBeLessThan(0);
    });
  });

  // 5. Boat Throttle Mode
  describe('Boat Throttle Mode', () => {
    let physics;
    let levelInfo;

    beforeEach(() => {
      physics = new PhysicsEngine();
      levelInfo = {
        trackLength: 200,
        gravity: 24.0,
        collidables: [],
        specialTiles: []
      };
    });

    it('should initialize boatThrottleEnabled to false', () => {
      expect(physics.boatThrottleEnabled).toBe(false);
    });

    it('should apply normal drag Z when boatThrottleEnabled is false', () => {
      physics.velocity.z = -10.0;
      physics.boatThrottleEnabled = false;
      physics.update(0.016, keyboard, levelInfo);
      // vz should decelerate closer to 0 (dragZ = 4.0, dt = 0.016 -> vz = -10.0 + 4*0.016 = -9.936)
      expect(physics.velocity.z).toBeCloseTo(-9.936, 3);
    });

    it('should NOT apply drag Z when boatThrottleEnabled is true', () => {
      physics.velocity.z = -10.0;
      physics.boatThrottleEnabled = true;
      physics.update(0.016, keyboard, levelInfo);
      // vz should remain unchanged (-10.0)
      expect(physics.velocity.z).toBe(-10.0);
    });
  });

  // 6. Continuous Jump & Rebound Bypass
  describe('Continuous Jump & Rebound Bypass', () => {
    let physics;
    let levelInfo;

    beforeEach(() => {
      physics = new PhysicsEngine();
      levelInfo = {
        trackLength: 200,
        gravity: 24.0,
        collidables: [],
        specialTiles: []
      };
    });

    it('should bypass landing rebound when jump key is held down', () => {
      physics.position.set(0, 0.05, -30);
      physics.velocity.set(0, -6.0, -10.0);
      physics.onGround = false;
      physics.groundHeight = -10.0;

      // Mock level pack to allow tile detection
      window.currentLevelData = {
        rows: Array.from({ length: 100 }, () => [{}, {}, {}, {}, {}, {}, {}])
      };

      // Set keyboard spacePressed = true (holding jump)
      keyboard.spacePressed = true;
      keyboard.jump = false; // jump triggered on keydown is false

      physics.update(0.016, keyboard, levelInfo);

      // Expected: rebound is NOT triggered because jump/space is held down
      expect(physics.isRebounding).toBe(false);
      expect(physics.onGround).toBe(true); // Treated as normal solid landing
      expect(physics.velocity.y).toBe(0.0); // Reset to 0 on landing

      window.currentLevelData = null; // Cleanup
    });

    it('should trigger rebound when jump key is NOT held down', () => {
      physics.position.set(0, 0.05, -30);
      physics.velocity.set(0, -6.0, -10.0);
      physics.onGround = false;

      window.currentLevelData = {
        rows: Array.from({ length: 100 }, () => [{}, {}, {}, {}, {}, {}, {}])
      };

      keyboard.spacePressed = false;

      physics.update(0.016, keyboard, levelInfo);

      // Expected: rebound IS triggered
      expect(physics.isRebounding).toBe(true);
      expect(physics.onGround).toBe(false);
      expect(physics.velocity.y).toBe(4.2); // Rebound impulse

      window.currentLevelData = null; // Cleanup
    });
  });

  // 7. Smart Lane-Snapping Magnetism
  describe('Smart Lane-Snapping Magnetism in PhysicsEngine', () => {
    let physics;
    let levelInfo;

    beforeEach(() => {
      physics = new PhysicsEngine();
      levelInfo = {
        trackLength: 200,
        gravity: 24.0,
        collidables: [],
        specialTiles: []
      };
      physics.onGround = true;
      physics.isDead = false;
      keyboard.touchControlsEnabled = true;
      keyboard.setTouchSteerAmount(0); // Neutral stick input
    });

    it('should apply leftward snap velocity when ship is slightly to the right of a lane center (e.g. x = 0.4)', () => {
      physics.position.x = 0.4; // Nearest lane is 0.0, displacement is -0.4
      physics.velocity.x = 0;

      physics.update(0.016, keyboard, levelInfo);

      // targetSteerSpeed should be -0.4 * 4 = -1.6, pulling the velocity to negative
      expect(physics.velocity.x).toBeLessThan(0);
    });

    it('should apply rightward snap velocity when ship is slightly to the left of a lane center (e.g. x = -0.4)', () => {
      physics.position.x = -0.4; // Nearest lane is 0.0, displacement is +0.4
      physics.velocity.x = 0;

      physics.update(0.016, keyboard, levelInfo);

      // targetSteerSpeed should be +0.4 * 4 = +1.6, pulling velocity to positive
      expect(physics.velocity.x).toBeGreaterThan(0);
    });

    it('should snap towards nearest lane center when near another lane (e.g. x = 1.6 near lane 2.0)', () => {
      physics.position.x = 1.6; // Nearest lane is 2.0, displacement is +0.4
      physics.velocity.x = 0;

      physics.update(0.016, keyboard, levelInfo);

      expect(physics.velocity.x).toBeGreaterThan(0);
    });

    it('should NOT apply lane-snapping when player is actively steering (steerAmount is non-zero)', () => {
      physics.position.x = 0.4; // Nearest lane is 0.0, snapping wants left (negative) velocity
      physics.velocity.x = 0;

      // Active steering rightward
      keyboard.setTouchSteerAmount(0.5); // wants +5.0 lateral speed

      physics.update(0.016, keyboard, levelInfo);

      // Manual steering must override snapping magnetism
      expect(physics.velocity.x).toBeGreaterThan(0);
    });

    it('should NOT apply lane-snapping when ship is airborne', () => {
      physics.position.x = 0.4;
      physics.velocity.x = 0;
      physics.onGround = false; // Airborne

      physics.update(0.016, keyboard, levelInfo);

      // Standard neutral deceleration applies, no lane pull
      expect(physics.velocity.x).toBe(0);
    });
  });
});
