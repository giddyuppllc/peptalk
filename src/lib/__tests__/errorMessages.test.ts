import {
  classifyAuthError,
  describeAuthError,
  extractMessage,
  toUserMessage,
} from '../errorMessages';

/**
 * Sentry PEPTALK-3: 53 NetworkError events across 5 users on
 * app.peptalk.bio/onboarding. Ten attempts each — the shape of someone stuck.
 * They were shown "Failed to fetch", because both auth screens rendered
 * err.message straight to the UI.
 */
describe('network failures — the PEPTALK-3 case', () => {
  // Each surface phrases it differently, and supabase-js does not normalise it.
  const shapes = [
    'Failed to fetch',                                  // Chrome / Android
    'TypeError: Failed to fetch',
    'Network request failed',                           // React Native
    'NetworkError when attempting to fetch resource.',  // Firefox
    'Load failed',                                      // Safari / iOS WebKit
    'The Internet connection appears to be offline.',
    'fetch failed',                                     // undici / node
    'AbortError: signal is aborted without reason',
    'Request timed out',
  ];

  it.each(shapes)('classifies %j as offline', (raw) => {
    expect(classifyAuthError(new Error(raw))).toBe('offline');
  });

  it('never shows the raw message to the user', () => {
    const d = describeAuthError(new Error('Failed to fetch'));
    expect(d.message).not.toContain('Failed to fetch');
    expect(d.message).not.toContain('fetch');
  });

  it('keeps the raw message for telemetry', () => {
    expect(describeAuthError(new Error('Failed to fetch')).raw).toBe('Failed to fetch');
  });

  it('names the in-app-browser possibility, not just "you are offline"', () => {
    // The same user population produces the Meta in-app-browser CSP reports, so
    // "check your connection" alone would send them looking in the wrong place.
    expect(describeAuthError(new Error('Load failed')).message.toLowerCase())
      .toContain('safari');
  });

  it('is retryable', () => {
    expect(describeAuthError(new Error('Failed to fetch')).retryable).toBe(true);
  });
});

describe('the other auth failures stay distinguishable', () => {
  const cases: [string, string][] = [
    ['Invalid login credentials', 'invalid_credentials'],
    ['Email not confirmed', 'email_not_confirmed'],
    ['User already registered', 'already_registered'],
    ['Password should be at least 8 characters', 'weak_password'],
  ];

  it.each(cases)('classifies %j', (raw, kind) => {
    expect(classifyAuthError(new Error(raw))).toBe(kind);
  });

  it('reads rate limiting off the status code as well as the text', () => {
    expect(classifyAuthError(Object.assign(new Error('nope'), { status: 429 })))
      .toBe('rate_limited');
    expect(classifyAuthError(new Error('For security purposes, you can only request this after 42 seconds')))
      .toBe('rate_limited');
  });

  it('treats 5xx as the server, not the user', () => {
    const d = describeAuthError(Object.assign(new Error('boom'), { status: 503 }));
    expect(d.kind).toBe('server');
    expect(d.retryable).toBe(true);
  });

  it('does not invite a retry of the same wrong password', () => {
    expect(describeAuthError(new Error('Invalid login credentials')).retryable).toBe(false);
  });
});

describe('malformed errors do not crash the screen', () => {
  it.each([[null], [undefined], [{}], [42], [new Error('')]])('handles %p', (err) => {
    const d = describeAuthError(err);
    expect(d.kind).toBe('unknown');
    expect(d.message.length).toBeGreaterThan(0);
  });

  it('accepts a bare string', () => {
    expect(extractMessage('Failed to fetch')).toBe('Failed to fetch');
    expect(classifyAuthError('Failed to fetch')).toBe('offline');
  });
});

describe('toUserMessage — the 15 non-auth Alert bodies', () => {
  const FALLBACK = 'Could not upload image.';

  it('replaces a dead network with something actionable', () => {
    const msg = toUserMessage(new Error('Failed to fetch'), FALLBACK);
    expect(msg).not.toBe(FALLBACK);
    expect(msg).not.toContain('fetch');
    expect(msg.toLowerCase()).toContain('connection');
  });

  it('replaces a 5xx, which is not the user\'s problem', () => {
    const msg = toUserMessage(Object.assign(new Error('boom'), { status: 503 }), FALLBACK);
    expect(msg).not.toBe(FALLBACK);
    expect(msg.toLowerCase()).toContain('trouble');
  });

  it('replaces a rate limit', () => {
    const msg = toUserMessage(Object.assign(new Error('slow down'), { status: 429 }), FALLBACK);
    expect(msg.toLowerCase()).toContain('too many');
  });

  it('KEEPS the caller\'s fallback for anything else', () => {
    // The caller's copy is context-specific ("Could not upload image") and is
    // almost always better than anything a generic helper could invent. Only
    // the cases we can genuinely improve on get rewritten.
    expect(toUserMessage(new Error('some weird server thing'), FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage({}, FALLBACK)).toBe(FALLBACK);
  });

  it('never leaks the raw message, whatever the input', () => {
    for (const raw of ['Failed to fetch', 'Load failed', 'Network request failed']) {
      expect(toUserMessage(new Error(raw), FALLBACK)).not.toContain(raw);
    }
  });
});
