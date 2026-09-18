/**
 * useCameraPermissionGate — asks for the camera with the system prompt directly,
 * and reports 'denied' only after the system has said no.
 *
 * The rules and the App Review history are in src/lib/cameraPermissionGate.ts.
 *
 * `enabled` lets a screen that is mounted but not showing (a closed modal) hold
 * off. When it goes false the phase resets, so reopening asks the OS again if
 * the OS still allows it.
 */
import { useEffect, useRef, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import {
  cameraGateState,
  shouldRequestCamera,
  type CameraGateState,
  type CameraRequestPhase,
} from '../lib/cameraPermissionGate';

export function useCameraPermissionGate(enabled = true): {
  state: CameraGateState;
  canAskAgain: boolean;
  requestPermission: () => Promise<unknown>;
} {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<CameraRequestPhase>('idle');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) setPhase('idle');
  }, [enabled]);

  const state = cameraGateState(permission, phase);

  useEffect(() => {
    if (!shouldRequestCamera(state, phase, enabled)) return;
    setPhase('requesting');
    requestPermission()
      .catch(() => {
        // A failed request is treated as an answer: the denied screen, with its
        // way out, is better than a blank screen waiting forever.
      })
      .finally(() => {
        if (mountedRef.current) setPhase('done');
      });
  }, [state, phase, enabled, requestPermission]);

  return {
    state,
    canAskAgain: permission?.canAskAgain ?? false,
    requestPermission,
  };
}
