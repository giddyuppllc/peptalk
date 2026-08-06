/**
 * StreamVideoSurface — NATIVE. The actual playback surface, split by platform.
 *
 * Exists so a screen's chrome (poster, modal, controls, retry) stays in ONE
 * shared file while only the element that renders pixels differs between
 * native and web. Duplicating a whole component per platform is what let
 * SquareCardForm and the two meal scanners drift apart; this keeps the split
 * to the smallest possible surface.
 *
 * Native is the straightforward case: expo-av hands the signed Cloudflare
 * Stream HLS manifest to AVPlayer / ExoPlayer, both of which speak HLS.
 * See StreamVideoSurface.web.tsx for why web cannot do the same.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

export interface StreamVideoSurfaceProps {
  /** Signed playback URL from get-workout-video / get-learn-video. */
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Start playing as soon as the surface mounts. */
  shouldPlay?: boolean;
  isLooping?: boolean;
}

/**
 * Whether this platform can drive playback imperatively through a ref
 * (play/pause/seek). False on web, where the Cloudflare iframe owns its own
 * transport, so a caller with custom controls can hide them instead of
 * rendering buttons that do nothing.
 */
export const SUPPORTS_TRANSPORT_CONTROL = true;

export function StreamVideoSurface({
  uri,
  style,
  shouldPlay = true,
  isLooping = false,
}: StreamVideoSurfaceProps) {
  return (
    <Video
      source={{ uri }}
      style={style}
      useNativeControls
      resizeMode={ResizeMode.CONTAIN}
      shouldPlay={shouldPlay}
      isLooping={isLooping}
    />
  );
}
