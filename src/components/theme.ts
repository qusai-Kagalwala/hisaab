import { useColorScheme } from 'react-native';

export interface Palette {
  background: string;
  surface: string;
  surfacePressed: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  positive: string;
  toast: string;
  toastText: string;
}

// Calm palette on purpose: no red "shame" states anywhere.
const light: Palette = {
  background: '#F7F7F4',
  surface: '#FFFFFF',
  surfacePressed: '#ECECE6',
  text: '#1B1B1A',
  textMuted: '#6B6B66',
  border: '#E2E2DC',
  accent: '#1F7A5C',
  accentText: '#FFFFFF',
  accentSoft: '#DDF0E8',
  positive: '#1F7A5C',
  toast: '#1B1B1A',
  toastText: '#FFFFFF',
};

const dark: Palette = {
  background: '#121212',
  surface: '#1E1E1C',
  surfacePressed: '#2A2A27',
  text: '#F2F2EE',
  textMuted: '#A3A39C',
  border: '#2F2F2B',
  accent: '#4CC79B',
  accentText: '#0E2A20',
  accentSoft: '#1D3A2F',
  positive: '#4CC79B',
  toast: '#F2F2EE',
  toastText: '#121212',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const MIN_TAP = 48;
