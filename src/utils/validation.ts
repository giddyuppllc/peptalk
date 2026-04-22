/**
 * Shared input validation helpers for auth / onboarding.
 *
 * The regex here is intentionally the "common case" — it catches typos
 * (missing @, spaces, no domain) while accepting the addresses real users
 * actually have (including `+` tags, subdomains, dotted locals). Don't
 * tighten it past this; we can always rely on Supabase Auth as the
 * ground-truth validator.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/** Minimum length + at least one letter AND one number. */
export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordValidation {
  valid: boolean;
  /** User-facing message when invalid (empty when valid). */
  message: string;
  /** Coarse strength bucket for the UI meter. */
  strength: 'weak' | 'fair' | 'strong';
}

export function validatePassword(password: string): PasswordValidation {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      strength: 'weak',
    };
  }
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (!hasLetter || !hasNumber) {
    return {
      valid: false,
      message: 'Password needs at least one letter and one number.',
      strength: 'weak',
    };
  }
  // Strength heuristic for the meter — not a validation gate.
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const long = password.length >= 12;
  const strength: PasswordValidation['strength'] =
    long && hasSymbol ? 'strong' : long || hasSymbol ? 'fair' : 'fair';
  return { valid: true, message: '', strength };
}
