import { APP_ROUTES } from '@/config/routes.ts';

export type NavigationIconKey = 'landing' | 'analysis' | 'settings';

export interface NavigationItem {
  readonly icon: NavigationIconKey;
  readonly label: string;
  readonly path: string;
}

export const APP_NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    icon: 'landing',
    label: 'Landing',
    path: APP_ROUTES.landing
  },
  {
    icon: 'analysis',
    label: 'Analysis',
    path: APP_ROUTES.analysis
  },
  {
    icon: 'settings',
    label: 'Settings',
    path: APP_ROUTES.settings
  }
] as const;
