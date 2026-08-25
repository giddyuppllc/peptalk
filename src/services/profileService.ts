/**
 * profileService — the customer's own account details, server-backed.
 *
 * WHY THIS IS SERVER-FIRST, UNLIKE MOST STATE HERE
 * Nearly everything else in this app is a zustand store that persists to the
 * device. That pattern lost data repeatedly: onboarding answers, chat history
 * and side-effect logs all vanished on reinstall because the local copy was the
 * only copy. Account details are exactly the data a customer expects to find
 * again on a new phone, so `profiles` is the source of truth and there is no
 * local mirror to drift out of sync with it.
 *
 * The row already exists for every account — handle_new_user() creates it on
 * signup — so this only ever updates.
 *
 * PII NOTE
 * phone, date_of_birth and the address fields are newly collected personal
 * data. Apple App Privacy and Google Data safety must describe them before the
 * next store submission.
 */

import { supabase } from './supabase';

import { captureException } from './telemetry';

/**
 * The generated Database types model `profiles` with several non-null columns
 * (goals, interests, is_pro …) that this service never touches, so a partial
 * update resolves to `never` and will not typecheck. useAuthStore and
 * useHealthProfileStore already work around this the same way; doing it once
 * here, rather than at each call site, keeps the untyped surface to a single
 * named binding. Every column used below is asserted against the live schema
 * by `npm run verify:synccolumns`.
 */
const db = supabase as any;

export interface PersonalDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string; // ISO yyyy-mm-dd, '' when unset
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export const EMPTY_DETAILS: PersonalDetails = {
  firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '',
  addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '', country: '',
};

/** Columns this service owns. Kept beside the mapper so the two cannot drift. */
const COLUMNS =
  'first_name,last_name,email,phone,date_of_birth,address_line1,address_line2,city,region,postal_code,country';

type Row = Record<string, string | null>;

const toDetails = (r: Row): PersonalDetails => ({
  firstName: r.first_name ?? '',
  lastName: r.last_name ?? '',
  email: r.email ?? '',
  phone: r.phone ?? '',
  dateOfBirth: r.date_of_birth ?? '',
  addressLine1: r.address_line1 ?? '',
  addressLine2: r.address_line2 ?? '',
  city: r.city ?? '',
  region: r.region ?? '',
  postalCode: r.postal_code ?? '',
  country: r.country ?? '',
});

/**
 * Empty string means "cleared", not "unchanged" — a user must be able to remove
 * a phone number or an address they no longer want stored. Writing '' as NULL
 * keeps the column semantically empty rather than storing a blank string that
 * every consumer then has to special-case.
 */
const orNull = (v: string): string | null => {
  const t = v.trim();
  return t.length > 0 ? t : null;
};

const toRow = (d: PersonalDetails): Row => ({
  first_name: orNull(d.firstName),
  last_name: orNull(d.lastName),
  phone: orNull(d.phone),
  date_of_birth: orNull(d.dateOfBirth),
  address_line1: orNull(d.addressLine1),
  address_line2: orNull(d.addressLine2),
  city: orNull(d.city),
  region: orNull(d.region),
  postal_code: orNull(d.postalCode),
  country: orNull(d.country),
  // email is deliberately absent: it is the login identity and is owned by
  // auth.users. Letting a profile edit diverge from it would mean the address
  // shown to the user is not the one they can sign in with.
});

/** ISO yyyy-mm-dd, or '' when blank. Rejects anything Postgres would refuse. */
export function isValidDateOfBirth(value: string): boolean {
  const v = value.trim();
  if (v === '') return true; // optional
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  // A birth date in the future is always a typo, and one before 1900 is too.
  const nowMs = Date.now();
  if (dt.getTime() > nowMs) return false;
  if (y < 1900) return false;
  return true;
}

/** Load the signed-in customer's details. Returns null when signed out. */
export async function fetchPersonalDetails(): Promise<PersonalDetails | null> {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data, error } = await db
      .from('profiles')
      .select(COLUMNS)
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? toDetails(data as Row) : { ...EMPTY_DETAILS, email: user.email ?? '' };
  } catch (err) {
    captureException(err, { source: 'profileService.fetch' });
    return null;
  }
}

/**
 * Save the customer's details. Returns true only on a confirmed write.
 *
 * The boolean is the point: a fire-and-forget save that silently failed would
 * show the user a success state over data that never left the device — the
 * failure mode this codebase has hit repeatedly.
 */
export async function savePersonalDetails(details: PersonalDetails): Promise<boolean> {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return false;
    const { error } = await db
      .from('profiles')
      .update(toRow(details))
      .eq('id', user.id);
    if (error) throw error;
    return true;
  } catch (err) {
    captureException(err, { source: 'profileService.save' });
    return false;
  }
}

/**
 * Record that this account passed the age gate.
 *
 * Stores the bucket the user chose and the minimum the app required at that
 * moment, so the proof survives a later change to the threshold. Never a date
 * of birth: this is the attestation made at signup, and must not be derivable
 * from a profile field the user can edit afterwards.
 */
export async function attestAge(ageRange: string, gateMinimum: number): Promise<boolean> {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return false;
    const { error } = await db
      .from('profiles')
      .update({
        age_range: ageRange,
        age_gate_min: gateMinimum,
        age_attested_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    if (error) throw error;
    return true;
  } catch (err) {
    captureException(err, { source: 'profileService.attestAge' });
    return false;
  }
}
