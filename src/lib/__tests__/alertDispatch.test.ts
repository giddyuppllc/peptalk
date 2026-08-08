/**
 * alertDispatch tests.
 *
 * The bug being guarded against is not "no dialog appeared" — it is "the button
 * callback never ran", which turned PWA signup into a dead end. So almost every
 * assertion here is about WHICH onPress fired, not about the text shown.
 */
import { composeBody, dispatchAlert, type AlertIO } from '../alertDispatch';

function makeIO(confirmResults: boolean[] = []): AlertIO & {
  notified: string[];
  confirmed: string[];
} {
  const notified: string[] = [];
  const confirmed: string[] = [];
  let i = 0;
  return {
    notified,
    confirmed,
    notify: (t) => { notified.push(t); },
    confirm: (t) => { confirmed.push(t); return confirmResults[i++] ?? false; },
  };
}

describe('composeBody', () => {
  it('stacks title and message like a native alert', () => {
    expect(composeBody('Title', 'Body')).toBe('Title\n\nBody');
  });

  it('omits missing parts rather than rendering blanks or "undefined"', () => {
    expect(composeBody('Title', undefined)).toBe('Title');
    expect(composeBody(undefined, 'Body')).toBe('Body');
    expect(composeBody(undefined, undefined)).toBe('');
    expect(composeBody('Title', '')).toBe('Title');
  });
});

describe('dispatchAlert — informational', () => {
  it('shows a plain alert when there are no buttons', () => {
    const io = makeIO();
    dispatchAlert('Saved', 'All good', undefined, io);
    expect(io.notified).toEqual(['Saved\n\nAll good']);
    expect(io.confirmed).toEqual([]);
  });

  it('treats an empty buttons array as informational', () => {
    const io = makeIO();
    dispatchAlert('Saved', undefined, [], io);
    expect(io.notified).toEqual(['Saved']);
  });
});

describe('dispatchAlert — single action (the signup dead-end case)', () => {
  it('RUNS the callback for a lone OK button', () => {
    // app/onboarding.tsx: [{ text: 'OK', onPress: () => router.replace('/auth') }]
    // On react-native-web this callback never fired and signup dead-ended.
    const onPress = jest.fn();
    const io = makeIO();
    dispatchAlert('Check your email', 'We sent a link.', [{ text: 'OK', onPress }], io);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not invent a Cancel the caller never offered', () => {
    // Using confirm() for a single-button alert would let a dismissed dialog
    // swallow the navigation — the exact failure we are fixing.
    const onPress = jest.fn();
    const io = makeIO([false]);
    dispatchAlert('Done', undefined, [{ text: 'OK', onPress }], io);
    expect(io.confirmed).toEqual([]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('tolerates a button with no onPress', () => {
    const io = makeIO();
    expect(() => dispatchAlert('Hi', undefined, [{ text: 'OK' }], io)).not.toThrow();
  });
});

describe('dispatchAlert — confirm (one action + cancel)', () => {
  it('runs the action when accepted', () => {
    const act = jest.fn();
    const cancel = jest.fn();
    const io = makeIO([true]);
    dispatchAlert('Delete?', 'This cannot be undone', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Delete', style: 'destructive', onPress: act },
    ], io);
    expect(act).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('runs the cancel button when dismissed — destructive action must NOT fire', () => {
    const act = jest.fn();
    const cancel = jest.fn();
    const io = makeIO([false]);
    dispatchAlert('Delete?', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Delete', style: 'destructive', onPress: act },
    ], io);
    expect(act).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('identifies the cancel button by style, not by position', () => {
    // Several call sites list the destructive action FIRST.
    const act = jest.fn();
    const cancel = jest.fn();
    const io = makeIO([true]);
    dispatchAlert('Remove?', undefined, [
      { text: 'Remove', style: 'destructive', onPress: act },
      { text: 'Keep', style: 'cancel', onPress: cancel },
    ], io);
    expect(act).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('dispatchAlert — multi-action action sheets', () => {
  const sheet = (a: jest.Mock, b: jest.Mock, c: jest.Mock) => [
    { text: 'Take Photo', onPress: a },
    { text: 'Choose from Library', onPress: b },
    { text: 'Cancel', style: 'cancel' as const, onPress: c },
  ];

  it('runs the first accepted option and asks no further questions', () => {
    const a = jest.fn(), b = jest.fn(), c = jest.fn();
    const io = makeIO([true]);
    dispatchAlert('Profile Photo', 'Choose a photo', sheet(a, b, c), io);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(c).not.toHaveBeenCalled();
    expect(io.confirmed).toHaveLength(1);
  });

  it('reaches the SECOND option when the first is declined', () => {
    // The point of the sequential mapping: every option stays reachable.
    const a = jest.fn(), b = jest.fn(), c = jest.fn();
    const io = makeIO([false, true]);
    dispatchAlert('Profile Photo', undefined, sheet(a, b, c), io);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
  });

  it('falls back to cancel when every option is declined', () => {
    const a = jest.fn(), b = jest.fn(), c = jest.fn();
    const io = makeIO([false, false]);
    dispatchAlert('Profile Photo', undefined, sheet(a, b, c), io);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('names each option so consecutive prompts are distinguishable', () => {
    const a = jest.fn(), b = jest.fn(), c = jest.fn();
    const io = makeIO([false, false]);
    dispatchAlert('Profile Photo', undefined, sheet(a, b, c), io);
    expect(io.confirmed[0]).toContain('Take Photo');
    expect(io.confirmed[1]).toContain('Choose from Library');
  });

  it('still terminates when there is no cancel button at all', () => {
    const a = jest.fn(), b = jest.fn();
    const io = makeIO([false, false]);
    expect(() => dispatchAlert('Pick', undefined, [
      { text: 'A', onPress: a }, { text: 'B', onPress: b },
    ], io)).not.toThrow();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
