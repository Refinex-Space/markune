export interface BuiltinIconData {
  body: string;
  height?: number;
  left?: number;
  top?: number;
  width?: number;
}

interface BuiltinIconSet {
  height?: number;
  icons: Record<string, BuiltinIconData>;
  width?: number;
}

export type BuiltinIconCategoryId =
  | 'common'
  | 'files'
  | 'editing'
  | 'development'
  | 'work'
  | 'people'
  | 'devices'
  | 'media'
  | 'travel'
  | 'nature'
  | 'brands'
  | 'other';

export interface BuiltinIconCategory {
  id: BuiltinIconCategoryId;
  label: string;
}

export interface BuiltinIconSummary {
  category: BuiltinIconCategoryId;
  data: BuiltinIconData;
  label: string;
  name: string;
  searchText: string;
}

export const BUILTIN_ICON_CATEGORIES: BuiltinIconCategory[] = [
  { id: 'common', label: '常用' },
  { id: 'files', label: '文件与目录' },
  { id: 'editing', label: '编辑与文本' },
  { id: 'development', label: '开发' },
  { id: 'work', label: '商务与工作' },
  { id: 'people', label: '人物' },
  { id: 'devices', label: '设备' },
  { id: 'media', label: '媒体' },
  { id: 'travel', label: '地图与旅行' },
  { id: 'nature', label: '自然' },
  { id: 'brands', label: '品牌' },
  { id: 'other', label: '其他' },
];

const COMMON_ICON_NAMES = new Set([
  'archive',
  'book',
  'bookmark',
  'briefcase',
  'calendar',
  'check',
  'circle',
  'code',
  'database',
  'folder',
  'heart',
  'home',
  'idea',
  'list',
  'notes',
  'rocket',
  'search',
  'settings',
  'star',
  'terminal',
]);

const CATEGORY_PATTERNS: Array<{
  id: Exclude<BuiltinIconCategoryId, 'common' | 'other'>;
  pattern: RegExp;
}> = [
  { id: 'brands', pattern: /^brand-/u },
  {
    id: 'files',
    pattern: /(^|-)(archive|file|folder|folders|library|notebook|paperclip)(-|$)/u,
  },
  {
    id: 'editing',
    pattern: /(^|-)(align|blockquote|bold|cursor|edit|eraser|font|heading|highlight|italic|letter|list|markdown|note|paragraph|pencil|quote|section|table|text|underline|writing)(-|$)/u,
  },
  {
    id: 'development',
    pattern: /(^|-)(api|binary|braces|brackets|bug|code|command|database|git|json|prompt|regex|server|source|terminal|variable)(-|$)/u,
  },
  {
    id: 'work',
    pattern: /(^|-)(briefcase|building|businessplan|calendar|chart|clipboard|coin|currency|presentation|report|school|timeline|wallet)(-|$)/u,
  },
  {
    id: 'people',
    pattern: /(^|-)(face|friends|gender|man|mood|person|user|users|woman)(-|$)/u,
  },
  {
    id: 'devices',
    pattern: /(^|-)(battery|bluetooth|camera|device|devices|headphones|keyboard|laptop|mobile|mouse|phone|printer|router|screen|smart-home|speaker|watch|wifi)(-|$)/u,
  },
  {
    id: 'media',
    pattern: /(^|-)(album|audio|disc|film|headphones|microphone|movie|music|photo|picture|player|playlist|record|video|volume)(-|$)/u,
  },
  {
    id: 'travel',
    pattern: /(^|-)(anchor|bike|bus|car|compass|flag|flight|map|navigation|plane|road|route|ship|train|travel|world)(-|$)/u,
  },
  {
    id: 'nature',
    pattern: /(^|-)(animal|cloud|flower|leaf|moon|mountain|plant|rain|seedling|snow|sun|tree|weather|wind)(-|$)/u,
  },
];

const ZH_ICON_ALIASES: Record<string, string[]> = {
  archive: ['归档', '存档'],
  book: ['书', '阅读', '知识'],
  briefcase: ['工作', '商务', '办公'],
  calendar: ['日历', '日期', '计划'],
  code: ['代码', '编程', '开发'],
  database: ['数据库', '数据', 'sql'],
  design: ['设计', '创意'],
  device: ['设备', '硬件'],
  file: ['文件', '文档'],
  folder: ['目录', '文件夹'],
  heart: ['喜欢', '爱心'],
  home: ['首页', '主页', '家'],
  idea: ['想法', '灵感'],
  image: ['图片', '图像'],
  map: ['地图', '旅行'],
  music: ['音乐', '音频'],
  note: ['笔记', '记录'],
  person: ['人物', '用户'],
  photo: ['照片', '相册'],
  rocket: ['火箭', '项目', '发布'],
  school: ['学习', '教育'],
  star: ['星标', '收藏'],
  terminal: ['终端', '命令行', 'cli'],
  tool: ['工具', '设置'],
  video: ['视频', '媒体'],
  work: ['工作', '任务'],
};

export interface BuiltinIconRegistry {
  categories: BuiltinIconCategory[];
  get(name: string): BuiltinIconSummary | null;
  list(category: BuiltinIconCategoryId): BuiltinIconSummary[];
  search(query: string, limit?: number): BuiltinIconSummary[];
}

let registryPromise: Promise<BuiltinIconRegistry> | null = null;

export function loadBuiltinIconRegistry() {
  registryPromise ??= import('@iconify-json/tabler').then(({ icons }) =>
    createBuiltinIconRegistry(icons),
  );
  return registryPromise;
}

export function createBuiltinIconRegistry(
  iconSet: BuiltinIconSet,
): BuiltinIconRegistry {
  const summaries = Object.entries(iconSet.icons).map(([iconName, icon]) => {
    const name = `tabler:${iconName}`;
    const category = classifyIcon(iconName);
    const aliases = Object.entries(ZH_ICON_ALIASES)
      .filter(
        ([token]) =>
          iconName.split('-').includes(token) || iconName.includes(token),
      )
      .flatMap(([, values]) => values);

    return {
      category,
      data: {
        ...icon,
        height: icon.height ?? iconSet.height ?? 24,
        width: icon.width ?? iconSet.width ?? 24,
      },
      label: iconName
        .split('-')
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' '),
      name,
      searchText: [iconName, ...iconName.split('-'), category, ...aliases]
        .join(' ')
        .toLocaleLowerCase(),
    } satisfies BuiltinIconSummary;
  });
  const byName = new Map(summaries.map((summary) => [summary.name, summary]));
  const byCategory = new Map<BuiltinIconCategoryId, BuiltinIconSummary[]>();

  for (const category of BUILTIN_ICON_CATEGORIES) {
    byCategory.set(
      category.id,
      summaries.filter((summary) => summary.category === category.id),
    );
  }

  return {
    categories: BUILTIN_ICON_CATEGORIES.filter(
      (category) => (byCategory.get(category.id)?.length ?? 0) > 0,
    ),
    get(name) {
      return byName.get(name) ?? null;
    },
    list(category) {
      return byCategory.get(category) ?? [];
    },
    search(query, limit = 240) {
      const normalized = query.trim().toLocaleLowerCase();
      if (!normalized) {
        return [];
      }
      const tokens = normalized.split(/\s+/u);

      return summaries
        .filter((summary) =>
          tokens.every((token) => summary.searchText.includes(token)),
        )
        .sort((left, right) => {
          const leftName = left.name.slice('tabler:'.length);
          const rightName = right.name.slice('tabler:'.length);
          const leftRank = searchRank(leftName, normalized);
          const rightRank = searchRank(rightName, normalized);
          return leftRank - rightRank || leftName.localeCompare(rightName);
        })
        .slice(0, limit);
    },
  };
}

function classifyIcon(name: string): BuiltinIconCategoryId {
  if (COMMON_ICON_NAMES.has(name)) {
    return 'common';
  }
  return (
    CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(name))?.id ?? 'other'
  );
}

function searchRank(name: string, query: string) {
  if (name === query) {
    return 0;
  }
  if (name.startsWith(`${query}-`) || name.startsWith(query)) {
    return 1;
  }
  if (name.split('-').includes(query)) {
    return 2;
  }
  return 3;
}
