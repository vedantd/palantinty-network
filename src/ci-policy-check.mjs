// Fail closed on changes to the narrowly reviewed CI supply-chain policy.
// This is a repository policy regression check, not a general YAML parser.
export function assertCiPolicy(yaml) {
  if (typeof yaml !== 'string') throw new TypeError('CI workflow must be text');
  const lines=yaml.split(/\r?\n/);
  const active=lines.map(x=>x.replace(/\s+#.*$/,'')).join('\n');
  if (!/^on:\s*\n\s+push:\s*\n\s+pull_request:\s*$/m.test(active))
    throw new Error('CI must run on push and unprivileged pull_request');
  if (/^\s*pull_request_target\s*:/m.test(active)) throw new Error('Privileged PR trigger forbidden');
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(active))
    throw new Error('Workflow token must be read-only');
  if (/^\s*(?:permissions:|contents:|id-token:|actions:|packages:)\s*write\s*$/m.test(active))
    throw new Error('Writable token permission forbidden');
  const uses=[...active.matchAll(/^\s*-?\s*uses:\s*([^\s]+)\s*$/gm)].map(m=>m[1]);
  if (uses.length<3 || uses.some(x=>!/^actions\/[a-z-]+@[a-f0-9]{40}$/.test(x)))
    throw new Error('Every action must use a reviewed immutable 40-hex revision');
  if (!/run:\s*npm ci --ignore-scripts --no-audit --no-fund/.test(active))
    throw new Error('Integrity-locked no-scripts install required');
  if (!/run:\s*npm run build:lock-check/.test(active))
    throw new Error('Dependency provenance check required');
  if (!/run:\s*timeout 90s npm test/.test(active))
    throw new Error('Full Node test suite required');
  if (!/npm run release:check -- open-synthetic-testnet --assert-blocked/.test(active) ||
      !/npm run release:check -- public-real-sensing --assert-blocked/.test(active))
    throw new Error('Both public release gate assertions required');
  return {actionCount:uses.length,token:'read-only',install:'npm ci --ignore-scripts'};
}
