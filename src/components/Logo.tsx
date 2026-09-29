import { Image } from 'react-native';

/** The app logo: a green khata (account book) with ₹. */
export function Logo({ size = 72 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/logo.png')}
      style={{ width: size, height: size }}
      accessibilityIgnoresInvertColors
      accessible={false}
    />
  );
}
