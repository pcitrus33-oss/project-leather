/** Country page themes. Ids must match THEME_IDS in server/src/db.ts. */
export type ThemeId = 'classic';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Photos at their own shape in clean, even rows. Click one for a closer look and its story.',
  },
];

export const getTheme = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];
