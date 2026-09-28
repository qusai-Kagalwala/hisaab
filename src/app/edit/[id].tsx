import { useLocalSearchParams } from 'expo-router';
import { EditTransactionScreen } from '../../features/history/EditTransactionScreen';

export default function EditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditTransactionScreen id={Number(id)} />;
}
