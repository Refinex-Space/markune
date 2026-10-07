// refinex: The desktop bundle and dependency graph must stay independent from a fixed Codex CLI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ACP migration removes fixed Codex staging, dependencies and production IPC', async () => {
  const [packageText, tauriText, native] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8'),
  ]);
  const pkg = JSON.parse(packageText), tauri = JSON.parse(tauriText);
  assert.equal(pkg.dependencies['@agentclientprotocol/sdk'], '1.7.0');
  assert.equal(pkg.devDependencies['@openai/codex'], undefined);
  assert.equal(pkg.scripts['codex:stage'], undefined);
  assert.doesNotMatch(pkg.scripts['desktop:dev'], /codex:stage/);
  assert.doesNotMatch(tauri.build.beforeBuildCommand, /codex:stage/);
  assert.equal(tauri.bundle.externalBin.some((binary) => binary.includes('codex')), false);
  assert.doesNotMatch(native, /codex::codex_runtime_start|codex::codex_app_server_request/);
  assert.match(native, /agents::agent_connect/);
});
