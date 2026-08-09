'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

import { localAssetUrlToImageDataUrl } from './workspace-local-assets';
import { WorkspaceTreeFolderIcon } from './workspace-tree-folder-icon';
import {
  loadBuiltinIconRegistry,
  type BuiltinIconData,
} from './tree-icon-registry';
import type {
  TreeNodeAppearance,
  TreeNodeIconColor,
  WorkspaceNode,
} from './workspace-types';

const localIconDataCache = new Map<string, Promise<string | null>>();

export function TrustedTablerIcon({
  className,
  icon,
  label,
  ...props
}: Omit<React.SVGProps<SVGSVGElement>, 'children'> & {
  icon: BuiltinIconData;
  label?: string;
}) {
  const width = icon.width ?? 24;
  const height = icon.height ?? 24;

  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn('shrink-0', className)}
      fill="none"
      role={label ? 'img' : undefined}
      viewBox={`${icon.left ?? 0} ${icon.top ?? 0} ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

export function TreeNodeIconRenderer({
  className,
  expanded,
  node,
  rootPath,
  testId,
}: {
  className?: string;
  expanded: boolean;
  node: WorkspaceNode;
  rootPath: string;
  testId?: string;
}) {
  const appearance = node.appearance;
  const icon = appearance?.icon;
  const colorStyle = treeIconColorStyle(appearance?.color);

  if (!icon) {
    return (
      <WorkspaceTreeFolderIcon
        className={cn('text-muted-foreground', className)}
        data-testid={testId}
        expanded={expanded}
        style={colorStyle}
      />
    );
  }

  if (icon.type === 'emoji') {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-[15px] shrink-0 items-center justify-center text-[14px] leading-none',
          className,
        )}
        data-testid={testId}
      >
        {icon.value}
      </span>
    );
  }

  if (icon.type === 'local') {
    return (
      <LocalTreeNodeIcon
        assetId={icon.assetId}
        className={className}
        expanded={expanded}
        rootPath={rootPath}
        testId={testId}
      />
    );
  }

  return (
    <BuiltinTreeNodeIcon
      className={className}
      colorStyle={colorStyle}
      expanded={expanded}
      name={icon.name}
      testId={testId}
    />
  );
}

function BuiltinTreeNodeIcon({
  className,
  colorStyle,
  expanded,
  name,
  testId,
}: {
  className?: string;
  colorStyle?: React.CSSProperties;
  expanded: boolean;
  name: string;
  testId?: string;
}) {
  const [data, setData] = React.useState<BuiltinIconData | null | undefined>();

  React.useEffect(() => {
    let active = true;
    void loadBuiltinIconRegistry().then((registry) => {
      if (active) {
        setData(registry.get(name)?.data ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [name]);

  if (!data) {
    return (
      <WorkspaceTreeFolderIcon
        className={cn('text-muted-foreground', className)}
        data-testid={testId}
        expanded={expanded}
        style={colorStyle}
      />
    );
  }

  return (
    <TrustedTablerIcon
      className={cn('size-[15px]', className)}
      icon={data}
      {...(testId ? { 'data-testid': testId } : {})}
      style={colorStyle}
    />
  );
}

function LocalTreeNodeIcon({
  assetId,
  className,
  expanded,
  rootPath,
  testId,
}: {
  assetId: string;
  className?: string;
  expanded: boolean;
  rootPath: string;
  testId?: string;
}) {
  const [source, setSource] = React.useState<string | null | undefined>();

  React.useEffect(() => {
    let active = true;
    const cacheKey = `${rootPath}\0${assetId}`;
    const request =
      localIconDataCache.get(cacheKey) ??
      localAssetUrlToImageDataUrl(`madora-asset://${assetId}`, rootPath).catch(
        () => null,
      );
    localIconDataCache.set(cacheKey, request);
    void request.then((value) => {
      if (active) {
        setSource(value);
      }
    });
    return () => {
      active = false;
    };
  }, [assetId, rootPath]);

  if (!source) {
    return (
      <WorkspaceTreeFolderIcon
        className={cn('text-muted-foreground', className)}
        data-testid={testId}
        expanded={expanded}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 本地 Vault 资产通过受限 IPC 解析，不经过 Next Image。
    <img
      alt=""
      aria-hidden="true"
      className={cn('size-[15px] shrink-0 object-contain', className)}
      data-testid={testId}
      src={source}
    />
  );
}

export function treeIconColorStyle(
  color: TreeNodeIconColor | undefined,
): React.CSSProperties | undefined {
  if (!color) {
    return undefined;
  }
  return {
    color:
      color.type === 'custom'
        ? color.value
        : `var(--tree-icon-${color.value})`,
  };
}

export function hasTreeNodeAppearance(
  appearance: TreeNodeAppearance | undefined,
) {
  return Boolean(appearance?.icon || appearance?.color);
}
