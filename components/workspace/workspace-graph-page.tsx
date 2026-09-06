'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Filter,
  RefreshCw,
  Scan,
  Search,
  Settings2,
  X,
} from 'lucide-react';

import {
  Popover,
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

import { useWorkspaceGraph } from './use-workspace-graph';
import {
  WorkspaceGraphCanvas,
  type WorkspaceGraphCanvasHandle,
  type WorkspaceGraphPhysicsSettings,
} from './workspace-graph-canvas';
import {
  DEFAULT_GRAPH_VISIBILITY,
  getGraphRelationshipDescriptions,
  localWorkspaceGraph,
  filterWorkspaceGraph,
  findWorkspaceGraphMatches,
  getWorkspaceGraphNeighbors,
  type WorkspaceGraphVisibility,
} from './workspace-graph-model';
import type {
  WorkspaceGraphNode,
  WorkspaceGraphNodeKind,
  WorkspaceGraphEdge,
  WorkspaceNode,
} from './workspace-types';

interface WorkspaceGraphPageProps {
  nodes: WorkspaceNode[];
  rootPath: string;
  revision?: number;
  currentDocumentPath?: string | null;
  sidebarHeaderOffset?: number;
  onOpenNode: (node: WorkspaceNode) => void;
}

interface PersistedGraphSettings extends WorkspaceGraphPhysicsSettings {
  hideOrphans: boolean;
  visibility: WorkspaceGraphVisibility;
}

const DEFAULT_SETTINGS: PersistedGraphSettings = {
  charge: -600,
  edgeOpacity: 0.6,
  hideOrphans: false,
  labelThreshold: 0.8,
  linkDistance: 80,
  nodeScale: 1,
  showArrows: true,
  visibility: DEFAULT_GRAPH_VISIBILITY,
};

const NODE_KIND_LABELS: Record<WorkspaceGraphNodeKind, string> = {
  daily: '日记',
  note: '笔记',
  property: '属性字段',
  unresolved: '未解析',
  tag: '标签',
  weekly: '周记',
};

export function WorkspaceGraphPage(props: WorkspaceGraphPageProps) {
  return <WorkspaceGraphPageContent key={props.rootPath} {...props} />;
}

function WorkspaceGraphPageContent({
  nodes,
  rootPath,
  revision = 0,
  currentDocumentPath,
  sidebarHeaderOffset,
  onOpenNode,
}: WorkspaceGraphPageProps) {
  const alignWithMacSidebar = sidebarHeaderOffset !== undefined;
  const canvasRef = React.useRef<WorkspaceGraphCanvasHandle | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const { snapshot, error, isLoading, isRefreshing, refresh } = useWorkspaceGraph(rootPath, revision);
  const [query, setQuery] = React.useState('');
  const [center, setCenter] = React.useState<string | null>(null);
  const [depth, setDepth] = React.useState(1);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<PersistedGraphSettings>(() =>
    readPersistedGraphSettings(rootPath),
  );
  const settingsStorageKey = React.useMemo(() => graphSettingsKey(rootPath), [rootPath]);
  const documentByPath = React.useMemo(
    () => new Map(flattenDocumentNodes(nodes).map((node) => [node.relativePath, node])),
    [nodes],
  );

  React.useEffect(() => {
    try { window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings)); } catch { /* Optional preference storage. author: refinex */ }
  }, [settings, settingsStorageKey]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setSelectedNodeId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const visibleGraph = React.useMemo(
    () =>
      snapshot
        ? localWorkspaceGraph(filterWorkspaceGraph(snapshot, settings.visibility, settings.hideOrphans), center, depth)
        : { nodes: [], edges: [] },
    [settings.hideOrphans, settings.visibility, snapshot, center, depth],
  );
  const matches = React.useMemo(
    () => findWorkspaceGraphMatches(visibleGraph.nodes, query),
    [query, visibleGraph.nodes],
  );
  const matchingNodes = React.useMemo(
    () => visibleGraph.nodes.filter((node) => matches.has(node.id)).slice(0, 12),
    [matches, visibleGraph.nodes],
  );
  const selectedNode = React.useMemo(
    () => visibleGraph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, visibleGraph.nodes],
  );
  const selectedNeighbors = React.useMemo(
    () =>
      selectedNode
        ? getWorkspaceGraphNeighbors(visibleGraph, selectedNode.id)
        : [],
    [selectedNode, visibleGraph],
  );
  React.useEffect(() => { canvasRef.current?.fit(); }, [center, depth]);

  const openGraphNode = React.useCallback(
    (nodeId: string) => {
      const graphNode = snapshot?.nodes.find((node) => node.id === nodeId);
      if (!graphNode?.relativePath) {
        return;
      }
      const workspaceNode = documentByPath.get(graphNode.relativePath);
      if (workspaceNode) {
        onOpenNode(workspaceNode);
      }
    },
    [documentByPath, onOpenNode, snapshot?.nodes],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="workspace-graph-page"
    >
      <header
        className={cn(
          'flex shrink-0 gap-3 border-b border-border/50 px-3',
          alignWithMacSidebar ? 'items-start pb-2' : 'h-12 items-center',
        )}
        style={
          alignWithMacSidebar
            ? { height: 44, marginTop: sidebarHeaderOffset }
            : undefined
        }
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2',
            alignWithMacSidebar && 'h-9',
          )}
        >
          <h1 className="text-sm font-medium">图谱</h1>
          {snapshot ? (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {visibleGraph.nodes.length} 个节点 · {visibleGraph.edges.length} 条关系
            </span>
          ) : null}
        </div>

        <TooltipProvider>
          <div
            className={cn(
              'ml-auto flex items-center gap-1',
              alignWithMacSidebar && 'h-9',
            )}
          >
            <label className="flex h-7 w-56 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 text-xs focus-within:border-ring">
              <Search className="shrink-0 text-muted-foreground" size={13} />
              <input
                ref={searchInputRef}
                aria-label="搜索图谱"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                placeholder="搜索节点"
                role="searchbox"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button
                  aria-label="清除图谱搜索"
                  className="text-muted-foreground hover:text-foreground"
                  type="button"
                  onClick={() => setQuery('')}
                >
                  <X size={12} />
                </button>
              ) : null}
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="适应图谱视图"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  type="button"
                  onClick={() => canvasRef.current?.fit()}
                >
                  <Scan size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                适应图谱视图
              </TooltipContent>
            </Tooltip>
            <button type="button" className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent" disabled={!center && !selectedNode?.relativePath && !currentDocumentPath} onClick={() => setCenter(center ? null : selectedNode?.relativePath ? selectedNode.id : snapshot?.nodes.find((node) => node.relativePath === currentDocumentPath)?.id ?? null)}>{center ? '返回全局' : '局部图谱'}</button>
            {center ? <select aria-label="局部图谱深度" className="h-7 rounded-md border border-border/60 bg-background px-1 text-xs" value={depth} onChange={(event) => setDepth(Number(event.target.value))}>{[1, 2, 3].map((depth) => <option key={depth} value={depth}>{depth} 层引用</option>)}</select> : null}
            <GraphSettingsPopover settings={settings} onChange={setSettings} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="刷新图谱"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  type="button"
                  onClick={() => refresh()}
                >
                  <RefreshCw className={cn(isRefreshing && 'animate-spin')} size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                刷新图谱
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {center && !query.trim() ? <div className="absolute left-3 top-3 z-10 max-w-xs truncate rounded-md border border-border/60 bg-background/95 px-2 py-1 text-xs text-muted-foreground">中心：{snapshot?.nodes.find((node) => node.id === center)?.label ?? '笔记已不可用'} · {depth} 层文档引用</div> : null}
        {isLoading ? (
          <GraphStatus icon={<RefreshCw className="animate-spin" size={18} />} label="正在构建工作区图谱…" />
        ) : error && !snapshot ? (
          <GraphStatus
            icon={<AlertTriangle size={18} />}
            label={error}
            action="重新加载"
            onAction={() => refresh()}
          />
        ) : visibleGraph.nodes.length === 0 ? (
          <GraphStatus icon={<Filter size={18} />} label="当前筛选条件下没有可显示的节点" />
        ) : (
          <WorkspaceGraphCanvas
            ref={canvasRef}
            edges={visibleGraph.edges}
            matches={matches}
            nodes={visibleGraph.nodes}
            selectedNodeId={selectedNodeId}
            settings={settings}
            onOpenNode={openGraphNode}
            onSelectNode={setSelectedNodeId}
          />
        )}

        {query.trim() && matchingNodes.length > 0 ? (
          <div className="absolute left-3 top-3 z-10 w-72 overflow-hidden rounded-lg border border-border/70 bg-popover/96 p-1 shadow-lg backdrop-blur">
            {matchingNodes.map((node) => (
              <button
                key={node.id}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent"
                type="button"
                onClick={() => {
                  setSelectedNodeId(node.id);
                  canvasRef.current?.focusNode(node.id);
                }}
              >
                <GraphNodeDot kind={node.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{node.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {node.relativePath ?? NODE_KIND_LABELS[node.kind]}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{node.degree}</span>
              </button>
            ))}
          </div>
        ) : null}

        {selectedNode ? (
          <GraphInspector
            key={selectedNode.id}
            edges={visibleGraph.edges}
            neighbors={selectedNeighbors}
            node={selectedNode}
            onLocal={() => setCenter(selectedNode.id)}
            onClose={() => setSelectedNodeId(null)}
            onOpen={() => openGraphNode(selectedNode.id)}
            onSelect={(node) => {
              setSelectedNodeId(node.id);
              canvasRef.current?.focusNode(node.id);
            }}
          />
        ) : null}

        {error && snapshot ? (
          <div role="alert" className="absolute bottom-3 left-3 max-w-lg rounded-md border border-amber-500/25 bg-background px-3 py-2 text-xs">刷新失败，当前显示上次图谱：{error}</div>
        ) : snapshot?.warnings.length ? (
          <div className="absolute bottom-3 left-3 flex max-w-lg items-start gap-2 rounded-md border border-amber-500/25 bg-amber-50/95 px-3 py-2 text-[11px] text-amber-900 shadow-sm dark:bg-amber-950/90 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 shrink-0" size={13} />
            <span>{snapshot.warnings.join('；')}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GraphSettingsPopover({
  settings,
  onChange,
}: {
  settings: PersistedGraphSettings;
  onChange: React.Dispatch<React.SetStateAction<PersistedGraphSettings>>;
}) {
  function update<K extends keyof PersistedGraphSettings>(
    key: K,
    value: PersistedGraphSettings[K],
  ) {
    onChange((current) => ({ ...current, [key]: value }));
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              aria-label="图谱设置"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              type="button"
            >
              <Settings2 size={15} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          图谱设置
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 gap-3 p-3 shadow-none">
        <div>
          <div className="mb-2 text-xs font-medium">显示节点</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(NODE_KIND_LABELS) as WorkspaceGraphNodeKind[]).map((kind) => (
              <label
                key={kind}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5 text-xs"
              >
                <input
                  checked={settings.visibility[kind]}
                  className="accent-primary"
                  type="checkbox"
                  onChange={(event) =>
                    update('visibility', {
                      ...settings.visibility,
                      [kind]: event.target.checked,
                    })
                  }
                />
                {NODE_KIND_LABELS[kind]}
              </label>
            ))}
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">连线表示文档引用或标签归属。属性字段仅按同名字段聚合，默认隐藏；未解析节点表示目标缺失、重名或尚未索引。</p>
        <label className="flex items-center justify-between text-xs">
          显示引用方向
          <input checked={settings.showArrows} className="accent-primary" type="checkbox" onChange={(event) => update('showArrows', event.target.checked)} />
        </label>
        <label className="flex items-center justify-between text-xs">
          隐藏孤立节点
          <input
            checked={settings.hideOrphans}
            className="accent-primary"
            type="checkbox"
            onChange={(event) => update('hideOrphans', event.target.checked)}
          />
        </label>
        <GraphRange
          label="斥力"
          max={-100}
          min={-1200}
          step={50}
          value={settings.charge}
          onChange={(value) => update('charge', value)}
        />
        <GraphRange
          label="连线距离"
          max={180}
          min={30}
          step={5}
          value={settings.linkDistance}
          onChange={(value) => update('linkDistance', value)}
        />
        <GraphRange
          label="节点大小"
          max={2}
          min={0.5}
          step={0.1}
          value={settings.nodeScale}
          onChange={(value) => update('nodeScale', value)}
        />
        <GraphRange
          label="连线透明度"
          max={1}
          min={0.1}
          step={0.1}
          value={settings.edgeOpacity}
          onChange={(value) => update('edgeOpacity', value)}
        />
        <GraphRange
          label="标签缩放阈值"
          max={2}
          min={0.2}
          step={0.1}
          value={settings.labelThreshold}
          onChange={(value) => update('labelThreshold', value)}
        />
        <button
          className="h-7 rounded-md border border-border/60 text-xs hover:bg-accent"
          type="button"
          onClick={() => onChange(DEFAULT_SETTINGS)}
        >
          恢复默认设置
        </button>
      </PopoverContent>
    </Popover>
  );
}

function GraphRange({
  label,
  max,
  min,
  step,
  value,
  onChange,
}: {
  label: string;
  max: number;
  min: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_56px] items-center gap-x-2 gap-y-1 text-xs">
      <span>{label}</span>
      <output className="text-right text-muted-foreground tabular-nums">{value}</output>
      <input
        aria-label={label}
        className="col-span-2 w-full accent-primary"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function GraphInspector({
  onLocal,
  edges,
  neighbors,
  node,
  onClose,
  onOpen,
  onSelect,
}: {
  onLocal: () => void;
  edges: WorkspaceGraphEdge[];
  neighbors: WorkspaceGraphNode[];
  node: WorkspaceGraphNode;
  onClose: () => void;
  onOpen: () => void;
  onSelect: (node: WorkspaceGraphNode) => void;
}) {
  const relationships = React.useMemo(() => getGraphRelationshipDescriptions(edges, node.id), [edges, node.id]);
  const [neighborLimit, setNeighborLimit] = React.useState(100);
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-80 flex-col border-l border-border/60 bg-background/96 backdrop-blur">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <GraphNodeDot kind={node.kind} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.label}</span>
        <button
          aria-label="关闭节点详情"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          type="button"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">类型</dt>
          <dd>{NODE_KIND_LABELS[node.kind]}</dd>
          <dt className="text-muted-foreground">相邻节点</dt>
          <dd>{node.degree}</dd>
          {node.relativePath || node.kind === 'unresolved' ? <>
            <dt className="text-muted-foreground">入链节点</dt><dd>{node.inDegree ?? 0}</dd>
            <dt className="text-muted-foreground">出链节点</dt><dd>{node.outDegree ?? 0}</dd>
          </> : null}
          {node.relativePath ? (
            <>
              <dt className="text-muted-foreground">位置</dt>
              <dd className="break-all">{node.relativePath}</dd>
            </>
          ) : null}
        </dl>
        {node.kind === 'unresolved' ? <p className="mt-3 text-muted-foreground">目标缺失、重名或尚未索引。请从相邻文档检查原始引用。</p> : null}
        {node.contentIndexed === false ? <p className="mt-3 text-muted-foreground">此文档内容未完整索引，出链和标签可能不完整。</p> : null}
        {node.relativePath ? (
          <button
            className="mt-4 flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs text-primary-foreground hover:bg-primary/90"
            type="button"
            onClick={onOpen}
          >
            <ExternalLink size={13} />
            打开文档
          </button>
        ) : null}
        {node.relativePath ? <button type="button" className="mt-2 w-full rounded-md border border-border/60 py-2" onClick={onLocal}>以此笔记为中心</button> : null}
        <div className="mb-2 mt-5 font-medium">相邻节点 ({neighbors.length})</div>
        <div className="space-y-1">
          {neighbors.slice(0, neighborLimit).map((neighbor) => (
            <button
              key={neighbor.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              type="button"
              onClick={() => onSelect(neighbor)}
            >
              <GraphNodeDot kind={neighbor.kind} />
              <span className="min-w-0 flex-1"><span className="block truncate">{neighbor.label}</span><span className="block text-[10px] text-muted-foreground">{relationships.get(neighbor.id)}</span></span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{neighbor.degree}</span>
            </button>
          ))}
          {neighbors.length > neighborLimit ? <button className="w-full rounded-md px-2 py-2 text-muted-foreground hover:bg-accent" type="button" onClick={() => setNeighborLimit((value) => value + 100)}>显示更多相邻节点</button> : null}
        </div>
      </div>
    </aside>
  );
}

function GraphNodeDot({ kind }: { kind: WorkspaceGraphNodeKind }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        kind === 'note' && 'bg-zinc-700 dark:bg-zinc-300',
        kind === 'daily' && 'bg-blue-600',
        kind === 'weekly' && 'bg-cyan-600',
        kind === 'tag' && 'bg-violet-600',
        kind === 'property' && 'bg-red-700',
        kind === 'unresolved' && 'bg-zinc-400',
      )}
    />
  );
}

function GraphStatus({
  action,
  icon,
  label,
  onAction,
}: {
  action?: string;
  icon: React.ReactNode;
  label: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      {icon}
      <span>{label}</span>
      {action && onAction ? (
        <button
          className="rounded-md border border-border/60 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
          type="button"
          onClick={onAction}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function flattenDocumentNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) =>
    node.kind === 'document'
      ? [node]
      : flattenDocumentNodes(node.children ?? []),
  );
}

function graphSettingsKey(rootPath: string) {
  let hash = 2166136261;
  for (let index = 0; index < rootPath.length; index += 1) {
    hash ^= rootPath.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `markune:graph:${(hash >>> 0).toString(36)}:settings:v1`;
}

function readPersistedGraphSettings(rootPath: string) {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(graphSettingsKey(rootPath));
    if (!raw) return DEFAULT_SETTINGS;
    return validatePersistedSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function validatePersistedSettings(value: unknown): PersistedGraphSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_SETTINGS;
  }
  const candidate = value as Partial<PersistedGraphSettings>;
  const visibility = candidate.visibility;
  return {
    charge: validNumber(candidate.charge, -1200, -100, DEFAULT_SETTINGS.charge),
    edgeOpacity: validNumber(candidate.edgeOpacity, 0.1, 1, DEFAULT_SETTINGS.edgeOpacity),
    hideOrphans:
      typeof candidate.hideOrphans === 'boolean'
        ? candidate.hideOrphans
        : DEFAULT_SETTINGS.hideOrphans,
    labelThreshold: validNumber(
      candidate.labelThreshold,
      0.2,
      2,
      DEFAULT_SETTINGS.labelThreshold,
    ),
    linkDistance: validNumber(
      candidate.linkDistance,
      30,
      180,
      DEFAULT_SETTINGS.linkDistance,
    ),
    nodeScale: validNumber(candidate.nodeScale, 0.5, 2, DEFAULT_SETTINGS.nodeScale),
    showArrows: typeof candidate.showArrows === 'boolean' ? candidate.showArrows : true,
    visibility: {
      unresolved: typeof visibility?.unresolved === 'boolean' ? visibility.unresolved : true,
      daily: typeof visibility?.daily === 'boolean' ? visibility.daily : true,
      note: typeof visibility?.note === 'boolean' ? visibility.note : true,
      property: typeof visibility?.property === 'boolean' ? visibility.property : false,
      tag: typeof visibility?.tag === 'boolean' ? visibility.tag : true,
      weekly: typeof visibility?.weekly === 'boolean' ? visibility.weekly : true,
    },
  };
}

function validNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}
