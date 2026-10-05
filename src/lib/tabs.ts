import type { AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

export type TabName = 'today' | 'alarms' | 'circles' | 'progress' | 'settings';

export type TabDefinition = {
  name: TabName;
  title: string;
  /** iOS SF Symbol, with a filled variant for the selected state. */
  sf: { default: SFSymbol; selected: SFSymbol };
  /** Android / web Material Symbol. */
  md: AndroidSymbol;
};

/** The app's main sections, in tab-bar order. Shared by native and web tabs. */
export const tabs: TabDefinition[] = [
  { name: 'today', title: 'Today', sf: { default: 'sun.horizon', selected: 'sun.horizon.fill' }, md: 'wb_twilight' },
  { name: 'alarms', title: 'Alarms', sf: { default: 'alarm', selected: 'alarm.fill' }, md: 'alarm' },
  { name: 'circles', title: 'Circles', sf: { default: 'person.3', selected: 'person.3.fill' }, md: 'groups' },
  { name: 'progress', title: 'Progress', sf: { default: 'chart.bar', selected: 'chart.bar.fill' }, md: 'bar_chart' },
  { name: 'settings', title: 'Settings', sf: { default: 'gearshape', selected: 'gearshape.fill' }, md: 'settings' },
];
