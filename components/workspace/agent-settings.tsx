'use client';

import * as React from 'react';
import {
  Download,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AgentIcon } from './agent-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isTauriRuntime, openUrlInDefaultBrowser } from './workspace-api';
import {
  agentError,
  agentInvoke,
  installAgent,
  loadAgentCatalog,
  saveAgentProfile,
  uninstallAgent,
  attachLocalAgent,
  type AgentCatalog,
  type AgentCatalogEntry,
  type AgentProfile,
} from './agent-api';

let lastCatalog: AgentCatalog | null = null;

export function AgentSettings({
  onSelect,
  scrollable = false,
}: {
  onSelect?: (profile: AgentProfile) => void;
  scrollable?: boolean;
}) {
  const [catalog, setCatalog] = React.useState<AgentCatalog | null>(
    () => lastCatalog,
  );
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [installProgress, setInstallProgress] = React.useState<{
    agentId: string;
    phase: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [operationError, setOperationError] = React.useState<{
    id: string;
    message: string;
  } | null>(null);
  const [editing, setEditing] = React.useState<AgentProfile | null>(null);
  const [installing, setInstalling] = React.useState<AgentCatalogEntry | null>(
    null,
  );
  const [removing, setRemoving] = React.useState<AgentProfile | null>(null);
  const load = React.useCallback(async (refresh = false) => {
    try {
      const next = await loadAgentCatalog(refresh);
      lastCatalog = next;
      setCatalog(next);
      setError(null);
    } catch (error) {
      setError(agentError(error));
    }
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);
  React.useEffect(() => {
    if (!isTauriRuntime()) return;
    let stopped = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<{ agentId: string; phase: string }>(
          'markune:agent-install',
          ({ payload }) => {
            if (!stopped)
              setInstallProgress(payload.phase === 'finished' ? null : payload);
            if (!stopped && payload.phase === 'finished') void load();
          },
        ),
      )
      .then(async (stop) => {
        if (stopped) {
          stop();
          return;
        }
        unlisten = stop;
        const status = await agentInvoke<{
          agentId: string;
          phase: string;
        } | null>('agent_install_status');
        if (!stopped) setInstallProgress(status);
      })
      .catch((error) => {
        if (!stopped) setError(agentError(error));
      });
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, [load]);
  const run = async (id: string, operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    setOperationError(null);
    try {
      await operation();
      await load();
    } catch (error) {
      if (id === 'refresh') setError(agentError(error));
      else setOperationError({ id, message: agentError(error) });
    } finally {
      setBusy(null);
    }
  };
  const entries =
    catalog?.agents.filter((item) =>
      `${item.name} ${item.id} ${item.authors?.join(' ')}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    ) ?? [];
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-4',
        scrollable && 'flex-1 overflow-hidden',
      )}
      data-testid="agent-settings"
    >
      <div className="shrink-0 pr-8">
        <h2 className="text-lg font-medium">智能体</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          连接你选择的智能体。账号、模型和使用额度由对应服务提供。
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          aria-label="搜索智能体"
          placeholder="搜索智能体…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="刷新智能体目录"
          disabled={Boolean(busy || installProgress) || !isTauriRuntime()}
          onClick={() => void run('refresh', () => load(true))}
        >
          <RefreshCw
            size={15}
            className={busy === 'refresh' ? 'animate-spin' : undefined}
          />
        </Button>
        <Button
          variant="outline"
          disabled={Boolean(busy || installProgress) || !isTauriRuntime()}
          onClick={() =>
            setEditing({
              id: crypto.randomUUID(),
              agentId: `custom-${crypto.randomUUID()}`,
              name: '',
              executable: '',
              args: [],
              env: {},
              secretKeys: [],
              version: null,
              managedPath: null,
              mcpEnabled: true,
              enabled: true,
            })
          }
        >
          <Plus size={15} />
          添加本机智能体
        </Button>
      </div>
      {!isTauriRuntime() && (
        <p className="text-sm text-muted-foreground">
          请在 Markune 桌面端安装和运行智能体。
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div
        data-testid="agent-catalog-list"
        role="region"
        aria-label="智能体列表"
        className={cn(
          'divide-y rounded-xl border',
          scrollable && 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
        )}
      >
        {entries.map((entry) => {
          const installed =
            catalog?.profiles.filter(
              (profile) => profile.agentId === entry.id,
            ) ?? [];
          const local = catalog?.localAgents.some(
            (item) => item.agentId === entry.id,
          );
          const available = Boolean(
            entry.distribution.npx ||
              entry.distribution.binary?.[catalog?.platform ?? ''],
          );
          const latest = installed.at(-1);
          const progress =
            installProgress?.agentId === entry.id ? installProgress : null;
          const working =
            busy === entry.id ||
            installed.some((profile) => profile.id === busy) ||
            Boolean(progress);
          return (
            <div
              key={entry.id}
              data-agent-id={entry.id}
              aria-busy={working}
              className="flex items-start gap-3 p-4"
            >
              <AgentIcon agentId={entry.id} className="mt-1" size={23} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {latest?.version ?? (latest ? '本机安装' : entry.version)}
                    {latest?.version && latest.version !== entry.version
                      ? ` → ${entry.version}`
                      : ''}
                  </span>
                  {entry.id === 'glm-acp-agent' && (
                    <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                      社区维护
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {entry.authors?.join(' · ')}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {entry.description}
                </p>
                <div className="mt-2 flex gap-3 text-xs">
                  <button
                    className="text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() =>
                      void openUrlInDefaultBrowser(
                        entry.website ?? entry.repository ?? '',
                      )
                    }
                  >
                    项目主页
                  </button>
                  {entry.license_url && (
                    <button
                      className="text-muted-foreground underline-offset-4 hover:underline"
                      onClick={() =>
                        void openUrlInDefaultBrowser(entry.license_url!)
                      }
                    >
                      许可条款
                    </button>
                  )}
                </div>
                {(operationError?.id === entry.id ||
                  installed.some(
                    (profile) => profile.id === operationError?.id,
                  )) && (
                  <p role="alert" className="mt-3 text-xs text-destructive">
                    {operationError?.message}
                  </p>
                )}
                {working && (
                  <div
                    role="status"
                    className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                  >
                    <LoaderCircle className="shrink-0 animate-spin" size={14} />
                    <span>{progress?.phase ?? '正在处理…'}</span>
                    {progress && (
                      <button
                        className="rounded px-1 py-0.5 underline underline-offset-4 hover:text-foreground"
                        aria-label={`取消安装 ${entry.name}`}
                        onClick={() =>
                          void agentInvoke('agent_cancel_install', {
                            agentId: entry.id,
                          }).catch((error) => setError(agentError(error)))
                        }
                      >
                        取消安装
                      </button>
                    )}
                  </div>
                )}
                {installed.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {installed.map((profile) => (
                      <button
                        key={profile.id}
                        className="rounded border px-2 py-1 text-xs hover:bg-accent"
                        onClick={() => onSelect?.(profile)}
                      >
                        {profile.version ?? '本机'}
                        {!profile.enabled ? ' · 已停用' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {latest ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(busy || installProgress)}
                      onClick={() =>
                        onSelect ? onSelect(latest) : setEditing(latest)
                      }
                    >
                      {onSelect ? '使用' : '配置'}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`配置 ${entry.name}`}
                      disabled={Boolean(busy || installProgress)}
                      onClick={() => setEditing(latest)}
                    >
                      <Settings2 size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`卸载 ${entry.name}`}
                      disabled={Boolean(busy || installProgress)}
                      onClick={() => setRemoving(latest)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ) : null}
                {!installed.some(
                  (profile) =>
                    profile.managedPath && profile.version === entry.version,
                ) && (
                  <Button
                    size="sm"
                    variant={latest ? 'outline' : 'default'}
                    disabled={
                      Boolean(busy || installProgress) ||
                      !isTauriRuntime() ||
                      !available
                    }
                    onClick={() => setInstalling(entry)}
                  >
                    <Download size={14} />
                    {latest
                      ? latest.managedPath
                        ? '安装更新'
                        : '安装托管版本'
                      : available
                        ? '安装'
                        : '此平台暂无安装包'}
                  </Button>
                )}
                {local &&
                  !installed.some((profile) => !profile.managedPath) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(busy || installProgress)}
                      onClick={() =>
                        void run(entry.id, async () => {
                          const profile = await attachLocalAgent(entry.id);
                          onSelect?.(profile);
                        })
                      }
                    >
                      使用本机安装
                    </Button>
                  )}
              </div>
            </div>
          );
        })}
        {catalog?.profiles
          .filter((profile) => profile.agentId.startsWith('custom-'))
          .map((profile) => (
            <div
              className="flex items-center justify-between gap-3 p-4"
              key={profile.id}
            >
              <div>
                <p className="font-medium">{profile.name}</p>
                <p className="text-xs text-muted-foreground">
                  自定义 ACP 智能体
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelect?.(profile)}
                >
                  使用
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(profile)}
                >
                  配置
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoving(profile)}
                >
                  移除
                </Button>
              </div>
            </div>
          ))}
      </div>
      <Dialog
        open={Boolean(installing)}
        onOpenChange={(open) => {
          if (!open) setInstalling(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安装 {installing?.name}</DialogTitle>
            <DialogDescription>
              智能体及其安装程序将以你的系统权限运行。它可访问工作区、运行本地命令，并按供应商规则连接网络服务。请确认信任此来源。
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            发布者：{installing?.authors?.join(' · ')}
            <br />
            版本：{installing?.version}
          </p>
          <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="break-all">
              来源：
              {installing?.distribution.npx
                ? `npm · ${installing.distribution.npx.package}`
                : installing?.distribution.binary?.[catalog?.platform ?? '']
                    ?.archive}
            </p>
            {installing?.distribution.binary && (
              <p>
                {installing.distribution.binary[catalog?.platform ?? '']?.sha256
                  ? '安装前核对发布者提供的 SHA-256。'
                  : '此目录版本未提供发布者校验值，请核实下载来源。'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstalling(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                const entry = installing;
                setInstalling(null);
                if (entry && catalog)
                  void run(entry.id, async () => {
                    const profile = await installAgent(
                      entry.id,
                      catalog.digest,
                    );
                    onSelect?.(profile);
                  });
              }}
            >
              安装并启用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移除 {removing?.name}</DialogTitle>
            <DialogDescription>
              移除此安装版本和 Markune
              保存的凭据。文档与会话记录会保留；本机自行安装的 CLI 不会删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const profile = removing;
                setRemoving(null);
                if (profile)
                  void run(profile.id, () => uninstallAgent(profile.id));
              }}
            >
              移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editing && (
        <AgentProfileDialog
          profile={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function AgentProfileDialog({
  profile,
  onClose,
  onSaved,
}: {
  profile: AgentProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = React.useState(profile);
  const [args, setArgs] = React.useState(JSON.stringify(profile.args));
  const [env, setEnv] = React.useState(JSON.stringify(profile.env, null, 2));
  const [grant, setGrant] = React.useState<string | null>(null);
  const [secretName, setSecretName] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const choose = async () => {
    try {
      const selected = await agentInvoke<{
        grantId: string;
        path: string;
      } | null>('agent_select_program');
      if (selected) {
        setGrant(selected.grantId);
        setDraft((current) => ({ ...current, executable: selected.path }));
      }
    } catch (error) {
      setError(agentError(error));
    }
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedArgs: unknown = JSON.parse(args),
        parsedEnv: unknown = JSON.parse(env);
      if (
        !Array.isArray(parsedArgs) ||
        !parsedArgs.every((value) => typeof value === 'string') ||
        !parsedEnv ||
        typeof parsedEnv !== 'object' ||
        Array.isArray(parsedEnv) ||
        !Object.values(parsedEnv).every((value) => typeof value === 'string')
      )
        throw new Error('参数需为字符串数组，环境变量需为字符串键值对象');
      const value = await saveAgentProfile(
        {
          ...draft,
          args: parsedArgs,
          env: parsedEnv as Record<string, string>,
        },
        grant,
      );
      if (secretName && secret)
        await agentInvoke('agent_set_secret', {
          profileId: value.id,
          name: secretName,
          value: secret,
        });
      setSecret('');
      toast.success('智能体配置已保存，下次连接时生效');
      onSaved();
    } catch (error) {
      setError(agentError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>配置智能体</DialogTitle>
          <DialogDescription>
            启动程序必须实现 ACP。运行参数来自该智能体的文档。
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1 text-sm">
          名称
          <Input
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </label>
        <label className="space-y-1 text-sm">
          启动程序
          <div className="flex gap-2">
            <Input
              readOnly
              value={draft.executable}
              placeholder="选择启动程序"
            />
            <Button
              variant="outline"
              aria-label="选择启动程序"
              onClick={() => void choose()}
            >
              <FolderOpen size={16} />
            </Button>
          </div>
        </label>
        <label className="space-y-1 text-sm">
          参数
          <textarea
            aria-label="智能体参数"
            className="min-h-16 w-full rounded-md border p-2 font-mono text-xs"
            value={args}
            onChange={(event) => setArgs(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          环境变量
          <textarea
            aria-label="智能体环境变量"
            className="min-h-20 w-full rounded-md border p-2 font-mono text-xs"
            value={env}
            onChange={(event) => setEnv(event.target.value)}
          />
        </label>
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">凭据</p>
          <p className="text-xs text-muted-foreground">
            值保存在系统凭据库，仅传给这个智能体。
          </p>
          <Input
            aria-label="凭据环境变量名称"
            placeholder="例如 ANTHROPIC_API_KEY"
            value={secretName}
            onChange={(event) => setSecretName(event.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            aria-label="智能体凭据"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
          {draft.secretKeys.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between text-xs"
            >
              <span>{name} · 已保存</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void agentInvoke('agent_set_secret', {
                    profileId: draft.id,
                    name,
                    value: null,
                  })
                    .then(() =>
                      setDraft((current) => ({
                        ...current,
                        secretKeys: current.secretKeys.filter(
                          (key) => key !== name,
                        ),
                      })),
                    )
                    .catch((error) => setError(agentError(error)))
                }
              >
                清除
              </Button>
            </div>
          ))}
        </div>
        <label className="flex items-center justify-between text-sm">
          开放 Markune 文档与图稿工具
          <input
            type="checkbox"
            checked={draft.mcpEnabled}
            onChange={(event) =>
              setDraft({ ...draft, mcpEnabled: event.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          启用此智能体
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft({ ...draft, enabled: event.target.checked })
            }
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={saving || !draft.name.trim() || !draft.executable}
            onClick={() => void save()}
          >
            {saving ? '正在保存…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
