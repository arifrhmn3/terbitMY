import { Link, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ListRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  icon: SymbolViewProps['name'];
  /** When set, the row navigates to this route and shows a chevron. */
  href?: Href;
  /** When set (and no `href`), the row is a button. */
  onPress?: () => void;
};

/** A single row inside a `Section`. */
export function ListRow({ title, subtitle, value, icon, href, onPress }: ListRowProps) {
  const theme = useTheme();

  const content = (
    <View style={styles.row}>
      <SymbolView name={icon} size={22} tintColor={theme.tint} style={styles.icon} />
      <View style={styles.text}>
        <ThemedText>{title}</ThemedText>
        {subtitle && (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        )}
      </View>
      {value && (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      )}
      {href && (
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          tintColor={theme.textSecondary}
        />
      )}
    </View>
  );

  const pressedStyle = ({ pressed }: { pressed: boolean }) => pressed && { backgroundColor: theme.backgroundSelected };

  if (!href) {
    if (!onPress) return content;
    return (
      <Pressable accessibilityRole="button" accessibilityHint={subtitle} onPress={onPress} style={pressedStyle}>
        {content}
      </Pressable>
    );
  }

  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="button" accessibilityHint={subtitle} style={pressedStyle}>
        {content}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
    minHeight: 44,
  },
  icon: {
    width: 28,
    height: 28,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
