import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks for Web Audio components
function createMockOscillator() {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn()
    },
    type: 'sine'
  };
}

function createMockGain() {
  return {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      value: 1.0
    }
  };
}

function createMockScriptProcessor() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null
  };
}

function createMockAudioContext() {
  return {
    createOscillator: vi.fn().mockImplementation(() => createMockOscillator()),
    createGain: vi.fn().mockImplementation(() => createMockGain()),
    createScriptProcessor: vi.fn().mockImplementation(() => createMockScriptProcessor()),
    createBuffer: vi.fn().mockImplementation(() => ({
      getChannelData: vi.fn().mockReturnValue(new Float32Array(100))
    })),
    createBufferSource: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      buffer: null
    })),
    destination: {},
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined)
  };
}

describe('ClassicAudioIntegration', () => {
  let gameAudio;
  let mockCtx;

  beforeEach(async () => {
    mockCtx = createMockAudioContext();
    window.AudioContext = vi.fn().mockImplementation(() => mockCtx);
    delete window.webkitAudioContext;

    // Reset module cache to reload audio.js with mock AudioContext
    vi.resetModules();
    const mod = await import('../audio.js');
    gameAudio = mod.gameAudio;
  });

  afterEach(() => {
    if (gameAudio) {
      gameAudio.stopMusic();
    }
    vi.restoreAllMocks();
  });

  it('should initialize retro and classic music sequencers', () => {
    gameAudio.init();
    expect(gameAudio.retroSequencer).toBeDefined();
    expect(gameAudio.classicSequencer).toBeDefined();
    expect(gameAudio.getActiveSequencer()).toBe(gameAudio.retroSequencer); // Default mode is synth
  });

  it('should toggle sound modes and start/stop music', () => {
    gameAudio.init();
    gameAudio.startMusic();
    expect(gameAudio.retroSequencer.isPlaying).toBe(true);

    // Switch sound mode to classic
    gameAudio.setSoundMode('classic');
    expect(gameAudio.soundMode).toBe('classic');
    // Since classic assets are not loaded in test environment, it falls back to retroSequencer
    expect(gameAudio.getActiveSequencer()).toBe(gameAudio.retroSequencer);
  });

  it('should support volume controls on both sequencers', () => {
    gameAudio.init();
    gameAudio.setMusicVolume(0.5);
    expect(gameAudio.retroSequencer.volume).toBe(0.5);
    expect(gameAudio.classicSequencer.volume).toBe(0.5);
  });

  it('should fall back to procedural sound effects in classic mode if assets fail to load', () => {
    gameAudio.init();
    gameAudio.setSoundMode('classic');
    
    // Trigger playClick
    gameAudio.playClick();
    
    // In classic fallback, it creates an oscillator and gain node
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();
  });

  it('should cycle through synth tracks on nextTrack() call in synth mode', () => {
    gameAudio.init();
    gameAudio.setSoundMode('synth');
    expect(gameAudio.getCurrentTrackName()).toBe('Retro Arpeggio');
    
    const nextTrackName = gameAudio.nextTrack();
    expect(nextTrackName).toBe('Space Drive');
    expect(gameAudio.getCurrentTrackName()).toBe('Space Drive');

    const thirdTrackName = gameAudio.nextTrack();
    expect(thirdTrackName).toBe('Cyber Horizon');
    expect(gameAudio.getCurrentTrackName()).toBe('Cyber Horizon');

    const backToFirst = gameAudio.nextTrack();
    expect(backToFirst).toBe('Retro Arpeggio');
  });

  it('should fall back to synth track name on nextTrack() call in classic mode if songs data is not loaded', () => {
    gameAudio.init();
    gameAudio.setSoundMode('classic');
    
    const nextTrack = gameAudio.nextTrack();
    expect(nextTrack).toBe('Space Drive');
  });
});
