'use client';
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  parseFrontmatter,
  serializeFrontmatter,
  type MetadataValue,
} from '@/components/editor/markdown-frontmatter';
import { patchFrontmatterSource } from '@/components/editor/markdown-frontmatter-source';
import {
  createWorkspaceDocumentFromContent,
  readMarkdownDocument,
} from './workspace-api';
import type { WorkspaceKnowledge } from './use-workspace-knowledge';
import type { WorkspaceNode } from './workspace-types';

export const BUILTIN_NOTE_TEMPLATES = [
  { id: 'blank', name: '空白笔记', content: '# {{title}}\n\n' },
  {
    id: 'meeting',
    name: '会议记录',
    content:
      '---\nstatus: draft\ntags: [meeting]\n---\n# {{title}}\n\n日期：{{date}}\n\n## 议题\n\n## 结论\n\n## 待办\n\n- [ ] 整理会议结论\n',
  },
  {
    id: 'project',
    name: '项目笔记',
    content:
      '---\nstatus: active\ntags: [project]\n---\n# {{title}}\n\n## 目标\n\n## 范围\n\n## 决策\n\n## 下一步\n\n- [ ] 明确验收标准\n',
  },
  {
    id: 'research',
    name: '研究记录',
    content:
      '---\nstatus: researching\ntags: [research]\n---\n# {{title}}\n\n## 问题\n\n## 原文证据\n\n## 推断\n\n## 待核实\n\n- [ ] 核对关键来源\n',
  },
  {
    id: 'reading',
    name: '阅读笔记',
    content:
      '---\nstatus: reading\ntags: [reading]\n---\n# {{title}}\n\n日期：{{date}}\n\n## 摘录\n\n## 理解\n\n## 应用\n\n',
  },
];

export function instantiateNoteTemplate(
  template: string,
  title: string,
  now = new Date(),
) {
  const variables: Record<string, string> = {
    title,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
  const expand = (value: string) =>
    value.replace(/\\?\{\{(title|date|time)\}\}/g, (match, key: string) =>
      match.startsWith('\\') ? match.slice(1) : variables[key],
    );
  const transform = (value: MetadataValue): MetadataValue =>
    typeof value === 'string'
      ? expand(value)
      : Array.isArray(value)
        ? value.map(transform)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value).map(([key, value]) => [
                key,
                transform(value),
              ]),
            )
          : value;
  const parsed = parseFrontmatter(template);
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  const properties = Object.fromEntries(
    Object.entries(parsed.properties).map(([key, value]) => [
      key,
      transform(value),
    ]),
  );
  const metadata: Record<string, string | number> = {
    ...Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      ]),
    ),
    title,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    refinexDialect: 1,
  };
  let source = parsed.source;
  if (source) {
    // Preserve source spelling for fields without variables; explicit changes use typed values. author: refinex
    const updated: Record<string, MetadataValue> = {
      ...properties,
      title,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      refinexDialect: 1,
    };
    if (Object.hasOwn(properties, 'markuneTemplate'))
      updated.markuneTemplate = false;
    const block = patchFrontmatterSource(source, updated);
    source = {
      ...source,
      block,
      properties: updated,
      values: Object.fromEntries(
        Object.entries(updated).map(([key, value]) => [
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value),
        ]),
      ),
    };
    return (
      source.opening +
      block +
      (source.closing.endsWith('\n')
        ? source.closing
        : source.closing + source.eol) +
      source.separator +
      expand(parsed.body)
    );
  }
  return serializeFrontmatter({ body: expand(parsed.body), metadata });
}

export function WorkspaceTemplateDialog({
  rootPath,
  parentPath = '',
  knowledge,
  open,
  onOpenChange,
  onCreated,
}: {
  rootPath: string;
  parentPath?: string;
  knowledge: WorkspaceKnowledge;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (node: WorkspaceNode) => Promise<void> | void;
}) {
  const [selection, setSelection] = React.useState('blank');
  const [title, setTitle] = React.useState('新笔记');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const templates = knowledge.documents.filter(
    (document) =>
      /^(Templates|模板)\//i.test(document.relativePath) ||
      document.properties.markuneTemplate === true,
  );
  async function create() {
    if (!title.trim()) {
      setError('请输入笔记名称');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const builtin = BUILTIN_NOTE_TEMPLATES.find(
        (template) => template.id === selection,
      );
      const templatePath = builtin ? undefined : `${rootPath}/${selection}`;
      const raw =
        builtin?.content ??
        (await readMarkdownDocument(rootPath, templatePath!)).content;
      const content = instantiateNoteTemplate(raw, title.trim());
      const created = await createWorkspaceDocumentFromContent(
        rootPath,
        parentPath,
        title.trim(),
        content,
        templatePath,
      );
      onOpenChange(false);
      await knowledge.refresh();
      await onCreated(created.node);
    } catch (error) {
      setError(String(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!saving) onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>从模板新建笔记</DialogTitle>
          <DialogDescription>
            创建到 {parentPath || '工作区根目录'}。支持内置模板，以及
            Templates/、模板/ 或标记 markuneTemplate 的笔记。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-xs">
          <span>模板</span>
          <Select value={selection} onValueChange={setSelection}>
            <SelectTrigger
              aria-label="笔记模板"
              className="h-9 w-full bg-background"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100]" position="popper">
              <SelectGroup>
                <SelectLabel>内置模板</SelectLabel>
                {BUILTIN_NOTE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              {templates.length ? (
                <SelectGroup>
                  <SelectLabel>工作区模板</SelectLabel>
                  {templates.map((template) => (
                    <SelectItem
                      key={template.relativePath}
                      value={template.relativePath}
                    >
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <label className="space-y-1 text-xs">
          <span>笔记名称</span>
          <input
            aria-label="新笔记名称"
            className="h-9 w-full rounded-md border bg-background px-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          变量：{'{{title}}'}、{'{{date}}'}、{'{{time}}'}。
        </p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saving}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          onClick={() => void create()}
        >
          {saving ? '正在创建…' : '创建笔记'}
        </button>
      </DialogContent>
    </Dialog>
  );
}
