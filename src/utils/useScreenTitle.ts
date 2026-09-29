import { useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';

/**
 * Set the header title, only when the text changes. (`<Stack.Screen options>`
 * re-applies options on every render; doing that on a screen that is closing —
 * e.g. right after Delete refreshed the data — crashes react-native-screens on
 * Android: "ScreenStackFragment added into a non-stack container".)
 */
export function useScreenTitle(title: string): void {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);
}
