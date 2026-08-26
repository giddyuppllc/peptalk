/**
 * The confirm-delete prompt, and the date it names.
 *
 * A delete confirm has one job: let the user check that the thing about to be
 * destroyed is the thing they meant. That only works if the prompt names the
 * record accurately — a prompt showing the wrong day is worse than none, since
 * it talks someone out of a deletion that was correct.
 *
 * The date parsing is the part that goes wrong quietly. `new Date('2026-03-03')`
 * is parsed as UTC midnight, which renders as 2 March for every user west of
 * Greenwich. These tests pin the local-noon parse that avoids it.
 */
import { confirmDelete, describeDate } from '../confirmDelete';
import { Alert } from '../alert';

jest.mock('../alert', () => ({ Alert: { alert: jest.fn() } }));

const alertMock = Alert.alert as unknown as jest.Mock;

describe('the prompt names what is being deleted', () => {
  beforeEach(() => alertMock.mockClear());

  it('states the subject and that it cannot be undone', () => {
    confirmDelete({ subject: 'the period starting 3 March 2026', onConfirm: () => {} });
    const [title, body] = alertMock.mock.calls[0];
    expect(title).toBe('Delete this entry?');
    expect(body).toContain('period starting 3 March 2026');
    expect(body).toContain('cannot be undone');
  });

  it('includes the consequence when one is given', () => {
    confirmDelete({
      subject: 'the scan from 1 April 2026',
      consequence: 'Your trend lines will be recalculated without it.',
      onConfirm: () => {},
    });
    expect(alertMock.mock.calls[0][1]).toContain('trend lines will be recalculated');
  });

  it('capitalises the sentence rather than starting mid-word', () => {
    confirmDelete({ subject: 'the scan from today', onConfirm: () => {} });
    expect(alertMock.mock.calls[0][1].startsWith('The scan from today')).toBe(true);
  });

  it('offers Cancel FIRST and marks the delete destructive', () => {
    // Cancel first so an accidental tap on the platform default destroys
    // nothing, and destructive styling so the dangerous button looks dangerous.
    confirmDelete({ subject: 'x', onConfirm: () => {} });
    const buttons = alertMock.mock.calls[0][2];
    expect(buttons[0].text).toBe('Cancel');
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].style).toBe('destructive');
  });

  it('does NOT delete until the destructive button is pressed', () => {
    const onConfirm = jest.fn();
    confirmDelete({ subject: 'x', onConfirm });
    expect(onConfirm).not.toHaveBeenCalled();
    alertMock.mock.calls[0][2][1].onPress();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('allows a custom confirm label', () => {
    confirmDelete({ subject: 'x', confirmLabel: 'Remove', onConfirm: () => {} });
    expect(alertMock.mock.calls[0][2][1].text).toBe('Remove');
  });
});

describe('describeDate names the right day', () => {
  it('renders a plain date without shifting it', () => {
    // The bug this guards: an ISO-midnight parse renders this as 2 March in
    // any timezone behind UTC.
    const out = describeDate('2026-03-03');
    expect(out).toContain('3');
    expect(out).toContain('2026');
    expect(out).not.toContain('2 March');
  });

  it('handles the first of the month, where an off-by-one crosses months', () => {
    const out = describeDate('2026-03-01');
    expect(out).toContain('2026');
    expect(out.toLowerCase()).toContain('march');
    expect(out.toLowerCase()).not.toContain('february');
  });

  it('handles the first of January, where an off-by-one crosses years', () => {
    const out = describeDate('2026-01-01');
    expect(out).toContain('2026');
    expect(out).not.toContain('2025');
  });

  it('falls back rather than throwing on junk', () => {
    expect(describeDate('')).toBe('this entry');
    expect(describeDate('not-a-date')).toBe('not-a-date');
  });
});
