import { toStreamIframeUrl, isHlsUrl } from '../../utils/streamUrl';

// The real shape produced by _shared/streamSign.ts → streamHlsUrl().
const SIGNED_JWT =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYzEyMyJ9.eyJzdWIiOiI1NjVhOTA2MDk4YWI3MjE1NjQ3ZDljYmUzNzI3NDY0OCJ9.sig-part_-x';
const SIGNED_HLS = `https://videodelivery.net/${SIGNED_JWT}/manifest/video.m3u8`;

describe('toStreamIframeUrl', () => {
  it('converts a signed Stream HLS manifest to the iframe embed', () => {
    expect(toStreamIframeUrl(SIGNED_HLS)).toBe(`https://iframe.videodelivery.net/${SIGNED_JWT}`);
  });

  it('handles an unsigned uid URL too', () => {
    expect(toStreamIframeUrl('https://videodelivery.net/565a906098ab/manifest/video.m3u8')).toBe(
      'https://iframe.videodelivery.net/565a906098ab',
    );
  });

  it('preserves the token exactly — a mangled JWT is an unplayable video', () => {
    // JWTs carry '.', '-' and '_'. An over-eager character class would corrupt
    // the token and Cloudflare would reject it.
    const out = toStreamIframeUrl(SIGNED_HLS)!;
    expect(out.endsWith(SIGNED_JWT)).toBe(true);
    expect(out).toContain('.');
    expect(out).toContain('-');
    expect(out).toContain('_');
  });

  it('returns null for an R2-signed mp4, which plays in a plain <video>', () => {
    expect(
      toStreamIframeUrl('https://peptalktraining.r2.cloudflarestorage.com/clip.mp4?X-Amz-Signature=x'),
    ).toBeNull();
  });

  it('returns null for anything that is not a Stream manifest', () => {
    expect(toStreamIframeUrl('https://example.com/video.m3u8')).toBeNull();
    expect(toStreamIframeUrl('https://videodelivery.net/abc/thumbnail.jpg')).toBeNull();
    expect(toStreamIframeUrl('')).toBeNull();
  });

  it('does not match a lookalike host', () => {
    // videodelivery.net.evil.com must not be treated as Cloudflare.
    expect(
      toStreamIframeUrl('https://videodelivery.net.evil.com/tok/manifest/video.m3u8'),
    ).toBeNull();
  });
});

describe('isHlsUrl', () => {
  it('detects HLS, including with a query or fragment', () => {
    expect(isHlsUrl(SIGNED_HLS)).toBe(true);
    expect(isHlsUrl('https://x/y.m3u8?t=1')).toBe(true);
    expect(isHlsUrl('https://x/y.m3u8#f')).toBe(true);
  });

  it('does not flag mp4', () => {
    expect(isHlsUrl('https://x/y.mp4')).toBe(false);
    expect(isHlsUrl('https://x/m3u8-notes.mp4')).toBe(false);
  });
});
