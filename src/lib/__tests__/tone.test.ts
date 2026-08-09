/**
 * The generated rest-timer beep.
 *
 * The rest timer signalled completion with `notifySuccess()` and nothing else.
 * That is Haptics.notificationAsync, and haptics.ts gates every call on
 * `Platform.OS === 'ios' || 'android'` — so on the PWA the timer ended with NO
 * perceptible feedback at all. On native it buzzed, which is easy to miss when
 * the phone is face-down on a bench, which is where a phone is during a set.
 *
 * A rest timer you have to watch is a clock.
 *
 * The app ships zero audio assets, so the tone is synthesised. These test the
 * bytes, because a malformed WAV header does not throw — expo-av just plays
 * nothing, which is indistinguishable from the bug being fixed.
 */
import { TONES, tonePcm, wavBytes, toBase64, toneDataUri } from '../tone';

const readAscii = (b: Uint8Array, at: number, len: number) =>
  String.fromCharCode(...Array.from(b.slice(at, at + len)));
const readU32 = (b: Uint8Array, at: number) =>
  b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);
const readU16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);

describe('the WAV header is actually a WAV header', () => {
  const bytes = wavBytes(tonePcm(TONES.restComplete), 22050);

  it('starts with RIFF/WAVE', () => {
    // Wrong magic bytes do not throw. expo-av just plays silence, which looks
    // exactly like the bug this replaces.
    expect(readAscii(bytes, 0, 4)).toBe('RIFF');
    expect(readAscii(bytes, 8, 4)).toBe('WAVE');
  });

  it('declares PCM, mono, 16-bit', () => {
    expect(readAscii(bytes, 12, 4)).toBe('fmt ');
    expect(readU32(bytes, 16)).toBe(16); // fmt chunk size
    expect(readU16(bytes, 20)).toBe(1); // 1 = PCM
    expect(readU16(bytes, 22)).toBe(1); // mono
    expect(readU16(bytes, 34)).toBe(16); // bits per sample
  });

  it('byte rate and block align agree with the format', () => {
    // A player trusts these. Getting them wrong plays the tone at the wrong
    // speed rather than failing.
    const rate = readU32(bytes, 24);
    expect(rate).toBe(22050);
    expect(readU32(bytes, 28)).toBe(rate * 1 * 2); // rate × channels × bytes
    expect(readU16(bytes, 32)).toBe(2); // block align
  });

  it('the declared sizes match the real buffer', () => {
    const dataSize = readU32(bytes, 40);
    expect(readAscii(bytes, 36, 4)).toBe('data');
    expect(dataSize).toBe(bytes.length - 44);
    expect(readU32(bytes, 4)).toBe(bytes.length - 8);
  });
});

describe('the samples are a real tone', () => {
  it('has roughly the requested duration', () => {
    const pcm = tonePcm({ frequency: 880, durationMs: 200 }, 22050);
    expect(pcm.length).toBe(Math.round(0.2 * 22050));
  });

  it('starts and ends at silence so it does not click', () => {
    // A sine starting mid-cycle is a step discontinuity — audible as a click
    // on every single play, which is what makes a generated beep sound broken.
    const pcm = tonePcm(TONES.restComplete);
    expect(Math.abs(pcm[0])).toBeLessThan(50);
    expect(Math.abs(pcm[pcm.length - 1])).toBeLessThan(50);
  });

  it('is actually loud in the middle', () => {
    // Guards the opposite failure: ramps so aggressive the tone is inaudible.
    const pcm = tonePcm(TONES.restComplete);
    const mid = Math.abs(pcm[Math.floor(pcm.length / 2)]);
    expect(mid).toBeGreaterThan(1000);
  });

  it('never clips', () => {
    const pcm = tonePcm({ frequency: 880, durationMs: 100, volume: 1 });
    for (let i = 0; i < pcm.length; i++) {
      expect(pcm[i]).toBeGreaterThanOrEqual(-32768);
      expect(pcm[i]).toBeLessThanOrEqual(32767);
    }
  });

  it('clamps a nonsense volume instead of distorting', () => {
    const loud = tonePcm({ frequency: 440, durationMs: 50, volume: 99 });
    const quiet = tonePcm({ frequency: 440, durationMs: 50, volume: -5 });
    for (let i = 0; i < loud.length; i++) expect(Math.abs(loud[i])).toBeLessThanOrEqual(32767);
    for (let i = 0; i < quiet.length; i++) expect(quiet[i]).toBe(0);
  });

  it('survives a zero-length request rather than producing an empty buffer', () => {
    // An empty WAV is a file that plays nothing — the silent failure again.
    expect(tonePcm({ frequency: 440, durationMs: 0 }).length).toBeGreaterThan(0);
  });
});

describe('base64', () => {
  it('matches a known encoding', () => {
    const bytes = new Uint8Array([0x4d, 0x61, 0x6e]); // "Man"
    expect(toBase64(bytes)).toBe('TWFu');
  });

  it('pads correctly for lengths not divisible by 3', () => {
    expect(toBase64(new Uint8Array([0x4d]))).toBe('TQ==');
    expect(toBase64(new Uint8Array([0x4d, 0x61]))).toBe('TWE=');
  });

  it('round-trips through Buffer', () => {
    // Independent check against Node's own encoder — a hand-rolled base64 that
    // is subtly wrong yields a data URI that silently fails to decode.
    const bytes = wavBytes(tonePcm(TONES.countdown));
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('the data URI expo-av loads', () => {
  it('is a well-formed audio/wav data URI', () => {
    const uri = toneDataUri(TONES.restComplete);
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(uri.length).toBeGreaterThan(1000);
  });

  it('decodes back to bytes that still start with RIFF', () => {
    const uri = toneDataUri(TONES.countdown);
    const decoded = Buffer.from(uri.split(',')[1], 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });
});

describe('the two cues are distinguishable', () => {
  it('differ in pitch and length', () => {
    // Two cues that sound alike are worse than one — you cannot tell "3, 2, 1"
    // from "go".
    expect(TONES.restComplete.frequency).not.toBe(TONES.countdown.frequency);
    expect(TONES.restComplete.durationMs).toBeGreaterThan(TONES.countdown.durationMs);
  });

  it('the countdown is quieter than the completion', () => {
    // It fires three times in a row; at equal volume it nags.
    expect(TONES.countdown.volume!).toBeLessThan(TONES.restComplete.volume!);
  });
});
