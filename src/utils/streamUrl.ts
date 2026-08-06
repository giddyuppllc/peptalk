/**
 * Cloudflare Stream URL helpers.
 *
 * Both get-workout-video and get-learn-video return a signed **HLS** manifest:
 *
 *   https://videodelivery.net/<signedJWT>/manifest/video.m3u8
 *
 * Native (expo-av → AVPlayer / ExoPlayer) plays that fine. Web does not:
 * expo-av's <Video> is a plain HTML5 <video>, and Chrome, Edge, Firefox and
 * Android cannot play HLS natively — only Safari can. The app bundles no HLS
 * library, so on web the element silently loaded nothing and no video ever
 * played. Cloudflare's own signed iframe embed plays the same asset in every
 * browser, so web surfaces convert the URL and render an iframe.
 */

/**
 * Convert a signed Stream HLS manifest URL into Cloudflare's signed iframe
 * embed. Returns null when the URL is not that shape — an R2-signed mp4, for
 * instance, which a plain <video> element handles perfectly well.
 */
export function toStreamIframeUrl(url: string): string | null {
  const m = /^https:\/\/videodelivery\.net\/([^/?#]+)\/manifest\/video\.m3u8/.exec(url);
  return m ? `https://iframe.videodelivery.net/${m[1]}` : null;
}

/** True when a URL needs an HLS-capable player rather than a bare <video>. */
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|#|$)/.test(url);
}
