#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const agyCmd = isWindows ? 'agy.cmd' : 'agy'

const getGlobalConfigPath = () => {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(configHome, 'yoakai', 'config.json')
}

const getLocalConfigPath = () => {
  const rcPath = join(process.cwd(), '.yoakairc')
  if (existsSync(rcPath)) return rcPath
  const jsonPath = join(process.cwd(), '.yoakai.json')
  if (existsSync(jsonPath)) return jsonPath
  return null
}

const readJsonSafe = (path) => {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'))
    }
  } catch {
    // Ignore malformed config
  }
  return {}
}

const DEFAULT_MODEL = 'gemini-3.8-flash'
const DEFAULT_EFFORT = 'high'
const DEFAULT_OUTPUT_FORMAT = 'text'

const loadConfig = () => {
  const globalConfig = readJsonSafe(getGlobalConfigPath())
  const localPath = getLocalConfigPath()
  const localConfig = localPath ? readJsonSafe(localPath) : {}
  return {
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
    outputFormat: DEFAULT_OUTPUT_FORMAT,
    ...globalConfig,
    ...localConfig
  }
}

const saveGlobalConfig = (config) => {
  const targetPath = getGlobalConfigPath()
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

const normalizeSlug = (val) => {
  if (typeof val !== 'string') return val
  return val.trim().replace(/_/g, '-')
}

const printUsage = () => {
  console.log(`Usage:
  yoakai <prompt-file-path> [options...]
  yoakai config.<key> [value]
  yoakai config set <key> <value>
  yoakai config get <key>
  yoakai config [list]
  yoakai models

Options:
  --output-format <text|json|stream-json>  Output format (default: text)
  --model <slug>                           Model slug (default: gemini-3.8-flash)
  --effort <low|medium|high>               Reasoning effort (default: high)
  --no-permissions, --no-skip-permissions  Do not auto-approve permissions
  -h, --help                               Show this help message
  -v, --version                            Show version

Examples:
  yoakai ./prompt.md
  yoakai ./prompt.md --model claude-sonnet-4-6
  yoakai config.model gemini_3.8_flash
  yoakai config.effort high
  yoakai models`)
}

const printVersion = () => {
  try {
    const pkgPath = new URL('../package.json', import.meta.url)
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    console.log(`yoakai v${pkg.version}`)
  } catch {
    console.log('yoakai (version unknown)')
  }
}

const handleConfigCommand = (args) => {
  const first = args[0]
  const globalPath = getGlobalConfigPath()
  const currentGlobal = readJsonSafe(globalPath)

  if (first.startsWith('config.')) {
    const rawKey = first.slice(7)
    const key = rawKey === 'output-format' ? 'outputFormat' : rawKey
    const value = args[1]
    if (value === undefined) {
      const current = loadConfig()
      console.log(current[key] ?? '')
      return
    }
    const normalized = key === 'model' ? normalizeSlug(value) : value
    currentGlobal[key] = normalized
    saveGlobalConfig(currentGlobal)
    console.log(`Set ${key} = ${normalized}`)
    return
  }

  if (first === 'config') {
    const action = args[1]
    if (!action || action === 'list') {
      const config = loadConfig()
      console.log(JSON.stringify(config, null, 2))
      return
    }
    if (action === 'get') {
      const key = args[2]
      if (!key) {
        console.error('Error: missing key for config get')
        process.exit(1)
      }
      const config = loadConfig()
      console.log(config[key] ?? '')
      return
    }
    if (action === 'set') {
      const key = args[2]
      const val = args[3]
      if (!key || val === undefined) {
        console.error('Error: usage is "yoakai config set <key> <value>"')
        process.exit(1)
      }
      const normalized = key === 'model' ? normalizeSlug(val) : val
      currentGlobal[key] = normalized
      saveGlobalConfig(currentGlobal)
      console.log(`Set ${key} = ${normalized}`)
      return
    }
    console.error(`Error: unknown config action "${action}"`)
    process.exit(1)
  }
}

const rawArgs = process.argv.slice(2)

if (rawArgs.length === 0 || rawArgs.includes('-h') || rawArgs.includes('--help')) {
  printUsage()
  process.exit(0)
}

if (rawArgs.includes('-v') || rawArgs.includes('--version')) {
  printVersion()
  process.exit(0)
}

if (rawArgs[0] === 'models') {
  const result = spawnSync(agyCmd, ['models'], {
    stdio: 'inherit',
    shell: isWindows
  })
  if (result.error) {
    console.error(`Error executing agy: ${result.error.message}`)
    process.exit(1)
  }
  process.exit(result.status ?? 0)
}

if (rawArgs[0].startsWith('config.') || rawArgs[0] === 'config') {
  handleConfigCommand(rawArgs)
  process.exit(0)
}

// Find prompt file path (first positional argument not starting with -)
let promptFilePath = null
const forwardedArgs = []
let skipNext = false
let skipPermissions = true

const config = loadConfig()

for (let i = 0; i < rawArgs.length; i++) {
  if (skipNext) {
    skipNext = false
    continue
  }
  const arg = rawArgs[i]

  if (arg === '--no-permissions' || arg === '--no-skip-permissions') {
    skipPermissions = false
    continue
  }

  if (arg === '--dangerously-skip-permissions') {
    skipPermissions = true
    continue
  }

  if (!promptFilePath && !arg.startsWith('-')) {
    promptFilePath = arg
    continue
  }

  forwardedArgs.push(arg)
}

if (!promptFilePath) {
  console.error('Error: no prompt file specified.')
  printUsage()
  process.exit(1)
}

const resolvedPath = resolve(process.cwd(), promptFilePath)

if (!existsSync(resolvedPath)) {
  console.error(`Error: prompt file not found: ${promptFilePath}`)
  process.exit(1)
}

try {
  const stat = statSync(resolvedPath)
  if (!stat.isFile()) {
    console.error(`Error: specified path is not a file: ${promptFilePath}`)
    process.exit(1)
  }
} catch (err) {
  console.error(`Error reading file stats: ${err.message}`)
  process.exit(1)
}

let promptContent
try {
  promptContent = readFileSync(resolvedPath, 'utf8')
} catch (err) {
  console.error(`Error reading prompt file: ${err.message}`)
  process.exit(1)
}

const agyArgs = ['-p', promptContent]

if (skipPermissions && !forwardedArgs.includes('--dangerously-skip-permissions')) {
  agyArgs.push('--dangerously-skip-permissions')
}

// Model resolution: CLI flag > config
if (!forwardedArgs.includes('--model') && config.model) {
  agyArgs.push('--model', normalizeSlug(config.model))
}

// Effort resolution: CLI flag > config
if (!forwardedArgs.includes('--effort') && config.effort) {
  agyArgs.push('--effort', config.effort)
}

// Output format: CLI flag > config > default 'text'
const hasOutputFormat = forwardedArgs.includes('--output-format')
if (!hasOutputFormat) {
  agyArgs.push('--output-format', config.outputFormat || 'text')
}

agyArgs.push(...forwardedArgs)

const result = spawnSync(agyCmd, agyArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  shell: isWindows
})

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error('Error: "agy" command not found on PATH. Make sure Google Antigravity CLI is installed and available.')
  } else {
    console.error(`Error executing agy: ${result.error.message}`)
  }
  process.exit(1)
}

process.exit(result.status ?? 0)
