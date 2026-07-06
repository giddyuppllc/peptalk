import { Stack } from 'expo-router';
import { PeptideDisclaimerModal } from '../../src/components/PeptideDisclaimerModal';

/**
 * The /calculators routes (quick-dose, reconstitution, plan) are dosing tools, so
 * they get the same global research/medical disclaimer gate as /doses (App Review
 * 1.4.1). Acceptance is shared via useOnboardingStore.acceptedPeptideDisclaimer, so
 * the modal shows at most once across all dosing surfaces.
 */
export default function CalculatorsLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <PeptideDisclaimerModal />
    </>
  );
}
