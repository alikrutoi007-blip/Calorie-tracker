import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Image } from 'expo-image';
import { ExternalLink } from '@/components/external-link';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { N8NTheme } from '@/constants/n8n-theme';
import { SectionData } from '@/data/explore-content';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FeatureCardProps {
  item: SectionData;
}

export const FeatureCard = ({ item }: FeatureCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsOpen(!isOpen);
  };

  return (
    <View style={[styles.card, isOpen && styles.cardActive]}>
      <TouchableOpacity 
        onPress={toggleOpen} 
        activeOpacity={0.7} 
        style={styles.header}
      >
        <Text style={[styles.title, isOpen && styles.titleActive]}>
          {item.title}
        </Text>
        <IconSymbol
          name="chevron.right"
          size={16}
          color={isOpen ? N8NTheme.colors.primary : N8NTheme.colors.textDim}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.content}>
          <Text style={styles.description}>{item.description}</Text>
          
          {/* Handle Special Content (Logic Splitting) */}
          {item.extraContent === 'images' && (
            <Image
              source={require('@/assets/images/react-logo.png')}
              style={styles.image}
              contentFit="contain"
            />
          )}

          {item.link && (
            <View style={styles.linkContainer}>
              <ExternalLink href={item.link}>
                <Text style={styles.linkText}>
                  {item.linkText || 'Learn more'} →
                </Text>
              </ExternalLink>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: N8NTheme.colors.surface,
    borderRadius: N8NTheme.borderRadius.md,
    marginBottom: N8NTheme.spacing.md,
    borderWidth: 1,
    borderColor: N8NTheme.colors.border,
    overflow: 'hidden',
    ...N8NTheme.shadows.card,
  },
  cardActive: {
    borderColor: N8NTheme.colors.surfaceHighlight, // Subtle highlight when open
    backgroundColor: N8NTheme.colors.surfaceHighlight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: N8NTheme.spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: N8NTheme.colors.text,
    fontFamily: N8NTheme.typography.fontFamily,
  },
  titleActive: {
    color: N8NTheme.colors.primary,
  },
  content: {
    paddingHorizontal: N8NTheme.spacing.md,
    paddingBottom: N8NTheme.spacing.md,
  },
  description: {
    fontSize: 14,
    color: N8NTheme.colors.textDim,
    lineHeight: 22,
    marginBottom: N8NTheme.spacing.sm,
    fontFamily: N8NTheme.typography.fontFamily,
  },
  image: {
    width: 80,
    height: 80,
    marginBottom: N8NTheme.spacing.sm,
  },
  linkContainer: {
    marginTop: N8NTheme.spacing.xs,
    alignSelf: 'flex-start',
  },
  linkText: {
    color: N8NTheme.colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
});