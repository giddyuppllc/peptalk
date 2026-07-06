import { Stack } from 'expo-router';
import { PeptideDisclaimerModal } from '../../src/components/PeptideDisclaimerModal';

/**
 * Every dosing surface — the calculator, the peptide library/table, the tracker,
 * stack builder, and side-effects — lives under /doses. Rendering the blocking
 * "Research & Education Only / not medical advice / consult a licensed provider"
 * disclaimer here gates ALL of them on first entry (App Review 1.4.1), instead of
 * only the my-stacks tab. Acceptance is a single persisted flag
 * (useOnboardingStore.acceptedPeptideDisclaimer), so a user who already accepted
 * it elsewhere never sees it twice.
 */
export default function DosesLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <PeptideDisclaimerModal />
    </>
  );
}
