/*
 * Lightweight diagnostic logging (opt-in via env vars).
 *
 * Usage:
 *  - Set `ADAPTER_DIAG=1` to enable all logs
 *  - Or set granular flags: `ADAPTER_DIAG_CONNECT=1`, `ADAPTER_DIAG_LIFECYCLE=1`
 */

type Scope = 'connect' | 'lifecycle' | 'commands' | 'pubsub';

const GLOBAL_FLAG = 'ADAPTER_DIAG';
const FLAGS: Record<Scope, string> = {
  connect: 'ADAPTER_DIAG_CONNECT',
  lifecycle: 'ADAPTER_DIAG_LIFECYCLE',
  commands: 'ADAPTER_DIAG_COMMANDS',
  pubsub: 'ADAPTER_DIAG_PUBSUB',
};

function enabled(scope?: Scope): boolean {
  if (process.env[GLOBAL_FLAG] === '1') return true;
  if (!scope) return false;
  return process.env[FLAGS[scope]] === '1';
}

function ts() {
  return new Date().toISOString();
}

// Safe stringify for small meta payloads
function safeMeta(meta?: unknown): string {
  if (!meta) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch {
    return ' ' + String(meta);
  }
}

export function log(scope: Scope, message: string, meta?: unknown) {
  if (!enabled(scope)) return;
  // Single-line, grep-friendly format
  // Example: 2025-09-14T12:34:56.789Z [connect] begin {"host":"127.0.0.1","port":6383}

  console.log(`${ts()} [${scope}] ${message}${safeMeta(meta)}`);
}

export function isEnabled(scope?: Scope) {
  return enabled(scope);
}

export default { log, isEnabled };
