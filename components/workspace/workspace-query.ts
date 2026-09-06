export interface SearchableProperties {
  relativePath: string;
  title: string;
  content: string;
  properties?: Record<string, unknown>;
  tags?: string[];
  modifiedAt?: number;
  kind?: 'document' | 'drawing';
}

export interface WorkspaceQuery {
  text: string;
  phrases: string[];
  filters: Array<{ field: string; value: string; exclude: boolean }>;
  error: string | null;
}

function textValue(value: unknown): string {
  return value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
}

export function parseWorkspaceQuery(query: string): WorkspaceQuery {
  const text: string[] = [];
  const phrases: string[] = [];
  const filters: WorkspaceQuery['filters'] = [];
  let error: string | null = null;
  for (const token of query.match(/(?:[^\s"]+|"(?:\\.|[^"\\])*")+/g) ?? []) {
    const match = /^(-?)(path|tag|prop|after|before|type):(.*)$/i.exec(token);
    if (match) {
      let value = match[3];
      if (value.startsWith('"') && value.endsWith('"')) {
        try {
          value = JSON.parse(value) as string;
        } catch {
          error = '引号内容无效';
        }
      }
      if (!value) error = '筛选条件缺少值';
      if (
        ['after', 'before'].includes(match[2].toLowerCase()) &&
        dateValue(value) === null
      )
        error = '日期请使用有效的 YYYY-MM-DD';
      filters.push({
        field: match[2].toLowerCase(),
        value,
        exclude: Boolean(match[1]),
      });
    } else if (token.startsWith('"') && token.endsWith('"')) {
      try {
        const value = JSON.parse(token) as string;
        phrases.push(value);
        text.push(value);
      } catch {
        error = '引号内容无效';
      }
    } else {
      text.push(token);
    }
  }
  return { text: text.join(' '), phrases, filters, error };
}

function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date.getTime()
    : null;
}

export function matchesWorkspaceQuery(
  document: SearchableProperties,
  query: WorkspaceQuery,
) {
  if (query.error) return false;
  const text =
    `${document.title}\n${document.relativePath}\n${document.content}`.toLowerCase();
  if (query.phrases.some((phrase) => !text.includes(phrase.toLowerCase())))
    return false;
  return query.filters.every(({ field, value, exclude }) => {
    let matches = false;
    const normalized = value.toLowerCase();
    if (field === 'path')
      matches = document.relativePath.toLowerCase().includes(normalized);
    else if (field === 'tag') {
      const tags =
        document.tags ??
        (Array.isArray(document.properties?.tags)
          ? document.properties.tags.map(textValue)
          : []);
      const tag = normalized.replace(/^#/, '');
      matches = tags.some(
        (value) =>
          value.toLowerCase().replace(/^#/, '') === tag ||
          value.toLowerCase().replace(/^#/, '').startsWith(`${tag}/`),
      );
    } else if (field === 'type') {
      const path = document.relativePath.toLowerCase();
      matches =
        document.kind === 'drawing'
          ? normalized === 'drawing'
          : normalized === 'daily'
            ? path.startsWith('daily/')
            : normalized === 'weekly'
              ? path.startsWith('weekly/')
              : normalized === 'template'
                ? path.startsWith('templates/') ||
                  document.properties?.markuneTemplate === true
                : normalized === 'note' &&
                  !path.startsWith('daily/') &&
                  !path.startsWith('weekly/');
    } else if (field === 'after' || field === 'before') {
      const date = dateValue(value);
      matches =
        date !== null &&
        document.modifiedAt !== undefined &&
        (field === 'after'
          ? document.modifiedAt >= date
          : document.modifiedAt < date + 86400000);
    } else if (field === 'prop') {
      const condition = /^([^=!<>~]+)(!=|>=|<=|=|>|<|~)(.*)$/.exec(value);
      if (!condition) matches = Object.hasOwn(document.properties ?? {}, value);
      else {
        const actual = document.properties?.[condition[1]];
        const expected = condition[3];
        const values = Array.isArray(actual) ? actual : [actual];
        const equal = values.some(
          (value) =>
            value !== undefined &&
            textValue(value).toLowerCase() === expected.toLowerCase(),
        );
        if (condition[2] === '=') matches = equal;
        else if (condition[2] === '!=')
          matches = actual !== undefined && !equal;
        else if (condition[2] === '~')
          matches = values.some(
            (value) =>
              value !== undefined &&
              textValue(value).toLowerCase().includes(expected.toLowerCase()),
          );
        else {
          const left =
            typeof actual === 'number' ? actual : dateValue(textValue(actual));
          const right =
            expected.trim() && Number.isFinite(Number(expected))
              ? Number(expected)
              : dateValue(expected);
          if (left !== null && right !== null)
            matches =
              condition[2] === '>'
                ? left > right
                : condition[2] === '>='
                  ? left >= right
                  : condition[2] === '<'
                    ? left < right
                    : left <= right;
        }
      }
    }
    return exclude ? !matches : matches;
  });
}
