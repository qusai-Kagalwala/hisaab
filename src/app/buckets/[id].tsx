import { useLocalSearchParams } from 'expo-router';
import { BucketDetailScreen } from '../../features/buckets/BucketDetailScreen';

export default function BucketRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BucketDetailScreen id={Number(id)} />;
}
