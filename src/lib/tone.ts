/**
 * A short beep, generated rather than shipped.
 *
 * WHY THIS EXISTS
 * The rest timer between sets signalled completion with `notifySuccess()` and
 * nothing else. That is `Haptics.notificationAsync`, and haptics.ts gates every
 * call on `Platform.OS === 'ios' || 'android'` — so on the PWA the timer ended
 * with NO feedback whatsoever: no sound, no buzz, nothing changed that you
 * could perceive without looking. On native it buzzed, which is easy to miss
 * when the phone is face-down on a bench two feet away, which is where a phone
 * is during a set.
 *
 * A rest timer you have to watch is not a rest timer. It is a clock.
 *
 * The app ships zero audio assets, so the tone is synthesised: a 44-byte WAV
 * header plus PCM samples, base64'd into a data URI that expo-av can load on
 * native. The web build uses the Web Audio API directly and never touches this
 * — see cue.web.ts.
 *
 * Generated rather than bundled on purpose: an mp3 is a binary blob nobody can
 * review in a diff, it has to be licence-checked, and it grows the download for
 * 150ms of sine wave. This is ~40 lines and every value in it is legible.
 */

/** Sample rate for the generated WAV. 22.05 kHz is ample for a sine beep. */
const SAMPLE_RATE = 22050;

export interface ToneSpec {
  /** Pitch in Hz. */
  frequency: number;
  /** Length in milliseconds. */
  durationMs: number;
  /** 0..1 peak amplitude. */
  volume?: number;
}

/**
 * The cues the app uses. Kept together so they can be compared by ear and by
 * eye — two cues that sound alike are worse than one.
 *
 *   restComplete  rest is over, start the next set. Higher and longer, since
 *                 it has to carry across a room.
 *   countdown     the last few seconds ticking down. Quieter and shorter so a
 *                 sequence of them does not become nagging.
 */
export const TONES: Record<'restComplete' | 'countdown', ToneSpec> = {
  restComplete: { frequency: 880, durationMs: 220, volume: 0.35 },
  countdown: { frequency: 660, durationMs: 90, volume: 0.22 },
};

/**
 * Raw 16-bit mono PCM samples for a tone, with a short linear fade in and out.
 *
 * The fade is not decoration. A sine wave that starts and stops at a non-zero
 * sample produces a step discontinuity, which is audible as a click on every
 * play — the exact artefact that makes a generated beep sound broken.
 */
export function tonePcm(spec: ToneSpec, sampleRate = SAMPLE_RATE): Int16Array {
  const { frequency, durationMs } = spec;
  const volume = Math.min(1, Math.max(0, spec.volume ?? 0.3));
  const count = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const out = new Int16Array(count);
  // 4 ms of ramp at each end, or a quarter of the tone if it is very short.
  const ramp = Math.min(Math.floor(sampleRate * 0.004), Math.floor(count / 4));

  for (let i = 0; i < count; i++) {
    let gain = volume;
    if (ramp > 0) {
      if (i < ramp) gain *= i / ramp;
      else if (i >= count - ramp) gain *= (count - 1 - i) / ramp;
    }
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * gain;
    out[i] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
  }
  return out;
}

/** Little-endian WAV bytes (RIFF header + PCM) for the given samples. */
export function wavBytes(pcm: Int16Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true); // file size minus the first 8 bytes
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // format 1 = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate = rate * channels * bytesPerSample
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);
  return new Uint8Array(buffer);
}

/** Base64, without assuming Buffer or btoa exists. */
export function toBase64(bytes: Uint8Array): string {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += CHARS[b0 >> 2];
    out += CHARS[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : CHARS[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : CHARS[b2 & 63];
  }
  return out;
}

/** A `data:audio/wav;base64,…` URI expo-av can load with no bundled asset. */
export function toneDataUri(spec: ToneSpec, sampleRate = SAMPLE_RATE): string {
  return `data:audio/wav;base64,${toBase64(wavBytes(tonePcm(spec, sampleRate), sampleRate))}`;
}
