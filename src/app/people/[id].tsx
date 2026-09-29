import { useLocalSearchParams } from 'expo-router';
import { DebtDetailScreen } from '../../features/people/DebtDetailScreen';

export default function DebtRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DebtDetailScreen id={Number(id)} />;
}
