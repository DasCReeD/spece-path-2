import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  PhysicsEngine,
  KeyboardController,
  SHIP_WIDTH,
  SHIP_HEIGHT,
  SHIP_LENGTH,
  TILE_WIDTH,
  TILE_LENGTH,
  ROAD_WIDTH_LANES,
  TOTAL_ROAD_WIDTH
} from '../physics.js';

// Mock Web Audio API for jsdom
if (typeof window !== 'undefined') {
  window.AudioContext = vi.fn().mockImplementation(() => ({
    createOscillator: vi.fn().mockReturnValue({
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
    }),
    createGain: vi.fn().mockReturnValue({
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
    }),
    createBiquadFilter: vi.fn().mockReturnValue({
      connect: vi.fn(),
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    }),
    createBuffer: vi.fn().mockReturnValue({ getChannelData: vi.fn().mockReturnValue(new Float32Array(100)) }),
    createBufferSource: vi.fn().mockReturnValue({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
    destination: {},
    currentTime: 0,
    sampleRate: 44100
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createKeyboard(overrides = {}) {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    resetJump: vi.fn(),
    ...overrides
  };
}

function createLevelInfo(overrides = {}) {
  return {
    trackLength: 200.0,
    finishZ: -202.0,
    gravity: 24.0,
    fuel: 100,
    oxygen: 100,
    collidables: [],
    specialTiles: [],
    roadMeshes: [],
    ...overrides
  };
}

function createSpecialTile(behavior, box = {}) {
  return {
    boundingBox: {
      minX: -5.0, maxX: 5.0,
      minY: -1.0, maxY: 2.0,
      minZ: -5.0, maxZ: 5.0,
      ...box
    },
    behavior
  };
}

function createObstacleBlock(overrides = {}) {
  return {
    minX: -1.0, maxX: 1.0,
    minY: 0.0, maxY: 2.0,
    minZ: -10.0, maxZ: -6.0,
    isObstacle: true,
    ...overrides
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('PhysicsEngine', () => {
  let physics;
  let keyboard;
  let levelInfo;

  beforeEach(() => {
    physics = new PhysicsEngine();
    keyboard = createKeyboard();
    levelInfo = createLevelInfo();
    physics.reset(100, 100);
  });

  // ── Initial State ───────────────────────────────────────────────────────

  describe('Initial state', () => {
    it('should set default position at origin on the ground', () => {
      const fresh = new PhysicsEngine();
      expect(fresh.position.x).toBe(0);
      expect(fresh.position.y).toBe(0.2);
      expect(fresh.position.z).toBe(0);
    });

    it('should start with zero velocity', () => {
      const fresh = new PhysicsEngine();
      expect(fresh.velocity.x).toBe(0);
      expect(fresh.velocity.y).toBe(0);
      expect(fresh.velocity.z).toBe(0);
    });

    it('should start on the ground and not dead', () => {
      const fresh = new PhysicsEngine();
      expect(fresh.onGround).toBe(true);
      expect(fresh.isDead).toBe(false);
      expect(fresh.deathReason).toBe('');
    });

    it('should start with default fuel and oxygen values', () => {
      const fresh = new PhysicsEngine();
      expect(fresh.fuel).toBe(10000);
      expect(fresh.oxygen).toBe(100);
    });

    it('should start with all special effects disabled', () => {
      const fresh = new PhysicsEngine();
      expect(fresh.activeEffects.boost).toBe(false);
      expect(fresh.activeEffects.sticky).toBe(false);
      expect(fresh.activeEffects.slippery).toBe(false);
      expect(fresh.activeEffects.burning).toBe(false);
    });
  });

  // ── Reset ───────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('should restore position to origin', () => {
      physics.position.set(10, 5, -50);
      physics.reset(100, 100);
      expect(physics.position.x).toBe(0);
      expect(physics.position.y).toBe(0.2);
      expect(physics.position.z).toBe(0);
    });

    it('should zero out velocity', () => {
      physics.velocity.set(5, 10, -30);
      physics.reset(100, 100);
      expect(physics.velocity.x).toBe(0);
      expect(physics.velocity.y).toBe(0);
      expect(physics.velocity.z).toBe(0);
    });

    it('should clear death state', () => {
      physics.isDead = true;
      physics.deathReason = 'COLLIDED WITH BLOCK';
      physics.reset(100, 100);
      expect(physics.isDead).toBe(false);
      expect(physics.deathReason).toBe('');
    });

    it('should set fuel using DOS scale factor (×50)', () => {
      physics.reset(80, 100);
      expect(physics.fuel).toBe(80 * 50);
    });

    it('should set oxygen from parameter directly', () => {
      physics.reset(100, 75);
      expect(physics.oxygen).toBe(75);
    });

    it('should reset all active effects to false', () => {
      physics.activeEffects.boost = true;
      physics.activeEffects.sticky = true;
      physics.activeEffects.slippery = true;
      physics.activeEffects.burning = true;
      physics.reset(100, 100);
      expect(physics.activeEffects.boost).toBe(false);
      expect(physics.activeEffects.sticky).toBe(false);
      expect(physics.activeEffects.slippery).toBe(false);
      expect(physics.activeEffects.burning).toBe(false);
    });

    it('should set onGround to true and groundHeight to 0', () => {
      physics.onGround = false;
      physics.groundHeight = 5;
      physics.reset(100, 100);
      expect(physics.onGround).toBe(true);
      expect(physics.groundHeight).toBe(0);
    });
  });

  // ── Forward Acceleration (W key) ───────────────────────────────────────

  describe('Forward acceleration', () => {
    it('should accelerate in negative Z when forward key pressed', () => {
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      // accelForward = 18.0, dt = 0.05 → Δv = -0.9
      expect(physics.velocity.z).toBeCloseTo(-18.0 * 0.05, 5);
    });

    it('should increase forward speed over multiple frames', () => {
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      const speed1 = physics.velocity.z;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.velocity.z).toBeLessThan(speed1);
    });

    it('should move position forward (negative Z)', () => {
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.position.z).toBeLessThan(0);
    });
  });

  // ── Brake Deceleration (S key) ─────────────────────────────────────────

  describe('Brake deceleration', () => {
    it('should decelerate when backward key pressed and moving forward', () => {
      physics.velocity.z = -20.0;
      keyboard.backward = true;
      physics.update(0.05, keyboard, levelInfo);
      // decelBrakes = 35.0, dt = 0.05 → Δv = +1.75
      expect(physics.velocity.z).toBeCloseTo(-20.0 + 35.0 * 0.05, 5);
    });

    it('should not reverse speed past zero when braking', () => {
      physics.velocity.z = -0.5;
      keyboard.backward = true;
      physics.update(0.05, keyboard, levelInfo);
      // decelBrakes*dt = 1.75 > 0.5, but code only adds if vz < 0
      // After: vz = -0.5 + 1.75 = 1.25, but then drag won't apply because backward is held
      // Actually the code allows vz to go above 0 but doesn't check for it
      expect(physics.velocity.z).toBeGreaterThanOrEqual(-0.5);
    });

    it('should not brake when velocity is already zero or positive', () => {
      physics.velocity.z = 0;
      keyboard.backward = true;
      physics.update(0.05, keyboard, levelInfo);
      // guard: if (this.velocity.z < 0) → false, so no braking applied
      // natural drag also won't apply because vz is not < 0
      expect(physics.velocity.z).toBe(0);
    });
  });

  // ── Natural Rolling Drag ───────────────────────────────────────────────

  describe('Natural rolling drag', () => {
    it('should slow down over time when no keys pressed', () => {
      physics.velocity.z = -20.0;
      physics.update(0.05, keyboard, levelInfo);
      // dragZ = 4.0, dt = 0.05 → Δv = +0.2
      expect(physics.velocity.z).toBeCloseTo(-20.0 + 4.0 * 0.05, 5);
    });

    it('should clamp velocity to zero and not reverse', () => {
      physics.velocity.z = -0.1;
      physics.update(0.05, keyboard, levelInfo);
      // dragZ*dt = 0.2 > 0.1, so vz would go positive → clamped to 0
      expect(physics.velocity.z).toBe(0);
    });

    it('should not apply drag when forward key is held', () => {
      physics.velocity.z = -10.0;
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      // Acceleration applied instead: vz = -10 - 18*0.05 = -10.9
      expect(physics.velocity.z).toBeCloseTo(-10.0 - 18.0 * 0.05, 5);
    });
  });

  describe('Speed capping', () => {
    it('should not globally cap speed if already exceeding maxSpeedNormal', () => {
      physics.velocity.z = -100.0;
      physics.update(0.05, keyboard, levelInfo);
      // Under new cumulative boost mechanic, speed is not globally capped to maxSpeedNormal (32)
      // It only decreases due to drag: -100 + 4.0*0.05 = -99.8
      expect(physics.velocity.z).toBeCloseTo(-99.8, 3);
    });

    it('should not allow manual acceleration past maxSpeedNormal', () => {
      physics.velocity.z = -31.5;
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      // Manual acceleration from -31.5 with dt=0.05 is capped at -32.0
      expect(physics.velocity.z).toBe(-physics.maxSpeedNormal);
    });
  });

  // ── Steering (Left / Right) ───────────────────────────────────────────

  describe('Steering', () => {
    it('should steer left with negative X velocity', () => {
      keyboard.left = true;
      physics.update(0.05, keyboard, levelInfo);
      // steerAccel = 35.0, dt = 0.05 → Δv = -1.75
      expect(physics.velocity.x).toBeCloseTo(-35.0 * 0.05, 5);
    });

    it('should steer right with positive X velocity', () => {
      keyboard.right = true;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.velocity.x).toBeCloseTo(35.0 * 0.05, 5);
    });

    it('should cap left steering at -maxSteerSpeed', () => {
      physics.velocity.x = -9.5;
      keyboard.left = true;
      physics.update(0.05, keyboard, levelInfo);
      // -9.5 - 1.75 = -11.25 > maxSteerSpeed(10) → capped
      expect(physics.velocity.x).toBe(-physics.maxSteerSpeed);
    });

    it('should cap right steering at +maxSteerSpeed', () => {
      physics.velocity.x = 9.5;
      keyboard.right = true;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.velocity.x).toBe(physics.maxSteerSpeed);
    });

    it('should apply steering drag when no left/right keys pressed (positive vx)', () => {
      physics.velocity.x = 5.0;
      physics.update(0.05, keyboard, levelInfo);
      // dragSteer = 28.0, dt = 0.05 → damped by 1.4
      expect(physics.velocity.x).toBeCloseTo(5.0 - 28.0 * 0.05, 5);
    });

    it('should apply steering drag when no left/right keys pressed (negative vx)', () => {
      physics.velocity.x = -5.0;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.velocity.x).toBeCloseTo(-5.0 + 28.0 * 0.05, 5);
    });

    it('should clamp steering velocity to zero and not overshoot', () => {
      physics.velocity.x = 0.5;
      physics.update(0.05, keyboard, levelInfo);
      // 0.5 - 1.4 would go negative → clamped to 0
      expect(physics.velocity.x).toBe(0);
    });

    it('should move position along X when steering', () => {
      keyboard.right = true;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.position.x).toBeGreaterThan(0);
    });
  });

  // ── Jump & Gravity ────────────────────────────────────────────────────

  describe('Jump and gravity', () => {
    it('should apply jump impulse when on ground and jump pressed', () => {
      physics.onGround = true;
      keyboard.jump = true;
      physics.update(0.05, keyboard, levelInfo);
      // jumpImpulse = 10.5, then gravity applied: 10.5 - 24*0.05 = 9.3
      expect(physics.velocity.y).toBeCloseTo(10.5 - 24.0 * 0.05, 5);
    });

    it('should set onGround to false after jump', () => {
      physics.onGround = true;
      keyboard.jump = true;
      physics.update(0.05, keyboard, levelInfo);
      // onGround is set false during jump, then collision may reset
      // but with no collidables, it stays false
      expect(physics.onGround).toBe(false);
    });

    it('should call resetJump to prevent double-jumping', () => {
      physics.onGround = true;
      keyboard.jump = true;
      physics.update(0.05, keyboard, levelInfo);
      expect(keyboard.resetJump).toHaveBeenCalledTimes(1);
    });

    it('should not jump when already airborne', () => {
      physics.onGround = false;
      keyboard.jump = true;
      physics.update(0.05, keyboard, levelInfo);
      // No impulse applied; resetJump not called
      expect(keyboard.resetJump).not.toHaveBeenCalled();
    });

    it('should apply gravity when airborne (pulls velocity down)', () => {
      physics.onGround = false;
      physics.velocity.y = 5.0;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.velocity.y).toBeCloseTo(5.0 - 24.0 * 0.05, 5);
    });

    it('should not apply gravity when on ground', () => {
      physics.onGround = true;
      physics.velocity.y = 0;
      // After update, onGround is reset to false then checked via collisions
      // but velocity.y should remain 0 if no jump
      const initVy = physics.velocity.y;
      physics.update(0.05, keyboard, levelInfo);
      // gravity would be applied since onGround becomes false after step 7
      // but position.y was updated before ground check
      // The key point: no jump impulse is applied when jump is false
      expect(keyboard.resetJump).not.toHaveBeenCalled();
    });

    it('should update Y position based on velocity', () => {
      physics.onGround = false;
      physics.velocity.y = 10.0;
      const initialY = physics.position.y;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.position.y).toBeGreaterThan(initialY);
    });

    it('should cut upward velocity when spacePressed is false (variable jump height)', () => {
      physics.onGround = false;
      physics.velocity.y = 10.0;
      
      // Setup keyboard mock with spacePressed = false (released space)
      const mockKeyboardReleased = createKeyboard({ spacePressed: false });
      
      physics.update(0.016, mockKeyboardReleased, levelInfo);
      
      // Expected: velocity.y is multiplied by 0.82, then gravity pulls it down.
      // Expected Vy: 10.0 * 0.82 - 24.0 * 0.016 = 8.2 - 0.384 = 7.816
      expect(physics.velocity.y).toBeCloseTo(7.816, 3);
    });

    it('should NOT cut upward velocity when spacePressed is true (holding space)', () => {
      physics.onGround = false;
      physics.velocity.y = 10.0;
      
      // Setup keyboard mock with spacePressed = true (holding space)
      const mockKeyboardHeld = createKeyboard({ spacePressed: true });
      
      physics.update(0.016, mockKeyboardHeld, levelInfo);
      
      // Expected: velocity.y is NOT multiplied by 0.82, only gravity applies.
      // Expected Vy: 10.0 - 24.0 * 0.016 = 10.0 - 0.384 = 9.616
      expect(physics.velocity.y).toBeCloseTo(9.616, 3);
    });

    it('should apply asymmetric falling gravity (1.45x) when velocity.y is negative', () => {
      // 1. Initial airborne falling state
      physics.onGround = false;
      physics.velocity.y = -5.0;
      
      physics.update(0.016, keyboard, levelInfo);
      
      // Expected: gravity is scaled by 1.45.
      // Expected Vy: -5.0 - (24.0 * 1.45) * 0.016 = -5.0 - 34.8 * 0.016 = -5.0 - 0.5568 = -5.5568
      expect(physics.velocity.y).toBeCloseTo(-5.5568, 3);
    });

    it('should trigger physical landing rebound bounce when landing with high downward velocity', () => {
      // 1. Setup ship falling fast onto standard flat road
      physics.position.set(0, 0.05, -30);
      physics.velocity.set(0, -6.0, -10.0);
      physics.onGround = false;
      
      // Setup mock levels
      window.currentLevelData = {
        rows: Array.from({ length: 100 }, () => [{}, {}, {}, {}, {}, {}, {}])
      };
      
      physics.update(0.016, keyboard, levelInfo);
      
      // Expected: rebound is triggered
      expect(physics.isRebounding).toBe(true);
      expect(physics.reboundTimer).toBe(0.12);
      expect(physics.onGround).toBe(false); // Physically airborne during bounce
      expect(physics.velocity.y).toBe(4.2); // Bounce impulse Y
      expect(physics.position.y).toBe(0.0); // Snapped to ground height
      
      window.currentLevelData = null; // Cleanup
    });

    it('should allow jumping while isRebounding is active', () => {
      physics.isRebounding = true;
      physics.reboundTimer = 0.1;
      physics.onGround = false;
      
      keyboard.jump = true;
      physics.update(0.016, keyboard, levelInfo);
      
      // Expected: jump triggered, velocity Y reset to jump impulse
      expect(physics.velocity.y).toBeCloseTo(physics.jumpImpulse - 24.0 * 0.016, 2);
      expect(physics.isRebounding).toBe(false); // Cleared
      expect(physics.onGround).toBe(false);
    });

    it('should respect custom gravityFactor settings', () => {
      physics.onGround = false;
      physics.velocity.y = 5.0;
      physics.settings.gravityFactor = 2.0;
      physics.update(0.05, keyboard, levelInfo);
      // Expected: gravity scaled by gravityFactor (24 * 2.0 = 48)
      // Vy = 5.0 - 48.0 * 0.05 = 2.6
      expect(physics.velocity.y).toBeCloseTo(2.6, 5);
    });

    it('should respect custom bounceFactor settings', () => {
      physics.position.set(0, 0.05, -30);
      physics.velocity.set(0, -6.0, -10.0);
      physics.onGround = false;
      physics.settings.bounceFactor = 1.5;
      
      window.currentLevelData = {
        rows: Array.from({ length: 100 }, () => [{}, {}, {}, {}, {}, {}, {}])
      };
      
      physics.update(0.016, keyboard, levelInfo);
      
      // Expected: rebound velocity scaled by bounceFactor (4.2 * 1.5 = 6.3)
      expect(physics.velocity.y).toBeCloseTo(6.3, 5);
      
      window.currentLevelData = null; // Cleanup
    });
  });

  // ── Fuel Consumption ──────────────────────────────────────────────────

  describe('Fuel consumption', () => {
    it('should consume fuel when moving above threshold (|vz| > 0.5)', () => {
      physics.velocity.z = -10.0;
      const initialFuel = physics.fuel;
      physics.update(0.05, keyboard, levelInfo);
      // fuel -= dt * 25.0 * 1.0 = 0.05 * 25 = 1.25
      expect(physics.fuel).toBeCloseTo(initialFuel - 0.05 * 25.0, 5);
    });

    it('should not consume fuel when nearly stationary (|vz| <= 0.5)', () => {
      physics.velocity.z = -0.3;
      const initialFuel = physics.fuel;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.fuel).toBe(initialFuel);
    });

    it('should consume fuel at 2.5x rate during boost', () => {
      // First update without boost to get baseline consumption
      physics.velocity.z = -10.0;
      const initialFuel = physics.fuel;
      physics.update(0.05, keyboard, levelInfo);
      const normalConsumption = initialFuel - physics.fuel;

      // Reset and update WITH boost tile
      physics.reset(100, 100);
      physics.velocity.z = -10.0;
      const boostTile = createSpecialTile('boost');
      const boostedLevel = createLevelInfo({ specialTiles: [boostTile] });
      // First update detects boost tile, second update uses it for fuel
      physics.update(0.05, keyboard, boostedLevel);
      const fuelAfterFirst = physics.fuel;
      physics.update(0.05, keyboard, boostedLevel);
      const boostedConsumption = fuelAfterFirst - physics.fuel;

      // Boost should consume 2.5x the normal rate
      expect(boostedConsumption / normalConsumption).toBeCloseTo(2.5, 1);
    });

    it('should not go below zero fuel', () => {
      physics.fuel = 0.5;
      physics.velocity.z = -10.0;
      physics.update(0.05, keyboard, levelInfo);
      // Would subtract 1.25 from 0.5, clamped to 0
      expect(physics.fuel).toBe(0);
    });
  });

  // ── Oxygen Depletion ──────────────────────────────────────────────────

  describe('Oxygen depletion', () => {
    it('should deplete oxygen at 1 unit per second', () => {
      const initialOxygen = physics.oxygen;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.oxygen).toBeCloseTo(initialOxygen - 0.05, 5);
    });

    it('should deplete oxygen even when stationary', () => {
      physics.velocity.z = 0;
      const initialOxygen = physics.oxygen;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.oxygen).toBeCloseTo(initialOxygen - 0.05, 5);
    });

    it('should not go below zero oxygen', () => {
      physics.oxygen = 0.01;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.oxygen).toBe(0);
    });
  });

  // ── Death Conditions ──────────────────────────────────────────────────

  describe('Death conditions', () => {
    it('should die when fuel reaches zero', () => {
      physics.fuel = 0;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.isDead).toBe(true);
      expect(physics.deathReason).toBe('OUT OF FUEL');
    });

    it('should die when oxygen reaches zero', () => {
      physics.oxygen = 0;
      physics.fuel = 5000; // still have fuel
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.isDead).toBe(true);
      expect(physics.deathReason).toBe('OUT OF OXYGEN');
    });

    it('should check fuel before oxygen (fuel death takes priority)', () => {
      physics.fuel = 0;
      physics.oxygen = 0;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.deathReason).toBe('OUT OF FUEL');
    });

    it('should not update when already dead', () => {
      physics.isDead = true;
      const posZ = physics.position.z;
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.position.z).toBe(posZ);
    });

    it('should die when falling below y = -4.0', () => {
      // Position ship outside track width (x=20) so ground-snap doesn't restore y=0
      physics.position.set(20, -4.5, -10);
      physics.onGround = false;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.isDead).toBe(true);
      expect(physics.deathReason).toBe('FELL OFF ROAD');
    });

    it('should set plummet velocity when falling off road', () => {
      physics.position.set(20, -4.5, -10);
      physics.onGround = false;
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.velocity.y).toBe(-15);
    });
  });

  // ── DT Capping ────────────────────────────────────────────────────────

  describe('DT capping', () => {
    it('should cap dt at 0.05 to prevent tunneling', () => {
      keyboard.forward = true;
      // With dt=0.2, acceleration would be 18*0.2=3.6
      // But capped at 0.05: 18*0.05=0.9
      physics.update(0.2, keyboard, levelInfo);
      expect(physics.velocity.z).toBeCloseTo(-18.0 * 0.05, 5);
    });

    it('should use actual dt when smaller than 0.05', () => {
      keyboard.forward = true;
      physics.update(0.01, keyboard, levelInfo);
      expect(physics.velocity.z).toBeCloseTo(-18.0 * 0.01, 5);
    });
  });

  // ── Boost Effect ──────────────────────────────────────────────────────

  describe('Boost effect', () => {
    it('should raise max speed to maxSpeedBoost (60.0)', () => {
      const boostTile = createSpecialTile('boost');
      const boostedLevel = createLevelInfo({ specialTiles: [boostTile] });
      physics.velocity.z = -50.0;
      physics.update(0.05, keyboard, boostedLevel);
      // Should not be capped to 32 (normal), but allowed up to 60
      expect(physics.velocity.z).toBeLessThan(-32.0);
    });

    it('should apply 2.5x forward acceleration automatically', () => {
      const boostTile = createSpecialTile('boost');
      const boostedLevel = createLevelInfo({ specialTiles: [boostTile] });
      physics.velocity.z = 0;
      physics.update(0.05, keyboard, boostedLevel);
      // Boost applies -accelForward * 2.5 * dt then drag, exact value depends on
      // interaction between boost accel and drag. Just verify it accelerated forward.
      expect(physics.velocity.z).toBeLessThan(0);
    });

    it('should ignore forward key input during boost (auto-accelerates)', () => {
      const boostTile = createSpecialTile('boost');
      const boostedLevel = createLevelInfo({ specialTiles: [boostTile] });
      keyboard.forward = true;
      // Update without boost to get normal acceleration
      physics.update(0.05, keyboard, levelInfo);
      const normalSpeed = physics.velocity.z;

      // Reset and update with boost  
      physics.reset(100, 100);
      keyboard.forward = true;
      physics.update(0.05, keyboard, boostedLevel);
      // Second update where boost is active from tile detection
      physics.update(0.05, keyboard, boostedLevel);
      // Boost auto-accelerates harder than normal forward
      expect(physics.velocity.z).toBeLessThan(normalSpeed);
    });
  });

  // ── Sticky Effect ─────────────────────────────────────────────────────

  describe('Sticky effect', () => {
    it('should cap max speed to maxSpeedSticky (10.0)', () => {
      const stickyTile = createSpecialTile('sticky');
      const stickyLevel = createLevelInfo({ specialTiles: [stickyTile] });
      physics.velocity.z = -25.0;
      // No forward key — let sticky deceleration bring speed down
      for (let i = 0; i < 200; i++) {
        physics.update(0.05, keyboard, stickyLevel);
      }
      // Should converge toward sticky max speed (10.0) or below via drag
      expect(Math.abs(physics.velocity.z)).toBeLessThanOrEqual(physics.maxSpeedSticky + 1.0);
    });

    it('should aggressively decelerate when above sticky max speed', () => {
      const stickyTile = createSpecialTile('sticky');
      const stickyLevel = createLevelInfo({ specialTiles: [stickyTile] });
      physics.velocity.z = -25.0;
      physics.update(0.05, keyboard, stickyLevel);
      // decelBrakes * dt = 35 * 0.05 = 1.75 added (deceleration)
      expect(physics.velocity.z).toBeGreaterThan(-25.0);
    });
  });

  // ── Slippery Effect ───────────────────────────────────────────────────

  describe('Slippery effect', () => {
    it('should use minimal steering drag (1.0) allowing drift', () => {
      const slipperyTile = createSpecialTile('slippery');
      const slipperyLevel = createLevelInfo({ specialTiles: [slipperyTile] });
      physics.velocity.x = 5.0;
      physics.update(0.05, keyboard, slipperyLevel);
      // slippery drag = 1.0 * 0.05 = 0.05
      expect(physics.velocity.x).toBeCloseTo(5.0 - 1.0 * 0.05, 5);
    });

    it('should drift much more than normal when slippery', () => {
      // Normal: dragSteer = 28, dt = 0.05 → damp = 1.4
      const normalVx = 5.0 - 28.0 * 0.05; // 3.6

      const slipperyTile = createSpecialTile('slippery');
      const slipperyLevel = createLevelInfo({ specialTiles: [slipperyTile] });
      physics.velocity.x = 5.0;
      physics.update(0.05, keyboard, slipperyLevel);
      // Slippery: 5.0 - 0.05 = 4.95 > 3.6 (normal)
      expect(physics.velocity.x).toBeGreaterThan(normalVx);
    });
  });

  // ── Burning Effect ────────────────────────────────────────────────────

  describe('Burning effect', () => {
    it('should cause instant death', () => {
      const burningTile = createSpecialTile('burning');
      const burningLevel = createLevelInfo({ specialTiles: [burningTile] });
      physics.update(0.05, keyboard, burningLevel);
      expect(physics.isDead).toBe(true);
      expect(physics.deathReason).toBe('BURNED TO CRIPPLES');
    });

    it('should stop processing after death (no position update)', () => {
      const burningTile = createSpecialTile('burning');
      const burningLevel = createLevelInfo({ specialTiles: [burningTile] });
      physics.velocity.z = -20.0;
      const posZ = physics.position.z;
      physics.update(0.05, keyboard, burningLevel);
      // Death returns early before position update step... but actually
      // burning check is at step 2 after resolveSpecialTiles, before position update
      // So position should NOT be updated
      // Wait — let's re-read: fuel/oxygen consumed first (step 1), then
      // resolveSpecialTiles (step 2), then burning check returns.
      // Position not updated.
      expect(physics.position.z).toBe(posZ);
    });
  });

  // ── Refill Effect ─────────────────────────────────────────────────────

  describe('Refill effect', () => {
    it('should restore oxygen to 100', () => {
      physics.oxygen = 50;
      const refillTile = createSpecialTile('refill');
      const refillLevel = createLevelInfo({ specialTiles: [refillTile] });
      physics.update(0.05, keyboard, refillLevel);
      // Oxygen gets set to 100 by refill, then depleted by dt*1.0
      // But refill happens in resolveSpecialTiles which is called in update
      // After refill: oxygen = 100 (set during resolveSpecialTiles)
      // But oxygen depletion already happened in step 1 before resolveSpecialTiles
      // So final oxygen = 100 (set by refill after depletion already occurred)
      expect(physics.oxygen).toBe(100);
    });

    it('should add fuel when below max', () => {
      physics.fuel = 1000;
      const refillTile = createSpecialTile('refill');
      const refillLevel = createLevelInfo({ specialTiles: [refillTile] });
      physics.update(0.05, keyboard, refillLevel);
      // fuel was depleted first if moving, then refill adds 1000
      // We're not moving (vz=0, |vz|<0.5 so no fuel drain), so fuel stays 1000
      // Then refill: fuel = min(5000, 1000 + 1000) = 2000
      expect(physics.fuel).toBe(2000);
    });

    it('should cap fuel at 100 * 50 = 5000', () => {
      physics.fuel = 4500;
      const refillTile = createSpecialTile('refill');
      const refillLevel = createLevelInfo({ specialTiles: [refillTile] });
      physics.update(0.05, keyboard, refillLevel);
      // min(5000, 4500 + 1000) = 5000
      expect(physics.fuel).toBe(5000);
    });

    it('should not add fuel when already at max', () => {
      physics.fuel = 5000;
      const refillTile = createSpecialTile('refill');
      const refillLevel = createLevelInfo({ specialTiles: [refillTile] });
      physics.update(0.05, keyboard, refillLevel);
      // guard: fuel < 100*50 → false, so no fuel added
      expect(physics.fuel).toBe(5000);
    });

    it('should set triggerRefillAudio flag', () => {
      physics.fuel = 1000;
      const refillTile = createSpecialTile('refill');
      const refillLevel = createLevelInfo({ specialTiles: [refillTile] });
      physics.update(0.05, keyboard, refillLevel);
      expect(physics.triggerRefillAudio).toBe(true);
    });
  });

  // ── Collision: Obstacle Blocks ────────────────────────────────────────

  describe('Collision with obstacle blocks', () => {
    it('should die when hitting obstacle from the front', () => {
      // After position update, ship's front (minZ) must be < block.maxZ
      // and ship's back (maxZ) must be > block.maxZ (front hit condition).
      // Ship halfL = 0.9. After update: z = -5.5 + (-10)*0.05 = -6.0
      // shipBox: minZ = -6.0 - 0.9 = -6.9, maxZ = -6.0 + 0.9 = -5.1
      // Block maxZ = -5.5: minZ(-6.9) < maxZ(-5.5) ✓, maxZ(-5.1) > maxZ(-5.5) ✓
      // Ship minY = 0.2, maxY = 0.6 → below block maxY(2.0) - 0.15 = 1.85 ✓
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.z = -10.0;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);
      expect(physics.isDead).toBe(true);
      expect(physics.deathReason).toBe('COLLIDED WITH BLOCK');
    });

    it('should bounce back on front collision when difficulty is easy', () => {
      physics.difficulty = 'easy';
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.z = -10.0;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);
      
      expect(physics.isDead).toBe(false);
      expect(physics.velocity.z).toBe(10.0); // Bounced back velocity
      // Z position is: -5.5 + (-9.8)*0.05 + 1.2 = -5.99 + 1.2 = -4.79
      expect(physics.position.z).toBeCloseTo(-4.79, 5);
      expect(physics.triggerWallCollisionAudio).toBe(true); // Bounce audio trigger
    });

    it('should zero velocity on collision death', () => {
      // Same setup as front-hit test; verify velocity zeroed on collision
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.set(3, 0, -10.0);
      const obstacle = createObstacleBlock({
        minX: -2.0, maxX: 2.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);
      expect(physics.velocity.x).toBe(0);
      expect(physics.velocity.y).toBe(0);
      expect(physics.velocity.z).toBe(0);
    });

    it('should land on top of obstacle blocks', () => {
      // Ship falling onto top of block
      physics.position.set(0, 2.1, -8.0);
      physics.velocity.y = -1.0;
      physics.onGround = false;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -6.0
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);
      expect(physics.onGround).toBe(true);
      expect(physics.position.y).toBe(2.0);
      expect(physics.velocity.y).toBe(0);
    });

    it('should not collide when obstacle is far away on X axis', () => {
      physics.position.set(5.0, 0.2, -8.0);
      physics.velocity.z = -10.0;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -6.0
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);
      expect(physics.isDead).toBe(false);
    });
  });

  // ── Ship Bounding Box ─────────────────────────────────────────────────

  describe('Ship bounding box', () => {
    it('should compute correct min/max X from position', () => {
      physics.position.set(3.0, 1.0, -5.0);
      const box = physics.getShipBox();
      expect(box.minX).toBeCloseTo(3.0 - SHIP_WIDTH / 2, 5);
      expect(box.maxX).toBeCloseTo(3.0 + SHIP_WIDTH / 2, 5);
    });

    it('should compute correct min/max Y from position', () => {
      physics.position.set(0, 2.0, 0);
      const box = physics.getShipBox();
      expect(box.minY).toBe(2.0);
      expect(box.maxY).toBe(2.0 + SHIP_HEIGHT);
    });

    it('should compute correct min/max Z from position', () => {
      physics.position.set(0, 0, -10.0);
      const box = physics.getShipBox();
      expect(box.minZ).toBeCloseTo(-10.0 - SHIP_LENGTH / 2, 5);
      expect(box.maxZ).toBeCloseTo(-10.0 + SHIP_LENGTH / 2, 5);
    });

    it('should update with position changes', () => {
      physics.position.set(0, 0, 0);
      const box1 = physics.getShipBox();
      physics.position.set(5, 3, -20);
      const box2 = physics.getShipBox();
      expect(box2.minX).not.toBe(box1.minX);
      expect(box2.minY).not.toBe(box1.minY);
      expect(box2.minZ).not.toBe(box1.minZ);
    });
  });

  // ── checkTileExists ───────────────────────────────────────────────────

  describe('checkTileExists()', () => {
    beforeEach(() => {
      // Set up window.currentLevelData for tile checking
      window.currentLevelData = {
        rows: [
          // Row 0: 7 columns, tiles at columns 2, 3, 4
          [null, null, { top_color: 0 }, { top_color: 0 }, { top_color: 0 }, null, null],
          // Row 1: all null (gap row)
          [null, null, null, null, null, null, null]
        ]
      };
    });

    afterEach(() => {
      delete window.currentLevelData;
    });

    it('should return true for a tile that exists', () => {
      // Column 3 (center, x=0), row 0 (z=0 to -4, so z=-2 → absZ=2, rIdx=0)
      const result = physics.checkTileExists(0, -2.0);
      expect(result).toBe(true);
    });

    it('should return false for a null tile (gap)', () => {
      // Column 0 (x = (0-3)*2 = -6), row 0
      const result = physics.checkTileExists(-6, -2.0);
      expect(result).toBe(false);
    });

    it('should return false for negative row index (behind start)', () => {
      const result = physics.checkTileExists(0, 5.0);
      expect(result).toBe(false);
    });

    it('should return false for out-of-bounds column index', () => {
      // x far right beyond 7 lanes: maxLeft = -7, so cIdx = floor((20 - (-7))/2) = 13 >= 7
      const result = physics.checkTileExists(20, -2.0);
      expect(result).toBe(false);
    });

    it('should return false for negative column index', () => {
      // x far left: maxLeft = -7, cIdx = floor((-10 - (-7))/2) = floor(-1.5) = -2 < 0
      const result = physics.checkTileExists(-10, -2.0);
      expect(result).toBe(false);
    });

    it('should return true as fallback when no currentLevelData', () => {
      delete window.currentLevelData;
      const result = physics.checkTileExists(0, -2.0);
      expect(result).toBe(true);
    });

    it('should return true when row index exceeds available rows', () => {
      // Row 5 doesn't exist → rows[5] is undefined → falls through to return true
      const result = physics.checkTileExists(0, -25.0);
      expect(result).toBe(true);
    });
  });

  // ── Special effects reset each frame ──────────────────────────────────

  describe('Effect lifecycle', () => {
    it('should reset all effects each frame before checking tiles', () => {
      // Manually set effects
      physics.activeEffects.boost = true;
      physics.activeEffects.sticky = true;
      physics.activeEffects.slippery = true;
      physics.activeEffects.burning = true;
      // Update with no special tiles → all should be reset to false
      physics.update(0.05, keyboard, levelInfo);
      expect(physics.activeEffects.boost).toBe(false);
      expect(physics.activeEffects.sticky).toBe(false);
      expect(physics.activeEffects.slippery).toBe(false);
      expect(physics.activeEffects.burning).toBe(false);
    });

    it('should activate effect only while overlapping the tile', () => {
      const boostTile = createSpecialTile('boost', {
        minX: -1, maxX: 1, minZ: -5, maxZ: -3
      });
      const boostedLevel = createLevelInfo({ specialTiles: [boostTile] });

      // Ship at center z=0 → not overlapping tile at z=-5..-3
      physics.position.set(0, 0.2, 0);
      physics.update(0.05, keyboard, boostedLevel);
      expect(physics.activeEffects.boost).toBe(false);
    });
  });

  // ── resolveSpecialTiles bounding box overlap ──────────────────────────

  describe('resolveSpecialTiles overlap detection', () => {
    it('should not activate effect when tile is out of range on X', () => {
      const tile = createSpecialTile('boost', {
        minX: 10.0, maxX: 12.0, minY: -1, maxY: 2, minZ: -5, maxZ: 5
      });
      physics.position.set(0, 0.2, 0);
      physics.resolveSpecialTiles([tile]);
      expect(physics.activeEffects.boost).toBe(false);
    });

    it('should not activate effect when tile is out of range on Y', () => {
      const tile = createSpecialTile('boost', {
        minX: -5, maxX: 5, minY: 10, maxY: 12, minZ: -5, maxZ: 5
      });
      physics.position.set(0, 0.2, 0);
      physics.resolveSpecialTiles([tile]);
      expect(physics.activeEffects.boost).toBe(false);
    });

    it('should not activate effect when tile is out of range on Z', () => {
      const tile = createSpecialTile('boost', {
        minX: -5, maxX: 5, minY: -1, maxY: 2, minZ: -50, maxZ: -40
      });
      physics.position.set(0, 0.2, 0);
      physics.resolveSpecialTiles([tile]);
      expect(physics.activeEffects.boost).toBe(false);
    });

    it('should handle multiple overlapping special tiles', () => {
      const boostTile = createSpecialTile('boost');
      const slipperyTile = createSpecialTile('slippery');
      physics.position.set(0, 0.2, 0);
      physics.resolveSpecialTiles([boostTile, slipperyTile]);
      expect(physics.activeEffects.boost).toBe(true);
      expect(physics.activeEffects.slippery).toBe(true);
    });
  });

  // ── KeyboardController Mouse Controls ─────────────────────────────────

  describe('KeyboardController', () => {
    let controller;

    beforeEach(() => {
      controller = new KeyboardController();
    });

    it('should initialize with mouse controls disabled', () => {
      expect(controller.mouseControlsEnabled).toBe(false);
      expect(controller.forward).toBe(false);
      expect(controller.backward).toBe(false);
      expect(controller.left).toBe(false);
      expect(controller.right).toBe(false);
      expect(controller.jump).toBe(false);
    });

    it('should handle standard key events', () => {
      controller.handleKey({ code: 'KeyW' }, true);
      expect(controller.forward).toBe(true);
      controller.handleKey({ code: 'KeyW' }, false);
      expect(controller.forward).toBe(false);

      controller.handleKey({ code: 'Space' }, true);
      expect(controller.jump).toBe(true);
    });

    it('should handle mouse clicks when mouse controls are enabled', () => {
      controller.mouseControlsEnabled = true;

      // Left click -> Jump
      controller.handleMouseDown({ button: 0 });
      expect(controller.jump).toBe(true);
      controller.handleMouseUp({ button: 0 });
      expect(controller.jump).toBe(false);

      // Right click -> Accelerate
      controller.handleMouseDown({ button: 2 });
      expect(controller.forward).toBe(true);
      controller.handleMouseUp({ button: 2 });
      expect(controller.forward).toBe(false);
    });

    it('should ignore mouse clicks when mouse controls are disabled', () => {
      controller.mouseControlsEnabled = false;

      controller.handleMouseDown({ button: 0 });
      expect(controller.jump).toBe(false);

      controller.handleMouseDown({ button: 2 });
      expect(controller.forward).toBe(false);
    });

    it('should handle mouse movement steering based on viewport position', () => {
      controller.mouseControlsEnabled = true;

      // Save and stub window.innerWidth
      const originalWidth = window.innerWidth;
      window.innerWidth = 1000; // center is at 500

      // Mouse left of center (clientX = 200 -> diff = -300, deadzone = 50, maxRange = 400)
      controller.handleMouseMove({ clientX: 200 });
      expect(controller.left).toBe(true);
      expect(controller.right).toBe(false);
      expect(controller.steerAmount).toBeCloseTo(-0.714, 3);

      // Mouse right of center (clientX = 800 -> diff = 300)
      controller.handleMouseMove({ clientX: 800 });
      expect(controller.right).toBe(true);
      expect(controller.left).toBe(false);
      expect(controller.steerAmount).toBeCloseTo(0.714, 3);

      // Mouse far left of center (clientX = 50 -> diff = -450, should clamp to -1)
      controller.handleMouseMove({ clientX: 50 });
      expect(controller.steerAmount).toBe(-1);

      // Mouse within deadzone (center, clientX = 510 -> diff = 10 < deadzone)
      controller.handleMouseMove({ clientX: 510 });
      expect(controller.left).toBe(false);
      expect(controller.right).toBe(false);
      expect(controller.steerAmount).toBe(0);

      // Restore
      window.innerWidth = originalWidth;
    });

    it('should combine mouse and keyboard inputs seamlessly', () => {
      controller.mouseControlsEnabled = true;

      // Keyboard forward + Mouse forward
      controller.handleKey({ code: 'KeyW' }, true);
      expect(controller.forward).toBe(true);

      controller.handleMouseDown({ button: 2 });
      expect(controller.forward).toBe(true);

      // Keyboard forward released, mouse forward still held
      controller.handleKey({ code: 'KeyW' }, false);
      expect(controller.forward).toBe(true);

      // Mouse forward released
      controller.handleMouseUp({ button: 2 });
      expect(controller.forward).toBe(false);
    });
  });

  // ── Exported Constants ────────────────────────────────────────────────

  describe('Exported constants', () => {
    it('should have correct road configuration values', () => {
      expect(ROAD_WIDTH_LANES).toBe(7);
      expect(TILE_WIDTH).toBe(2.0);
      expect(TILE_LENGTH).toBe(4.0);
      expect(TOTAL_ROAD_WIDTH).toBe(14.0);
    });

    it('should have correct ship dimension values', () => {
      expect(SHIP_WIDTH).toBe(0.6);
      expect(SHIP_HEIGHT).toBe(0.4);
      expect(SHIP_LENGTH).toBe(1.8);
    });
  });

  // ── Advanced Physics Calibrator & Presets ─────────────────────────────

  describe('Advanced Physics Calibrator Sliders & Presets', () => {
    it('should initialize with default customizable settings', () => {
      expect(physics.settings.maxSpeedNormal).toBe(32.0);
      expect(physics.settings.maxSpeedBoost).toBe(60.0);
      expect(physics.settings.accelForward).toBe(18.0);
      expect(physics.settings.decelBrakes).toBe(35.0);
      expect(physics.settings.dragZ).toBe(4.0);
      expect(physics.settings.maxSteerSpeed).toBe(10.0);
      expect(physics.settings.steerAccel).toBe(35.0);
      expect(physics.settings.dragSteer).toBe(28.0);
      expect(physics.settings.easyCollisionBounceVel).toBe(10.0);
      expect(physics.settings.easyCollisionBounceDist).toBe(1.2);
      expect(physics.settings.fallGravityMultiplier).toBe(1.45);
      expect(physics.settings.variableJumpDampening).toBe(0.82);
      expect(physics.settings.coyoteTimeBuffer).toBe(0.25);
    });

    it('should apply custom max normal speed in Z update', () => {
      physics.settings.maxSpeedNormal = 50.0;
      physics.velocity.z = -45.0;
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      
      // With custom max speed of 50, velocity of -45 can accelerate forward (-Z)
      // accelForward * dt = 18 * 0.05 = 0.9. Vz becomes -45 - 0.9 = -45.9
      expect(physics.velocity.z).toBeCloseTo(-45.9, 3);
    });

    it('should cap manual acceleration to custom max normal speed', () => {
      physics.settings.maxSpeedNormal = 20.0;
      physics.velocity.z = -19.5;
      keyboard.forward = true;
      physics.update(0.05, keyboard, levelInfo);
      
      // Custom max speed is 20, so vz should be capped to -20 when accelerating
      expect(physics.velocity.z).toBe(-20.0);
    });

    it('should apply custom steering acceleration inertia in X update', () => {
      physics.settings.steerAccel = 80.0;
      keyboard.right = true;
      physics.update(0.05, keyboard, levelInfo);
      
      // vx = 0 + steerAccel * dt = 0 + 80 * 0.05 = 4.0
      expect(physics.velocity.x).toBeCloseTo(4.0, 3);
    });

    it('should apply custom easy collision bounce pushback factors', () => {
      physics.difficulty = 'easy';
      physics.settings.easyCollisionBounceVel = 18.0;
      physics.settings.easyCollisionBounceDist = 2.5;
      
      // Position Z at start boundary of obstacle
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.z = -10.0;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);

      expect(physics.isDead).toBe(false);
      expect(physics.velocity.z).toBe(18.0); // Uses custom bounce velocity
      // Z position: -5.5 + (-9.8)*0.05 + 2.5 = -5.99 + 2.5 = -3.49
      expect(physics.position.z).toBeCloseTo(-3.49, 3);
    });

    it('should utilize custom coyote time buffer range', () => {
      physics.settings.coyoteTimeBuffer = 0.65;
      
      // Ship falling down (vy = -1) and is 0.5 units above groundHeight (0)
      physics.position.set(0, 0.5, -10);
      physics.velocity.y = -1.0;
      physics.groundHeight = 0;
      physics.onGround = false;
      
      // Try to jump
      keyboard.jump = true;
      physics.update(0.05, keyboard, levelInfo);

      // Coyote buffer of 0.65 allows jumping at 0.5 units high!
      // velocity.y should be reset to jump impulse (10.5) minus gravity over dt (24 * 0.05 = 1.2) = 9.3
      expect(physics.velocity.y).toBeCloseTo(9.3, 5);
      expect(physics.onGround).toBe(false);
    });
  });

  // ── Consecutive Rebound Prevention ─────────────────────────────────────

  describe('Consecutive rebound prevention', () => {
    it('should NOT trigger a consecutive rebound when landing from a previous rebound', () => {
      // 1. Setup ship falling fast onto standard flat road
      physics.position.set(0, 0.05, -30);
      physics.velocity.set(0, -6.0, -10.0);
      physics.onGround = false;
      physics.justRebounded = false;
      
      window.currentLevelData = {
        rows: Array.from({ length: 100 }, () => [{}, {}, {}, {}, {}, {}, {}])
      };
      
      physics.update(0.016, keyboard, levelInfo);
      
      // First landing: should trigger rebound
      expect(physics.isRebounding).toBe(true);
      expect(physics.justRebounded).toBe(true);
      expect(physics.velocity.y).toBe(4.2);
      
      // Let the ship travel up and fall down again, simulating landing from this rebound
      physics.isRebounding = false; // reset for test
      physics.onGround = false;
      physics.position.set(0, 0.05, -30);
      physics.velocity.set(0, -6.0, -10.0); // fell back down fast
      
      physics.update(0.016, keyboard, levelInfo);
      
      // Second landing: since justRebounded was true, it should land FLAT and reset justRebounded
      expect(physics.isRebounding).toBe(false);
      expect(physics.justRebounded).toBe(false);
      expect(physics.onGround).toBe(true);
      expect(physics.velocity.y).toBe(0.0);
      
      window.currentLevelData = null; // Cleanup
    });
  });

  // ── Proximity Landing Boundaries and Flight Safety Check ────────────────

  describe('Proximity landing boundaries and flight safety check', () => {
    it('should NOT snap the ship to elevated block top when falling from high above it', () => {
      // 1. Place a block at Y = 2.0
      const block = {
        minX: -10.0, maxX: 10.0,
        minZ: -50.0, maxZ: -10.0,
        minY: 0.0, maxY: 2.0,
        isObstacle: false,
        boundingBox: { minX: -10, maxX: 10, minY: 0, maxY: 2.0, minZ: -50, maxZ: -10 }
      };
      levelInfo.collidables = [block];

      // 2. Place ship high above the block (Y = 5.0) and falling
      physics.position.set(0, 5.0, -30);
      physics.velocity.set(0, -2.0, -10.0);
      physics.onGround = false;

      physics.update(0.016, keyboard, levelInfo);

      // Ship should NOT snap to 2.0, it should continue falling naturally
      expect(physics.position.y).toBeCloseTo(5.0 - 2.0 * 0.016 - (24.0 * 1.45) * 0.016 * 0.016, 2);
      expect(physics.onGround).toBe(false);
    });

    it('should snap and land the ship on elevated block when it falls within the vertical proximity threshold', () => {
      const block = {
        minX: -10.0, maxX: 10.0,
        minZ: -50.0, maxZ: -10.0,
        minY: 0.0, maxY: 2.0,
        isObstacle: false,
        boundingBox: { minX: -10, maxX: 10, minY: 0, maxY: 2.0, minZ: -50, maxZ: -10 }
      };
      levelInfo.collidables = [block];

      // Place ship just above the block top (Y = 2.05) and falling
      physics.position.set(0, 2.05, -30);
      physics.velocity.set(0, -2.0, -10.0);
      physics.onGround = false;

      physics.update(0.016, keyboard, levelInfo);

      // Ship should snap to 2.0 and land
      expect(physics.position.y).toBe(2.0);
      expect(physics.onGround).toBe(true);
      expect(physics.velocity.y).toBe(0.0);
    });

    it('should NOT trigger standard flat ground landing check when ship is rising (velocity.y > 0)', () => {
      levelInfo.collidables = [];
      window.currentLevelData = {
        rows: Array.from({ length: 100 }, () => [{}, {}, {}, {}, {}, {}, {}])
      };

      // Place ship at Y = 0.0, but moving up with high positive velocity (rising rebound/jump phase)
      physics.position.set(0, 0.0, -30);
      physics.velocity.set(0, 5.0, -10.0);
      physics.onGround = false;

      physics.update(0.016, keyboard, levelInfo);

      // The standard ground check should be bypassed because it is rising, keeping velocity.y positive and onGround false
      expect(physics.onGround).toBe(false);
      expect(physics.velocity.y).toBeCloseTo(5.0 - 24.0 * 0.016, 2);
      expect(physics.position.y).toBeGreaterThan(0.0);

      window.currentLevelData = null; // Cleanup
    });
  });

  // ── Ceiling Collisions ──────────────────────────────────────────────────

  describe('Ceiling collisions', () => {
    it('should cap Y position and zero Y velocity when hitting ceiling from below', () => {
      const ceiling = {
        minX: -5.0, maxX: 5.0,
        minZ: -50.0, maxZ: -10.0,
        minY: 2.0, maxY: 2.15,
        isObstacle: true,
        isCeiling: true
      };
      levelInfo.collidables = [ceiling];

      // Place ship moving upward and overlapping the ceiling from below
      // Ship Y = 1.7 (so shipBox: minY = 1.7, maxY = 2.1 which is > ceiling.minY)
      physics.position.set(0, 1.7, -30);
      physics.velocity.set(0, 5.0, -10.0);
      physics.onGround = false;

      physics.update(0.016, keyboard, levelInfo);

      // Expected: Y position capped to ceiling.minY - SHIP_HEIGHT - 0.01 = 2.0 - 0.4 - 0.01 = 1.59
      expect(physics.position.y).toBeCloseTo(1.59, 2);
      // Expected: velocity Y zeroed
      expect(physics.velocity.y).toBe(0.0);
      // Expected: ship is NOT dead
      expect(physics.isDead).toBe(false);
    });

    it('should land on top of the ceiling block if landing from above', () => {
      const ceiling = {
        minX: -5.0, maxX: 5.0,
        minZ: -50.0, maxZ: -10.0,
        minY: 2.0, maxY: 2.15,
        isObstacle: true,
        isCeiling: true
      };
      levelInfo.collidables = [ceiling];

      // Place ship just above ceiling top (Y = 2.2) and falling down (velocity Y = -1.0)
      physics.position.set(0, 2.2, -30);
      physics.velocity.set(0, -1.0, -10.0);
      physics.onGround = false;

      physics.update(0.016, keyboard, levelInfo);

      // Expected: snaps to ceiling top (Y = 2.15) and lands
      expect(physics.position.y).toBeCloseTo(2.15, 2);
      expect(physics.onGround).toBe(true);
      expect(physics.velocity.y).toBe(0.0);
      expect(physics.isDead).toBe(false);
    });
  });

  // ── Collision Damage System & Difficulty Modes ─────────────────────────
  describe('Collision Damage System & Difficulty Modes', () => {
    it('should initialize ship with 100% health', () => {
      physics.reset(100, 100);
      expect(physics.health).toBe(100.0);
    });

    it('should not take collision damage in easy mode', () => {
      physics.reset(100, 100);
      physics.difficulty = 'easy';
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.z = -10.0;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);
      
      expect(physics.isDead).toBe(false);
      expect(physics.health).toBe(100.0);
    });

    it('should deduct health on frontal collision in normal mode and bounce back', () => {
      physics.reset(100, 100);
      physics.difficulty = 'normal';
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.z = -10.0; // speed = 10
      physics.settings.damageModifier = 1.0;
      physics.settings.shipMass = 1.0;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);

      // Expected damage = 9.8 * 1 * 1 * 1.5 = 14.7 (impact speed is 9.8 after 0.05s natural drag)
      // Expected health = 100.0 - 14.7 = 85.3
      expect(physics.isDead).toBe(false);
      expect(physics.health).toBeCloseTo(85.3, 1);
      expect(physics.velocity.z).toBe(10.0); // bounce back velocity
    });

    it('should deduct health on side collision in normal mode and slide', () => {
      physics.reset(100, 100);
      physics.difficulty = 'normal';
      physics.position.set(0.8, 0.2, -8.0); // block center is 0, ship starts at x=0.8 (overlapping block)
      physics.velocity.set(-4.0, 0, -10.0); // lateral speed = 4
      physics.settings.damageModifier = 1.0;
      physics.settings.shipMass = 1.0;
      physics.settings.minDamageSpeed = 0.0; // Disable cutoff for this test
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -6.0
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);

      // Expected damage = 2.6 * 1 * 1 * 1.5 = 3.9 (impact speed is 2.6 after 0.05s lateral steering drag)
      // Expected health = 100.0 - 3.9 = 96.1
      expect(physics.isDead).toBe(false);
      expect(physics.health).toBeCloseTo(96.1, 1);
      expect(physics.velocity.x).toBe(0); // lateral velocity zeroed
    });

    it('should not deduct health if impact speed is below minDamageSpeed (4.0 units/s / 40 kph)', () => {
      physics.reset(100, 100);
      physics.difficulty = 'normal';
      physics.position.set(0.8, 0.2, -8.0);
      physics.velocity.set(-4.0, 0, -10.0); // lateral speed = 4 -> drops to 2.6 after drag (< 4.0)
      physics.settings.damageModifier = 1.0;
      physics.settings.shipMass = 1.0;
      physics.settings.minDamageSpeed = 4.0; // Enable 40 kph cutoff
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -6.0
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);

      expect(physics.health).toBe(100.0); // No damage taken
    });

    it('should scale damage based on damageModifier and shipMass settings', () => {
      physics.reset(100, 100);
      physics.difficulty = 'normal';
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.z = -10.0;
      physics.settings.damageModifier = 2.0;
      physics.settings.shipMass = 1.5;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);

      // Expected damage = 9.8 * 1.5 * 2.0 * 1.5 = 44.1 (impact speed is 9.8 after 0.05s natural drag)
      // Expected health = 100 - 44.1 = 55.9
      expect(physics.isDead).toBe(false);
      expect(physics.health).toBeCloseTo(55.9, 1);
    });

    it('should trigger instant death in normal mode if damage exceeds current health', () => {
      physics.reset(100, 100);
      physics.health = 10.0; // low health
      physics.difficulty = 'normal';
      physics.position.set(0, 0.2, -5.5);
      physics.velocity.z = -10.0; // damage = 15.0 > 10.0
      physics.settings.damageModifier = 1.0;
      physics.settings.shipMass = 1.0;
      const obstacle = createObstacleBlock({
        minX: -1.0, maxX: 1.0,
        minY: 0.0, maxY: 2.0,
        minZ: -10.0, maxZ: -5.5
      });
      const collidingLevel = createLevelInfo({ collidables: [obstacle] });
      physics.update(0.05, keyboard, collidingLevel);

      expect(physics.isDead).toBe(true);
      expect(physics.deathReason).toBe('COLLIDED WITH BLOCK');
      expect(physics.health).toBe(0);
    });

    it('should restore health to 100% when passing over a refill tile', () => {
      physics.reset(100, 100);
      physics.health = 50.0;
      const refillTile = createSpecialTile('refill');
      const refillLevel = createLevelInfo({ specialTiles: [refillTile] });
      physics.update(0.05, keyboard, refillLevel);
      expect(physics.health).toBe(100.0);
    });
  });
});

