// refinex: Initialization-only compatibility probe; isolated homes and no model prompts.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { client } from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';
import { ndJsonStream } from '@agentclientprotocol/sdk';
const specs = JSON.parse(process.env.MARKUNE_ACP_PROBE_SPECS ?? '[]');
if (!Array.isArray(specs) || specs.length === 0)
  throw new Error(
    'Set MARKUNE_ACP_PROBE_SPECS to [{"name":"Agent","command":"/absolute/cli","args":["acp"]}]',
  );
const results = [];
for (const spec of specs) {
  const home = await mkdtemp(join(tmpdir(), 'markune-acp-probe-'));
  await mkdir(join(home, 'workspace'));
  await mkdir(join(home, 'codex'));
  const processEnv = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, 'config'),
    XDG_DATA_HOME: join(home, 'data'),
    XDG_CACHE_HOME: join(home, 'cache'),
    CODEX_HOME: join(home, 'codex'),
    CLAUDE_CONFIG_DIR: join(home, 'claude'),
    NO_COLOR: '1',
    TERM: 'dumb',
    LANG: 'en_US.UTF-8',
  };
  let child, connection, timer;
  try {
    child = spawn(spec.command, spec.args, {
      cwd: join(home, 'workspace'),
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    child.stderr.resume();
    child.on('error', () => {});
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout),
    );
    connection = client({ name: 'markune-compatibility-probe' }).connect(
      stream,
    );
    const started = Date.now();
    const init = await Promise.race([
      connection.agent.request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'markune-probe', version: '1' },
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
          auth: { terminal: true },
          elicitation: { form: {}, url: {} },
        },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('initialize timeout')),
          20_000,
        );
      }),
      new Promise((_, reject) =>
        child.once('error', () => reject(new Error('process launch failed'))),
      ),
    ]);
    results.push({
      name: spec.name,
      version: init.agentInfo?.version ?? null,
      outcome: 'initialized',
      durationMs: Date.now() - started,
      protocolVersion: init.protocolVersion,
      capabilities: init.agentCapabilities,
      authMethods: (init.authMethods ?? []).map(({ id, name, type }) => ({
        id,
        name,
        type: type ?? 'agent',
      })),
      modelPromptSent: false,
    });
  } catch (error) {
    results.push({
      name: spec.name,
      outcome: 'failed',
      error: String(error.message).replaceAll(home, '<isolated-home>'),
      modelPromptSent: false,
    });
  } finally {
    clearTimeout(timer);
    connection?.close();
    if (child?.pid) {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill();
      } catch {}
    }
    await rm(home, { recursive: true, force: true });
  }
}
const report = {
  checkedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  credentialPolicy:
    'isolated HOME and credential environment removed; no authentication or prompts',
  results,
};
if (process.env.MARKUNE_ACP_PROBE_REPORT)
  await writeFile(
    process.env.MARKUNE_ACP_PROBE_REPORT,
    `${JSON.stringify(report, null, 2)}\n`,
  );
console.log(JSON.stringify(report, null, 2));
process.exitCode = results.some((result) => result.outcome !== 'initialized')
  ? 1
  : 0;
