import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { N8NTheme } from '@/constants/n8n-theme';

export const HeroHeader = () => {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <IconSymbol
          size={80}
          color={N8NTheme.colors.primary}
          name="paperplane.fill" // Changed to a more dynamic icon if avail, else fallback
          style={styles.icon}
        />
        {/* simulated glow behind icon */}
        <View style={styles.glow} />
      </View>
      
      <Text style={styles.title}>
        Explore <Text style={styles.highlight}>Flows</Text>
      </Text>
      <Text style={styles.subtitle}>
        Automate your React Native development journey with these building blocks.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: N8NTheme.spacing.lg,
    paddingTop: 80, // Space for status bar
    paddingBottom: N8NTheme.spacing.xl,
    backgroundColor: N8NTheme.colors.background,
    alignItems: 'center',
  },
  iconContainer: {
    position: 'relative',
    marginBottom: N8NTheme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    zIndex: 2,
  },
  glow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: N8NTheme.colors.primary,
    opacity: 0.2,
    transform: [{ scale: 1.5 }],
  },
  title: {
    fontSize: N8NTheme.typography.headerSize,
    fontFamily: N8NTheme.typography.fontFamily,
    fontWeight: '800', // Extra bold
    color: N8NTheme.colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  highlight: {
    color: N8NTheme.colors.primary,
  },
  subtitle: {
    marginTop: N8NTheme.spacing.sm,
    fontSize: N8NTheme.typography.bodySize,
    fontFamily: N8NTheme.typography.fontFamily,
    color: N8NTheme.colors.textDim,
    textAlign: 'center',
    maxWidth: '80%',
    lineHeight: 22,
  },
});