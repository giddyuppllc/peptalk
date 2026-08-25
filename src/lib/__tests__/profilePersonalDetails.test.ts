/**
 * Personal details: validation, and the columns must be real.
 *
 * Two failure modes this pins:
 *
 *  1. PostgREST rejects the WHOLE row when one key is not a column, silently.
 *     That has happened twice in this repo (dose_logs `dose_mcg`, check_ins
 *     `respiratory_rate`), and both times the data simply stayed local with no
 *     error anywhere. The mapper's key set is therefore checked against the
 *     live schema snapshot.
 *  2. A malformed date reaches Postgres and the whole save fails, taking the
 *     address and phone with it — so the date is validated before the write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isValidDateOfBirth } from '../../services/profileService';

const ROOT = path.join(__dirname, '..', '..', '..');
const schema = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts', 'sync-columns.json'), 'utf8'),
) as Record<string, string[]>;

describe('isValidDateOfBirth', () => {
  it('accepts a real date', () => {
    expect(isValidDateOfBirth('1990-04-17')).toBe(true);
  });

  it('accepts blank, because the field is optional', () => {
    expect(isValidDateOfBirth('')).toBe(true);
    expect(isValidDateOfBirth('   ')).toBe(true);
  });

  it('rejects a date that does not exist', () => {
    // The classic: Date() rolls 31 Feb forward to March instead of failing.
    expect(isValidDateOfBirth('2001-02-31')).toBe(false);
    expect(isValidDateOfBirth('2001-13-01')).toBe(false);
  });

  it('rejects the wrong shape', () => {
    for (const v of ['17/04/1990', '1990-4-7', 'April 1990', '19900417']) {
      expect(isValidDateOfBirth(v)).toBe(false);
    }
  });

  it('rejects a birth date in the future', () => {
    const next = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(isValidDateOfBirth(next)).toBe(false);
  });

  it('rejects an implausible year', () => {
    expect(isValidDateOfBirth('1492-01-01')).toBe(false);
  });
});

describe('every column the service writes exists on profiles', () => {
  const cols = new Set(schema.profiles ?? []);

  it('has the schema snapshot loaded', () => {
    // Guards against passing vacuously if the snapshot moves or empties.
    expect(cols.size).toBeGreaterThan(10);
    expect(cols.has('id')).toBe(true);
  });

  it.each([
    'first_name', 'last_name', 'phone', 'date_of_birth',
    'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country',
  ])('profiles.%s exists', (col) => {
    expect(cols.has(col)).toBe(true);
  });

  it.each(['age_range', 'age_attested_at', 'age_gate_min'])(
    'age-gate proof column profiles.%s exists',
    (col) => {
      expect(cols.has(col)).toBe(true);
    },
  );
});

describe('the age gate and the proof it records cannot drift', () => {
  const onboarding = fs.readFileSync(path.join(ROOT, 'app', 'onboarding.tsx'), 'utf8');

  it('gates on a named constant rather than a literal', () => {
    expect(onboarding).toMatch(/selectedAge >= MIN_AGE/);
    expect(onboarding).toMatch(/const MIN_AGE = 18;/);
  });

  it('records the same constant it enforced', () => {
    // Passing a literal here would let the gate change while the stored proof
    // kept claiming the old threshold.
    expect(onboarding).toMatch(/attestAge\(ageToRange\(selectedAge\), MIN_AGE\)/);
  });
});
