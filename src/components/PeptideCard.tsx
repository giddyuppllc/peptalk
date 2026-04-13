import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Peptide, PeptideCategory } from '../types';
import { getCategoryColor } from '../constants/categories';

/** Map peptide categories to subtle background Unsplash images */
function getCategoryImageUrl(categories: PeptideCategory[]): string {
  const weightCategories: PeptideCategory[] = ['Metabolic'];
  const muscleCategories: PeptideCategory[] = ['Growth Hormone'];
  const recoveryCategories: PeptideCategory[] = ['Recovery', 'Anti-inflammatory'];
  const agingCategories: PeptideCategory[] = ['Longevity', 'Cosmetic', 'Tanning'];
  const cognitiveCategories: PeptideCategory[] = ['Nootropic', 'Neuropeptide', 'Sleep'];

  if (categories.some((c) => weightCategories.includes(c))) {
    return 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&q=80';
  }
  if (categories.some((c) => muscleCategories.includes(c))) {
    return 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400&q=80';
  }
  if (categories.some((c) => recoveryCategories.includes(c))) {
    return 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&q=80';
  }
  if (categories.some((c) => agingCategories.includes(c))) {
    return 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=400&q=80';
  }
  if (categories.some((c) => cognitiveCategories.includes(c))) {
    return 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&q=80';
  }
  return 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=400&q=80';
}

interface PeptideCardProps {
  peptide: Peptide;
}

export const PeptideCard: React.FC<PeptideCardProps> = ({ peptide }) => {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/peptide/${peptide.id}`);
  };

  const truncatedSummary =
    peptide.researchSummary && peptide.researchSummary.length > 120
      ? `${peptide.researchSummary.substring(0, 120)}...`
      : peptide.researchSummary;

  const bgImageUrl = getCategoryImageUrl(peptide.categories ?? []);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <ImageBackground
        source={{ uri: bgImageUrl }}
        style={styles.bgImage}
        imageStyle={styles.bgImageInner}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {peptide.name}
              </Text>
              {peptide.abbreviation ? (
                <Text style={styles.abbreviation}>{peptide.abbreviation}</Text>
              ) : null}
            </View>
          </View>

          {peptide.categories && peptide.categories.length > 0 ? (
            <View style={styles.tagsRow}>
              {peptide.categories.map((category) => {
                const color = getCategoryColor(category);
                return (
                  <View
                    key={category}
                    style={[
                      styles.tag,
                      { backgroundColor: `${color}20`, borderColor: `${color}40` },
                    ]}
                  >
                    <Text style={[styles.tagText, { color }]}>{category}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {truncatedSummary ? (
            <Text style={styles.summary} numberOfLines={3}>
              {truncatedSummary}
            </Text>
          ) : null}
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  bgImage: {
    width: '100%',
  },
  bgImageInner: {
    opacity: 0.15,
    borderRadius: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 32, 0.82)',
    borderRadius: 16,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D2D2D',
    flex: 1,
    marginRight: 8,
  },
  abbreviation: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e3a7a1',
    backgroundColor: 'rgba(227, 167, 161, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  summary: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },
});

export default PeptideCard;
