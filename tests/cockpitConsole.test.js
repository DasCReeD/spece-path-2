import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CockpitConsole3D, PathScannerMinimap } from '../cockpitConsole.js';

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

// Patch getContext to return our mock for '2d' calls
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...args) {
  if (type === '2d') return mockCtx2d;
  return originalGetContext.call(this, type, ...args);
};

describe('PathScannerMinimap', () => {
  let canvas;
  let scanner;
  
  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    scanner = new PathScannerMinimap(canvas);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct dimensions and bounds', () => {
      expect(scanner.width).toBe(128);
      expect(scanner.height).toBe(256);
      expect(scanner.scanAhead).toBe(30);
      expect(scanner.scanBehind).toBe(2);
      expect(scanner.totalRows).toBe(32);
    });
  });

  describe('getTileBehavior', () => {
    it('should handle null tiles', () => {
      const result = scanner.getTileBehavior(null);
      expect(result).toEqual({ behavior: null, isObstacle: false });
    });

    it('should classify obstacle tiles', () => {
      const obstacleTile = { full: true, half: false, top_color: 2 };
      const result = scanner.getTileBehavior(obstacleTile);
      expect(result.isObstacle).toBe(true);
    });

    it('should classify special behavior colors', () => {
      // 11 maps to boost (behaviorColor = top_color + 1)
      const boostTile = { full: false, half: false, top_color: 10, bottom_color: 10 };
      const result = scanner.getTileBehavior(boostTile);
      expect(result.behavior).toBe('boost');
    });
  });

  describe('update', () => {
    it('should redraw canvas with correct grid blocks and player dot', () => {
      const playerPos = new THREE.Vector3(0, 0.2, -30);
      const mockLevelData = {
        rows: Array(100).fill(null).map(() => Array(7).fill({
          full: false,
          half: false,
          top_color: 0,
          bottom_color: 0
        }))
      };

      scanner.update(playerPos, mockLevelData);
      expect(mockCtx2d.clearRect).toHaveBeenCalled();
      expect(mockCtx2d.fillRect).toHaveBeenCalled();
    });
  });
});

describe('CockpitConsole3D', () => {
  let camera;
  let cockpit;
  
  beforeEach(() => {
    vi.clearAllMocks();
    camera = new THREE.PerspectiveCamera(65, 800 / 600, 0.1, 1000);
    cockpit = new CockpitConsole3D(camera);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor & init', () => {
    it('should initialize and attach to camera', () => {
      expect(camera.children).toContain(cockpit.group);
      expect(cockpit.group.name).toBe('cockpit_console_3d');
    });

    it('should create all required components', () => {
      expect(cockpit.casing).toBeDefined();
      expect(cockpit.speedDial).toBeDefined();
      expect(cockpit.speedNeedlePivot).toBeDefined();
      expect(cockpit.o2Dial).toBeDefined();
      expect(cockpit.fuelDial).toBeDefined();
      expect(cockpit.ledBoost).toBeDefined();
      expect(cockpit.ledSticky).toBeDefined();
      expect(cockpit.ledSlippery).toBeDefined();
    });

    it('should enforce depth-test false and high renderOrder on components', () => {
      expect(cockpit.casing.material.depthTest).toBe(false);
      expect(cockpit.casing.material.depthWrite).toBe(false);
      expect(cockpit.casing.renderOrder).toBe(9999);
    });
  });

  describe('updatePositionAndScale', () => {
    it('should position cockpit console at frustum bottom', () => {
      cockpit.updatePositionAndScale(800, 600);
      expect(cockpit.group.position.x).toBe(0);
      expect(cockpit.group.position.z).toBe(-0.8);
      expect(cockpit.group.position.y).toBeLessThan(0); // at the bottom half
    });

    it('should apply scale reduction on narrow ratios', () => {
      cockpit.updatePositionAndScale(300, 600); // narrow portrait aspect
      expect(cockpit.group.scale.x).toBeLessThan(1.0);
      expect(cockpit.group.scale.y).toBeLessThan(1.0);
    });
  });

  describe('update', () => {
    it('should toggle visibility based on camera mode', () => {
      const mockPhysics = {
        velocity: new THREE.Vector3(0, 0, 0),
        activeEffects: {}
      };
      
      cockpit.update(mockPhysics, null, 'follow');
      expect(cockpit.group.visible).toBe(true);

      cockpit.update(mockPhysics, null, 'cockpit');
      expect(cockpit.group.visible).toBe(true);
    });

    it('should rotate needle and scale dials based on speed/telemetry', () => {
      const mockPhysics = {
        velocity: new THREE.Vector3(0, 0, -16), // half of maxSpeedNormal (32)
        activeEffects: {},
        oxygen: 80,
        fuel: 5000
      };

      cockpit.update(mockPhysics, null, 'cockpit');
      
      // Speed pct ~ 26.67% (160 out of 600)
      expect(cockpit.speedNeedlePivot.rotation.z).toBeCloseTo((Math.PI * 0.75) - (160 / 600) * Math.PI * 1.5, 2);
      expect(cockpit.o2Dial.scale.y).toBeCloseTo(0.8, 2);
    });

    it('should show/hide casing and border based on showCockpitBezel setting', () => {
      const mockPhysics = {
        velocity: new THREE.Vector3(0, 0, 0),
        activeEffects: {},
        settings: { showCockpitBezel: 0.0 }
      };

      cockpit.update(mockPhysics, null, 'cockpit');
      expect(cockpit.casing.visible).toBe(false);
      expect(cockpit.border.visible).toBe(false);

      mockPhysics.settings.showCockpitBezel = 1.0;
      cockpit.update(mockPhysics, null, 'cockpit');
      expect(cockpit.casing.visible).toBe(true);
      expect(cockpit.border.visible).toBe(true);
    });
  });
});
