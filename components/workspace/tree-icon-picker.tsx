'use client';

import * as React from 'react';
import {
  Apple,
  Badge,
  BriefcaseBusiness,
  Check,
  CircleCheck,
  Clock3,
  Code2,
  Flag,
  Folder,
  Gamepad2,
  Grid3X3,
  Leaf,
  Lightbulb,
  LoaderCircle,
  MonitorSmartphone,
  Plane,
  Play,
  Search,
  Shuffle,
  Smile,
  Type,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import {
  TREE_EMOJI_CATEGORIES,
  TREE_EMOJI_ITEMS,
  type TreeEmojiCategoryId,
} from './tree-emoji-catalog';
import {
  discardUnreferencedTreeIconAsset,
  selectTreeIconAsset,
} from './workspace-api';
import {
  BUILTIN_ICON_CATEGORIES,
  loadBuiltinIconRegistry,
  type BuiltinIconRegistry,
  type BuiltinIconSummary,
} from './tree-icon-registry';
import { recordRecentTreeIcon } from './tree-icon-preferences';
import { TrustedTablerIcon } from './tree-node-icon';
import type {
  TreeIconPickerSettings,
  TreeIconPickerTab,
  TreeNodeAppearance,
  TreeNodeIcon,
  TreeNodeIconColor,
  TreeNodeIconColorPreset,
  WorkspaceNode,
} from './workspace-types';

const ICON_GRID_COLUMNS = 10;
const ICON_GRID_ROW_HEIGHT = 38;
const ICON_SECTION_HEADER_HEIGHT = 34;
const ICON_GRID_VIEWPORT_HEIGHT = 330;

const COLOR_PRESETS: Array<{
  id: TreeNodeIconColorPreset;
  label: string;
}> = [
  { id: 'slate', label: '石板灰' },
  { id: 'red', label: '红色' },
  { id: 'orange', label: '橙色' },
  { id: 'amber', label: '琥珀色' },
  { id: 'green', label: '绿色' },
  { id: 'teal', label: '青绿色' },
  { id: 'cyan', label: '青色' },
  { id: 'blue', label: '蓝色' },
  { id: 'indigo', label: '靛蓝色' },
  { id: 'violet', label: '紫罗兰色' },
  { id: 'purple', label: '紫色' },
  { id: 'pink', label: '粉色' },
  { id: 'rose', label: '玫瑰色' },
];

const BUILTIN_CATEGORY_ICONS = {
  brands: Badge,
  common: Clock3,
  development: Code2,
  devices: MonitorSmartphone,
  editing: Type,
  files: Folder,
  media: Play,
  nature: Leaf,
  other: Grid3X3,
  people: Users,
  travel: Plane,
  work: BriefcaseBusiness,
} satisfies Record<
  (typeof BUILTIN_ICON_CATEGORIES)[number]['id'],
  React.ComponentType<{ className?: string }>
>;

const EMOJI_CATEGORY_ICONS = {
  activity: Gamepad2,
  common: Clock3,
  flags: Flag,
  food: Apple,
  nature: Leaf,
  objects: Lightbulb,
  people: Smile,
  symbols: CircleCheck,
  travel: Plane,
} satisfies Record<
  TreeEmojiCategoryId,
  React.ComponentType<{ className?: string }>
>;

interface TreeIconPickerProps {
  anchor: { left: number; top: number };
  node: WorkspaceNode;
  onAppearanceChange: (appearance: TreeNodeAppearance | null) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onPreferencesChange: (settings: TreeIconPickerSettings) => Promise<void> | void;
  open: boolean;
  preferences: TreeIconPickerSettings;
  rootPath: string;
}

export default function TreeIconPicker({
  anchor,
  node,
  onAppearanceChange,
  onOpenChange,
  onPreferencesChange,
  open,
  preferences,
  rootPath,
}: TreeIconPickerProps) {
  const [activeTab, setActiveTab] = React.useState<TreeIconPickerTab>(
    preferences.lastTab,
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const updateTab = (tab: TreeIconPickerTab) => {
    setActiveTab(tab);
    void Promise.resolve(
      onPreferencesChange({ ...preferences, lastTab: tab }),
    ).catch(() => undefined);
  };

  const saveIcon = async (icon: TreeNodeIcon, tab: TreeIconPickerTab) => {
    setIsSaving(true);
    setError(null);
    try {
      await onAppearanceChange({ ...node.appearance, icon });
      await onPreferencesChange(recordRecentTreeIcon(preferences, icon, tab));
      if (tab !== 'local') {
        onOpenChange(false);
      }
    } catch (cause) {
      if (icon.type === 'local') {
        await discardUnreferencedTreeIconAsset(rootPath, icon.assetId).catch(
          () => undefined,
        );
      }
      const message = getErrorMessage(cause, '无法保存目录图标，请重试');
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const saveColor = async (color: TreeNodeIconColor | undefined) => {
    setIsSaving(true);
    setError(null);
    try {
      const appearance = normalizeAppearance({ ...node.appearance, color });
      await onAppearanceChange(appearance);
    } catch (cause) {
      const message = getErrorMessage(cause, '无法保存图标颜色，请重试');
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const resetAppearance = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onAppearanceChange(null);
      onOpenChange(false);
    } catch (cause) {
      const message = getErrorMessage(cause, '无法恢复默认图标，请重试');
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-px"
          style={{ left: anchor.left, top: anchor.top }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[min(420px,calc(100vw-24px))] gap-0 overflow-hidden p-0 shadow-none ring-1 ring-border/70 data-open:animate-none data-closed:animate-none [&_button]:active:translate-y-0"
        collisionPadding={12}
        side="left"
        sideOffset={4}
        onFocusOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if (
            target instanceof HTMLElement &&
            target.closest('[data-workspace-node-path]')
          ) {
            event.preventDefault();
          }
        }}
      >
        <div
          aria-label="目录图标类型"
          className="flex h-11 items-stretch border-b border-border/60 px-2"
          role="tablist"
        >
          <PickerTab
            active={activeTab === 'emoji'}
            label="表情符号"
            onSelect={() => updateTab('emoji')}
          />
          <PickerTab
            active={activeTab === 'builtin'}
            label="图标"
            onSelect={() => updateTab('builtin')}
          />
          <PickerTab
            active={activeTab === 'local'}
            label="上传"
            onSelect={() => updateTab('local')}
          />
          <span className="flex-1" />
          {node.appearance?.icon || node.appearance?.color ? (
            <button
              className="px-2 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
              disabled={isSaving}
              type="button"
              onClick={() => void resetAppearance()}
            >
              恢复默认
            </button>
          ) : null}
        </div>

        {activeTab === 'builtin' ? (
          <BuiltinIconPanel
            appearance={node.appearance}
            disabled={isSaving}
            preferences={preferences}
            onColorChange={saveColor}
            onSelect={(icon) => saveIcon(icon, 'builtin')}
          />
        ) : null}
        {activeTab === 'emoji' ? (
          <EmojiIconPanel
            disabled={isSaving}
            preferences={preferences}
            selectedValue={
              node.appearance?.icon?.type === 'emoji'
                ? node.appearance.icon.value
                : null
            }
            onSelect={(icon) => saveIcon(icon, 'emoji')}
          />
        ) : null}
        {activeTab === 'local' ? (
          <LocalIconPanel
            disabled={isSaving}
            rootPath={rootPath}
            onError={setError}
            onSelect={(icon) => saveIcon(icon, 'local')}
          />
        ) : null}

        {error ? (
          <p className="border-t px-3 py-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PickerTab({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        'relative px-3 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground',
        active &&
          'text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground/80',
      )}
      role="tab"
      type="button"
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

function BuiltinIconPanel({
  appearance,
  disabled,
  onColorChange,
  onSelect,
  preferences,
}: {
  appearance: TreeNodeAppearance | undefined;
  disabled: boolean;
  onColorChange: (color: TreeNodeIconColor | undefined) => Promise<void>;
  onSelect: (icon: TreeNodeIcon) => Promise<void>;
  preferences: TreeIconPickerSettings;
}) {
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const [registry, setRegistry] = React.useState<BuiltinIconRegistry | null>(null);

  React.useEffect(() => {
    let active = true;
    void loadBuiltinIconRegistry().then((value) => {
      if (active) {
        setRegistry(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const sections = React.useMemo(() => {
    if (!registry) {
      return [];
    }
    if (deferredQuery.trim()) {
      return [{ id: 'search', label: '搜索结果', icons: registry.search(deferredQuery) }];
    }
    const recent = preferences.recentIcons
      .filter((icon): icon is Extract<TreeNodeIcon, { type: 'builtin' }> => icon.type === 'builtin')
      .map((icon) => registry.get(icon.name))
      .filter((icon): icon is BuiltinIconSummary => Boolean(icon));
    return [
      ...(recent.length ? [{ id: 'recent', label: '最近', icons: recent }] : []),
      ...registry.categories.map((category) => ({
        id: category.id,
        label: category.label,
        icons: registry.list(category.id),
      })),
    ];
  }, [deferredQuery, preferences.recentIcons, registry]);
  const colorDisabled = Boolean(
    appearance?.icon && appearance.icon.type !== 'builtin',
  );
  const availableIcons = sections.flatMap((section) => section.icons);

  const selectRandomIcon = () => {
    const icon = randomItem(availableIcons);
    if (icon) {
      void onSelect({ type: 'builtin', name: icon.name });
    }
  };

  return (
    <div>
      <div className="flex gap-1.5 px-3 pb-2 pt-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="搜索图标"
            className="h-9 border-transparent bg-muted/45 pl-8 text-sm shadow-none focus-visible:border-foreground/25 focus-visible:ring-0 dark:bg-muted/30"
            placeholder="筛选..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          aria-label="随机选择图标"
          className="size-9 border-transparent bg-muted/45 p-0 shadow-none focus-visible:border-foreground/25 focus-visible:ring-0 dark:bg-muted/30"
          disabled={disabled || availableIcons.length === 0}
          type="button"
          variant="outline"
          onClick={selectRandomIcon}
        >
          <Shuffle className="size-3.5" />
        </Button>
        <IconColorPopover
          color={appearance?.color}
          disabled={disabled || colorDisabled}
          disabledReason={
            colorDisabled ? 'Emoji 和本地图标保留原始颜色' : undefined
          }
          onChange={onColorChange}
        />
      </div>

      {!registry ? (
        <div className="flex h-[330px] items-center justify-center text-xs text-muted-foreground">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          正在载入本地图标
        </div>
      ) : sections.every((section) => section.icons.length === 0) ? (
        <div className="flex h-[330px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium">未找到相关图标</p>
          <p className="text-xs text-muted-foreground">尝试使用其他关键词</p>
        </div>
      ) : (
        <VirtualIconGrid
          key={deferredQuery.trim() ? `search:${deferredQuery}` : 'browse'}
          disabled={disabled}
          sections={sections}
          selectedName={
            appearance?.icon?.type === 'builtin' ? appearance.icon.name : null
          }
          onSelect={(icon) => onSelect({ type: 'builtin', name: icon.name })}
        />
      )}
    </div>
  );
}

interface IconGridSection {
  id: string;
  icons: BuiltinIconSummary[];
  label: string;
}

interface VirtualIconRow {
  height: number;
  icons?: BuiltinIconSummary[];
  key: string;
  label?: string;
  sectionId: string;
  top: number;
}

function VirtualIconGrid({
  disabled,
  onSelect,
  sections,
  selectedName,
}: {
  disabled: boolean;
  onSelect: (icon: BuiltinIconSummary) => Promise<void>;
  sections: IconGridSection[];
  selectedName: string | null;
}) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rows = React.useMemo(() => buildVirtualIconRows(sections), [sections]);
  const totalHeight = rows.at(-1)
    ? rows.at(-1)!.top + rows.at(-1)!.height
    : 0;
  const visibleRows = rows.filter(
    (row) =>
      row.top + row.height >= scrollTop - 100 &&
      row.top <= scrollTop + ICON_GRID_VIEWPORT_HEIGHT + 100,
  );

  return (
    <>
      <div
        ref={scrollRef}
        className="relative overflow-y-auto px-3"
        data-testid="tree-icon-grid-scroll"
        style={{ height: ICON_GRID_VIEWPORT_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="relative" style={{ height: totalHeight }}>
          {visibleRows.map((row) => (
            <div
              key={row.key}
              className={
                row.label
                  ? 'flex items-end px-1 pb-1 text-xs font-semibold text-muted-foreground'
                  : 'grid grid-cols-10 gap-0.5'
              }
              data-tree-icon-category={row.label ? row.sectionId : undefined}
              style={{
                height: row.height,
                left: 0,
                position: 'absolute',
                right: 0,
                top: row.top,
              }}
            >
              {row.label ??
                row.icons?.map((icon) => (
                  <TooltipProvider key={icon.name} delayDuration={500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={icon.label}
                          aria-pressed={selectedName === icon.name}
                          className={cn(
                            'flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground',
                            selectedName === icon.name &&
                              'bg-accent text-foreground',
                          )}
                          disabled={disabled}
                          type="button"
                          onClick={() => void onSelect(icon)}
                        >
                          <TrustedTablerIcon
                            className="size-[19px]"
                            icon={icon.data}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{icon.label}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
            </div>
          ))}
        </div>
      </div>
      <TooltipProvider delayDuration={450}>
        <div className="flex h-11 items-center justify-around border-t border-border/60 px-2">
          {BUILTIN_ICON_CATEGORIES.filter((category) =>
            rows.some(
              (row) => row.label && row.sectionId === category.id,
            ),
          ).map((category) => (
            <Tooltip key={category.id}>
              <TooltipTrigger asChild>
                <button
                  aria-label={category.label}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
                  type="button"
                  onClick={() => {
                    const target = rows.find(
                      (row) => row.label && row.sectionId === category.id,
                    );
                    if (target && scrollRef.current) {
                      scrollRef.current.scrollTo({
                        behavior: 'smooth',
                        top: target.top,
                      });
                    }
                  }}
                >
                  {React.createElement(BUILTIN_CATEGORY_ICONS[category.id], {
                    className: 'size-4',
                  })}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{category.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </>
  );
}

function buildVirtualIconRows(sections: IconGridSection[]) {
  const rows: VirtualIconRow[] = [];
  let top = 0;

  for (const section of sections) {
    if (section.icons.length === 0) {
      continue;
    }
    rows.push({
      height: ICON_SECTION_HEADER_HEIGHT,
      key: `header-${section.id}`,
      label: section.label,
      sectionId: section.id,
      top,
    });
    top += ICON_SECTION_HEADER_HEIGHT;
    for (let index = 0; index < section.icons.length; index += ICON_GRID_COLUMNS) {
      rows.push({
        height: ICON_GRID_ROW_HEIGHT,
        icons: section.icons.slice(index, index + ICON_GRID_COLUMNS),
        key: `${section.id}-${index}`,
        sectionId: section.id,
        top,
      });
      top += ICON_GRID_ROW_HEIGHT;
    }
  }

  return rows;
}

function IconColorPopover({
  color,
  disabled,
  disabledReason,
  onChange,
}: {
  color: TreeNodeIconColor | undefined;
  disabled: boolean;
  disabledReason?: string;
  onChange: (color: TreeNodeIconColor | undefined) => Promise<void>;
}) {
  const [customColor, setCustomColor] = React.useState(
    color?.type === 'custom' ? color.value : '#5B8DEF',
  );
  const trigger = (
    <Button
      aria-label="图标颜色"
      className="size-9 shrink-0 border-transparent bg-muted/45 p-0 shadow-none focus-visible:border-foreground/25 focus-visible:ring-0 active:translate-y-0 dark:bg-muted/30"
      disabled={disabled}
      type="button"
      variant="outline"
    >
      <span
        className="size-4 rounded-full border border-foreground/10"
        style={{ backgroundColor: treeIconColorValue(color) }}
      />
    </Button>
  );

  if (disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{trigger}</span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 shadow-none ring-1 ring-border/70 data-open:animate-none data-closed:animate-none [&_button]:active:translate-y-0"
        sideOffset={5}
      >
        <p className="text-xs font-medium">图标颜色</p>
        <button
          className="flex h-8 items-center gap-2 rounded-md px-2 text-xs hover:bg-muted"
          disabled={disabled}
          type="button"
          onClick={() => void onChange(undefined)}
        >
          <span className="size-4 rounded-full border bg-muted-foreground/60" />
          默认
          {!color ? <Check className="ml-auto size-3.5" /> : null}
        </button>
        <div className="grid grid-cols-7 gap-2 rounded-md bg-muted/35 p-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              aria-label={preset.label}
              className="relative size-6 rounded-full border border-foreground/10 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
              disabled={disabled}
              style={{ backgroundColor: `var(--tree-icon-${preset.id})` }}
              type="button"
              onClick={() =>
                void onChange({ type: 'preset', value: preset.id })
              }
            >
              {color?.type === 'preset' && color.value === preset.id ? (
                <Check className="absolute inset-1 size-4 text-white" />
              ) : null}
            </button>
          ))}
        </div>
        <label
          className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md bg-muted/35 px-2.5 outline-none transition-colors hover:bg-muted/60 has-focus-visible:outline has-focus-visible:outline-1 has-focus-visible:outline-offset-1 has-focus-visible:outline-foreground/35"
          htmlFor="tree-icon-custom-color"
        >
          <input
            aria-label="选择自定义图标颜色"
            className="size-7 shrink-0 cursor-pointer rounded-full border border-foreground/10 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
            disabled={disabled}
            id="tree-icon-custom-color"
            type="color"
            value={customColor}
            onChange={(event) => {
              const nextColor = event.target.value.toUpperCase();
              setCustomColor(nextColor);
              void onChange({ type: 'custom', value: nextColor });
            }}
          />
          <span className="text-xs font-medium">自定义颜色</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            打开调色板
          </span>
        </label>
      </PopoverContent>
    </Popover>
  );
}

function EmojiIconPanel({
  disabled,
  onSelect,
  preferences,
  selectedValue,
}: {
  disabled: boolean;
  onSelect: (icon: TreeNodeIcon) => Promise<void>;
  preferences: TreeIconPickerSettings;
  selectedValue: string | null;
}) {
  const [query, setQuery] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const recent = preferences.recentIcons.filter(
    (icon): icon is Extract<TreeNodeIcon, { type: 'emoji' }> =>
      icon.type === 'emoji',
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sections = normalizedQuery
    ? [
        {
          id: 'search',
          label: '搜索结果',
          items: uniqueEmojiItems(TREE_EMOJI_ITEMS).filter(
            ([emoji, keywords]) =>
              `${emoji} ${keywords}`
                .toLocaleLowerCase()
                .includes(normalizedQuery),
          ),
        },
      ].filter((section) => section.items.length > 0)
    : [
        ...(recent.length
          ? [
              {
                id: 'recent',
                label: '最近',
                items: uniqueEmojiItems(
                  recent.map((icon) => [icon.value, '最近']),
                ),
              },
            ]
          : []),
        ...TREE_EMOJI_CATEGORIES,
      ];
  const pastedEmoji = isSingleEmoji(query) ? query : null;
  const visibleEmojiItems = sections.flatMap((section) => section.items);

  const runQuickAction = () => {
    const emoji = pastedEmoji ?? randomItem(visibleEmojiItems)?.[0];
    if (emoji) {
      void onSelect({ type: 'emoji', value: emoji });
    }
  };

  const scrollToCategory = (categoryId: TreeEmojiCategoryId) => {
    setQuery('');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = scrollRef.current?.querySelector<HTMLElement>(
          `[data-tree-emoji-category="${categoryId}"]`,
        );
        if (target && scrollRef.current) {
          scrollRef.current.scrollTo({
            behavior: 'smooth',
            top: Math.max(0, target.offsetTop - 8),
          });
        }
      });
    });
  };

  return (
    <div>
      <div className="flex gap-1.5 px-3 pb-2 pt-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="搜索表情符号"
            className="h-9 border-transparent bg-muted/45 pl-8 text-sm shadow-none focus-visible:border-foreground/25 focus-visible:ring-0 dark:bg-muted/30"
            placeholder="筛选或粘贴 Emoji..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && pastedEmoji) {
                event.preventDefault();
                runQuickAction();
              }
            }}
          />
        </div>
        <Button
          aria-label={pastedEmoji ? '使用粘贴的 Emoji' : '随机选择 Emoji'}
          className="size-9 border-transparent bg-muted/45 p-0 shadow-none focus-visible:border-foreground/25 focus-visible:ring-0 dark:bg-muted/30"
          disabled={
            disabled || (!pastedEmoji && visibleEmojiItems.length === 0)
          }
          type="button"
          variant="outline"
          onClick={runQuickAction}
        >
          {pastedEmoji ? (
            <span className="text-base leading-none">{pastedEmoji}</span>
          ) : (
            <Shuffle className="size-3.5" />
          )}
        </Button>
      </div>
      <div ref={scrollRef} className="h-[330px] overflow-y-auto px-3 pb-2">
        {sections.length ? (
          sections.map((section) => (
            <section
              key={section.id}
              data-tree-emoji-category={section.id}
            >
              <h3 className="px-1 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
                {section.label}
              </h3>
              <div className="grid grid-cols-10 gap-0.5">
                {section.items.map(([emoji, keywords]) => (
                  <button
                    key={`${section.id}-${emoji}`}
                    aria-label={`${keywords.split(' ')[0] || 'Emoji'} ${emoji}`}
                    aria-pressed={selectedValue === emoji}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md text-[21px] leading-none outline-none transition-colors hover:bg-muted focus-visible:bg-muted',
                      selectedValue === emoji && 'bg-accent',
                    )}
                    disabled={disabled}
                    type="button"
                    onClick={() => void onSelect({ type: 'emoji', value: emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">未找到相关表情符号</p>
            <p className="text-xs text-muted-foreground">
              试试其他关键词，或直接粘贴一个 Emoji
            </p>
          </div>
        )}
      </div>
      <TooltipProvider delayDuration={450}>
        <div className="flex h-11 items-center justify-around border-t border-border/60 px-2">
          {TREE_EMOJI_CATEGORIES.map((category) => (
            <Tooltip key={category.id}>
              <TooltipTrigger asChild>
                <button
                  aria-label={category.label}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
                  type="button"
                  onClick={() => scrollToCategory(category.id)}
                >
                  {React.createElement(EMOJI_CATEGORY_ICONS[category.id], {
                    className: 'size-4',
                  })}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{category.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

function LocalIconPanel({
  disabled,
  onError,
  onSelect,
  rootPath,
}: {
  disabled: boolean;
  onError: (error: string | null) => void;
  onSelect: (icon: TreeNodeIcon) => Promise<void>;
  rootPath: string;
}) {
  const [isImporting, setIsImporting] = React.useState(false);

  const selectLocalIcon = async () => {
    setIsImporting(true);
    onError(null);
    try {
      const asset = await selectTreeIconAsset(rootPath);
      if (asset) {
        await onSelect({ type: 'local', assetId: asset.assetId });
      }
    } catch (cause) {
      const message = getErrorMessage(cause, '无法保存本地图标，请重试');
      onError(message);
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex h-[386px] items-center p-4">
      <div className="w-full">
        <button
          className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted/40 text-muted-foreground outline-none transition-colors hover:bg-muted/65 hover:text-foreground focus-visible:bg-muted/65 focus-visible:text-foreground dark:bg-muted/25 dark:hover:bg-muted/45"
          disabled={disabled || isImporting}
          type="button"
          onClick={() => void selectLocalIcon()}
        >
          {isImporting ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Upload className="size-5" />
          )}
          <span className="text-sm font-medium text-foreground/80">
            {isImporting ? '正在导入...' : '选择图片'}
          </span>
        </button>
        <p className="pt-3 text-center text-xs text-muted-foreground">
          SVG、PNG、WebP · 最大 2 MB
        </p>
      </div>
    </div>
  );
}

function normalizeAppearance(appearance: TreeNodeAppearance) {
  return appearance.icon || appearance.color ? appearance : null;
}

function treeIconColorValue(color: TreeNodeIconColor | undefined) {
  if (!color) {
    return 'var(--muted-foreground)';
  }
  return color.type === 'custom'
    ? color.value
    : `var(--tree-icon-${color.value})`;
}

function uniqueEmojiItems(items: Array<[string, string]>) {
  const seen = new Set<string>();
  return items.filter(([emoji]) => {
    if (seen.has(emoji)) {
      return false;
    }
    seen.add(emoji);
    return true;
  });
}

function randomItem<T>(items: T[]) {
  return items.length ? items[Math.floor(Math.random() * items.length)] : null;
}

export function isSingleEmoji(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || value.length > 32) {
    return false;
  }
  const hasEmoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(value);
  if (!hasEmoji) {
    return false;
  }
  if (typeof Intl.Segmenter !== 'function') {
    return true;
  }
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
  );
  return segments.length === 1;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
