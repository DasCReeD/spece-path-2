// 1993 Skyroads DOS OPL2 (AdLib FM) Synthesizer and LZS Decompressor
import muzaxUrl from './MUZAX.LZS?url';
import sfxUrl from './SFX.SND?url';
import introUrl from './INTRO.SND?url';

export { muzaxUrl, sfxUrl, introUrl };

// --- 1. LZS Decompressor & File Parsers ---

class BitReader {
  constructor(data, offset) {
    this.data = data;
    this.byteOffset = offset;
    this.bitOffset = 0;
  }

  readBits(count) {
    let value = 0;
    for (let i = 0; i < count; i++) {
      if (this.byteOffset >= this.data.length) {
        throw new Error("unexpected end of compressed stream");
      }
      const bit = (this.data[this.byteOffset] >> (7 - this.bitOffset)) & 1;
      value = (value << 1) | bit;
      this.bitOffset++;
      if (this.bitOffset === 8) {
        this.bitOffset = 0;
        this.byteOffset++;
      }
    }
    return value;
  }
}

function copyFromHistory(output, distance, count, limit) {
  if (distance <= 0 || distance > output.length) {
    throw new Error(`invalid back-reference distance ${distance}`);
  }
  for (let i = 0; i < count; i++) {
    if (output.length >= limit) break;
    output.push(output[output.length - distance]);
  }
}

export function decompressStream(data, offset, expectedSize, widths) {
  const [width1, width2, width3] = widths;
  const reader = new BitReader(data, offset);
  const output = [];

  try {
    while (expectedSize === null || output.length < expectedSize) {
      let prefix = reader.readBits(1);
      if (prefix === 0) {
        const distance = reader.readBits(width2) + 2;
        const count = reader.readBits(width1) + 2;
        copyFromHistory(output, distance, count, expectedSize || (output.length + count));
        continue;
      }

      prefix = reader.readBits(1);
      if (prefix === 0) {
        const distance = reader.readBits(width3) + 2 + (1 << width2);
        const count = reader.readBits(width1) + 2;
        copyFromHistory(output, distance, count, expectedSize || (output.length + count));
        continue;
      }

      output.push(reader.readBits(8));
    }
  } catch (e) {
    if (expectedSize !== null) {
      throw e;
    }
  }

  return new Uint8Array(output);
}

function readU16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

export function parseMuzax(data) {
  const songTableSize = readU16LE(data, 0);
  if (songTableSize % 6 !== 0) {
    throw new Error(`MUZAX.LZS song table size is not a multiple of 6: ${songTableSize}`);
  }
  const count = songTableSize / 6;
  const songs = [];

  for (let index = 0; index < count; index++) {
    const startPos = readU16LE(data, index * 6);
    const numInstruments = readU16LE(data, index * 6 + 2);
    const uncompressedLength = readU16LE(data, index * 6 + 4);

    if (startPos === 0) {
      songs.push(null);
      continue;
    }

    const widths = [data[startPos], data[startPos + 1], data[startPos + 2]];
    const decompressed = decompressStream(data, startPos + 3, uncompressedLength, widths);

    const instrumentBytes = numInstruments * 16;
    const instruments = [];
    for (let i = 0; i < numInstruments; i++) {
      const offset = i * 16;
      instruments.push({
        operatorA: parseOscillator(decompressed.subarray(offset, offset + 5)),
        operatorB: parseOscillator(decompressed.subarray(offset + 5, offset + 10)),
        channelConfig: decompressed[offset + 10]
      });
    }

    const commands = decompressed.subarray(instrumentBytes);
    songs.push({
      index,
      instruments,
      commands
    });
  }

  return songs;
}

function parseOscillator(block) {
  const tremolo = block[0];
  const keyScaleLevel = block[1];
  const attackRate = block[2];
  const sustainLevel = block[3];
  const waveForm = block[4];
  return {
    tremolo: (tremolo & 0x80) !== 0,
    vibrato: (tremolo & 0x40) !== 0,
    soundSustaining: (tremolo & 0x20) !== 0,
    keyScaling: (tremolo & 0x10) !== 0,
    multiplication: tremolo & 0x0F,
    keyScaleLevel: keyScaleLevel >> 6,
    outputLevel: keyScaleLevel & 0x3F,
    attackRate: attackRate >> 4,
    decayRate: attackRate & 0x0F,
    sustainLevel: sustainLevel >> 4,
    releaseRate: sustainLevel & 0x0F,
    waveForm: waveForm & 0x07
  };
}

export function parseSfx(data) {
  if (data.length < 2) {
    throw new Error("SFX.SND is too small to contain an offset table");
  }
  const firstOffset = readU16LE(data, 0);
  if (firstOffset % 2 !== 0 || firstOffset > data.length) {
    throw new Error(`SFX.SND first offset is invalid: ${firstOffset}`);
  }

  const offsets = [];
  for (let offset = 0; offset < firstOffset; offset += 2) {
    offsets.push(readU16LE(data, offset));
  }

  const effects = [];
  for (let index = 0; index < offsets.length; index++) {
    const start = offsets[index];
    const end = (index + 1 < offsets.length) ? offsets[index + 1] : data.length;
    if (end > data.length || start > end) {
      throw new Error(`SFX.SND effect ${index} has invalid range ${start}..${end}`);
    }
    effects.push(data.subarray(start, end));
  }

  return effects;
}

// --- 2. OPL2 Synthesizer Constants ---

const ATTACK_RATES = [
  NaN, NaN, NaN, NaN,
  2826.24, 2252.80, 1884.16, 1597.44,
  1413.12, 1126.40, 942.08, 798.72,
  706.56, 563.20, 471.04, 399.36,
  353.28, 281.60, 235.52, 199.68,
  176.76, 140.80, 117.76, 99.84,
  88.32, 70.40, 58.88, 49.92,
  44.16, 35.20, 29.44, 24.96,
  22.08, 17.60, 14.72, 12.48,
  11.04, 8.80, 7.36, 6.24,
  5.52, 4.40, 3.68, 3.12,
  2.76, 2.20, 1.84, 1.56,
  1.40, 1.12, 0.92, 0.80,
  0.70, 0.56, 0.46, 0.42,
  0.38, 0.30, 0.24, 0.20,
  0.0, 0.0, 0.0, 0.0
];

const DECAY_RATES = [
  NaN, NaN, NaN, NaN,
  39280.64, 31416.32, 26173.44, 22446.08,
  19640.32, 15708.16, 13086.72, 11223.04,
  9820.16, 7854.08, 6543.36, 5611.52,
  4910.08, 3927.04, 3271.68, 2805.76,
  2455.04, 1936.52, 1635.84, 1402.88,
  1227.52, 981.76, 817.92, 701.44,
  613.76, 490.88, 488.96, 350.72,
  306.88, 245.44, 204.48, 175.36,
  153.44, 122.72, 102.24, 87.68,
  76.72, 61.36, 51.12, 43.84,
  38.36, 30.68, 25.56, 21.92,
  19.20, 15.36, 12.80, 10.96,
  9.60, 7.68, 6.40, 5.48,
  4.80, 3.84, 3.20, 2.74,
  2.40, 2.40, 2.40, 2.40
];

const KEY_SCALE_MULTIPLIERS = [0.0, 1.0, 0.5, 2.0];
const FREQ_STARTS = [0.047, 0.094, 0.189, 0.379, 0.758, 1.517, 3.034, 6.068];
const FREQ_STEPS = [0.048, 0.095, 0.190, 0.379, 0.759, 1.517, 3.034, 6.069];
const KEY_SCALE_LEVELS = [
  new Float32Array(16),
  new Float32Array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.75, 1.125, 1.5, 1.875, 2.25, 2.625, 3.0]),
  new Float32Array([0.0, 0.0, 0.0, 0.0, 0.0, 1.875, 3.0, 4.125, 4.875, 5.625, 6.0, 6.75, 7.125, 7.5, 7.875, 8.25]),
  new Float32Array([0.0, 0.0, 0.0, 1.875, 3.0, 4.125, 4.875, 5.625, 6.0, 6.75, 7.125, 7.5, 7.875, 8.25, 8.625, 9.0]),
  new Float32Array([0.0, 0.0, 3.0, 4.875, 6.0, 7.125, 7.875, 8.625, 9.0, 9.75, 10.125, 10.5, 10.875, 11.25, 11.625, 12.0]),
  new Float32Array([0.0, 3.0, 6.0, 7.875, 9.0, 10.125, 10.875, 11.625, 12.0, 12.75, 13.125, 13.5, 13.875, 14.25, 14.625, 15.0]),
  new Float32Array([0.0, 6.0, 9.0, 10.875, 12.0, 13.125, 13.875, 14.625, 15.0, 15.75, 16.125, 16.5, 16.875, 17.25, 17.625, 18.0]),
  new Float32Array([0.0, 9.0, 12.0, 13.875, 15.0, 16.125, 16.875, 17.625, 18.0, 18.75, 19.125, 19.5, 19.875, 20.25, 20.625, 21.0])
];

const SAMPLE_COUNT_WAVE = 1024;
const WAVES = [];
for (let w = 0; w < 8; w++) {
  WAVES.push(new Float32Array(SAMPLE_COUNT_WAVE));
}
for (let i = 0; i < SAMPLE_COUNT_WAVE; i++) {
  const angle = (2.0 * Math.PI * i) / SAMPLE_COUNT_WAVE;
  const sine = Math.sin(angle);
  WAVES[0][i] = sine;
  WAVES[1][i] = Math.max(sine, 0.0);
  WAVES[2][i] = Math.abs(sine);
  WAVES[3][i] = (angle % (2.0 * Math.PI)) < 1.57 ? sine : 0.0;
  WAVES[4][i] = (angle % (4.0 * Math.PI)) < (2.0 * Math.PI) ? sine : 0.0;
  WAVES[5][i] = (angle % (4.0 * Math.PI)) < (2.0 * Math.PI) ? Math.abs(sine) : 0.0;
  WAVES[6][i] = sine > 0.0 ? 1.0 : 0.0;
  WAVES[7][i] = sine > 0.0 ? 1.0 : 0.0;
}

// --- 3. OPL2 Synthesizer & Note Player ---

class OscState {
  constructor() {
    this.config = {
      tremolo: false,
      vibrato: false,
      soundSustaining: true,
      keyScaling: false,
      multiplication: 1.0,
      keyScaleLevel: 0,
      outputLevel: 0.0,
      attackRate: 0,
      decayRate: 0,
      sustainLevel: 0.0,
      releaseRate: 0,
      waveForm: 0
    };
    this.state = 'Off'; // 'Off', 'Attack', 'Decay', 'Sustain', 'Release'
    this.volume = -96.0; // MIN_DB
    this.envelopeStep = 0;
    this.angle = 0.0;
  }
}

class Channel {
  constructor() {
    this.a = new OscState();
    this.b = new OscState();
    this.additive = false;
    this.feedback = 0;
    this.freqNum = 0;
    this.blockNum = 0;
    this.output0 = 0.0;
    this.output1 = 0.0;
    this.feedbackFactor = 0.0;
    this.m1 = 0.0;
    this.m2 = 0.0;
  }
}

export class OplSynthJS {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.time = 0.0;
    this.channels = [];
    for (let i = 0; i < 15; i++) {
      this.channels.push(new Channel());
    }
  }

  stopAll() {
    for (let i = 0; i < 15; i++) {
      this.channels[i].a.state = 'Off';
      this.channels[i].b.state = 'Off';
    }
  }

  setChannelConfig(channelIndex, instrument) {
    const channel = this.channels[channelIndex];
    if (!channel) return;

    channel.a.config = this.oscDescFromInstrument(instrument.operatorA);
    channel.b.config = this.oscDescFromInstrument(instrument.operatorB);
    channel.additive = (instrument.channelConfig & 1) !== 0;
    channel.feedback = (instrument.channelConfig & 0x0E) >> 1;
    channel.feedbackFactor = channel.feedback > 0 ? Math.pow(2.0, channel.feedback + 8) : 0.0;

    const radiansPerWave = 2.0 * Math.PI;
    const dbuPerWave = 1024.0 * 16.0;
    const volAsDbu = 0x10000;
    channel.m2 = radiansPerWave * volAsDbu / dbuPerWave;
    channel.m1 = channel.m2 / 2.0 / 0x10000;
  }

  oscDescFromInstrument(osc) {
    return {
      tremolo: osc.tremolo,
      vibrato: osc.vibrato,
      soundSustaining: osc.soundSustaining,
      keyScaling: osc.keyScaling,
      multiplication: osc.multiplication === 0 ? 0.0 : osc.multiplication,
      keyScaleLevel: osc.keyScaleLevel,
      outputLevel: (osc.outputLevel / 0x3F) * -47.25,
      attackRate: osc.attackRate,
      decayRate: osc.decayRate,
      sustainLevel: -45.0 * osc.sustainLevel / 0x0F,
      releaseRate: osc.releaseRate,
      waveForm: osc.waveForm
    };
  }

  setChannelVolume(channelIndex, volume) {
    const channel = this.channels[channelIndex];
    if (channel) {
      channel.b.config.outputLevel = volume;
    }
  }

  startNote(channelIndex, freqNum, blockNum) {
    const channel = this.channels[channelIndex];
    if (!channel) return;

    this.configureOscStart(channel.a, channel.freqNum, channel.blockNum, freqNum, blockNum);
    this.configureOscStart(channel.b, channel.freqNum, channel.blockNum, freqNum, blockNum);

    channel.freqNum = freqNum;
    channel.blockNum = blockNum;
  }

  configureOscStart(osc, currentFreqNum, currentBlockNum, freqNum, blockNum) {
    osc.state = 'Attack';
    osc.envelopeStep = 0;
  }

  stopNote(channelIndex) {
    const channel = this.channels[channelIndex];
    if (channel) {
      if (channel.a.state !== 'Off') channel.a.state = 'Release';
      if (channel.b.state !== 'Off') channel.b.state = 'Release';
    }
  }

  nextSample() {
    this.time += 1.0 / this.sampleRate;
    let out = 0.0;
    for (let c = 0; c < this.channels.length; c++) {
      out += this.processChannel(c);
    }
    if (isNaN(out)) {
      out = 0.0;
    }
    return Math.max(-1.0, Math.min(1.0, out / 2.0));
  }

  processChannel(channelIndex) {
    const channel = this.channels[channelIndex];
    const feedbackMod = (channel.output0 + channel.output1) * channel.feedbackFactor * channel.m1;

    const a = this.processOsc(channel.a, channel.freqNum, channel.blockNum, feedbackMod);
    const b = this.processOsc(
      channel.b,
      channel.freqNum,
      channel.blockNum,
      channel.additive ? 0.0 : a * channel.m2
    );

    channel.output1 = channel.output0;
    channel.output0 = a;

    return channel.additive ? (a + b) : b;
  }

  processOsc(osc, freqNum, blockNum, modulator) {
    if (osc.state === 'Off') return 0.0;

    const keyScaleNum = blockNum * 2 + (freqNum >> 7);
    const rof = osc.config.keyScaling ? keyScaleNum : Math.floor(keyScaleNum / 4);

    const getRate = (rate) => {
      return rate > 0 ? Math.min(63, rof + rate * 4) : 0;
    };

    const MIN_DB = -96.0;
    const MAX_DB = 0.0;

    switch (osc.state) {
      case 'Attack': {
        const rate = getRate(osc.config.attackRate);
        const timeToAttack = ATTACK_RATES[rate];
        if (isNaN(timeToAttack)) {
          osc.state = 'Off';
        } else if (timeToAttack === 0.0) {
          osc.volume = MAX_DB;
          osc.envelopeStep = 0;
          osc.state = 'Decay';
        } else {
          const steps = Math.max(1, Math.floor((this.sampleRate * timeToAttack) / 1000.0));
          const p = 3.0;
          osc.volume = -96.0 * Math.pow(Math.max(0, (steps - osc.envelopeStep) / steps), p);
          osc.envelopeStep++;
          if (osc.envelopeStep >= steps || isNaN(osc.volume)) {
            osc.envelopeStep = 0;
            osc.volume = MAX_DB;
            osc.state = 'Decay';
          }
        }
        break;
      }
      case 'Decay': {
        const rate = getRate(osc.config.decayRate);
        const timeToDecay = DECAY_RATES[rate];
        if (timeToDecay === 0.0 || isNaN(timeToDecay)) {
          osc.volume = osc.config.sustainLevel;
          osc.envelopeStep = 0;
          osc.state = 'Sustain';
        } else {
          const steps = Math.max(1, Math.floor((this.sampleRate * timeToDecay) / 1000.0));
          const decreaseAmt = osc.config.sustainLevel / steps;
          osc.volume += decreaseAmt;
          osc.envelopeStep++;
          if (osc.envelopeStep >= steps || isNaN(osc.volume)) {
            osc.envelopeStep = 0;
            osc.volume = osc.config.sustainLevel;
            osc.state = 'Sustain';
          }
        }
        break;
      }
      case 'Sustain': {
        if (!osc.config.soundSustaining) {
          osc.state = 'Release';
        }
        break;
      }
      case 'Release': {
        const rate = getRate(osc.config.releaseRate);
        const timeToRelease = DECAY_RATES[rate];
        if (isNaN(timeToRelease)) {
          osc.volume = MIN_DB;
          osc.state = 'Off';
        } else {
          const steps = Math.max(1, Math.floor((this.sampleRate * timeToRelease) / 1000.0));
          const decreaseAmt = (MIN_DB - osc.config.sustainLevel) / steps;
          osc.volume += decreaseAmt;
          osc.envelopeStep++;
          if (osc.envelopeStep >= steps || isNaN(osc.volume)) {
            osc.volume = MIN_DB;
            osc.state = 'Off';
          }
        }
        break;
      }
    }

    let ksDamping = 0.0;
    if (osc.config.keyScaleLevel > 0) {
      const kslm = KEY_SCALE_MULTIPLIERS[osc.config.keyScaleLevel];
      const levelVal = KEY_SCALE_LEVELS[blockNum] ? KEY_SCALE_LEVELS[blockNum][freqNum >> 6] : 0;
      ksDamping = -kslm * (levelVal || 0.0);
    }

    let freq = (freqNum * 49716.0) / Math.pow(2, 20 - blockNum);
    freq *= osc.config.multiplication === 0.0 ? 0.5 : osc.config.multiplication;

    const vib = osc.config.vibrato ? (Math.cos(this.time * 2.0 * Math.PI) * 0.00004 + 1.0) : 1.0;
    osc.angle += (1.0 / this.sampleRate) * 2.0 * Math.PI * freq * vib;

    const angle = osc.angle + modulator;
    const wrapped = Math.abs(angle) % (2.0 * Math.PI);
    const waveIndex = Math.min(
      SAMPLE_COUNT_WAVE - 1,
      Math.floor((wrapped * SAMPLE_COUNT_WAVE) / (2.0 * Math.PI))
    );
    const wave = WAVES[osc.config.waveForm][waveIndex];

    const tremolo = osc.config.tremolo ? Math.abs(Math.cos(this.time * Math.PI * 3.7)) : 0.0;
    return wave * Math.pow(10.0, (osc.volume + osc.config.outputLevel + tremolo + ksDamping) / 20.0);
  }
}

export class MuzaxPlayerJS {
  constructor(songs) {
    this.songs = songs;
    this.currentSong = null;
    this.commands = null;
    this.cursor = 0;
    this.paused = 0;
    this.jumpPos = 0;
    this.timeUntilTick = 0.0;
    this.tickDuration = 0.005; // 5ms tick rate
  }

  loadSong(songIndex, synth) {
    const song = this.songs[songIndex];
    if (!song) {
      this.stop(synth);
      return;
    }
    this.currentSong = songIndex;
    this.cursor = 0;
    this.paused = 0;
    this.jumpPos = 0;
    this.timeUntilTick = 0.0;
    this.commands = song.commands;
    synth.stopAll();
  }

  stop(synth) {
    this.currentSong = null;
    this.commands = null;
    this.cursor = 0;
    this.paused = 0;
    this.jumpPos = 0;
    this.timeUntilTick = 0.0;
    synth.stopAll();
  }

  render(synth, outputBuffer, sampleRate) {
    if (this.currentSong === null || !this.commands) {
      outputBuffer.fill(0.0);
      return;
    }

    const dt = 1.0 / sampleRate;
    for (let i = 0; i < outputBuffer.length; i++) {
      this.timeUntilTick += dt;
      while (this.timeUntilTick >= this.tickDuration) {
        this.readNote(synth);
        this.timeUntilTick -= this.tickDuration;
      }
      outputBuffer[i] = synth.nextSample();
    }
  }

  readNote(synth) {
    if (this.currentSong === null || !this.commands) return;
    if (this.paused > 0) {
      this.paused--;
      return;
    }

    while (this.paused === 0) {
      if (this.cursor + 1 >= this.commands.length) {
        this.cursor = 0;
      }

      let cmdLow = this.commands[this.cursor];
      const cmdHigh = this.commands[this.cursor + 1];
      this.cursor += 2;

      const functionType = cmdLow & 7;
      cmdLow = cmdLow >> 4;

      switch (functionType) {
        case 0:
          this.paused = cmdHigh;
          return;
        case 1:
          this.stopNote(cmdLow, synth);
          this.configureInstrument(cmdLow, cmdHigh, synth);
          break;
        case 2:
          this.playNote(cmdLow, cmdHigh, synth);
          break;
        case 3:
          this.stopNote(cmdLow, synth);
          break;
        case 4:
          synth.setChannelVolume(cmdLow, ((cmdHigh & 0x3F) / 0x3F) * -47.25);
          break;
        case 5:
          this.cursor = Math.min(this.jumpPos, this.commands.length);
          break;
        case 6:
          this.jumpPos = this.cursor;
          break;
        case 7:
          break;
      }
    }
  }

  configureInstrument(channel, instrumentIndex, synth) {
    const song = this.songs[this.currentSong];
    if (!song) return;
    const instrument = song.instruments[instrumentIndex];
    if (instrument) {
      synth.setChannelConfig(channel, instrument);
    }
  }

  stopNote(channel, synth) {
    if (channel < 11) {
      synth.stopNote(channel);
    }
  }

  playNote(channel, note, synth) {
    const lowFreqs = [
      0xAC, 0xB6, 0xC1, 0xCD, 0xD9, 0xE6, 0xF3, 0x02, 0x11, 0x22, 0x33, 0x45
    ];
    const highFreqs = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const noteIdx = note % 12;
    const octave = Math.floor(note / 12) + 3;
    const freqNum = (highFreqs[noteIdx] << 8) | lowFreqs[noteIdx];
    const target = channel < 6 ? channel : (channel - 6 + 6);
    synth.startNote(target, freqNum, octave);
  }
}
