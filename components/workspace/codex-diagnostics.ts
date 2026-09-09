import manifest from '@/contracts/codex/manifest.json';
type Kind =
  | 'rpc-timeout'
  | 'subscriber-failure'
  | 'transport-failure'
  | 'startup-overflow';
const counters: Record<Kind, number> = {
  'rpc-timeout': 0,
  'subscriber-failure': 0,
  'transport-failure': 0,
  'startup-overflow': 0,
};
export function recordCodexDiagnostic(kind: Kind) {
  counters[kind]++;
}
export function codexDiagnostics() {
  return {
    contractVersion: manifest.version,
    observedAt: new Date().toISOString(),
    counters: { ...counters },
  };
}
