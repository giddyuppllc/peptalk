/**
 * useAimeeVoice — hook that records audio, transcribes it via the
 * `aimee-voice` edge function (Whisper), and routes the transcript
 * into the existing Aimee chat pipeline.
 *
 * Why route through chat instead of a parallel intent shape:
 *   - `aimee-chat-stream` already exposes a 10-tool registry
 *     (log_meal, log_dose, schedule_workout, draft_meal_template,
 *      navigate_to_screen, open_dosing_calculator, etc.) plus the
 *     pending-action confirm-card UI.
 *   - peptalk.tsx already auto-sends a `?message=...` query param.
 *   - So voice just becomes: record → transcribe → router.push the
 *     transcript into chat. Aimee's existing tool routing does the rest.
 *
 * If you also want the response read aloud, pass `?speak=1` — peptalk
 * picks it up and uses expo-speech on the final bot message.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { supabase } from '../services/supabase';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { tapLight, tapMedium } from '../utils/haptics';

export type VoiceStatus =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'transcribing';

interface UseAimeeVoiceResult {
  status: VoiceStatus;
  isActive: boolean;
  /** Begin recording. Bounces to /subscription if user is on free tier. */
  start: () => Promise<void>;
  /** Stop recording and dispatch the transcript into Aimee chat. */
  stop: () => Promise<void>;
  /** Bail out without sending — used if the user releases too quickly. */
  cancel: () => Promise<void>;
}

const MIN_RECORDING_MS = 350;

export function useAimeeVoice(): UseAimeeVoiceResult {
  const router = useRouter();
  const tier = useSubscriptionStore((s) => s.tier);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const start = useCallback(async () => {
    // Voice + "Aimee controls the whole app" is reserved for the highest
    // paid tier (Pro). Plus and Free users see the mic but get bounced
    // to the paywall on press.
    if (tier !== 'pro') {
      tapLight();
      router.push('/subscription' as never);
      return;
    }
    try {
      tapMedium();
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Mic permission needed',
          'Enable microphone access in Settings so Aimee can hear you.',
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await rec.startAsync();
      recordingRef.current = rec;
      startedAtRef.current = Date.now();
      setStatus('recording');
    } catch (err) {
      console.warn('[useAimeeVoice] start failed:', err);
      setStatus('idle');
    }
  }, [router, tier]);

  const cancel = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setStatus('idle');
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {}
    }
  }, []);

  const stop = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) {
      setStatus('idle');
      return;
    }
    // Tap-too-fast guard: if the user just brushed the button, swallow it
    // rather than ship 50ms of silence to Whisper.
    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed < MIN_RECORDING_MS) {
      await cancel();
      return;
    }
    tapLight();
    setStatus('uploading');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error('No audio captured');

      const form = new FormData();
      form.append('audio', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      } as any);

      const { data: { session } } = await (supabase as any).auth.getSession();
      const accessToken = session?.access_token ?? '';
      if (!accessToken) {
        Alert.alert('Not signed in', 'Sign in to use Aimee voice.');
        setStatus('idle');
        return;
      }

      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      setStatus('transcribing');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/aimee-voice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON,
        },
        body: form as any,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn('[useAimeeVoice] edge fn error', res.status, detail);
        Alert.alert(
          'Voice unavailable',
          'Aimee couldn\'t hear that. Try again in a moment.',
        );
        setStatus('idle');
        return;
      }

      const { transcript } = (await res.json()) as { transcript: string };
      const text = (transcript || '').trim();
      setStatus('idle');
      if (!text) {
        // Empty transcript — silent recording or unintelligible. Bail
        // softly so the user can retry without seeing a modal.
        return;
      }

      // Hand off to the existing chat pipeline. `speak=1` makes peptalk.tsx
      // read the bot reply aloud once it finishes streaming.
      router.push(
        `/(tabs)/peptalk?message=${encodeURIComponent(text)}&speak=1` as never,
      );
    } catch (err) {
      console.warn('[useAimeeVoice] stop failed:', err);
      setStatus('idle');
    }
  }, [router, cancel]);

  return {
    status,
    isActive: status !== 'idle',
    start,
    stop,
    cancel,
  };
}
