// Canvas colours. The page's own colours live in src/style.css (same names).
// ✎ Change a hex value here to recolour the pieces.
import type { PieceType } from './engine';

export interface Palette {
  pieces: Record<PieceType, string>;
  boardBg: string;
  grid: string;
  ghost: string;
  particles: string[];
  glow: number;
}

const dark: Palette = {
  pieces: {
    I: '#8fd3e8', // soft sky blue
    O: '#f6d98a', // warm cream gold
    T: '#c59df0', // lavender
    S: '#9fe0b5', // mint
    Z: '#f59aa8', // rose
    J: '#8ea3f0', // periwinkle
    L: '#f6b48a', // peach
  },
  boardBg: 'rgba(12, 9, 24, 0.72)',
  grid: 'rgba(200, 180, 255, 0.07)',
  ghost: 'rgba(255, 235, 245, 0.55)',
  particles: ['#f4a6c8', '#c59df0', '#f6d98a', '#8fd3e8', '#ffffff'],
  glow: 14,
};

const indigo: Palette = {
  pieces: {
    I: '#7fd0ee', // ice blue
    O: '#f2d68f', // soft gold
    T: '#b39bf5', // violet
    S: '#8fdcc0', // sea mint
    Z: '#f39bb5', // rose
    J: '#7f95f5', // periwinkle
    L: '#f5ae8c', // peach
  },
  boardBg: 'rgba(6, 8, 26, 0.78)',
  grid: 'rgba(150, 165, 255, 0.09)',
  ghost: 'rgba(210, 220, 255, 0.55)',
  particles: ['#f2a7d0', '#a5b4ff', '#f2d68f', '#7fd0ee', '#ffffff'],
  glow: 14,
};

const light: Palette = {
  pieces: {
    I: '#4fb3d1',
    O: '#e8b84a',
    T: '#9a6fd8',
    S: '#5cbf83',
    Z: '#e2647a',
    J: '#5f78d6',
    L: '#e88f55',
  },
  boardBg: 'rgba(255, 250, 245, 0.85)',
  grid: 'rgba(90, 60, 140, 0.10)',
  ghost: 'rgba(90, 60, 140, 0.55)',
  particles: ['#e2647a', '#9a6fd8', '#e8b84a', '#4fb3d1', '#5cbf83'],
  glow: 6,
};

const contrast: Palette = {
  pieces: {
    I: '#00e5ff',
    O: '#ffee00',
    T: '#d580ff',
    S: '#00ff88',
    Z: '#ff4d6d',
    J: '#5b8cff',
    L: '#ff9a2e',
  },
  boardBg: '#000000',
  grid: 'rgba(255, 255, 255, 0.22)',
  ghost: '#ffffff',
  particles: ['#ffffff', '#ffee00', '#00e5ff'],
  glow: 0,
};

export type ThemeName = 'dark' | 'indigo' | 'light';

export function paletteFor(theme: ThemeName, highContrast: boolean): Palette {
  if (highContrast) return contrast;
  if (theme === 'light') return light;
  return theme === 'indigo' ? indigo : dark;
}
