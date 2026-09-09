---
owner: refinex
updated: 2026-06-20
status: deprecated
referenced_by: docs/README.md
---
# 用 markora 内置目录替换自研 TOC

**日期：** 2026-06-20
**状态：** 已确认，待实施

## 背景

Refinex Wiki 当前的文档目录由两套耦合的自研机制构成：

1. 编辑器层 `components/editor/markdown-editor.tsx` 以 `toc: { enabled: false, onTocChange }` 接收 markora 推送的 `MarkoraTocItem[]`，在组件内维护 `tocItems` / `activeTocId`，并通过 `useEffect` 把 `DocumentTocSnapshot`（含 `items` / `activeContentId` / `scrollToHeading`）经 `onTocSnapshotChange` prop 外抛。映射逻辑位于 `components/editor/markdown-toc.ts`（`buildTocSnapshot` 过滤 H1、把 level clamp 到 [1,3]；`scrollToHeadingIn` 做外层容器滚动定位）。
2. 工作区层 `components/workspace/workspace-layout.tsx` 维护 `tocSnapshotsByPath`（按文档路径分桶存储快照），右上角目录图标 `toc-panel-icon-button`（`ai-side-panel.tsx`）切换 `rightPanelMode === 'toc'`，在独立右侧 `<aside>` 面板（固定 340px）渲染 `components/workspace/document-toc-panel.tsx`。

markora 1.1.0（已升级，见 commit `6aeefbc`）提供了内置目录能力（`packages/markora/src/editor/table-of-contents/*`）：开启 `toc.enabled` 后，`TocViewPlugin` 直接 `view.dom.appendChild(panel)` 渲染一个 `position: absolute` 浮层，浮在 `.cm-markora` 编辑器容器右侧，自带折叠/展开按钮、可拖拽宽度，状态按 `storageKey` 持久化到 `localStorage`，并按滚动位置实时计算 active 项。这正是 playground（`/Users/refinex/develop/project/markora/playground/react-playground`）与官方文档（`docs/guides/react-integration.md` §7）推荐的接入方式：`toc: { enabled, storageKey }`。

本次目标是用内置目录**全面替换**自研 TOC，让目录与文档天然同处一个面板（贴近 playground 体验），并彻底删除自研 TOC 设施。

## 目标与非目标

**目标：**

1. 启用 markora 内置目录：`toc: { enabled: true, storageKey: 'refinex-wiki:toc' }`，目录默认展开。
2. 调整编辑器布局，使内置 TOC 浮层始终贴编辑器卡片右侧（而非粘在限宽内容右缘）——即 `.cm-markora` 撑满卡片宽度，限宽只作用在内容滚动区。
3. 移除右上角目录入口（`toc-panel-icon-button`）与 `RightPanelMode` 的 `'toc'` 取值；右侧面板只保留 AI / 元信息两类。
4. 删除全部自研 TOC 代码：`markdown-toc.ts`、`document-toc-panel.tsx`、`markdown-editor.tsx` 中的 TOC 状态与外抛逻辑、`workspace-layout.tsx` 中的 `tocSnapshotsByPath` 与 `onTocSnapshotChange` prop 链。
5. 同步更新受影响测试。

**非目标（本期不做）：**

- 不自定义内置 TOC 的主题/CSS（沿用 markora 默认样式）。
- 不改 AI / 元信息面板的行为。
- 不改 markora 包本身。
- 不保留任何自研 TOC 的过渡兼容层（按用户决策 A：全部删除）。`rightPanelMode` 为纯内存 `useState(null)`，无持久化，故无需兼容老存档。

## 整体架构（改动后）

```
编辑器卡片 workspace-editor-block
└─ 主体行（flex）
   └─ 编辑器列 flex-1 overflow-hidden
      └─ MarkdownEditor
         ├─ FrontmatterPanel（固定块，不随正文滚动）
         └─ CodeMirror / .cm-markora（w-full h-full，右缘 = 卡片右缘）
            ├─ .cm-scroller（限宽模式：内容 max-width + 居中）
            └─ .cm-markora-toc（内置浮层，absolute 贴 .cm-markora 右缘 = 卡片右侧）
```

**关键决策：**

- `.cm-markora` 撑满编辑器列 → 内置 TOC 浮层贴卡片右侧。
- 限宽从"限 `.cm-markora` + 外层居中"下沉到"`.cm-scroller` 内容区限宽 + 居中"。
- 外层 `.workspace-editor-scrollarea` 的滚动职责移交 CodeMirror 自身 scroller，消除双滚动条；"回到顶部"按钮改由 CodeMirror `scrollDOM` 驱动。
- TOC 折叠/展开/宽度由 markora 按 `storageKey` 持久化，移除 per-path `tocSnapshotsByPath`。
- 分屏多 group 时每个编辑器实例各自挂内置 TOC，共享同一 `storageKey`（展开/宽度一致）；切文档后 active 按滚动位置实时重算，无功能损失。

## 组件改动细节

### `components/editor/markdown-editor.tsx`（核心改造）

**Props：** 删除 `onTocSnapshotChange`。

**删除的状态/逻辑：** `tocItems`、`activeTocId`、`handleTocChange`、外抛 snapshot 的 `useEffect`；移除 import `MarkoraTocItem`、`buildTocSnapshot`、`scrollToHeadingIn`、`DocumentTocSnapshot`。

**`markora({...})` 配置：**

```ts
toc: {
  enabled: true,
  storageKey: 'refinex-wiki:toc',
  // minLevel/maxLevel 沿用内置默认（2-6），不沿用旧 clamp 到 3 的行为
},
```

替换原 `toc: { enabled: false, onTocChange: handleTocChange }`。

**布局重构：** 当前外层为 `<div overflow-auto ref=scrollContainer onScroll>` > `<div mx-auto max-w-* pl-10>` > `<CodeMirror>`。改为：

```tsx
<div className="relative flex h-full min-h-0 flex-col" ...key/onKeyDown...>
  {frontmatterView.hasFrontmatter ? <FrontmatterPanel .../> : null}
  <CodeMirror
    className="h-full w-full"      // .cm-markora 撑满
    height="100%"
    extensions={[...extensions, pageWidthExtensions]}
    ...
  />
  {backToTop 按钮}
</div>
```

`STANDARD_PAGE_WIDTH` 常量保留（`'64rem'`）。`maxWidthClass`、`mx-auto`、`pl-10 lg:pl-16` 等外层限宽/居中/内边距类移除。

**`pageWidthExtensions` 改造**（限宽下沉到内容区、`.cm-markora` 不限宽）：

```ts
const pageWidthExtensions = React.useMemo<Extension[]>(() => {
  if (pageWidthMode === 'wide') return [];           // 宽屏不限宽
  return [
    EditorView.theme({
      '&.cm-markora .cm-scroller > .cm-content': {   // 选择器以 CM6 实际 DOM 验证为准
        maxWidth: STANDARD_PAGE_WIDTH,
        marginInline: 'auto',
      },
    }),
  ];
}, [pageWidthMode]);
```

原则锁定：限宽作用于内容区、`.cm-markora` 撑满不限宽。具体选择器在实现时按 CodeMirror 6 实际 DOM 验证；同时需移除原 `.cm-scroller { overflow: visible !important }` hack（该 hack 是为外层滚动服务，下沉后由 CodeMirror 自身滚动）。

**FrontmatterPanel 定位：** 作为 CodeMirror 上方不随正文滚动的固定块（用户决策 a），置于外层 `flex-col` 内、CodeMirror 之上。

**"回到顶部"按钮：** 改为读取 `editorRef.current?.view?.scrollDOM`，对其 `scrollTo({ top: 0, behavior: 'smooth' })`；可见性监听改为绑定到 CodeMirror `scrollDOM`（经 `EditorView.domEventHandlers({ scroll })` 或 view plugin），替换原 `scrollContainerRef` + 外层 `onScroll`。

### `components/workspace/workspace-types.ts`

```ts
export type RightPanelMode = 'ai' | 'meta' | null;   // 移除 'toc'
```

### `components/workspace/use-workspace.ts`

`rightPanelMode` 为纯内存 `useState<RightPanelMode>(null)`，无持久化，无需兼容归一化；仅因类型收窄而受益，无代码改动。

### `components/workspace/ai-side-panel.tsx`

- `RightToolRail`：删除 `toc-panel-icon-button`（ListTree 按钮整块）与 `ListTree` import。
- `RightSidePanel`：删除 `mode === 'toc'` 分支，只保留 `ai` / `meta`。
- `getRightPanelTestId`：删除 `case 'toc'`。
- `RightSidePanelProps`：移除 `tocSnapshot` 字段。

### `components/workspace/workspace-layout.tsx`

- 删除 `tocSnapshotsByPath` state（约 `:223-224`）、`tocSnapshot` 派生（约 `:258-259`）、`handleTocSnapshotChange`（约 `:520-527`）。
- 删除 `onTocSnapshotChange` prop 链：`DocumentEditorSurface` → `DocumentEditorGroup` → `MarkdownEditor` 整条透传（约 `:1457, 1792, 1819-1821, 1901, 1925, 1940-1943, 2014, 2027, 2036-2038, 2045-2048, 2059`）。
- `RightSidePanel` 调用处（约 `:1505-1514`）移除 `tocSnapshot` prop。

## 整文件删除

| 文件 | 原因 |
| --- | --- |
| `components/editor/markdown-toc.ts` | `buildTocSnapshot` / `scrollToHeadingIn` / `DocumentTocSnapshot` / `DocumentTocItem` 全部不再使用 |
| `components/workspace/document-toc-panel.tsx` | 自研面板，被内置 TOC 取代 |
| `components/workspace/__tests__/document-toc-panel.test.tsx` | 测试目标已删除 |

## 测试改动

- **`components/editor/__tests__/markdown-editor.test.tsx`**：删除依赖 `markoraMock.mock.calls` 断言 `onTocSnapshotChange` 回调的用例（约 `:244-280`），保留其余用例。
- **`components/workspace/__tests__/workspace-layout.test.tsx`**：删除 toc 相关用例——`document-toc-panel` testid 断言、`toc-panel-icon-button` 断言（约 `:1233-1236`）、toc snapshot 渲染用例（约 `:1473+`）、split 后 toc（约 `:705`）、switch ai/doc toc（约 `:1151`）、toc 面板宽度（约 `:2079`）。逐条核对，保留非 toc 用例。

## 验证

- `pnpm test:run`（聚焦 `markdown-editor` / `workspace-layout` 后全量）。
- `pnpm lint`、`pnpm build`（Web）确认布局改造无回归。
- 手动：宽屏 / 限宽两种 `pageWidthMode` 下确认 TOC 贴卡片右侧、内容居中、无双滚动条；折叠/展开/拖拽宽度持久化生效；分屏两 group 各自 TOC 正常。

## 风险与回滚

- **风险**：限宽选择器与 CodeMirror 6 实际 DOM 不符导致限宽失效或错位——实现时以真实 DOM 验证选择器为准。
- **风险**：移除外层滚动后，frontmatter 与 CodeMirror 在 `flex-col` 内的高度分配需确认不产生溢出。
- **回滚**：本次为纯前端改动，回滚即 `git revert`；`@refinex/markora@1.1.0` 不受影响。
