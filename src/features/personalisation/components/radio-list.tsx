import { ListRow } from '@/components/list-row';

const SELECTED = { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } as const;
const UNSELECTED = { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' } as const;

/** Rows inside a `Section`, one of which is chosen (the same pattern as Settings → Faith). */
export function RadioList<T>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string; description?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      {options.map((o) => (
        <ListRow
          key={String(o.value)}
          icon={o.value === value ? SELECTED : UNSELECTED}
          title={o.label}
          subtitle={o.description || undefined}
          onPress={() => onChange(o.value)}
        />
      ))}
    </>
  );
}
