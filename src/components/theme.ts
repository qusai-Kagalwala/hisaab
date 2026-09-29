import { useColorScheme } from 'react-native';
import { useThemeStore } from '../store/themeStore';

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
  /** Chart series — validated for colour-blind separation on these surfaces. */
  series1: string;
  series2: string;
  grid: string;
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
  series1: '#2a78d6',
  series2: '#eb6834',
  grid: '#E9E9E4',
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
  series1: '#3987e5',
  series2: '#d95926',
  grid: '#2C2C29',
};

export function useIsDark(): boolean {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();
  return mode === 'system' ? system === 'dark' : mode === 'dark';
}

export function usePalette(): Palette {
  return useIsDark() ? dark : light;
}

export const MIN_TAP = 48;
