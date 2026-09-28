import { router, type Href } from 'expo-router';

/** Go back, or to `fallback` when there is nothing to go back to (e.g. opened via a link). */
export function goBack(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
