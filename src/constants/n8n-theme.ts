import { Platform } from 'react-native';

export const N8NTheme = {
  colors: {
    background: '#0B0D0E', // Deep n8n dark
    surface: '#16191D',     // Card background
    surfaceHighlight: '#1F2329',
    primary: '#FF6D5A',     // n8n orange/red accent
    secondary: '#865CFF',   // Purple accent
    text: '#FFFFFF',
    textDim: '#9EA4B0',
    border: '#2C3038',
    success: '#20A47E',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  typography: {
    fontFamily: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }),
    headerSize: 32,
    subheaderSize: 20,
    bodySize: 15,
  },
  shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    glow: {
      shadowColor: '#FF6D5A',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 10,
    }
  }
};