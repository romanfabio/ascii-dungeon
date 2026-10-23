export interface Theme {
  background: string;
  hudText: string;
  hudDim: string;
  wall: string;
  wallRemembered: string;
  floor: string;
  floorRemembered: string;
  exit: string;
  exitRemembered: string;
  player: string;
  /** Enemies, in sight and remembered (a Bloodstone stays drawn once seen). */
  enemy: string;
  enemyRemembered: string;
  /** Moving enemies (they hide out of sight, so they get a brighter colour). */
  enemyMobile: string;
  /** A chaser that is hunting the player. */
  enemyHunting: string;
  /** Tiles that will hurt soon (a telegraph), drawn under the hurting cells. */
  enemyWarn: string;
  /** The Shade, an enemy whose touch blinds instead of hurting. */
  shade: string;
  /** Draw each enemy with its alternative glyph, so colour alone does not carry the meaning. */
  enemyAltGlyph?: boolean;
  /** The life pickup (`+`), in sight and remembered once seen. */
  pickup: string;
  pickupRemembered: string;
  /** A full heart in the lives row. */
  heart: string;
  /** A lost life (`</3`). */
  heartLost: string;
  /** Colour of the flash when a life is lost (drawn translucent). */
  hurt: string;
}

export type ThemeId = 'default' | 'high-contrast' | 'colorblind';

export const THEME_IDS: readonly ThemeId[] = ['default', 'high-contrast', 'colorblind'];

export const DEFAULT_THEME: Theme = {
  background: '#0d0f12',
  hudText: '#c9ced6',
  hudDim: '#6b7280',
  wall: '#8a8f98',
  wallRemembered: '#3c4048',
  floor: '#3a3f47',
  floorRemembered: '#22252b',
  exit: '#5dff8a',
  exitRemembered: '#2b7a44',
  player: '#ffd34d',
  enemy: '#a32020',
  enemyRemembered: '#4d1414',
  enemyMobile: '#e0453a',
  enemyHunting: '#ff6a3d',
  enemyWarn: '#7a4a1c',
  shade: '#9b6bd6',
  pickup: '#3ddc5f',
  pickupRemembered: '#1d5a2c',
  heart: '#ff4d5e',
  heartLost: '#4a3236',
  hurt: '#ff1f1f',
};

const HIGH_CONTRAST_THEME: Theme = {
  background: '#000000',
  hudText: '#ffffff',
  hudDim: '#b0b0b0',
  wall: '#ffffff',
  wallRemembered: '#808080',
  floor: '#9a9a9a',
  floorRemembered: '#4d4d4d',
  exit: '#00ff00',
  exitRemembered: '#008000',
  player: '#ffff00',
  enemy: '#ff2020',
  enemyRemembered: '#802020',
  enemyMobile: '#ff6a5a',
  enemyHunting: '#ffaa00',
  enemyWarn: '#996600',
  shade: '#c080ff',
  pickup: '#40ff40',
  pickupRemembered: '#207a20',
  heart: '#ff3030',
  heartLost: '#606060',
  hurt: '#ff0000',
};

/**
 * Avoids telling red from green: the exit is cyan, the player orange and the life pickup sky blue
 * (Okabe-Ito inspired).
 */
const COLORBLIND_THEME: Theme = {
  background: '#0d0f12',
  hudText: '#c9ced6',
  hudDim: '#6b7280',
  wall: '#9aa5b1',
  wallRemembered: '#404852',
  floor: '#4a5560',
  floorRemembered: '#262c33',
  exit: '#00d8ff',
  exitRemembered: '#0a6b80',
  player: '#ff9f1c',
  enemy: '#d55e00',
  enemyRemembered: '#5c2900',
  enemyMobile: '#ff8a2a',
  enemyHunting: '#ffd400',
  enemyWarn: '#7d6a00',
  shade: '#b07cc6',
  enemyAltGlyph: true,
  pickup: '#56b4e9',
  pickupRemembered: '#1f4d6b',
  heart: '#cc79a7',
  heartLost: '#46343f',
  hurt: '#cc79a7',
};

export const THEMES: Readonly<Record<ThemeId, Theme>> = {
  default: DEFAULT_THEME,
  'high-contrast': HIGH_CONTRAST_THEME,
  colorblind: COLORBLIND_THEME,
};
