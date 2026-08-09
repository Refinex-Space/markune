import type {
  TreeIconPickerSettings,
  TreeIconPickerTab,
  TreeNodeIcon,
} from './workspace-types';

const MAX_RECENT_TREE_ICONS = 20;

export function recordRecentTreeIcon(
  settings: TreeIconPickerSettings,
  icon: TreeNodeIcon,
  lastTab: TreeIconPickerTab,
): TreeIconPickerSettings {
  return {
    lastTab,
    recentIcons: [
      icon,
      ...settings.recentIcons.filter(
        (candidate) => treeNodeIconKey(candidate) !== treeNodeIconKey(icon),
      ),
    ].slice(0, MAX_RECENT_TREE_ICONS),
  };
}

export function treeNodeIconKey(icon: TreeNodeIcon) {
  switch (icon.type) {
    case 'builtin':
      return `builtin:${icon.name}`;
    case 'emoji':
      return `emoji:${icon.value}`;
    case 'local':
      return `local:${icon.assetId}`;
  }
}
