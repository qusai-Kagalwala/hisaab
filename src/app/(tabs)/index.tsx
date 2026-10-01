import { Redirect } from 'expo-router';
import { CaptureScreen } from '../../features/capture/CaptureScreen';
import { useLedgerStore } from '../../store/ledgerStore';

export default function Index() {
  const needsOnboarding = useLedgerStore((s) => s.needsOnboarding);
  const featuresChosen = useLedgerStore((s) => s.featuresChosen);
  if (needsOnboarding) return <Redirect href="/onboarding" />;
  // People updating the app pick their features once.
  if (!featuresChosen) return <Redirect href={{ pathname: '/features', params: { first: '1' } }} />;
  return <CaptureScreen />;
}
