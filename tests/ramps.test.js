import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildLevel, TILE_WIDTH, TILE_LENGTH } from '../levelLoader.js';
import { PhysicsEngine } from '../physics.js';

function createMockScene() {
  return { add: vi.fn() };
}

function createFlatTile(overrides = {}) {
  return {
    val: 0,
    full: false,
    half: false,
    tunnel: false,
    top_color: 0,
    bottom_color: 0,
    low3: 0,
    ...overrides
  };
}

function createFullBlockTile(overrides = {}) {
  return {
    val: 16389,
    full: true,
    half: false,
    tunnel: false,
    top_color: 0,
    bottom_color: 0,
    low3: 5,
    ...overrides
  };
}

function createBaseLevelData(overrides = {}) {
  return {
    gravity: 8,
    fuel: 100,
    oxygen: 60,
    palette: Array(16).fill([128, 128, 128]),
    rows: [],
    ...overrides
  };
}

describe('Ramp Pre-processing and Geometry Rendering', () => {
  let scene;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('should detect an elevated tunnel and place a ramp on the previous row', () => {
    // Row 1: Tunnel on a raised block (full block)
    // Row 0: Flat road
    const tunnelTile = createFullBlockTile({ tunnel: true, bottom_color: 1 });
    const flatTile = createFlatTile();
    
    const levelData = createBaseLevelData({
      rows: [
        [null, null, null, flatTile, null, null, null],
        [null, null, null, tunnelTile, null, null, null]
      ]
    });

    const result = buildLevel(levelData, scene);

    // Verify row 0 got pre-processed into a ramp
    expect(levelData.rows[0][3].ramp).toBe(true);
    expect(levelData.rows[0][3].endY).toBe(2.0); // Full block height

    // Verify a ramp collidable was registered
    const rampCollidable = result.collidables.find(c => c.isRamp);
    expect(rampCollidable).toBeDefined();
    expect(rampCollidable.startY).toBe(0.0);
    expect(rampCollidable.endY).toBe(2.0);
    expect(rampCollidable.minZ).toBe(-TILE_LENGTH); // Exit at Z = -4.0
    expect(rampCollidable.maxZ).toBe(0.0);          // Enter at Z = 0.0
  });

  it('should not place a ramp if the previous tile is already an elevated tunnel', () => {
    const tunnelTile1 = createFullBlockTile({ tunnel: true, bottom_color: 1 });
    const tunnelTile2 = createFullBlockTile({ tunnel: true, bottom_color: 1 });
    
    const levelData = createBaseLevelData({
      rows: [
        [null, null, null, tunnelTile1, null, null, null],
        [null, null, null, tunnelTile2, null, null, null]
      ]
    });

    const result = buildLevel(levelData, scene);

    // Verify row 0 did NOT get a ramp because it is already an elevated tunnel
    expect(levelData.rows[0][3].ramp).toBeUndefined();
  });
});

describe('Sloped Ramp Physics Engine Mechanics', () => {
  let physics;
  let keyboard;
  let levelInfo;

  beforeEach(() => {
    physics = new PhysicsEngine();
    keyboard = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      resetJump: vi.fn(),
    };
    physics.reset(100, 100);
    physics.settings.dragZ = 0.0; // Disable forward drag for test predictability

    // Create a level info that has a ramp collidable in lane 3 (X index 3, xPos = 0)
    levelInfo = {
      trackLength: 100.0,
      finishZ: -102.0,
      gravity: 24.0,
      fuel: 100,
      oxygen: 100,
      collidables: [
        {
          minX: -TILE_WIDTH / 2,
          maxX: TILE_WIDTH / 2,
          minZ: -TILE_LENGTH, // -4.0
          maxZ: 0.0,
          startY: 0.0,
          endY: 2.0,
          isObstacle: true,
          isRamp: true,
          isFlatRoad: false
        }
      ],
      specialTiles: [],
      roadMeshes: []
    };
  });

  it('should snap ship to ramp height and set onGround when driving onto it', () => {
    // Ship is over the ramp (x=0, z=-1.0) and descending slightly (y=0.1, vy=-1.0)
    // Z-velocity is set to 0.0 so that the Z position remains exactly -1.0 during physics.update
    physics.position.set(0, 0.1, -1.0);
    physics.velocity.set(0, -1.0, 0.0);
    physics.onGround = false;

    physics.update(0.016, keyboard, levelInfo);

    // Progression ratio: Z is at -1.0. MaxZ = 0.0, MinZ = -4.0.
    // t = (-1.0 - 0.0) / (-4.0 - 0.0) = 0.25
    // rampHeight = 0.0 + 0.25 * (2.0 - 0.0) = 0.5
    expect(physics.position.y).toBeCloseTo(0.5, 4);
    expect(physics.groundHeight).toBeCloseTo(0.5, 4);
    expect(physics.onGround).toBe(true);
    expect(physics.velocity.y).toBe(0);
  });

  it('should smoothly interpolate Y height upwards as ship drives forward along the ramp', () => {
    // Ship is driving forward (velocity.z = -10) starting from Z = 0
    physics.position.set(0, 0.0, 0.0);
    physics.velocity.set(0, 0, -10.0);
    physics.onGround = true;

    // Simulate 3 physics steps. We run two 0.05 steps to total 0.1s of movement per step,
    // which avoids the dt cap of 0.05 in physics.js.
    // Step 1: moves to z = 0.0 - 10 * 0.1 = -1.0
    physics.update(0.05, keyboard, levelInfo);
    physics.update(0.05, keyboard, levelInfo);
    expect(physics.position.y).toBeCloseTo(0.5, 3); // 25% of height 2.0

    // Step 2: moves to z = -1.0 - 10 * 0.1 = -2.0
    physics.update(0.05, keyboard, levelInfo);
    physics.update(0.05, keyboard, levelInfo);
    expect(physics.position.y).toBeCloseTo(1.0, 3); // 50% of height 2.0

    // Step 3: moves to z = -2.0 - 10 * 0.1 = -3.0
    physics.update(0.05, keyboard, levelInfo);
    physics.update(0.05, keyboard, levelInfo);
    expect(physics.position.y).toBeCloseTo(1.5, 3); // 75% of height 2.0
  });

  it('should prevent front collision crashes when driving onto a ramp block', () => {
    // Standard obstacle block would trigger death.
    // Ship is at z = 0.1, y = 0.0, moving forward.
    physics.position.set(0, 0.0, 0.1);
    physics.velocity.set(0, 0, -10.0);
    physics.onGround = true;

    physics.update(0.016, keyboard, levelInfo);

    // Verify ship is NOT dead
    expect(physics.isDead).toBe(false);
  });

  it('should trigger side collision slide if steering into the side of a ramp from another lane when too low', () => {
    // Let's place the ship in lane 2 (X = -2.0) and try to steer into lane 3 (X = -0.7, overlapping the ramp)
    // The ramp is in lane 3 (X from -1.0 to 1.0)
    // Ship Z is at -2.0 (midway along the ramp, so rampHeight is 1.0)
    // Ship Y is at 0.0 (too low, so it should slide against the side of the ramp)
    physics.position.set(-0.7, 0.0, -2.0);
    physics.velocity.set(5.0, 0, -10.0);
    physics.onGround = true;

    physics.update(0.016, keyboard, levelInfo);

    // Verify ship was pushed back to the left of the ramp (X = -1.0 - halfW = -1.0 - 0.3 = -1.3)
    expect(physics.position.x).toBeLessThanOrEqual(-1.3);
    expect(physics.velocity.x).toBe(0);
    expect(physics.triggerWallCollisionAudio).toBe(true);
  });

  it('should not crash or rebound on the elevated block immediately following the ramp when climbing it', () => {
    levelInfo.collidables.push({
      minX: -TILE_WIDTH / 2,
      maxX: TILE_WIDTH / 2,
      minZ: -TILE_LENGTH * 2,
      maxZ: -TILE_LENGTH,
      minY: 0,
      maxY: 2.0,
      isObstacle: true,
      isFlatRoad: false
    });

    // Ship is near the top of the ramp (z = -3.5), so its center is on the ramp.
    // Its snapped Y on the ramp is 1.75.
    // Its snout (z - 0.9 = -4.4) has crossed the start of the elevated block (-4.0).
    physics.position.set(0, 1.75, -3.5);
    physics.velocity.set(0, 0, -10.0);
    physics.onGround = true;

    physics.update(0.016, keyboard, levelInfo);

    // Verify ship is NOT dead (should not crash into the elevated block under the tunnel)
    expect(physics.isDead).toBe(false);
  });

  it('should not crash when landing on a ramp near the top (e.g. z = -4.1) where center has crossed the boundary but snout overlaps the next block', () => {
    levelInfo.collidables.push({
      minX: -TILE_WIDTH / 2,
      maxX: TILE_WIDTH / 2,
      minZ: -TILE_LENGTH * 2,
      maxZ: -TILE_LENGTH,
      minY: 0,
      maxY: 2.0,
      isObstacle: true,
      isFlatRoad: false
    });

    // Ship is landing on the ramp near the top (z = -4.1).
    // Ramp height at z = -4.1 is 2.0 (clamped).
    // Ship is at y = 1.2, falling (vy = -2.0).
    physics.position.set(0, 1.2, -4.1);
    physics.velocity.set(0, -2.0, -10.0);
    physics.onGround = false;

    physics.update(0.016, keyboard, levelInfo);

    // Verify ship is NOT dead and snaps to top
    expect(physics.isDead).toBe(false);
    expect(physics.position.y).toBeCloseTo(2.0, 3);
    expect(physics.onGround).toBe(true);
  });
});
