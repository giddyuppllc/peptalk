import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CATEGORIES, CategoryInfo } from '../constants/categories';

const CategoryCard: React.FC<{ category: CategoryInfo; onPress: () => void }> = ({
  category,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: `${category.color}30` }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: `${category.color}20` },
        ]}
      >
        <Ionicons
          name={category.icon as keyof typeof Ionicons.glyphMap}
          size={28}
          color={category.color}
        />
      </View>
      <Text style={styles.categoryName} numberOfLines={2}>
        {category.name}
      </Text>
    </TouchableOpacity>
  );
};

export const CategoryGrid: React.FC = () => {
  const router = useRouter();

  const handleCategoryPress = (categoryName: string) => {
    router.push(`/?category=${encodeURIComponent(categoryName)}`);
  };

  const renderItem = ({ item }: { item: CategoryInfo }) => (
    <CategoryCard
      category={item}
      onPress={() => handleCategoryPress(item.name)}
    />
  );

  return (
    <FlatList
      data={CATEGORIES}
      renderItem={renderItem}
      keyExtractor={(item) => item.name}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.grid}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
};

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: 0,
  },
  row: {
    justifyContent: 'space-between',
  },
  separator: {
    height: 12,
  },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D2D2D',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default CategoryGrid;
