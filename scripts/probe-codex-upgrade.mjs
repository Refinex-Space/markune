import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const [previous, candidate] = process.argv.slice(2);
if (!previous || !candidate)
  throw new Error('Provide previous and candidate Codex binary paths');
const root = mkdtempSync(join(tmpdir(), 'markune-upgrade-'));
const home = join(root, 'home'),
  workspace = join(root, 'workspace');
mkdirSync(home);
mkdirSync(workspace);
writeFileSync(
  join(home, 'config.toml'),
  'model="gpt-5.4"\nmodel_provider="fixture"\n[model_providers.fixture]\nname="Synthetic offline endpoint"\nbase_url="http://127.0.0.1:9/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n',
);
const marker = '升级保真：中文来源 [文档](notes/a.md#L3)';
async function connect(binary) {
  const child = spawn(
    binary,
    [
      'app-server',
      '--listen',
      'stdio://',
      '-c',
      `sqlite_home=${JSON.stringify(home)}`,
    ],
    {
      cwd: workspace,
      env: { ...process.env, CODEX_HOME: home, CODEX_SQLITE_HOME: home },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', () => {});
  let seq = 0,
    buffer = '';
  const pending = new Map(),
    events = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 32 * 1024 * 1024) {
      child.kill();
      return;
    }
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.method) {
        events.push(message);
        if (events.length > 512) events.shift();
        continue;
      }
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error)
          waiter.reject(
            new Error(`${waiter.method} failed (${message.error.code})`),
          );
        else waiter.resolve(message.result);
      }
    }
  });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15000);
      pending.set(id, { method, timer, resolve, reject });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async function close() {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Session closed'));
    }
    pending.clear();
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once('exit', resolve);
    });
  }
  await request('initialize', {
    clientInfo: { name: 'markune-upgrade-probe', version: '1' },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write(
    JSON.stringify({ method: 'initialized', params: {} }) + '\n',
  );
  return { request, close, events };
}
function rollouts(dir) {
  let paths = [];
  try {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) paths.push(...rollouts(path));
      else if (item.name.endsWith('.jsonl')) paths.push(path);
    }
  } catch {}
  return paths;
}
let running;
try {
  running = await connect(previous);
  const original = await running.request('thread/start', {
    cwd: workspace,
    permissions: ':read-only',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    runtimeWorkspaceRoots: [workspace],
    config: { web_search: 'disabled' },
  });
  const id = original.thread.id;
  await running.request('thread/name/set', {
    threadId: id,
    name: 'Synthetic upgrade fixture',
  });
  const started = await running.request('turn/start', {
    threadId: id,
    input: [{ type: 'text', text: marker, text_elements: [] }],
  });
  for (
    let attempt = 0;
    attempt < 100 &&
    !running.events.some((event) => event.method === 'turn/completed');
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 50));
  if (!running.events.some((event) => event.method === 'turn/completed'))
    await running
      .request('turn/interrupt', { threadId: id, turnId: started.turn.id })
      .catch(() => {});
  const oldRead = await running.request('thread/read', {
    threadId: id,
    includeTurns: true,
  });
  if (!JSON.stringify(oldRead).includes(marker))
    process.stdout.write(
      JSON.stringify({
        events: running.events.map((event) => ({
          method: event.method,
          type: event.params?.item?.type,
          status: event.params?.turn?.status,
        })),
        turns: oldRead.thread.turns,
      }) + '\n',
    );
  assert(JSON.stringify(oldRead).includes(marker));
  await running.close();
  running = null;
  const snapshots = new Map(
    rollouts(join(home, 'sessions')).map((path) => [path, readFileSync(path)]),
  );
  assert(snapshots.size > 0);
  running = await connect(candidate);
  const metadata = await running.request('thread/read', {
    threadId: id,
    includeTurns: false,
  });
  const history =
    metadata.thread.historyMode === 'paginated'
      ? await running.request('thread/turns/list', {
          threadId: id,
          limit: 30,
          itemsView: 'full',
          sortDirection: 'asc',
        })
      : await running.request('thread/read', {
          threadId: id,
          includeTurns: true,
        });
  assert(
    JSON.stringify(history).includes(marker),
    'candidate lost legacy user content',
  );
  const resumed = await running.request('thread/resume', {
    threadId: id,
    excludeTurns: true,
  });
  assert.equal(resumed.approvalPolicy, 'never');
  assert.equal(resumed.activePermissionProfile.id, ':read-only');
  const fork = await running.request('thread/fork', {
    threadId: id,
    excludeTurns: true,
  });
  assert.notEqual(fork.thread.id, id);
  for (const [path, before] of snapshots) {
    const after = readFileSync(path);
    assert(
      after.subarray(0, before.length).equals(before),
      'candidate rewrote old rollout bytes',
    );
  }
  await running.close();
  running = null;
  running = await connect(candidate);
  const reopened = await running.request('thread/read', {
    threadId: id,
    includeTurns: false,
  });
  assert.equal(reopened.thread.id, id);
  process.stdout.write(
    JSON.stringify({
      status: 'passed',
      legacyContent: 'preserved',
      legacyRolloutPrefixes: 'unchanged',
      resumePermissions: 'preserved',
      fork: 'passed',
      coldRestart: 'passed',
      externalModelCalls: 0,
    }) + '\n',
  );
} finally {
  if (running) await running.close();
  rmSync(root, { recursive: true, force: true });
}
