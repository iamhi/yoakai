import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const yoakaiPath = resolve(new URL('.', import.meta.url).pathname, '../bin/yoakai.js')

const mockAgyScript = `#!/usr/bin/env bash
if [[ "$1" == "models" ]]; then
  echo "gemini-3.8-flash-high     Gemini 3.8 Flash (High)"
  echo "gemini-3.7-flash-high     Gemini 3.7 Flash (High)"
  exit 0
fi

if [[ -n "$MOCK_EXIT_CODE" ]]; then
  echo "simulated error" >&2
  exit "$MOCK_EXIT_CODE"
fi

if [[ -n "$MOCK_LOG_FILE" ]]; then
  printf '%s\\n' "$@" > "$MOCK_LOG_FILE"
fi

echo "mock agy execution successful"
`

const mockCopilotScript = `#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  echo "copilot version 1.0.0"
  exit 0
fi

if [[ -n "$MOCK_COPILOT_EXIT_CODE" ]]; then
  echo "simulated copilot error" >&2
  exit "$MOCK_COPILOT_EXIT_CODE"
fi

if [[ -n "$MOCK_COPILOT_LOG_FILE" ]]; then
  printf '%s\\n' "$@" > "$MOCK_COPILOT_LOG_FILE"
fi

echo "mock copilot execution successful"
`

const mockClaudeScript = `#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  echo "claude version 1.0.0"
  exit 0
fi

if [[ -n "$MOCK_CLAUDE_EXIT_CODE" ]]; then
  echo "simulated claude error" >&2
  exit "$MOCK_CLAUDE_EXIT_CODE"
fi

if [[ -n "$MOCK_CLAUDE_LOG_FILE" ]]; then
  printf '%s\\n' "$@" > "$MOCK_CLAUDE_LOG_FILE"
fi

echo "mock claude execution successful"
`

function setupTestEnv() {
  const baseDir = mkdtempSync(join(tmpdir(), 'yoakai-test-'))
  const binDir = join(baseDir, 'bin')
  mkdirSync(binDir)
  const configHome = join(baseDir, 'config')
  mkdirSync(configHome)

  writeFileSync(join(binDir, 'agy'), mockAgyScript, { mode: 0o755 })
  writeFileSync(join(binDir, 'copilot'), mockCopilotScript, { mode: 0o755 })
  writeFileSync(join(binDir, 'claude'), mockClaudeScript, { mode: 0o755 })

  const logFile = join(baseDir, 'agy_args.log')
  const copilotLogFile = join(baseDir, 'copilot_args.log')
  const claudeLogFile = join(baseDir, 'claude_args.log')

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    XDG_CONFIG_HOME: configHome,
    MOCK_LOG_FILE: logFile,
    MOCK_COPILOT_LOG_FILE: copilotLogFile,
    MOCK_CLAUDE_LOG_FILE: claudeLogFile
  }

  return { baseDir, binDir, configHome, logFile, copilotLogFile, claudeLogFile, env }
}

function runYoakai(args, cwd, env) {
  return execFileSync('node', [yoakaiPath, ...args], {
    cwd,
    encoding: 'utf8',
    env
  })
}

test('reads prompt file and passes content with -p and default flags', () => {
  const { baseDir, logFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'test-prompt.md')
  writeFileSync(promptFile, 'What is recursion?', 'utf8')

  const output = runYoakai(['test-prompt.md'], baseDir, env)
  assert.match(output, /mock agy execution successful/)

  const loggedArgs = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(loggedArgs[0], '-p')
  assert.equal(loggedArgs[1], 'What is recursion?')
  assert.ok(loggedArgs.includes('--dangerously-skip-permissions'))
  assert.ok(loggedArgs.includes('--output-format'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--output-format') + 1], 'text')
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'gemini-3.8-flash')
  assert.ok(loggedArgs.includes('--effort'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--effort') + 1], 'high')
})

test('respects --no-permissions and omits --dangerously-skip-permissions', () => {
  const { baseDir, logFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.txt')
  writeFileSync(promptFile, 'Hello world', 'utf8')

  runYoakai(['prompt.txt', '--no-permissions'], baseDir, env)

  const loggedArgs = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(loggedArgs[0], '-p')
  assert.equal(loggedArgs[1], 'Hello world')
  assert.equal(loggedArgs.includes('--dangerously-skip-permissions'), false)
})

test('supports config.model and config.effort and applies them to runs', () => {
  const { baseDir, logFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Explain closures', 'utf8')

  // Set config.model to custom model (translates underscores to hyphens)
  const setModelOutput = runYoakai(['config.model', 'claude_sonnet_4_6'], baseDir, env)
  assert.match(setModelOutput, /Set model = claude-sonnet-4-6/)

  // Set config.effort to custom effort
  const setEffortOutput = runYoakai(['config.effort', 'medium'], baseDir, env)
  assert.match(setEffortOutput, /Set effort = medium/)

  // Run yoakai and verify updated config is applied
  runYoakai(['prompt.md'], baseDir, env)

  const loggedArgs = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'claude-sonnet-4-6')
  assert.ok(loggedArgs.includes('--effort'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--effort') + 1], 'medium')
})

test('CLI flags override configured defaults', () => {
  const { baseDir, logFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Task instructions', 'utf8')

  runYoakai(['config.model', 'gemini-3.8-flash-low'], baseDir, env)
  runYoakai(['config.effort', 'low'], baseDir, env)

  // Run with CLI overrides
  runYoakai(['prompt.md', '--model', 'claude-sonnet-4-6', '--effort', 'high'], baseDir, env)

  const loggedArgs = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'claude-sonnet-4-6')
  assert.ok(loggedArgs.includes('--effort'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--effort') + 1], 'high')
})

test('forwards arbitrary flags to agy', () => {
  const { baseDir, logFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Review code', 'utf8')

  runYoakai(['prompt.md', '--continue', '--print-timeout', '10m'], baseDir, env)

  const loggedArgs = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--continue'))
  assert.ok(loggedArgs.includes('--print-timeout'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--print-timeout') + 1], '10m')
})

test('delegates models command to agy models', () => {
  const { baseDir, env } = setupTestEnv()
  const output = runYoakai(['models'], baseDir, env)
  assert.match(output, /gemini-3\.8-flash-high/)
  assert.match(output, /gemini-3\.7-flash-high/)
})

test('exits with error when prompt file does not exist', () => {
  const { baseDir, env } = setupTestEnv()
  assert.throws(
    () => runYoakai(['non-existent-file.md'], baseDir, env),
    (err) => {
      assert.match(err.stderr, /prompt file not found/)
      assert.equal(err.status, 1)
      return true
    }
  )
})

test('propagates non-zero exit code from agy', () => {
  const { baseDir, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Failing task', 'utf8')

  assert.throws(
    () => runYoakai(['prompt.md'], baseDir, { ...env, MOCK_EXIT_CODE: '2' }),
    (err) => {
      assert.equal(err.status, 2)
      return true
    }
  )
})

test('supports configuring custom models like "GPT-6 Luna" and "gemini-3.8-flash"', () => {
  const { baseDir, logFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Test custom model', 'utf8')

  // Set model to "GPT-6 Luna"
  const setOutput1 = runYoakai(['config.model', 'GPT-6 Luna'], baseDir, env)
  assert.match(setOutput1, /Set model = GPT-6 Luna/)

  // Get model via config.model
  const getOutput1 = runYoakai(['config.model'], baseDir, env)
  assert.equal(getOutput1.trim(), 'GPT-6 Luna')

  // Run and check args passed to agy
  runYoakai(['prompt.md'], baseDir, env)
  let loggedArgs = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'GPT-6 Luna')

  // Set model to "gemini-3.8-flash"
  const setOutput2 = runYoakai(['config.model', 'gemini-3.8-flash'], baseDir, env)
  assert.match(setOutput2, /Set model = gemini-3.8-flash/)

  const getOutput2 = runYoakai(['config.model'], baseDir, env)
  assert.equal(getOutput2.trim(), 'gemini-3.8-flash')

  // Test config set model syntax
  const setOutput3 = runYoakai(['config', 'set', 'model', 'GPT-6 Luna'], baseDir, env)
  assert.match(setOutput3, /Set model = GPT-6 Luna/)

  const getOutput3 = runYoakai(['config', 'get', 'model'], baseDir, env)
  assert.equal(getOutput3.trim(), 'GPT-6 Luna')
})

test('supports configuring harness (agy, copilot, claude)', () => {
  const { baseDir, env } = setupTestEnv()

  // Default harness is agy
  const defaultHarness = runYoakai(['config.harness'], baseDir, env)
  assert.equal(defaultHarness.trim(), 'agy')

  // Set harness to copilot
  const setCopilot = runYoakai(['config.harness', 'copilot'], baseDir, env)
  assert.match(setCopilot, /Set harness = copilot/)

  const getCopilot = runYoakai(['config.harness'], baseDir, env)
  assert.equal(getCopilot.trim(), 'copilot')

  // Set harness to claude via config set
  const setClaude = runYoakai(['config', 'set', 'harness', 'claude'], baseDir, env)
  assert.match(setClaude, /Set harness = claude/)

  const getClaude = runYoakai(['config', 'get', 'harness'], baseDir, env)
  assert.equal(getClaude.trim(), 'claude')

  // Listed in full config
  const fullConfig = JSON.parse(runYoakai(['config'], baseDir, env))
  assert.equal(fullConfig.harness, 'claude')
})

test('lists available models with fallback when agy is not installed', () => {
  const { baseDir, configHome } = setupTestEnv()
  // Clean PATH without mock agy
  const cleanEnv = {
    PATH: '/usr/bin:/bin',
    XDG_CONFIG_HOME: configHome
  }

  const output = runYoakai(['models'], baseDir, cleanEnv)
  assert.match(output, /Available models:/)
  assert.match(output, /gemini-3\.8-flash/)
  assert.match(output, /claude-3-7-sonnet/)
  assert.match(output, /GPT-6 Luna/)
})

test('lists available models in json format', () => {
  const { baseDir, env } = setupTestEnv()
  const output = runYoakai(['models', '--json'], baseDir, env)
  const models = JSON.parse(output)
  assert.ok(Array.isArray(models))
  assert.ok(models.some(m => m.id === 'gemini-3.8-flash'))
  assert.ok(models.some(m => m.id === 'GPT-6 Luna'))
  assert.ok(models.some(m => m.id === 'claude-3-7-sonnet'))
})

test('lists available harnesses', () => {
  const { baseDir, env } = setupTestEnv()
  const output = runYoakai(['harnesses'], baseDir, env)
  assert.match(output, /Available harnesses:/)
  assert.match(output, /agy/)
  assert.match(output, /copilot/)
  assert.match(output, /claude/)
})

test('runs copilot harness with -p, --no-ask-user, --allow-all-tools, -s, and default model', () => {
  const { baseDir, copilotLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'copilot-prompt.md')
  writeFileSync(promptFile, 'Explain event loops', 'utf8')

  const output = runYoakai(['copilot-prompt.md', '--harness', 'copilot'], baseDir, env)
  assert.match(output, /mock copilot execution successful/)

  const loggedArgs = readFileSync(copilotLogFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(loggedArgs[0], '-p')
  assert.equal(loggedArgs[1], 'Explain event loops')
  assert.ok(loggedArgs.includes('--no-ask-user'))
  assert.ok(loggedArgs.includes('--allow-all-tools'))
  assert.ok(loggedArgs.includes('-s'))
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'gpt-4o')
})

test('respects --no-permissions in copilot harness and omits --allow-all-tools', () => {
  const { baseDir, copilotLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'copilot-prompt.md')
  writeFileSync(promptFile, 'Analyze repository', 'utf8')

  runYoakai(['copilot-prompt.md', '--harness', 'copilot', '--no-permissions'], baseDir, env)

  const loggedArgs = readFileSync(copilotLogFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(loggedArgs[0], '-p')
  assert.equal(loggedArgs.includes('--allow-all-tools'), false)
  assert.ok(loggedArgs.includes('--no-ask-user'))
})

test('supports config.harness copilot persisted across runs', () => {
  const { baseDir, copilotLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'task.md')
  writeFileSync(promptFile, 'Persistent task', 'utf8')

  runYoakai(['config.harness', 'copilot'], baseDir, env)
  runYoakai(['task.md'], baseDir, env)

  const loggedArgs = readFileSync(copilotLogFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(loggedArgs[0], '-p')
  assert.equal(loggedArgs[1], 'Persistent task')
  assert.ok(loggedArgs.includes('--allow-all-tools'))
})

test('passes custom model to copilot harness', () => {
  const { baseDir, copilotLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'task.md')
  writeFileSync(promptFile, 'Deep reasoning', 'utf8')

  runYoakai(['task.md', '--harness', 'copilot', '--model', 'o3-mini'], baseDir, env)

  const loggedArgs = readFileSync(copilotLogFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'o3-mini')
})

test('forwards arbitrary flags to copilot', () => {
  const { baseDir, copilotLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'task.md')
  writeFileSync(promptFile, 'Cloud sandbox task', 'utf8')

  runYoakai(['task.md', '--harness', 'copilot', '--cloud', '--allow-tool=write'], baseDir, env)

  const loggedArgs = readFileSync(copilotLogFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--cloud'))
  assert.ok(loggedArgs.includes('--allow-tool=write'))
})

test('propagates non-zero exit code from copilot', () => {
  const { baseDir, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Failing copilot task', 'utf8')

  assert.throws(
    () => runYoakai(['prompt.md', '--harness', 'copilot'], baseDir, { ...env, MOCK_COPILOT_EXIT_CODE: '5' }),
    (err) => {
      assert.equal(err.status, 5)
      return true
    }
  )
})

test('reports descriptive error when copilot is missing on PATH', () => {
  const { baseDir, configHome } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Missing binary task', 'utf8')

  const cleanEnv = {
    PATH: '/usr/bin:/bin',
    XDG_CONFIG_HOME: configHome
  }

  assert.throws(
    () => runYoakai(['prompt.md', '--harness', 'copilot'], baseDir, cleanEnv),
    (err) => {
      assert.match(err.stderr, /"copilot" command not found on PATH/)
      assert.match(err.stderr, /GitHub Copilot CLI/)
      assert.equal(err.status, 1)
      return true
    }
  )
})

test('runs claude harness with -p, --dangerously-skip-permissions, default model, and effort', () => {
  const { baseDir, claudeLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'claude-prompt.md')
  writeFileSync(promptFile, 'Explain async generators', 'utf8')

  const output = runYoakai(['claude-prompt.md', '--harness', 'claude'], baseDir, env)
  assert.match(output, /mock claude execution successful/)

  const loggedArgs = readFileSync(claudeLogFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(loggedArgs[0], '-p')
  assert.equal(loggedArgs[1], 'Explain async generators')
  assert.ok(loggedArgs.includes('--dangerously-skip-permissions'))
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'claude-3-7-sonnet')
  assert.ok(loggedArgs.includes('--effort'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--effort') + 1], 'high')
  assert.ok(loggedArgs.includes('--output-format'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--output-format') + 1], 'text')
})

test('respects --no-permissions in claude harness and omits --dangerously-skip-permissions', () => {
  const { baseDir, claudeLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'claude-prompt.md')
  writeFileSync(promptFile, 'Audit dependencies', 'utf8')

  runYoakai(['claude-prompt.md', '--harness', 'claude', '--no-permissions'], baseDir, env)

  const loggedArgs = readFileSync(claudeLogFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(loggedArgs[0], '-p')
  assert.equal(loggedArgs.includes('--dangerously-skip-permissions'), false)
})

test('passes custom model and effort to claude harness', () => {
  const { baseDir, claudeLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'task.md')
  writeFileSync(promptFile, 'Complex architecture prompt', 'utf8')

  runYoakai(['task.md', '--harness', 'claude', '--model', 'claude-opus-4', '--effort', 'max'], baseDir, env)

  const loggedArgs = readFileSync(claudeLogFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--model'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--model') + 1], 'claude-opus-4')
  assert.ok(loggedArgs.includes('--effort'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--effort') + 1], 'max')
})

test('forwards arbitrary flags to claude', () => {
  const { baseDir, claudeLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'task.md')
  writeFileSync(promptFile, 'Verbose task', 'utf8')

  runYoakai(['task.md', '--harness', 'claude', '--verbose', '--max-thinking-tokens', '4000'], baseDir, env)

  const loggedArgs = readFileSync(claudeLogFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--verbose'))
  assert.ok(loggedArgs.includes('--max-thinking-tokens'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--max-thinking-tokens') + 1], '4000')
})

test('propagates non-zero exit code from claude', () => {
  const { baseDir, env } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Failing claude task', 'utf8')

  assert.throws(
    () => runYoakai(['prompt.md', '--harness', 'claude'], baseDir, { ...env, MOCK_CLAUDE_EXIT_CODE: '3' }),
    (err) => {
      assert.equal(err.status, 3)
      return true
    }
  )
})

test('reports descriptive error when claude is missing on PATH', () => {
  const { baseDir, configHome } = setupTestEnv()
  const promptFile = join(baseDir, 'prompt.md')
  writeFileSync(promptFile, 'Missing claude binary task', 'utf8')

  const cleanEnv = {
    PATH: '/usr/bin:/bin',
    XDG_CONFIG_HOME: configHome
  }

  assert.throws(
    () => runYoakai(['prompt.md', '--harness', 'claude'], baseDir, cleanEnv),
    (err) => {
      assert.match(err.stderr, /"claude" command not found on PATH/)
      assert.match(err.stderr, /Claude Code CLI/)
      assert.equal(err.status, 1)
      return true
    }
  )
})

test('runs copilot harness with custom output-format', () => {
  const { baseDir, copilotLogFile, env } = setupTestEnv()
  const promptFile = join(baseDir, 'copilot-prompt.md')
  writeFileSync(promptFile, 'Output JSON task', 'utf8')

  runYoakai(['copilot-prompt.md', '--harness', 'copilot', '--output-format', 'json'], baseDir, env)

  const loggedArgs = readFileSync(copilotLogFile, 'utf8').split('\n').filter(Boolean)
  assert.ok(loggedArgs.includes('--output-format'))
  assert.equal(loggedArgs[loggedArgs.indexOf('--output-format') + 1], 'json')
  assert.equal(loggedArgs.includes('-s'), false)
})

test('dynamically resolves default model in config based on active harness', () => {
  const { baseDir, env } = setupTestEnv()

  // Default is agy -> gemini-3.8-flash
  const agyConfig = JSON.parse(runYoakai(['config'], baseDir, env))
  assert.equal(agyConfig.harness, 'agy')
  assert.equal(agyConfig.model, 'gemini-3.8-flash')

  // Switch harness to copilot -> default model is gpt-4o
  runYoakai(['config.harness', 'copilot'], baseDir, env)
  const copilotConfig = JSON.parse(runYoakai(['config'], baseDir, env))
  assert.equal(copilotConfig.harness, 'copilot')
  assert.equal(copilotConfig.model, 'gpt-4o')

  // Switch harness to claude -> default model is claude-3-7-sonnet
  runYoakai(['config.harness', 'claude'], baseDir, env)
  const claudeConfig = JSON.parse(runYoakai(['config'], baseDir, env))
  assert.equal(claudeConfig.harness, 'claude')
  assert.equal(claudeConfig.model, 'claude-3-7-sonnet')

  // Explicit model configuration overrides harness default
  runYoakai(['config.model', 'o3-mini'], baseDir, env)
  const overrideConfig = JSON.parse(runYoakai(['config'], baseDir, env))
  assert.equal(overrideConfig.model, 'o3-mini')
})



