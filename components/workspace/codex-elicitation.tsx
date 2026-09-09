'use client';
import * as React from 'react';
import {
  codexAppServerClient,
  type CodexProtocolMessage,
} from './codex-app-server';
import { openUrlInDefaultBrowser } from './workspace-api';
type Schema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  enumNames?: string[];
  oneOf?: { const: string; title?: string }[];
  items?: Schema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
};
type Request = {
  id: string | number;
  sessionId: string;
  params: {
    threadId: string;
    serverName: string;
    message: string;
    mode: string;
    url?: string;
    requestedSchema?: {
      properties: Record<string, Schema>;
      required?: string[];
    };
  };
};
export function updateElicitations(
  current: Request[],
  message: CodexProtocolMessage,
): Request[] {
  if (message.method === 'markune/runtime/exited') return [];
  if (message.method === 'serverRequest/resolved')
    return current.filter(
      (request) => request.id !== message.params?.requestId,
    );
  if (
    message.method === 'mcpServer/elicitation/request' &&
    message.id !== undefined &&
    message.markuneSessionId
  ) {
    const next = {
      id: message.id,
      sessionId: message.markuneSessionId,
      params: message.params as Request['params'],
    };
    return [
      ...current.filter(
        (request) =>
          request.id !== next.id || request.sessionId !== next.sessionId,
      ),
      next,
    ];
  }
  return current;
}
export function CodexElicitationQueue() {
  const [queue, setQueue] = React.useState<Request[]>([]);
  React.useEffect(() => {
    const unsubscribe = codexAppServerClient.subscribe((message) =>
      setQueue((current) => updateElicitations(current, message)),
    );
    return () => {
      unsubscribe();
    };
  }, []);
  return queue.length ? (
    <div
      aria-label="待处理的连接器请求"
      className="max-h-[45vh] shrink-0 overflow-auto border-b p-3"
    >
      <p className="mb-2 text-xs text-muted-foreground">
        连接器需要你的输入 · {queue.length} 项
      </p>
      {queue.map((request) => (
        <ElicitationCard
          key={request.sessionId + ':' + request.id}
          request={request}
          onAnswered={() =>
            setQueue((current) => current.filter((item) => item !== request))
          }
        />
      ))}
    </div>
  ) : null;
}
function ElicitationCard({
  request,
  onAnswered,
}: {
  request: Request;
  onAnswered: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { params } = request;
  const properties = params.requestedSchema?.properties ?? {};
  const supported = Object.values(properties).every(
    (schema) =>
      ['string', 'number', 'integer', 'boolean', 'array'].includes(
        schema.type ?? '',
      ) &&
      (schema.type !== 'array' ||
        Boolean(schema.items?.enum || schema.items?.oneOf)),
  );
  async function answer(action: 'accept' | 'decline' | 'cancel') {
    setBusy(true);
    setError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('codex_app_server_respond_elicitation', {
        requestId: request.id,
        sessionId: request.sessionId,
        action,
        ...(action === 'accept' && params.mode !== 'url'
          ? { content: values }
          : {}),
      });
      onAnswered();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="mb-2 space-y-3 rounded-lg border p-3 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        void answer('accept');
      }}
    >
      <p className="font-medium">
        {params.serverName} · 任务 {params.threadId.slice(0, 8)}
      </p>
      <p className="whitespace-pre-wrap break-words">{params.message}</p>
      {params.mode === 'url' ? (
        <div className="space-y-2">
          <p className="break-all text-muted-foreground">{params.url}</p>
          <button
            type="button"
            className="rounded border px-3 py-2"
            onClick={() =>
              void openUrlInDefaultBrowser(params.url ?? '').catch((error) =>
                setError(String(error)),
              )
            }
          >
            在浏览器中打开
          </button>
          <p className="text-muted-foreground">
            完成网页操作后返回此处确认。打开网页本身不会批准请求。
          </p>
        </div>
      ) : supported ? (
        Object.entries(properties).map(([name, schema]) => {
          const required = params.requestedSchema?.required?.includes(name);
          const options =
            schema.enum?.map((value, index) => ({
              value,
              label: schema.enumNames?.[index] ?? value,
            })) ??
            schema.oneOf?.map((value) => ({
              value: value.const,
              label: value.title ?? value.const,
            }));
          const arrayOptions =
            schema.items?.enum ??
            schema.items?.oneOf?.map((item) => item.const);
          return (
            <label className="block space-y-1" key={name}>
              <span>
                {schema.title ?? name}
                {required ? ' *' : ''}
              </span>
              {schema.description ? (
                <span className="block text-muted-foreground">
                  {schema.description}
                </span>
              ) : null}
              {schema.type === 'boolean' ? (
                <select
                  className="block w-full rounded border bg-background p-2"
                  required={required}
                  value={values[name] === undefined ? '' : String(values[name])}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [name]: e.target.value === 'true',
                    }))
                  }
                >
                  <option value="">请选择</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              ) : schema.type === 'array' ? (
                <select
                  multiple
                  className="block w-full rounded border bg-background p-2"
                  required={required}
                  value={(values[name] as string[]) ?? []}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [name]: Array.from(e.target.selectedOptions).map(
                        (option) => option.value,
                      ),
                    }))
                  }
                >
                  {arrayOptions?.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : options ? (
                <select
                  className="block w-full rounded border bg-background p-2"
                  required={required}
                  value={(values[name] as string) ?? ''}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [name]: e.target.value }))
                  }
                >
                  <option value="">请选择</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  autoComplete="off"
                  className="block w-full rounded border bg-background p-2"
                  required={required}
                  type={
                    schema.type === 'number' || schema.type === 'integer'
                      ? 'number'
                      : schema.format === 'email'
                        ? 'email'
                        : 'text'
                  }
                  step={schema.type === 'integer' ? 1 : 'any'}
                  min={schema.minimum}
                  max={schema.maximum}
                  minLength={schema.minLength}
                  maxLength={Math.min(schema.maxLength ?? 8192, 8192)}
                  value={(values[name] as string | number) ?? ''}
                  onChange={(e) =>
                    setValues((v) => {
                      const next = { ...v };
                      if (!e.target.value) delete next[name];
                      else
                        next[name] =
                          schema.type === 'number' || schema.type === 'integer'
                            ? Number(e.target.value)
                            : e.target.value;
                      return next;
                    })
                  }
                />
              )}
            </label>
          );
        })
      ) : (
        <p role="alert">此表单结构尚不支持，请取消并通过连接器完成操作。</p>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || (!supported && params.mode !== 'url')}
          className="rounded border bg-primary px-3 py-2 text-primary-foreground"
        >
          {params.mode === 'url' ? '已完成网页操作' : '提交'}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded border px-3 py-2"
          onClick={() => void answer('decline')}
        >
          拒绝
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded border px-3 py-2"
          onClick={() => void answer('cancel')}
        >
          取消请求
        </button>
      </div>
    </form>
  );
}
