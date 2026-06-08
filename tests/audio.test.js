import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock Factory ─────────────────────────────────────────────────────────────

function createMockOscillator() {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: '',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn()
    }
  };
}

function createMockGain() {
  return {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn()
    }
  };
}

function createMockBiquadFilter() {
  return {
    connect: vi.fn(),
    type: '',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn()
    }
  };
}

function createMockBufferSource() {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    buffer: null
  };
}

function createMockAudioContext() {
  return {
    createOscillator: vi.fn().mockImplementation(() => createMockOscillator()),
    createGain: vi.fn().mockImplementation(() => createMockGain()),
    createBiquadFilter: vi.fn().mockImplementation(() => createMockBiquadFilter()),
    createBuffer: vi.fn().mockImplementation(() => ({
      getChannelData: vi.fn().mockReturnValue(new Float32Array(100))
    })),
    createBufferSource: vi.fn().mockImplementation(() => createMockBufferSource()),
    destination: {},
    currentTime: 0,
    sampleRate: 44100
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('AudioSynthesizer', () => {
  let gameAudio;
  let mockCtxInstance;

  beforeEach(async () => {
    // Create a fresh mock context for each test
    mockCtxInstance = createMockAudioContext();

    // Install mock AudioContext on window before importing
    window.AudioContext = vi.fn().mockImplementation(() => mockCtxInstance);
    delete window.webkitAudioContext;

    // Dynamic import to get fresh singleton-like behavior
    // We reset the singleton's internal state
    const mod = await import('../audio.js');
    gameAudio = mod.gameAudio;

    // Reset internal state of the singleton
    gameAudio.ctx = null;
    gameAudio.engineOsc = null;
    gameAudio.engineOsc1 = undefined;
    gameAudio.engineOsc2 = undefined;
    gameAudio.engineGain = null;
    gameAudio.isEngineRunning = false;

    vi.clearAllMocks();
    // Re-install after clearAllMocks since it clears the AudioContext mock
    window.AudioContext = vi.fn().mockImplementation(() => mockCtxInstance);
  });

  // ── Initialization ────────────────────────────────────────────────────

  describe('init()', () => {
    it('should create an AudioContext on first call', () => {
      gameAudio.init();
      expect(gameAudio.ctx).toBeDefined();
      expect(window.AudioContext).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent — multiple calls create only one context', () => {
      gameAudio.init();
      gameAudio.init();
      gameAudio.init();
      expect(window.AudioContext).toHaveBeenCalledTimes(1);
    });

    it('should not overwrite existing context on second call', () => {
      gameAudio.init();
      const firstCtx = gameAudio.ctx;
      gameAudio.init();
      expect(gameAudio.ctx).toBe(firstCtx);
    });

    it('should handle AudioContext constructor throwing gracefully', () => {
      window.AudioContext = vi.fn().mockImplementation(() => {
        throw new Error('AudioContext not supported');
      });
      delete window.webkitAudioContext;
      gameAudio.init();
      expect(gameAudio.ctx).toBeNull();
    });

    it('should fallback to webkitAudioContext if AudioContext not available', () => {
      delete window.AudioContext;
      const webkitMock = vi.fn().mockImplementation(() => mockCtxInstance);
      window.webkitAudioContext = webkitMock;
      gameAudio.init();
      expect(gameAudio.ctx).toBeDefined();
    });
  });

  // ── playClick() ───────────────────────────────────────────────────────

  describe('playClick()', () => {
    it('should auto-initialize context if not yet initialized', () => {
      gameAudio.playClick();
      expect(gameAudio.ctx).toBeDefined();
    });

    it('should create an oscillator and gain node', () => {
      gameAudio.playClick();
      expect(mockCtxInstance.createOscillator).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createGain).toHaveBeenCalledTimes(1);
    });

    it('should connect oscillator → gain → destination', () => {
      gameAudio.playClick();
      const osc = mockCtxInstance.createOscillator.mock.results[0].value;
      const gain = mockCtxInstance.createGain.mock.results[0].value;
      expect(osc.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
    });

    it('should start and schedule stop on the oscillator', () => {
      gameAudio.playClick();
      const osc = mockCtxInstance.createOscillator.mock.results[0].value;
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
    });

    it('should set frequency ramp for the click sound', () => {
      gameAudio.playClick();
      const osc = mockCtxInstance.createOscillator.mock.results[0].value;
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(600, expect.any(Number));
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(100, expect.any(Number));
    });

    it('should be a no-op if context creation failed', () => {
      window.AudioContext = vi.fn().mockImplementation(() => {
        throw new Error('not supported');
      });
      delete window.webkitAudioContext;
      // Should not throw
      expect(() => gameAudio.playClick()).not.toThrow();
    });
  });

  // ── startEngine() ─────────────────────────────────────────────────────

  describe('startEngine()', () => {
    it('should create two oscillators and a gain node', () => {
      gameAudio.startEngine();
      // 2 oscillators (sawtooth + triangle)
      expect(mockCtxInstance.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockCtxInstance.createGain).toHaveBeenCalledTimes(1);
    });

    it('should set isEngineRunning to true', () => {
      gameAudio.startEngine();
      expect(gameAudio.isEngineRunning).toBe(true);
    });

    it('should store oscillators on instance', () => {
      gameAudio.startEngine();
      expect(gameAudio.engineOsc1).toBeDefined();
      expect(gameAudio.engineOsc2).toBeDefined();
      expect(gameAudio.engineGain).toBeDefined();
    });

    it('should connect both oscillators to gain, and gain to destination', () => {
      gameAudio.startEngine();
      const osc1 = mockCtxInstance.createOscillator.mock.results[0].value;
      const osc2 = mockCtxInstance.createOscillator.mock.results[1].value;
      const gain = mockCtxInstance.createGain.mock.results[0].value;
      expect(osc1.connect).toHaveBeenCalledWith(gain);
      expect(osc2.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
    });

    it('should start both oscillators', () => {
      gameAudio.startEngine();
      const osc1 = mockCtxInstance.createOscillator.mock.results[0].value;
      const osc2 = mockCtxInstance.createOscillator.mock.results[1].value;
      expect(osc1.start).toHaveBeenCalledTimes(1);
      expect(osc2.start).toHaveBeenCalledTimes(1);
    });

    it('should not start engine twice if already running', () => {
      gameAudio.startEngine();
      gameAudio.startEngine();
      // Only 2 oscillators total (from first call), not 4
      expect(mockCtxInstance.createOscillator).toHaveBeenCalledTimes(2);
    });

    it('should auto-initialize context', () => {
      gameAudio.startEngine();
      expect(gameAudio.ctx).toBeDefined();
    });
  });

  // ── updateEngineSpeed() ───────────────────────────────────────────────

  describe('updateEngineSpeed()', () => {
    it('should modulate frequency based on speed ratio', () => {
      gameAudio.startEngine();
      gameAudio.updateEngineSpeed(0.5);
      const osc1 = gameAudio.engineOsc1;
      const osc2 = gameAudio.engineOsc2;
      // targetFreq1 = 45 + 0.5 * 60 = 75
      expect(osc1.frequency.setTargetAtTime).toHaveBeenCalledWith(75, expect.any(Number), 0.1);
      // targetFreq2 = 90 + 0.5 * 120 = 150
      expect(osc2.frequency.setTargetAtTime).toHaveBeenCalledWith(150, expect.any(Number), 0.1);
    });

    it('should modulate gain based on speed ratio', () => {
      gameAudio.startEngine();
      gameAudio.updateEngineSpeed(0.5);
      const gain = gameAudio.engineGain;
      // gain = 0.02 + 0.5 * 0.02 = 0.03
      expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0.03, expect.any(Number), 0.1);
    });

    it('should handle ratio = 0 (idle)', () => {
      gameAudio.startEngine();
      gameAudio.updateEngineSpeed(0);
      const osc1 = gameAudio.engineOsc1;
      expect(osc1.frequency.setTargetAtTime).toHaveBeenCalledWith(45, expect.any(Number), 0.1);
    });

    it('should handle ratio = 1 (max speed)', () => {
      gameAudio.startEngine();
      gameAudio.updateEngineSpeed(1.0);
      const osc1 = gameAudio.engineOsc1;
      expect(osc1.frequency.setTargetAtTime).toHaveBeenCalledWith(105, expect.any(Number), 0.1);
    });

    it('should be a no-op when engine is not running', () => {
      gameAudio.init();
      gameAudio.updateEngineSpeed(0.5);
      // No oscillators to modulate, should not throw
      expect(gameAudio.isEngineRunning).toBe(false);
    });

    it('should be a no-op when context is null', () => {
      gameAudio.ctx = null;
      expect(() => gameAudio.updateEngineSpeed(0.5)).not.toThrow();
    });
  });

  // ── stopEngine() ──────────────────────────────────────────────────────

  describe('stopEngine()', () => {
    it('should stop both oscillators', () => {
      gameAudio.startEngine();
      const osc1 = gameAudio.engineOsc1;
      const osc2 = gameAudio.engineOsc2;
      gameAudio.stopEngine();
      expect(osc1.stop).toHaveBeenCalledTimes(1);
      expect(osc2.stop).toHaveBeenCalledTimes(1);
    });

    it('should set isEngineRunning to false', () => {
      gameAudio.startEngine();
      gameAudio.stopEngine();
      expect(gameAudio.isEngineRunning).toBe(false);
    });

    it('should not throw when engine is not running', () => {
      expect(() => gameAudio.stopEngine()).not.toThrow();
    });

    it('should remain not running after stop when already stopped', () => {
      gameAudio.stopEngine();
      expect(gameAudio.isEngineRunning).toBe(false);
    });

    it('should handle oscillator.stop() throwing gracefully', () => {
      gameAudio.startEngine();
      gameAudio.engineOsc1.stop = vi.fn().mockImplementation(() => {
        throw new Error('already stopped');
      });
      // Should not propagate error
      expect(() => gameAudio.stopEngine()).not.toThrow();
    });
  });

  // ── playJump() ────────────────────────────────────────────────────────

  describe('playJump()', () => {
    it('should create oscillator with triangle wave', () => {
      gameAudio.playJump();
      const osc = mockCtxInstance.createOscillator.mock.results[0].value;
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(180, expect.any(Number));
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(750, expect.any(Number));
    });

    it('should start and schedule stop', () => {
      gameAudio.playJump();
      const osc = mockCtxInstance.createOscillator.mock.results[0].value;
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
    });

    it('should auto-initialize context', () => {
      gameAudio.playJump();
      expect(gameAudio.ctx).toBeDefined();
    });

    it('should be a no-op if context is unavailable', () => {
      window.AudioContext = vi.fn().mockImplementation(() => {
        throw new Error('nope');
      });
      delete window.webkitAudioContext;
      expect(() => gameAudio.playJump()).not.toThrow();
    });
  });

  // ── playRefill() ──────────────────────────────────────────────────────

  describe('playRefill()', () => {
    it('should create two oscillators for the two-note chime', () => {
      gameAudio.playRefill();
      expect(mockCtxInstance.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockCtxInstance.createGain).toHaveBeenCalledTimes(2);
    });

    it('should set C5 and G5 frequencies', () => {
      gameAudio.playRefill();
      const osc1 = mockCtxInstance.createOscillator.mock.results[0].value;
      const osc2 = mockCtxInstance.createOscillator.mock.results[1].value;
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(523.25, expect.any(Number));
      expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(783.99, expect.any(Number));
    });

    it('should start and stop both oscillators', () => {
      gameAudio.playRefill();
      const osc1 = mockCtxInstance.createOscillator.mock.results[0].value;
      const osc2 = mockCtxInstance.createOscillator.mock.results[1].value;
      expect(osc1.start).toHaveBeenCalledTimes(1);
      expect(osc1.stop).toHaveBeenCalledTimes(1);
      expect(osc2.start).toHaveBeenCalledTimes(1);
      expect(osc2.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ── playBoost() ───────────────────────────────────────────────────────

  describe('playBoost()', () => {
    it('should create sawtooth oscillator sweep', () => {
      gameAudio.playBoost();
      const osc = mockCtxInstance.createOscillator.mock.results[0].value;
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(150, expect.any(Number));
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1800, expect.any(Number));
    });

    it('should start and schedule stop', () => {
      gameAudio.playBoost();
      const osc = mockCtxInstance.createOscillator.mock.results[0].value;
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ── playExplosion() ───────────────────────────────────────────────────

  describe('playExplosion()', () => {
    it('should create a buffer source with noise', () => {
      gameAudio.playExplosion();
      expect(mockCtxInstance.createBuffer).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('should create a biquad filter for low-pass', () => {
      gameAudio.playExplosion();
      expect(mockCtxInstance.createBiquadFilter).toHaveBeenCalledTimes(1);
    });

    it('should chain: bufferSource → filter → gain → destination', () => {
      gameAudio.playExplosion();
      const bufSrc = mockCtxInstance.createBufferSource.mock.results[0].value;
      const filter = mockCtxInstance.createBiquadFilter.mock.results[0].value;
      const gain = mockCtxInstance.createGain.mock.results[0].value;
      expect(bufSrc.connect).toHaveBeenCalledWith(filter);
      expect(filter.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
    });

    it('should start and schedule stop on buffer source', () => {
      gameAudio.playExplosion();
      const bufSrc = mockCtxInstance.createBufferSource.mock.results[0].value;
      expect(bufSrc.start).toHaveBeenCalledTimes(1);
      expect(bufSrc.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ── playWin() ─────────────────────────────────────────────────────────

  describe('playWin()', () => {
    it('should create 4 oscillators for the C major arpeggio', () => {
      gameAudio.playWin();
      // C4, E4, G4, C5 = 4 notes
      expect(mockCtxInstance.createOscillator).toHaveBeenCalledTimes(4);
      expect(mockCtxInstance.createGain).toHaveBeenCalledTimes(4);
    });

    it('should set correct frequencies for each note', () => {
      gameAudio.playWin();
      const expectedFreqs = [261.63, 329.63, 392.00, 523.25];
      for (let i = 0; i < 4; i++) {
        const osc = mockCtxInstance.createOscillator.mock.results[i].value;
        expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(
          expectedFreqs[i],
          expect.any(Number)
        );
      }
    });

    it('should start and stop all 4 oscillators', () => {
      gameAudio.playWin();
      for (let i = 0; i < 4; i++) {
        const osc = mockCtxInstance.createOscillator.mock.results[i].value;
        expect(osc.start).toHaveBeenCalledTimes(1);
        expect(osc.stop).toHaveBeenCalledTimes(1);
      }
    });

    it('should connect each oscillator through its own gain node', () => {
      gameAudio.playWin();
      for (let i = 0; i < 4; i++) {
        const osc = mockCtxInstance.createOscillator.mock.results[i].value;
        const gain = mockCtxInstance.createGain.mock.results[i].value;
        expect(osc.connect).toHaveBeenCalledWith(gain);
        expect(gain.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
      }
    });
  });

  // ── playWallCollision() ────────────────────────────────────────────────
  describe('playWallCollision()', () => {
    it('should create a buffer source with noise and a biquad filter', () => {
      gameAudio.playWallCollision();
      expect(mockCtxInstance.createBuffer).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createBiquadFilter).toHaveBeenCalledTimes(1);
    });

    it('should chain: bufferSource → filter → gain → destination', () => {
      gameAudio.playWallCollision();
      const bufSrc = mockCtxInstance.createBufferSource.mock.results[0].value;
      const filter = mockCtxInstance.createBiquadFilter.mock.results[0].value;
      const gain = mockCtxInstance.createGain.mock.results[0].value;
      expect(bufSrc.connect).toHaveBeenCalledWith(filter);
      expect(filter.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
    });

    it('should start and schedule stop on buffer source', () => {
      gameAudio.playWallCollision();
      const bufSrc = mockCtxInstance.createBufferSource.mock.results[0].value;
      expect(bufSrc.start).toHaveBeenCalledTimes(1);
      expect(bufSrc.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ── playLandingRebound() ────────────────────────────────────────────────
  describe('playLandingRebound()', () => {
    it('should create two oscillators and two gains', () => {
      gameAudio.playLandingRebound();
      expect(mockCtxInstance.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockCtxInstance.createGain).toHaveBeenCalledTimes(2);
    });

    it('should start and stop both oscillators', () => {
      gameAudio.playLandingRebound();
      const osc1 = mockCtxInstance.createOscillator.mock.results[0].value;
      const osc2 = mockCtxInstance.createOscillator.mock.results[1].value;
      expect(osc1.start).toHaveBeenCalledTimes(1);
      expect(osc1.stop).toHaveBeenCalledTimes(1);
      expect(osc2.start).toHaveBeenCalledTimes(1);
      expect(osc2.stop).toHaveBeenCalledTimes(1);
    });

    it('should connect both oscillators to their respective gains, and gains to destination', () => {
      gameAudio.playLandingRebound();
      const osc1 = mockCtxInstance.createOscillator.mock.results[0].value;
      const osc2 = mockCtxInstance.createOscillator.mock.results[1].value;
      const gain1 = mockCtxInstance.createGain.mock.results[0].value;
      const gain2 = mockCtxInstance.createGain.mock.results[1].value;
      expect(osc1.connect).toHaveBeenCalledWith(gain1);
      expect(gain1.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
      expect(osc2.connect).toHaveBeenCalledWith(gain2);
      expect(gain2.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
    });
  });

  // ── playSteer() ────────────────────────────────────────────────────────
  describe('playSteer()', () => {
    it('should create a buffer source and a biquad filter', () => {
      gameAudio.playSteer();
      expect(mockCtxInstance.createBuffer).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createBiquadFilter).toHaveBeenCalledTimes(1);
    });

    it('should chain: bufferSource → filter → gain → destination', () => {
      gameAudio.playSteer();
      const bufSrc = mockCtxInstance.createBufferSource.mock.results[0].value;
      const filter = mockCtxInstance.createBiquadFilter.mock.results[0].value;
      const gain = mockCtxInstance.createGain.mock.results[0].value;
      expect(bufSrc.connect).toHaveBeenCalledWith(filter);
      expect(filter.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
    });

    it('should start and schedule stop on buffer source', () => {
      gameAudio.playSteer();
      const bufSrc = mockCtxInstance.createBufferSource.mock.results[0].value;
      expect(bufSrc.start).toHaveBeenCalledTimes(1);
      expect(bufSrc.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should not throw when calling any play method before init', () => {
      // ctx is null, methods should bail gracefully
      window.AudioContext = vi.fn().mockImplementation(() => {
        throw new Error('unavailable');
      });
      delete window.webkitAudioContext;

      expect(() => gameAudio.playClick()).not.toThrow();
      expect(() => gameAudio.playJump()).not.toThrow();
      expect(() => gameAudio.playRefill()).not.toThrow();
      expect(() => gameAudio.playBoost()).not.toThrow();
      expect(() => gameAudio.playExplosion()).not.toThrow();
      expect(() => gameAudio.playWin()).not.toThrow();
      expect(() => gameAudio.playWallCollision()).not.toThrow();
      expect(() => gameAudio.playLandingRebound()).not.toThrow();
      expect(() => gameAudio.playSteer()).not.toThrow();
    });

    it('should not throw when starting engine with failed context', () => {
      window.AudioContext = vi.fn().mockImplementation(() => {
        throw new Error('unavailable');
      });
      delete window.webkitAudioContext;
      expect(() => gameAudio.startEngine()).not.toThrow();
      expect(gameAudio.isEngineRunning).toBe(false);
    });
  });
});
