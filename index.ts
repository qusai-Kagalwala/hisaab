// App entry: register the Android widget task (only when its native module
// exists), then start Expo Router.
import { registerWidget } from './src/widget/register';
import 'expo-router/entry';

registerWidget();
