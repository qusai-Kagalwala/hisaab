import { useLocalSearchParams } from 'expo-router';
import { AboutScreen } from '../features/about/AboutScreen';

export default function AboutRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  return <AboutScreen initial={section} />;
}
