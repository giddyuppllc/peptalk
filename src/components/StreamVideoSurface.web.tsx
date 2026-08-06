/**
 * StreamVideoSurface — WEB.
 *
 * get-workout-video and get-learn-video both return a signed Cloudflare Stream
 * HLS manifest. expo-av's <Video> on web is a plain HTML5 <video>, and Chrome,
 * Edge, Firefox and Android cannot play HLS natively — only Safari can. The app
 * bundles no HLS library, so the element silently loaded nothing and no video
 * ever played on the web build.
 *
 * Cloudflare's signed iframe embed plays the same asset in every browser and is
 * maintained by Cloudflare, which beats adding a ~400KB HLS player to a bundle
 * already at 8.59MB. Needs `frame-src https://iframe.videodelivery.net` in the
 * CSP (public/vercel.json) or it renders blank.
 *
 * Anything that is not a Stream manifest — an R2-signed mp4, say — goes to a
 * plain <video>, which handles it fine.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { toStreamIframeUrl } from '../utils/streamUrl';

export interface StreamVideoSurfaceProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  shouldPlay?: boolean;
  isLooping?: boolean;
}

/**
 * False on web: the Cloudflare iframe owns its own transport, so a caller's
 * custom play/pause/seek controls cannot drive it and should be hidden rather
 * than rendered as dead buttons.
 */
export const SUPPORTS_TRANSPORT_CONTROL = false;

export function StreamVideoSurface({
  uri,
  style,
  shouldPlay = true,
  isLooping = false,
}: StreamVideoSurfaceProps) {
  const iframeUrl = toStreamIframeUrl(uri);

  return (
    <View style={[styles.fill, style]}>
      {iframeUrl ? (
        // react-native-web renders real DOM, so a raw iframe is valid here.
        <iframe
          src={iframeUrl}
          style={{ border: 'none', width: '100%', height: '100%', background: '#000' }}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
          title="Video player"
        />
      ) : (
        <video
          src={uri}
          controls
          autoPlay={shouldPlay}
          loop={isLooping}
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' },
});
