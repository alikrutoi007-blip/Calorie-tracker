import { Platform } from 'react-native';

export type SectionData = {
  id: string;
  title: string;
  description: string;
  link?: string;
  linkText?: string;
  image?: any;
  extraContent?: 'platform-specific' | 'images' | null;
};

export const EXPLORE_SECTIONS: SectionData[] = [
  {
    id: 'routing',
    title: 'File-based Routing',
    description: 'This app uses modern file-based routing. The layout structure determines how screens are nested and presented.',
    link: 'https://docs.expo.dev/router/introduction',
    linkText: 'Read Docs',
  },
  {
    id: 'platforms',
    title: 'Cross-Platform',
    description: 'Write once, run everywhere. Open on Android, iOS, and Web seamlessly.',
    extraContent: 'platform-specific',
  },
  {
    id: 'assets',
    title: 'Smart Assets',
    description: 'Optimized asset serving with density awareness (@2x, @3x).',
    extraContent: 'images',
    link: 'https://reactnative.dev/docs/images',
    linkText: 'Asset Guide',
  },
  {
    id: 'theming',
    title: 'Adaptive Theming',
    description: 'Built-in support for Light and Dark modes using the useColorScheme() hook.',
    link: 'https://docs.expo.dev/develop/user-interface/color-themes/',
    linkText: 'Theme Guide',
  },
  {
    id: 'animations',
    title: 'Fluid Animations',
    description: 'Powered by Reanimated for 60fps gesture-driven interactions.',
  },
];