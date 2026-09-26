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

function setupTestEnv() {
  const baseDir = mkdtempSync(join(tmpdir(), 'yoakai-test-'))
  const binDir = join(baseDir, 'bin')
  mkdirSync(binDir)
  const configHome = join(baseDir, 'config')
  mkdirSync(configHome)

  writeFileSync(join(binDir, 'agy'), mockAgyScript, { mode: 0o755 })

  const logFile = join(baseDir, 'agy_args.log')

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    XDG_CONFIG_HOME: configHome,
    MOCK_LOG_FILE: logFile
  }

  return { baseDir, binDir, configHome, logFile, env }
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
