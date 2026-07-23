# 内置目录替换自研 TOC 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 markora 1.1.0 内置目录面板替换自研 TOC，使目录与文档同处一个面板（贴近 playground 体验），TOC 贴编辑器卡片右侧，并删除全部自研 TOC 设施。

**Architecture:** 编辑器 `.cm-markora` 撑满卡片宽度，限宽下沉到 `.cm-scroller` 内容区并居中，内置 TOC 浮层 `position:absolute` 锚定 `.cm-markora` 右缘即卡片右侧；TOC 折叠/展开/宽度由 markora 按 `storageKey` 持久化。右侧面板移除 `'toc'` 模式，只保留 AI / 元信息。

**Tech Stack:** Next.js App Router、React、TypeScript、`@refinex/markora@1.1.0`、CodeMirror 6、Vitest + @testing-library/react。

**关联 spec:** `docs/superpowers/specs/2026-06-20-builtin-toc-design.md`

**注意：** 本计划涉及多文件改动。按 Task 顺序执行，每个 Task 结束前运行该 Task 的验证命令；任意验证失败应停下排查，不要带错推进。行号引用会随改动漂移，按"唯一文本锚点"定位（代码块已给出）。

---

## File Structure

| 文件 | 职责 | 操作 |
| --- | --- | --- |
| `components/editor/markdown-editor.tsx` | 编辑器组件：启用内置 toc、布局重构、删除自研 TOC 状态 | 修改 |
| `components/workspace/workspace-types.ts` | `RightPanelMode` 类型 | 修改（移除 `'toc'`） |
| `components/workspace/ai-side-panel.tsx` | 右侧面板与工具栏 | 修改（删 toc 入口与分支） |
| `components/workspace/workspace-layout.tsx` | 工作区布局 | 修改（删 tocSnapshotsByPath 与 prop 链） |
| `components/editor/markdown-toc.ts` | 自研 TOC 映射/滚动 | **删除** |
| `components/workspace/document-toc-panel.tsx` | 自研右侧目录面板 | **删除** |
| `components/workspace/__tests__/document-toc-panel.test.tsx` | 面板测试 | **删除** |
| `components/editor/__tests__/markdown-editor.test.tsx` | 编辑器测试 | 修改（删 toc 用例、改 mock） |
| `components/workspace/__tests__/workspace-layout.test.tsx` | 布局测试 | 修改（删 toc 用例、改 mock） |

---

## Task 1：清理编辑器测试中的自研 TOC 用例与 mock

先改测试，锁定"删除自研 TOC 接口"的契约，再动实现。本 Task 只处理 `markdown-editor.test.tsx`。

**Files:**
- Modify: `components/editor/__tests__/markdown-editor.test.tsx`

- [ ] **Step 1：删除"点击 TOC 跳转时立即更新 activeContentId"用例**

在 `components/editor/__tests__/markdown-editor.test.tsx` 中，删除从 `it('点击 TOC 跳转时立即更新 activeContentId', async () => {`（约 `:237`）到其对应闭合 `});`（约 `:290`）的**整个** `it` 块。该块依赖 `markoraConfig.toc.onTocChange` 与 `latestSnapshot.scrollToHeading`，均属待删接口。

删除后，文件内不应再出现 `onTocSnapshotChange`、`activeContentId`、`onTocChange`。

- [ ] **Step 2：确认"standard 页宽"用例仍通过 markora extensions 传参**

不要改动 `it('standard 页宽模式通过 markora extension 避免内层滚动条', ...)`（约 `:220-235`）。它只断言 `markoraMock` 被调用时含 `extensions`，与 TOC 无关，保留。后续 Task 2 会扩展该断言以校验 `toc.enabled: true`。

- [ ] **Step 3：运行测试，确认删除后文件可编译且用例数减少**

Run: `pnpm test:run -- components/editor/__tests__/markdown-editor.test.tsx`
Expected: 全部通过；用例数比改动前少 1（删掉了 TOC 跳转用例）。若出现 `onTocSnapshotChange` 未定义之类的编译错误，说明误删了别的内容，回滚该步重做。

- [ ] **Step 4：Commit**

```bash
git add components/editor/__tests__/markdown-editor.test.tsx
git commit -m "test(editor): 移除 markdown-editor 的自研 TOC 跳转用例"
```

---

## Task 2：改造 `markdown-editor.tsx` 启用内置 TOC 并重构布局

本 Task 是核心。按子步骤推进，每步都是可独立编译的小改动。

**Files:**
- Modify: `components/editor/markdown-editor.tsx`

- [ ] **Step 1：移除自研 TOC 的 import 与 props**

删除以下 import（`markdown-editor.tsx` 顶部）：
```ts
import {
  buildTocSnapshot,
  scrollToHeadingIn,
  type DocumentTocSnapshot,
} from '@/components/editor/markdown-toc';
```
以及 import 列表里的 `type MarkoraTocItem`（从 `'@refinex/markora/editor'` 的解构中移除该项，保留 `markora`、`ThemeEnum`）。

从 `MarkdownEditorProps` 接口删除：
```ts
  onTocSnapshotChange?: (snapshot: DocumentTocSnapshot) => void;
```
从 `MarkdownEditor` 函数解构参数中删除 `onTocSnapshotChange`。

- [ ] **Step 2：删除自研 TOC 状态与外抛逻辑**

删除：
- state `tocItems`、`activeTocId`（含其 `useState` 声明，约 `const [tocItems, setTocItems] = React.useState<MarkoraTocItem[]>([]);` 与 `const [activeTocId, setActiveTocId] = React.useState<string | null>(null);`）
- `handleTocChange` 的整个 `useCallback`
- 外抛 snapshot 的整个 `useEffect`（以 `React.useEffect(() => { if (!onTocSnapshotChange)` 开头那个）

注意：`scrollContainerRef`、`backToTopVisible`、`setBackToTopVisible` 暂时保留——Step 5 会改写它们。

- [ ] **Step 3：改 `markora({...})` 配置启用内置 toc**

把：
```ts
        toc: {
          // 不渲染 markora 内置 TOC 面板，但 onTocChange 仍会触发。
          // handleTocChange 会同步 TOC 列表与当前 active id。
          enabled: false,
          onTocChange: handleTocChange,
        },
```
替换为：
```ts
        toc: {
          enabled: true,
          storageKey: 'refinex-wiki:toc',
        },
```

同步更新其上方 `useMemo` 的依赖数组：把 `[handleTocChange, markoraTheme, pageWidthExtensions, uploader]` 改为 `[markoraTheme, pageWidthExtensions, uploader]`（移除已删除的 `handleTocChange`）。

- [ ] **Step 4：下沉限宽到 `.cm-scroller`，让 `.cm-markora` 撑满**

把 `pageWidthExtensions` 的整个 `useMemo` 替换为：
```ts
  const pageWidthExtensions = React.useMemo<Extension[]>(() => {
    if (pageWidthMode === 'wide') {
      return [];
    }

    return [
      EditorView.theme({
        // 限宽下沉到内容区并居中；.cm-markora 撑满，内置 TOC 浮层贴卡片右侧。
        '&.cm-markora .cm-content': {
          maxWidth: STANDARD_PAGE_WIDTH,
          width: '100%',
          marginInline: 'auto',
        },
      }),
    ];
  }, [pageWidthMode]);
```
（移除原 `.cm-scroller { overflow: visible !important }` 与 `EditorView.contentAttributes`——它们是为外层滚动服务，下沉后由 CodeMirror 自身滚动。）

- [ ] **Step 5：重构编辑器外壳布局**

定位 `return (` 之后的 JSX。当前结构（以唯一锚点 `workspace-editor-page-${pageWidthMode}` 为准）：
```tsx
  return (
    <WorkspaceAssetProvider ...>
      <div
        className={`workspace-editor-page-${pageWidthMode} relative flex h-full min-h-0 flex-col`}
        data-page-width-mode={pageWidthMode}
        data-testid="markdown-editor-root"
        key={documentKey}
        onKeyDown={...}
      >
        <div
          className="workspace-editor-scrollarea workspace-editor-scrollarea min-h-0 flex-1 overflow-auto"
          ref={scrollContainerRef}
          onScroll={(event) =>
            setBackToTopVisible(event.currentTarget.scrollTop > 240)
          }
        >
          <div
            className={`mx-auto w-full ${maxWidthClass} pl-10 pr-0 pt-0 pb-0 lg:pl-16`}
          >
            {frontmatterView.hasFrontmatter ? (
              <FrontmatterPanel entries={frontmatterView.entries} />
            ) : null}
            <CodeMirror
              ref={editorRef}
              value={frontmatterView.body}
              theme={cmTheme}
              extensions={extensions}
              basicSetup={false}
              onChange={handleMarkdownChange}
            />
          </div>
        </div>

        {backToTopVisible ? ( <button ...回到顶部.../> ) : null}
      </div>
    </WorkspaceAssetProvider>
  );
```

替换为（关键：去掉外层限宽/居中/内边距与双滚动；frontmatter 作为固定块置于 CodeMirror 之上；CodeMirror `h-full w-full`）：
```tsx
  return (
    <WorkspaceAssetProvider
      mode="workspace"
      rootPath={workspaceRootPath ?? null}
    >
      <div
        className={`workspace-editor-page-${pageWidthMode} relative flex h-full min-h-0 flex-col`}
        data-page-width-mode={pageWidthMode}
        data-testid="markdown-editor-root"
        key={documentKey}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === 's'
          ) {
            event.preventDefault();
            onSaveRequested?.();
          }
        }}
      >
        {frontmatterView.hasFrontmatter ? (
          <FrontmatterPanel entries={frontmatterView.entries} />
        ) : null}
        <CodeMirror
          className="h-full w-full"
          height="100%"
          ref={editorRef}
          value={frontmatterView.body}
          theme={cmTheme}
          extensions={extensions}
          basicSetup={false}
          onChange={handleMarkdownChange}
        />

        {backToTopVisible ? (
          <button
            aria-label="回到顶部"
            className="absolute right-4 bottom-4 z-40 flex size-8 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
            type="button"
            onClick={() => {
              const scroller =
                editorRef.current?.view?.scrollDOM ?? null;
              if (scroller) {
                scroller.scrollTo({ behavior: 'smooth', top: 0 });
                setBackToTopVisible(false);
              }
            }}
          >
            <ArrowUp size={15} />
          </button>
        ) : null}
      </div>
    </WorkspaceAssetProvider>
  );
```

- [ ] **Step 6：把"回到顶部"的可见性监听从外层 DOM 改为 CodeMirror scrollDOM**

`scrollContainerRef`（`React.useRef<HTMLDivElement | null>(null)`）已不再被 JSX 引用。删除 `scrollContainerRef` 声明，并把滚动监听改为基于 editor view 的 effect：
```ts
  React.useEffect(() => {
    const view = editorRef.current?.view;
    const scroller = view?.scrollDOM;
    if (!scroller) {
      return;
    }

    const handleScroll = () => {
      setBackToTopVisible(scroller.scrollTop > 240);
    };
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, []);
```
放在已有 hooks 附近（`handleMarkdownChange` 之后即可）。

注意：CodeMirror 的 scrollDOM 在 `ref` 首次挂载后存在；若空依赖 effect 抓不到 view（react-codemirror 首渲染时机），改为对 `editorRef` 不做依赖但在内部 `requestAnimationFrame` 兜底重试一次即可。实现时若空依赖版本能稳定拿到（多数情况可以），保持空依赖最简。

- [ ] **Step 7：清理不再使用的派生变量**

`maxWidthClass`（`const maxWidthClass = pageWidthMode === 'wide' ? 'max-w-[88rem]' : 'max-w-[64rem]';`）已不再被 JSX 引用，删除该声明。确认 `pageWidthMode` 仍被 `workspace-editor-page-${pageWidthMode}`、`data-page-width-mode`、`pageWidthExtensions` 使用，保留它。

- [ ] **Step 8：类型检查与聚焦测试**

Run: `npx tsc --noEmit 2>&1 | grep -i "markdown-editor" ; echo done`
Expected: 无 `markdown-editor.tsx` 相关错误（其它既有错误，如 AI runtime 测试类型问题，不在本 Task 范围，忽略）。

Run: `pnpm test:run -- components/editor/__tests__/markdown-editor.test.tsx`
Expected: 全部通过。

- [ ] **Step 9：Commit**

```bash
git add components/editor/markdown-editor.tsx
git commit -m "feat(editor): 启用 markora 内置目录并重构限宽布局

- toc.enabled 开启内置目录面板,storageKey 持久化
- .cm-markora 撑满卡片,限宽下沉到 .cm-content 并居中
- 删除自研 TOC 状态/外抛逻辑,回到顶部改用 CodeMirror scrollDOM"
```

---

## Task 3：删除自研 TOC 源文件

`markdown-toc.ts`、`document-toc-panel.tsx` 及其测试在 Task 2 之后已无引用（`markdown-editor.tsx` 不再 import `markdown-toc`）。但 `document-toc-panel.tsx` 仍被 `ai-side-panel.tsx` 引用——Task 4 会移除该引用。为避免中间态编译错误，本 Task 在 Task 4 之前执行，但需先确认引用面。

**Files:**
- Delete: `components/editor/markdown-toc.ts`
- Delete: `components/workspace/document-toc-panel.tsx`
- Delete: `components/workspace/__tests__/document-toc-panel.test.tsx`

- [ ] **Step 1：确认 `markdown-toc.ts` 已无生产引用**

Run: `grep -rn "components/editor/markdown-toc" components app 2>/dev/null`
Expected: 无输出（Task 2 已移除 `markdown-editor.tsx` 的 import）。若仍有命中，说明 Task 2 Step 1 未完成，先回去补。

- [ ] **Step 2：删除三个文件**

```bash
rm components/editor/markdown-toc.ts
rm components/workspace/document-toc-panel.tsx
rm components/workspace/__tests__/document-toc-panel.test.tsx
```

- [ ] **Step 3：此时不要单独验证——文件 `ai-side-panel.tsx` 仍 import 已删的 `DocumentTocPanel`，会编译失败。直接进入 Task 4 修复，Task 4 结束统一验证。**

- [ ] **Step 4：Commit（与 Task 4 合并提交，避免提交编译失败中间态）**

本 Task 不单独 commit；改动留到 Task 4 Step 末尾一并提交。

---

## Task 4：从 `ai-side-panel.tsx` 与 `workspace-types.ts` 移除 `'toc'` 模式

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/ai-side-panel.tsx`

- [ ] **Step 1：收窄 `RightPanelMode` 类型**

`components/workspace/workspace-types.ts`：
```ts
export type RightPanelMode = 'ai' | 'toc' | 'meta' | null;
```
改为：
```ts
export type RightPanelMode = 'ai' | 'meta' | null;
```

- [ ] **Step 2：删除 `ai-side-panel.tsx` 对 `DocumentTocPanel` 的 import 与引用**

删除：
```ts
import { DocumentTocPanel } from './document-toc-panel';
```
从 `import { Info, ListTree, Palette, Settings } from 'lucide-react';` 中移除 `ListTree`（改为 `import { Info, Palette, Settings } from 'lucide-react';`）。

- [ ] **Step 3：从 `RightSidePanelProps` 移除 `tocSnapshot`**

删除接口中的：
```ts
  tocSnapshot: DocumentTocSnapshot | null;
```
同时删除 `RightSidePanel` 解构里的 `tocSnapshot,`。删除文件顶部 `import type { DocumentTocSnapshot } from '@/components/editor/markdown-toc';`（该 import 仅服务于此字段）。

- [ ] **Step 4：删除 `RightSidePanel` 的 `mode === 'toc'` 分支**

把：
```tsx
      {mode === 'ai' ? (
        <AiPanelContent ... />
      ) : mode === 'toc' ? (
        <DocumentTocPanel
          currentDocument={currentDocument}
          snapshot={tocSnapshot}
        />
      ) : (
        <DocumentMetaPanel ... />
      )}
```
改为：
```tsx
      {mode === 'ai' ? (
        <AiPanelContent ... />
      ) : (
        <DocumentMetaPanel ... />
      )}
```

- [ ] **Step 5：删除 `getRightPanelTestId` 的 `case 'toc'`**

```ts
  switch (mode) {
    case 'ai':
      return 'ai-panel-island';
    case 'toc':
      return 'document-toc-panel';
    case 'meta':
      return 'document-meta-panel';
  }
```
删除 `case 'toc'` 两行。

- [ ] **Step 6：删除 `RightToolRail` 的目录图标按钮**

删除整个：
```tsx
      <button
        aria-label={mode === 'toc' ? '折叠目录面板' : '展开目录面板'}
        className={rightToolButtonClassName(mode === 'toc')}
        data-testid="toc-panel-icon-button"
        type="button"
        onClick={() => onModeChange(nextMode('toc'))}
      >
        <ListTree size={17} />
      </button>
```

- [ ] **Step 7：类型检查**

Run: `npx tsc --noEmit 2>&1 | grep -E "ai-side-panel|workspace-types|workspace-layout" ; echo done`
Expected: 无上述三个文件的错误。`workspace-layout.tsx` 此时仍传 `tocSnapshot` prop，会报错——该报错在 Task 5 修复，本步可接受。若 `ai-side-panel.tsx`/`workspace-types.tsx` 自身有错，必须修掉。

Run: `pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx`
Expected: 此时**会失败**（mock 与 layout 仍引用 toc 相关）。本步只确认失败限于 toc 相关，不展开修——Task 5、6 会修。如果出现非 toc 相关的编译/运行错误，需排查。

- [ ] **Step 8：Commit（含 Task 3 的文件删除）**

```bash
git add components/editor/markdown-toc.ts \
        components/workspace/document-toc-panel.tsx \
        components/workspace/__tests__/document-toc-panel.test.tsx \
        components/workspace/workspace-types.ts \
        components/workspace/ai-side-panel.tsx
git commit -m "refactor(workspace): 移除右侧目录面板入口与 'toc' 模式

- RightPanelMode 收窄为 'ai' | 'meta' | null
- 删除右上角目录图标与 DocumentTocPanel 渲染分支
- 删除自研 markdown-toc.ts / document-toc-panel.tsx 及其测试"
```

---

## Task 5：清理 `workspace-layout.tsx` 的 TOC 状态与 prop 链

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`

- [ ] **Step 1：删除 import 与 state**

删除顶部：
```ts
import type { DocumentTocSnapshot } from '@/components/editor/markdown-toc';
```
删除 state（约文件中部，唯一文本 `tocSnapshotsByPath`）：
```ts
  const [tocSnapshotsByPath, setTocSnapshotsByPath] = React.useState<
    Record<string, DocumentTocSnapshot>
  ...
```
整个 `useState` 块。

删除派生：
```ts
  const tocSnapshot = activePanelDocumentPath
    ? tocSnapshotsByPath[activePanelDocumentPath] ?? null
    : null;
```

删除 `handleTocSnapshotChange` 整个 `useCallback`（唯一文本 `const handleTocSnapshotChange = React.useCallback(`，含其内 `setTocSnapshotsByPath` 调用）。

- [ ] **Step 2：删除 `<DocumentEditorSurface>` 的 `onTocSnapshotChange` prop**

定位 `onTocSnapshotChange={handleTocSnapshotChange}`（在 `<DocumentEditorSurface ...>` 的 props 中，唯一锚点），删除该行。

- [ ] **Step 3：删除 `<RightSidePanel>` 的 `tocSnapshot` prop**

定位：
```tsx
                <RightSidePanel
                  currentDocument={activePanelDocument}
                  documentPanelData={documentPanelData}
                  mode={workspace.rightPanelMode}
                  settingsVersion={settingsVersion}
                  tocSnapshot={tocSnapshot}
                  width={rightPanelWidth}
                  workspaceRootPath={workspaceRootPath}
                  onOpenSettings={() => openSettingsDialog('ai')}
                />
```
删除 `tocSnapshot={tocSnapshot}` 一行。

- [ ] **Step 4：删除 prop 链透传的 `onTocSnapshotChange`**

`DocumentEditorSurface`、内部编辑器 group 组件、`DocumentEditorInstance`（`MarkdownEditor` 的直接包装）这三个组件的 props 接口与解构中，均含 `onTocSnapshotChange`。逐个删除：

(a) `DocumentEditorSurface` 的 props 接口：
```ts
  onTocSnapshotChange: (
    documentPath: string,
    snapshot: DocumentTocSnapshot,
  ) => void;
```
及其函数解构 `onTocSnapshotChange,`。它向 `DocumentEditorGroup`（或内部 group 组件）传 `onTocSnapshotChange={onTocSnapshotChange}` 的那行也删。

(b) group 组件的 props 接口与解构里同样的 `onTocSnapshotChange: (...) => void;` / `onTocSnapshotChange,`，以及它向 `DocumentEditorInstance`（或直接向 `MarkdownEditor`）传 `onTocSnapshotChange={handleTocSnapshotChange}` / `onTocSnapshotChange={onTocSnapshotChange}` 的行。

(c) `DocumentEditorInstance` 内 `handleTocSnapshotChange`（约 `const handleTocSnapshotChange = React.useCallback((snapshot) => onTocSnapshotChange(documentPath, snapshot), [documentPath, onTocSnapshotChange]);`）删除；其 props 接口 `onTocSnapshotChange: (...) => void;` 与解构 `onTocSnapshotChange,` 删除；向 `<MarkdownEditor>` 传 `onTocSnapshotChange={handleTocSnapshotChange}` 的行删除。

定位提示：`grep -n "onTocSnapshotChange\|DocumentTocSnapshot" components/workspace/workspace-layout.tsx` 应全部清除，改完后该命令无输出。

- [ ] **Step 5：类型检查**

Run: `npx tsc --noEmit 2>&1 | grep "workspace-layout" ; echo done`
Expected: 无 `workspace-layout.tsx` 相关错误。若报 `'toc'` 不能赋给 `RightPanelMode`，说明 `use-workspace.ts` 持久化有 `'toc'`——但 spec 已确认它是 `useState(null)` 无持久化，不应出现；如真出现，按 spec 在读取处归一化为 `null`。

Run: `pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx`
Expected: 仍有 toc 用例失败（Task 6 修），仅接受 toc 相关失败。

- [ ] **Step 6：Commit**

```bash
git add components/workspace/workspace-layout.tsx
git commit -m "refactor(workspace): 移除 TOC 快照状态与 prop 透传链

- 删除 tocSnapshotsByPath / handleTocSnapshotChange
- 删除 DocumentEditorSurface→Group→Instance 的 onTocSnapshotChange 链"
```

---

## Task 6：清理 `workspace-layout.test.tsx` 的 TOC 用例与 mock

**Files:**
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

**边界提示**（务必区分，勿误删）：
- **要删/改**：文档目录 TOC 相关——`document-toc-panel`、`toc-panel-icon-button`、`onTocSnapshotChange`、"展开目录面板"/"折叠目录面板"指**右侧面板**目录按钮、`renders toc snapshot`。
- **要保留**：左侧文件树"目录"——"搜索当前目录下的文档"、"选择工作区"、"所在目录"、"新建目录"、"调整左侧目录宽度"、"资源目录"。这些是文件树功能，与 TOC 无关。

- [ ] **Step 1：精简 `MarkdownEditor` mock**

mock（约 `:69-104`）当前为 `({ documentKey, markdown, onTocSnapshotChange, pageWidthMode }) => (<button onClick={() => onTocSnapshotChange?.({...})}>`。改为移除 `onTocSnapshotChange` 与其触发的 toc snapshot：
```tsx
vi.mock('@/components/editor/markdown-editor', () => ({
  MarkdownEditor: ({
    documentKey,
    markdown,
    pageWidthMode,
  }: {
    documentKey?: string;
    markdown?: string;
    pageWidthMode?: string;
  }) => (
    <button
      data-document-key={documentKey}
      data-page-width-mode={pageWidthMode}
      data-markdown={markdown}
      data-testid="markdown-editor"
      type="button"
    />
  ),
}));
```
同时删除文件顶部相关 hoisted 类型 `onTocSnapshotChange?: (snapshot: unknown) => void;`（约 `:78`）。

- [ ] **Step 2：删除 4 个 TOC 专属用例**

逐个删除整个 `it(...)`/`test(...)` 块（从 `it(` 到闭合 `});`）：

(a) `it('switches between ai and document toc from the right tool rail', ...)`（约 `:1151-1173`，含 `展开目录面板`/`折叠目录面板`/`document-toc-panel` 断言）。

(b) `it('renders toc snapshot from the active Plate editor in the right toc panel', ...)`（约 `:1473` 起，含 `展开目录面板`）。注意其闭合大括号可能较长，删整块。

(c) 在 `it('splits a tab into a second editor group', ...)` 之后的子断言块——若该用例内部含 `展开目录面板`/`文档 B 目录` 断言（约 `:729-731` 区域），把这些**子断言行**从该 `it` 内删除，但保留用例其余部分（分屏打开 B 文档、聚焦切换等）。若分屏用例整体只是为测 toc，则整块删除。逐行判断。

(d) 在 `it('resizable ...'` 系列里的右侧面板宽度断言：定位 `expect(screen.getByTestId('document-toc-panel').style.width).toBe('340px');`（约 `:2079`）。删除该断言行；若其所在 `it` 的其余断言（如 `:2088-2089` 折叠/展开目录按钮）也只服务 toc，一并删除；属面板 resize 通用断言则保留并改测 ai/meta 面板（见 Step 3）。

- [ ] **Step 3：处理"右面板激活态样式"用例（约 `:1231-1236`）**

该处 `expect(screen.getByTestId('toc-panel-icon-button').className)` 校验工具栏激活高亮。`toc-panel-icon-button` 已删，用例失效。把校验目标从 toc 按钮改为 ai 按钮（保留"工具栏激活态高亮"这一通用契约）：`expect(screen.getByTestId('ai-panel-icon-button').className).toContain('...')`，并用 `展开 AI 面板` 替代 `展开目录面板` 触发。若改造复杂，可直接删除该断言组（激活高亮由组件 CSS 保证，非核心回归点）。

- [ ] **Step 4：运行测试**

Run: `pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx`
Expected: 全部通过。用例数减少（删了 toc 专属用例）。若仍有 `document-toc-panel`/`toc-panel-icon-button`/`onTocSnapshotChange` 命中，说明 Step 2/3 漏删，`grep -n "document-toc-panel\|toc-panel-icon-button\|onTocSnapshotChange\|展开目录面板\|折叠目录面板" components/workspace/__tests__/workspace-layout.test.tsx` 应无输出（"调整左侧目录宽度"等文件树文案保留）。

- [ ] **Step 5：Commit**

```bash
git add components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "test(workspace): 清理布局测试中的自研 TOC 用例

- MarkdownEditor mock 移除 onTocSnapshotChange
- 删除 toc 面板切换/快照/宽度专属用例,保留左侧文件树目录用例"
```

---

## Task 7：全量验证

**Files:** 无（仅验证）

- [ ] **Step 1：全量测试**

Run: `pnpm test:run`
Expected: 全部通过。对比改动前（239 用例），TOC 专属用例已删，总数下降，无新增失败。

- [ ] **Step 2：Lint**

Run: `pnpm lint`
Expected: 无错误（warning 可接受）。重点关注 `markdown-editor.tsx`、`ai-side-panel.tsx`、`workspace-layout.tsx` 的未使用变量/未使用 import。

- [ ] **Step 3：Web 构建**

Run: `pnpm build`
Expected: 成功。确认布局改造未引入构建期类型/导入错误。

- [ ] **Step 4：grep 全仓无自研 TOC 残留**

Run:
```bash
grep -rn "DocumentTocPanel\|DocumentTocSnapshot\|DocumentTocItem\|buildTocSnapshot\|scrollToHeadingIn\|toc-panel-icon-button\|onTocSnapshotChange\|tocSnapshotsByPath" components app
```
Expected: 无输出（生产代码无残留）。`docs/`、`node_modules/`、`.next/` 中的历史归档命中忽略。

- [ ] **Step 5：手动验证（可选，桌面/web）**

启动 `pnpm dev`，打开一篇含多级标题的文档：
1. 内置 TOC 默认展开，贴编辑器卡片右侧，不粘在限宽内容右缘。
2. 切换"限宽/宽屏"页宽模式：限宽模式下内容居中、TOC 仍贴卡片右侧；无双滚动条。
3. 点击 TOC 项跳转正确；折叠为 42px 窄条后再展开；拖拽宽度后刷新页面，宽度/展开态持久化。
4. 右上角工具栏无目录图标；AI / 元信息面板切换正常。
5. 分屏两个编辑器：各自显示 TOC，互不干扰。

- [ ] **Step 6：最终 commit（若手动验证产生改动）**

若无改动则跳过。若 Task 1-6 均已各自提交，本步通常无需新提交。

---

## Self-Review

**1. Spec coverage**
- 目标1（启用内置 toc）→ Task 2 Step 3 ✓
- 目标2（布局使 TOC 贴卡片右侧）→ Task 2 Step 4/5 ✓
- 目标3（移除右上角入口与 `'toc'` 模式）→ Task 4 ✓
- 目标4（删除自研代码：markdown-toc.ts / document-toc-panel / markdown-editor 状态 / workspace-layout prop 链）→ Task 2/3/5 ✓
- 目标5（测试同步）→ Task 1/6 ✓
- 验证节（pnpm test/lint/build、grep 残留、手动）→ Task 7 ✓

**2. Placeholder scan**：无 TBD/TODO；每步含具体代码或精确 grep/定位锚点；分屏用例的"逐行判断"是必要谨慎（测试块结构需实现时看实际闭合），已给出判断准则而非空泛指令。

**3. Type consistency**：`RightPanelMode` 在 workspace-types（Task 4 Step 1）与所有消费处一致；`tocSnapshot` 在 ai-side-panel（Task 4 Step 3）与 workspace-layout（Task 5 Step 3）双向清除；`onTocSnapshotChange` prop 链在 Task 5 Step 4 逐层清除，命名前后一致。

无问题，计划定稿。
