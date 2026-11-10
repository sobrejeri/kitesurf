import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// This is a SAFE static regression, not a paid Claude Code invocation.
// Claude QA must remain opt-in until an Anthropic account is connected.
const read = path => readFileSync(path, 'utf8');
const workflow = read('.github/workflows/claude-qa-review.yml');
const agent = read('.claude/agents/vento-qa-reviewer.md');
const instructions = read('docs/CLAUDE_CODE_QA_AUTOMATICO.md');

assert.match(workflow, /pull_request:\s*\n\s+types: \[opened, synchronize, reopened, ready_for_review\]/,
  'QA must trigger when developer PR is opened or updated');
assert.match(workflow, /vars\.VENTO_CLAUDE_QA_ENABLED == 'true'/,
  'Anthropic QA must remain gated by explicit owner opt-in');
assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  'Only trusted branches from this repository may use Anthropic credentials');
assert.match(workflow, /github\.event\.pull_request\.draft == false/,
  'Draft development PRs should not waste Claude usage');
assert.match(workflow, /!startsWith\(github\.head_ref, 'qa\/claude-pr-'\)/,
  'QA fix branches must not recursively invoke the reviewer');
assert.match(workflow, /secrets\.CLAUDE_CODE_OAUTH_TOKEN/,
  'OAuth token must be supplied via GitHub Actions secrets, never hardcoded');
assert.match(workflow, /anthropics\/claude-code-action@v1/,
  'Use official Claude Code action');
assert.match(workflow, /--max-turns 12/,
  'Bound the agent execution to a fixed number of turns');
assert.match(workflow, /timeout-minutes: 45/,
  'QA workflow must have a finite timeout');
assert.match(workflow, /Bash\(pnpm:\*\)/,
  'Claude must have permission to run local typecheck, lint and build');
assert.match(workflow, /Bash\(bash scripts\/test-db\.sh:\*\)/,
  'Claude must be allowed to run isolated PostgreSQL tests when applicable');
assert.doesNotMatch(workflow, /pull_request_target:/,
  'Never expose Anthropic or GitHub write tokens to untrusted fork PR checkouts');
assert.doesNotMatch(workflow, /\bschedule:\s*\n\s+- cron:/,
  'No paid automatic Claude sweeps unrelated to developer PRs');
assert.match(agent, /name: vento-qa-reviewer/);
assert.match(agent, /Proactively audit/);
for (const term of [
  'P0', 'P1', 'P2', 'pnpm typecheck', 'pnpm lint', 'pnpm build',
  'scripts/test-db.sh', 'SECURITY DEFINER',
  'qa/claude-pr-', 'não o agente que desenvolveu',
  'não faça reset', 'Nunca rode GitHub merges',
  'análise estática não é E2E',
]) {
  assert.ok(agent.toLowerCase().includes(term.toLowerCase()),
    `Reviewer must explicitly cover: ${term}`);
}
assert.match(instructions, /AINDA NÃO ATIVO/,
  'Documentation must not falsely imply Claude is already connected');
assert.match(instructions, /CLAUDE_CODE_OAUTH_TOKEN/);
assert.match(instructions, /VENTO_CLAUDE_QA_ENABLED/);
console.log('PASS: independent Claude Code QA is staged and gated, no paid usage, secure PR isolation');
