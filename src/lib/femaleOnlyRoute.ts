/**
 * The access decision for female-only surfaces (menstrual-cycle tracking).
 *
 * Deliberately kept in its own dependency-free module rather than living
 * beside the HOC in src/components/withFemaleOnly.tsx. Importing that
 * component pulls in useOnboardingStore -> secureStorage -> AsyncStorage,
 * which needs a native module jest has no mock for, so the guard's logic would
 * have been untestable purely because of what its neighbour imports.
 *
 * Deny-by-default: anything that is not exactly 'Female' is refused. A loose
 * check (truthy, case-insensitive, startsWith) would let an unset profile or a
 * differently-cased value through, and the failure would be silent — a male
 * profile landing on a period tracker.
 */
export function isFemaleOnlyRouteAllowed(gender: unknown): boolean {
  return gender === 'Female';
}
