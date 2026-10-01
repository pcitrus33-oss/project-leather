/** Country page themes. Ids must match THEME_IDS in server/src/db.ts. */
export type ThemeId = 'classic' | 'airplane';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  emoji: string;
  description: string;
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'classic',
    name: 'Classic',
    emoji: '📸',
    description: 'Tilted polaroids in a tidy grid.',
  },
  {
    id: 'airplane',
    name: 'Airplane',
    emoji: '✈️',
    description: 'Your photos through airplane windows, three across. Empty windows show blue sky.',
  },
];

export const getTheme = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];
