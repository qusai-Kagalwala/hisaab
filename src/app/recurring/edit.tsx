import { useLocalSearchParams } from 'expo-router';
import { RecurringEditScreen } from '../../features/recurring/RecurringEditScreen';

export default function RecurringEditRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <RecurringEditScreen id={id ? Number(id) : null} />;
}
