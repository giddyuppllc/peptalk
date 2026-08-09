/**
 * Audio cues — web.
 *
 * The reason this file exists at all: haptics.ts no-ops on web
 * (`Platform.OS === 'ios' || 'android'`), so the rest timer finished with
 * absolutely no perceptible signal on the PWA. Not a quiet one — none.
 *
 * Web synthesises the tone directly with the Web Audio API rather than
 * decoding the generated WAV: an oscillator is a few lines, avoids a base64
 * blob in the bundle, and sidesteps codec differences between browsers.
 *
 * Browsers refuse to start audio until the user has interacted with the page.
 * That is not a problem here — a rest timer only exists after someone tapped
 * "log this set" — but the context is still created lazily and resumed on
 * demand, because creating it at import time on a page the user never
 * interacts with logs a console warning in Chrome.
 */
import { TONES } from './tone';

type CueName = keyof typeof TONES;

let ctx: AudioContext | null = null;
let enabled = true;

export function setCuesEnabled(next: boolean) {
  enabled = next;
}

export function cuesEnabled(): boolean {
  return enabled;
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as any).AudioContext ?? (window as any).webkitAudioContext ?? null;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

export async function playCue(name: CueName): Promise<void> {
  if (!enabled) return;
  try {
    const audio = getContext();
    if (!audio) return;
    if (audio.state === 'suspended') await audio.resume();

    const spec = TONES[name];
    const now = audio.currentTime;
    const seconds = spec.durationMs / 1000;
    const volume = spec.volume ?? 0.3;

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = spec.frequency;

    // Same 4 ms ramps as the native tone. Without them the oscillator starts
    // and stops on a non-zero sample and every beep begins with a click.
    const ramp = Math.min(0.004, seconds / 4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + ramp);
    gain.gain.setValueAtTime(volume, now + seconds - ramp);
    gain.gain.linearRampToValueAtTime(0, now + seconds);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + seconds);
  } catch {
    // Best-effort, exactly as on native.
  }
}

export async function unloadCues(): Promise<void> {
  try {
    await ctx?.close();
  } catch {
    /* ignore */
  }
  ctx = null;
}
