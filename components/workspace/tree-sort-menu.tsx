'use client';

import { ArrowDownUp } from 'lucide-react';
import * as Dropdown from '@/components/ui/dropdown-menu';
import * as Context from '@/components/ui/context-menu';
import {
  DEFAULT_TREE_SORT,
  getTreeSortPolicy,
  TREE_SORT_OPTIONS,
} from './workspace-tree-sort';
import type { TreeSortPolicy, TreeSortPreferences } from './workspace-types';

export function TreeSortMenu({
  preferences = DEFAULT_TREE_SORT,
  parent = '',
  context = false,
  disabled,
  onChange,
}: {
  preferences?: TreeSortPreferences;
  parent?: string;
  context?: boolean;
  disabled?: boolean;
  onChange: (policy: TreeSortPolicy | null) => void;
}) {
  const Sub = context ? Context.ContextMenuSub : Dropdown.DropdownMenuSub;
  const Trigger = context
    ? Context.ContextMenuSubTrigger
    : Dropdown.DropdownMenuSubTrigger;
  const Content = context
    ? Context.ContextMenuSubContent
    : Dropdown.DropdownMenuSubContent;
  const Group = context
    ? Context.ContextMenuRadioGroup
    : Dropdown.DropdownMenuRadioGroup;
  const Item = context
    ? Context.ContextMenuRadioItem
    : Dropdown.DropdownMenuRadioItem;
  const Check = context
    ? Context.ContextMenuCheckboxItem
    : Dropdown.DropdownMenuCheckboxItem;
  const Separator = context
    ? Context.ContextMenuSeparator
    : Dropdown.DropdownMenuSeparator;
  const policy = getTreeSortPolicy(preferences, parent);
  const inherited = Boolean(parent && !preferences.folders[parent]);
  return (
    <Sub>
      <Trigger disabled={disabled}>
        <ArrowDownUp />
        排序方式
      </Trigger>
      <Content className="w-60">
        <Group
          value={inherited ? 'inherit' : policy.mode}
          onValueChange={(mode) =>
            onChange(
              mode === 'inherit'
                ? null
                : { ...policy, mode: mode as TreeSortPolicy['mode'] },
            )
          }
        >
          {parent && (
            <>
              <Item value="inherit">使用上级排序</Item>
              <Separator />
            </>
          )}
          {TREE_SORT_OPTIONS.map(([value, label], index) => (
            <MenuOption
              key={value}
              separator={index === 1 || index === 3 || index === 5}
              Separator={Separator}
            >
              <Item value={value}>{label}</Item>
            </MenuOption>
          ))}
        </Group>
        <Separator />
        <Check
          checked={policy.foldersFirst}
          disabled={policy.mode === 'manual'}
          onCheckedChange={(foldersFirst) =>
            onChange({ ...policy, foldersFirst })
          }
        >
          文件夹优先
        </Check>
      </Content>
    </Sub>
  );
}

function MenuOption({
  children,
  separator,
  Separator,
}: {
  children: React.ReactNode;
  separator: boolean;
  Separator: React.ComponentType;
}) {
  return (
    <>
      {separator && <Separator />}
      {children}
    </>
  );
}
