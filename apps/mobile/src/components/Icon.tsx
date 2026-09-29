import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { colors } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

const CATEGORY_ICONS: Record<string, IconName> = {
  food: 'fast-food-outline',
  travel: 'car-outline',
  shopping: 'bag-handle-outline',
  bills: 'receipt-outline',
  education: 'school-outline',
  health: 'medkit-outline',
  entertainment: 'film-outline',
  rent: 'home-outline',
  utilities: 'flash-outline',
  subscriptions: 'repeat-outline',
  personal: 'person-outline',
  business: 'briefcase-outline',
  other: 'pricetag-outline',
};
export const categoryIcon = (key: string): IconName => CATEGORY_ICONS[key] ?? 'pricetag-outline';
