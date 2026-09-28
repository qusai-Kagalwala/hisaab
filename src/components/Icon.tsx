import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** One icon family everywhere (Material Community Icons) for a consistent look. */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} accessible={false} />;
}

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(MaterialCommunityIcons.glyphMap, name);
}

/**
 * A category's icon. Categories store an icon name; anything else (e.g. an
 * emoji from an older backup) is shown as text so nothing ever disappears.
 */
export function CategoryIcon({ icon, size = 22, color }: { icon: string; size?: number; color: string }) {
  if (isIconName(icon)) return <Icon name={icon} size={size} color={color} />;
  return <Text style={{ fontSize: size - 2, color }}>{icon}</Text>;
}
