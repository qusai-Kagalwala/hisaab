import { Redirect } from 'expo-router';
import { CaptureScreen } from '../../features/capture/CaptureScreen';
import { useLedgerStore } from '../../store/ledgerStore';

export default function Index() {
  const needsOnboarding = useLedgerStore((s) => s.needsOnboarding);
  if (needsOnboarding) return <Redirect href="/onboarding" />;
  return <CaptureScreen />;
}
