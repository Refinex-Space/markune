'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AiMessageContent } from './ai-message-content';
import type { AgentInteraction } from './agent-session';
import { openUrlInDefaultBrowser } from './workspace-api';

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(obj) : [];
export function AgentInteractionCard({
  interaction,
}: {
  interaction: AgentInteraction;
}) {
  const { params, kind, resolve, cancel } = interaction;
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [error, setError] = React.useState('');
  const schema = obj(params.requestedSchema);
  const fields = Object.entries(obj(schema.properties));
  const set = (key: string, value: unknown) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (kind === 'question') {
      const questions = list(params.questions);
      if (
        questions.some(
          (question) =>
            !Array.isArray(values[String(question.id)]) ||
            !(values[String(question.id)] as unknown[]).length,
        )
      ) {
        setError('请回答所有问题');
        return;
      }
      resolve({
        outcome: {
          outcome: 'answered',
          answers: questions.map((question) => ({
            questionId: question.id,
            selectedOptionIds: values[String(question.id)],
          })),
        },
      });
    } else {
      const content: Record<string, unknown> = {};
      for (const [key, raw] of fields) {
        const field = obj(raw),
          required =
            Array.isArray(schema.required) && schema.required.includes(key);
        const value = values[key];
        if (value === undefined || value === '') {
          if (required) {
            setError(`请填写 ${String(field.title ?? key)}`);
            return;
          }
          continue;
        }
        if (
          field.type === 'array' &&
          Array.isArray(value) &&
          ((typeof field.minItems === 'number' &&
            value.length < field.minItems) ||
            (typeof field.maxItems === 'number' &&
              value.length > field.maxItems))
        ) {
          setError(`${String(field.title ?? key)} 的选择数量不符合要求`);
          return;
        }
        content[key] = value;
      }
      resolve({ action: 'accept', content });
    }
  };
  return (
    <section
      aria-label="智能体等待你的决定"
      className="space-y-3 rounded-xl border border-amber-500/40 bg-background p-4 shadow-sm"
    >
      <p className="text-sm font-medium">
        {kind === 'permission'
          ? '需要你的授权'
          : kind === 'plan'
            ? String(params.name ?? '确认执行计划')
            : String(params.title ?? params.message ?? '需要补充信息')}
      </p>
      {kind === 'permission' ? (
        <>
          <p className="text-sm">
            {String(obj(params.toolCall).title ?? '工具操作')}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">查看操作详情</summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(params.toolCall, null, 2)}
            </pre>
          </details>
          <div className="flex flex-wrap gap-2">
            {list(params.options).map((option) => (
              <Button
                key={String(option.optionId)}
                size="sm"
                variant={
                  String(option.kind).startsWith('reject')
                    ? 'outline'
                    : 'default'
                }
                onClick={() =>
                  resolve({
                    outcome: { outcome: 'selected', optionId: option.optionId },
                  })
                }
              >
                {String(option.name)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={cancel}>
              取消请求
            </Button>
          </div>
        </>
      ) : kind === 'plan' ? (
        <>
          <div className="max-h-80 overflow-auto">
            <AiMessageContent
              markdown={String(params.plan ?? params.overview ?? '')}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => resolve({ outcome: { outcome: 'accepted' } })}
            >
              批准计划
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => resolve({ outcome: { outcome: 'rejected' } })}
            >
              拒绝
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              取消
            </Button>
          </div>
        </>
      ) : kind === 'url' ? (
        <>
          <p className="break-all text-xs text-muted-foreground">
            {String(params.url ?? '')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const url = String(params.url ?? '');
                if (/^https?:\/\//i.test(url))
                  void openUrlInDefaultBrowser(url).catch(() =>
                    setError('无法打开链接'),
                  );
                else setError('不支持此链接协议');
              }}
            >
              在浏览器打开
            </Button>
            <Button size="sm" onClick={() => resolve({ action: 'accept' })}>
              已完成
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              取消
            </Button>
          </div>
        </>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          {kind === 'question'
            ? list(params.questions).map((question) => (
                <fieldset key={String(question.id)} className="space-y-2">
                  <legend className="mb-2 text-sm">
                    {String(question.prompt)}
                  </legend>
                  {list(question.options).map((option) => (
                    <label
                      key={String(option.id)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type={question.allowMultiple ? 'checkbox' : 'radio'}
                        name={String(question.id)}
                        checked={(
                          (values[String(question.id)] as string[]) ?? []
                        ).includes(String(option.id))}
                        onChange={(event) =>
                          set(
                            String(question.id),
                            question.allowMultiple
                              ? event.target.checked
                                ? [
                                    ...((values[
                                      String(question.id)
                                    ] as string[]) ?? []),
                                    String(option.id),
                                  ]
                                : (
                                    (values[String(question.id)] as string[]) ??
                                    []
                                  ).filter((id) => id !== option.id)
                              : [String(option.id)],
                          )
                        }
                      />
                      {String(option.label)}
                    </label>
                  ))}
                </fieldset>
              ))
            : fields.map(([key, raw]) => {
                const field = obj(raw),
                  options = Array.isArray(field.enum)
                    ? field.enum.map((value) => ({
                        value: String(value),
                        name: String(value),
                      }))
                    : list(field.oneOf).map((option) => ({
                        value: String(option.const),
                        name: String(option.title ?? option.const),
                      }));
                const required =
                  Array.isArray(schema.required) &&
                  schema.required.includes(key);
                return (
                  <label key={key} className="block space-y-1 text-sm">
                    <span>
                      {String(field.title ?? key)}
                      {required ? ' *' : ''}
                    </span>
                    {field.description ? (
                      <span className="block text-xs text-muted-foreground">
                        {String(field.description)}
                      </span>
                    ) : null}
                    {field.type === 'boolean' ? (
                      <input
                        className="ml-2"
                        type="checkbox"
                        checked={values[key] === true}
                        onChange={(event) => set(key, event.target.checked)}
                      />
                    ) : field.type === 'array' ? (
                      <select
                        multiple
                        aria-label={String(field.title ?? key)}
                        className="w-full rounded border bg-background p-2"
                        value={(values[key] as string[]) ?? []}
                        onChange={(event) =>
                          set(
                            key,
                            Array.from(
                              event.target.selectedOptions,
                              (option) => option.value,
                            ),
                          )
                        }
                      >
                        {(Array.isArray(obj(field.items).enum)
                          ? (obj(field.items).enum as string[])
                          : list(obj(field.items).anyOf).map((option) =>
                              String(option.const),
                            )
                        ).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    ) : options.length ? (
                      <select
                        required={required}
                        aria-label={String(field.title ?? key)}
                        className="w-full rounded border bg-background p-2"
                        value={String(values[key] ?? '')}
                        onChange={(event) => set(key, event.target.value)}
                      >
                        <option value="">请选择</option>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : ['string', 'number', 'integer'].includes(
                        String(field.type),
                      ) ? (
                      <Input
                        required={required}
                        aria-label={String(field.title ?? key)}
                        autoComplete="off"
                        type={
                          field.type === 'string'
                            ? field.format === 'email'
                              ? 'email'
                              : field.format === 'uri'
                                ? 'url'
                                : field.format === 'date'
                                  ? 'date'
                                  : 'text'
                            : 'number'
                        }
                        min={
                          typeof field.minimum === 'number'
                            ? field.minimum
                            : undefined
                        }
                        max={
                          typeof field.maximum === 'number'
                            ? field.maximum
                            : undefined
                        }
                        step={field.type === 'integer' ? 1 : 'any'}
                        minLength={
                          typeof field.minLength === 'number'
                            ? field.minLength
                            : undefined
                        }
                        maxLength={
                          typeof field.maxLength === 'number'
                            ? field.maxLength
                            : 8192
                        }
                        value={String(values[key] ?? '')}
                        onChange={(event) =>
                          set(
                            key,
                            field.type === 'string' || !event.target.value
                              ? event.target.value
                              : Number(event.target.value),
                          )
                        }
                      />
                    ) : (
                      <p className="text-destructive">
                        不支持此字段类型，请拒绝并告知智能体。
                      </p>
                    )}
                  </label>
                );
              })}
          <div className="flex gap-2">
            <Button
              size="sm"
              type="submit"
              disabled={
                kind === 'form' &&
                fields.some(
                  ([, raw]) =>
                    ![
                      'string',
                      'number',
                      'integer',
                      'boolean',
                      'array',
                    ].includes(String(obj(raw).type)),
                )
              }
            >
              提交
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() =>
                resolve(
                  kind === 'question'
                    ? { outcome: { outcome: 'skipped' } }
                    : { action: 'decline' },
                )
              }
            >
              跳过
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={cancel}>
              取消
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
