/**
 * Audio cues — native.
 *
 * Pairs with cue.web.ts; Metro picks the platform file, the same one-primitive
 * pattern as lib/alert.ts. Callers import from 'lib/cue' and never branch.
 *
 * The rest timer previously signalled completion with haptics alone, which the
 * PWA does not implement at all and which is easy to miss on a phone lying on
 * a bench. See tone.ts for why the sound is generated rather than bundled.
 *
 * Everything here fails silently. A cue is a nicety layered on top of haptics
 * and an on-screen change; a workout must never break because audio would not
 * initialise.
 */
import { Audio } from 'expo-av';
import { TONES, toneDataUri, type ToneSpec } from './tone';

type CueName = keyof typeof TONES;

const cache = new Map<CueName, Audio.Sound>();
let enabled = true;

/** Turn cues off globally (a settings toggle can call this). */
export function setCuesEnabled(next: boolean) {
  enabled = next;
}

export function cuesEnabled(): boolean {
  return enabled;
}

async function load(name: CueName): Promise<Audio.Sound | null> {
  const existing = cache.get(name);
  if (existing) return existing;
  try {
    const spec: ToneSpec = TONES[name];
    const { sound } = await Audio.Sound.createAsync(
      { uri: toneDataUri(spec) },
      { shouldPlay: false, volume: 1 },
    );
    cache.set(name, sound);
    return sound;
  } catch {
    return null;
  }
}

/**
 * Play a cue. Never throws, never blocks the caller.
 *
 * `playsInSilentModeIOS: false` is deliberate: a phone switched to silent
 * should stay silent. The haptic and the on-screen timer still fire, so the
 * cue is additive rather than the only signal — muting the phone must not mean
 * missing the end of a rest period entirely.
 */
export async function playCue(name: CueName): Promise<void> {
  if (!enabled) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    const sound = await load(name);
    if (!sound) return;
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Audio is best-effort. Swallow.
  }
}

/** Release cached sounds. Call on teardown if a screen wants to be tidy. */
export async function unloadCues(): Promise<void> {
  for (const sound of cache.values()) {
    try {
      await sound.unloadAsync();
    } catch {
      /* ignore */
    }
  }
  cache.clear();
}
