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

const DEFAULT_HARNESS = 'agy'
const DEFAULT_MODEL = 'gemini-3.8-flash'
const DEFAULT_EFFORT = 'high'
const DEFAULT_OUTPUT_FORMAT = 'text'

const BUILTIN_HARNESSES = [
  { id: 'agy', name: 'Google Antigravity CLI', default: true },
  { id: 'copilot', name: 'GitHub Copilot CLI', default: false },
  { id: 'claude', name: 'Claude Code CLI', default: false }
]

const BUILTIN_MODELS = [
  // Google / Antigravity
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'Google', harness: 'agy', default: true },
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', provider: 'Google', harness: 'agy' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'Google', harness: 'agy' },
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)', provider: 'Google', harness: 'agy' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', harness: 'agy' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', harness: 'agy' },

  // Anthropic / Claude
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'Anthropic', harness: 'claude' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', harness: 'claude' },
  { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic', harness: 'claude' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'Anthropic', harness: 'claude' },

  // OpenAI / Copilot
  { id: 'GPT-6 Luna', name: 'GPT-6 Luna', provider: 'OpenAI', harness: 'copilot' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', harness: 'copilot' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', harness: 'copilot' },
  { id: 'o3-mini', name: 'o3-mini', provider: 'OpenAI', harness: 'copilot' },
  { id: 'o1', name: 'o1', provider: 'OpenAI', harness: 'copilot' }
]

const loadConfig = () => {
  const globalConfig = readJsonSafe(getGlobalConfigPath())
  const localPath = getLocalConfigPath()
  const localConfig = localPath ? readJsonSafe(localPath) : {}
  return {
    harness: DEFAULT_HARNESS,
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

const normalizeModel = (val) => {
  if (typeof val !== 'string') return val
  const trimmed = val.trim().replace(/^["'](.*)["']$/, '$1')
  return trimmed.replace(/_/g, '-')
}

const normalizeConfigValue = (key, val) => {
  if (typeof val !== 'string') return val
  const trimmed = val.trim().replace(/^["'](.*)["']$/, '$1')
  if (key === 'model') {
    return normalizeModel(trimmed)
  }
  if (key === 'harness') {
    return trimmed.toLowerCase()
  }
  return trimmed
}

const HARNESS_ADAPTERS = {
  agy: {
    command: (win) => (win ? 'agy.cmd' : 'agy'),
    displayName: 'Google Antigravity CLI',
    defaultModel: 'gemini-3.8-flash',
    buildArgs: ({ promptContent, skipPermissions, activeModel, activeEffort, activeOutputFormat, forwardedArgs }) => {
      const args = ['-p', promptContent]
      if (skipPermissions && !forwardedArgs.includes('--dangerously-skip-permissions')) {
        args.push('--dangerously-skip-permissions')
      }
      args.push('--model', normalizeModel(activeModel))
      if (activeEffort) {
        args.push('--effort', activeEffort)
      }
      args.push('--output-format', activeOutputFormat)
      args.push(...forwardedArgs)
      return args
    }
  },
  copilot: {
    command: (win) => (win ? 'copilot.cmd' : 'copilot'),
    displayName: 'GitHub Copilot CLI',
    defaultModel: 'gpt-4o',
    buildArgs: ({ promptContent, skipPermissions, activeModel, activeOutputFormat, forwardedArgs }) => {
      const args = ['-p', promptContent]
      if (!forwardedArgs.includes('--no-ask-user')) {
        args.push('--no-ask-user')
      }
      if (skipPermissions && !forwardedArgs.includes('--allow-all-tools')) {
        args.push('--allow-all-tools')
      }
      if (activeOutputFormat === 'text' && !forwardedArgs.includes('-s') && !forwardedArgs.includes('--silent')) {
        args.push('-s')
      }
      if (activeModel) {
        args.push('--model', normalizeModel(activeModel))
      }
      args.push(...forwardedArgs)
      return args
    }
  },
  claude: {
    command: (win) => (win ? 'claude.cmd' : 'claude'),
    displayName: 'Claude Code CLI',
    defaultModel: 'claude-3-7-sonnet',
    buildArgs: ({ promptContent, skipPermissions, activeModel, activeOutputFormat, forwardedArgs }) => {
      const args = ['-p', promptContent]
      if (skipPermissions && !forwardedArgs.includes('--dangerously-skip-permissions')) {
        args.push('--dangerously-skip-permissions')
      }
      if (activeModel) {
        args.push('--model', normalizeModel(activeModel))
      }
      if (activeOutputFormat) {
        args.push('--output-format', activeOutputFormat)
      }
      args.push(...forwardedArgs)
      return args
    }
  }
}

const getAvailableModels = (config = {}) => {
  const currentModel = config.model || DEFAULT_MODEL
  const models = BUILTIN_MODELS.map(m => ({
    ...m,
    isCurrent: m.id === currentModel
  }))

  if (!models.some(m => m.id === currentModel)) {
    models.push({
      id: currentModel,
      name: currentModel,
      provider: 'Custom',
      harness: config.harness || DEFAULT_HARNESS,
      isCurrent: true
    })
  }

  return models
}

const printAvailableModels = (config = {}) => {
  const models = getAvailableModels(config)
  const currentModel = config.model || DEFAULT_MODEL

  console.log('Available models:\n')

  const groups = {
    'Google (agy)': models.filter(m => m.provider === 'Google'),
    'Anthropic (claude)': models.filter(m => m.provider === 'Anthropic'),
    'OpenAI (copilot)': models.filter(m => m.provider === 'OpenAI'),
    'Custom': models.filter(m => m.provider === 'Custom')
  }

  const maxIdLen = Math.max(...models.map(m => m.id.length), 22)

  for (const [groupName, groupModels] of Object.entries(groups)) {
    if (groupModels.length === 0) continue
    console.log(`  ${groupName}:`)
    for (const m of groupModels) {
      const marker = m.id === currentModel ? '*' : ' '
      const currentLabel = m.id === currentModel ? (m.default ? '(default, current)' : '(current)') : (m.default ? '(default)' : '')
      const paddedId = m.id.padEnd(maxIdLen + 2)
      console.log(`   ${marker} ${paddedId} ${m.name} ${currentLabel}`.trimEnd())
    }
    console.log('')
  }
}

const printAvailableHarnesses = (config = {}) => {
  const currentHarness = config.harness || DEFAULT_HARNESS
  console.log('Available harnesses:\n')
  for (const h of BUILTIN_HARNESSES) {
    const marker = h.id === currentHarness ? '*' : ' '
    const label = h.id === currentHarness ? (h.default ? '(default, current)' : '(current)') : (h.default ? '(default)' : '')
    console.log(`   ${marker} ${h.id.padEnd(12)} ${h.name} ${label}`.trimEnd())
  }
  console.log('')
}

const printUsage = () => {
  console.log(`Usage:
  yoakai <prompt-file-path> [options...]
  yoakai config.<key> [value]
  yoakai config set <key> <value>
  yoakai config get <key>
  yoakai config [list]
  yoakai models [--json]
  yoakai harnesses [--json]

Options:
  --output-format <text|json|stream-json>  Output format (default: text)
  --harness <agy|copilot|claude>           AI harness (default: agy)
  --model <name|slug>                      Model name/slug (default: gemini-3.8-flash)
  --effort <low|medium|high>               Reasoning effort (default: high)
  --no-permissions, --no-skip-permissions  Do not auto-approve permissions
  -h, --help                               Show this help message
  -v, --version                            Show version

Examples:
  yoakai ./prompt.md
  yoakai ./prompt.md --model "GPT-6 Luna"
  yoakai ./prompt.md --model claude-3-7-sonnet
  yoakai config.model "GPT-6 Luna"
  yoakai config.model gemini-3.8-flash
  yoakai config.harness copilot
  yoakai config.effort high
  yoakai models
  yoakai harnesses`)
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

  if (first === 'config.models' || (first === 'config' && args[1] === 'models')) {
    const currentConfig = loadConfig()
    if (args.includes('--json')) {
      console.log(JSON.stringify(getAvailableModels(currentConfig), null, 2))
    } else {
      printAvailableModels(currentConfig)
    }
    return
  }

  if (first === 'config.harnesses' || (first === 'config' && args[1] === 'harnesses')) {
    const currentConfig = loadConfig()
    if (args.includes('--json')) {
      console.log(JSON.stringify(BUILTIN_HARNESSES, null, 2))
    } else {
      printAvailableHarnesses(currentConfig)
    }
    return
  }

  if (first.startsWith('config.')) {
    const rest = first.slice(7)
    let key
    let value
    if (rest.includes('=')) {
      const eqIdx = rest.indexOf('=')
      const rawKey = rest.slice(0, eqIdx)
      key = rawKey === 'output-format' ? 'outputFormat' : rawKey
      value = rest.slice(eqIdx + 1)
    } else {
      const rawKey = rest
      key = rawKey === 'output-format' ? 'outputFormat' : rawKey
      if (args.length > 1) {
        value = args.slice(1).join(' ')
      }
    }

    if (value === undefined) {
      const current = loadConfig()
      console.log(current[key] ?? '')
      return
    }

    const normalized = normalizeConfigValue(key, value)
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
      const rawKey = args[2]
      if (!rawKey) {
        console.error('Error: missing key for config get')
        process.exit(1)
      }
      const key = rawKey === 'output-format' ? 'outputFormat' : rawKey
      const config = loadConfig()
      console.log(config[key] ?? '')
      return
    }
    if (action === 'set') {
      const rawKey = args[2]
      if (!rawKey || args[3] === undefined) {
        console.error('Error: usage is "yoakai config set <key> <value>"')
        process.exit(1)
      }
      const key = rawKey === 'output-format' ? 'outputFormat' : rawKey
      const val = args.slice(3).join(' ')
      const normalized = normalizeConfigValue(key, val)
      currentGlobal[key] = normalized
      saveGlobalConfig(currentGlobal)
      console.log(`Set ${key} = ${normalized}`)
      return
    }
    console.error(`Error: unknown config action "${action}"`)
    process.exit(1)
  }
}

const handleModelsCommand = (args = []) => {
  const currentConfig = loadConfig()
  const wantsJson = args.includes('--json')

  if (wantsJson) {
    console.log(JSON.stringify(getAvailableModels(currentConfig), null, 2))
    return
  }

  // If harness is agy, delegate to agy models if agy is available and succeeds
  if (currentConfig.harness === 'agy') {
    const result = spawnSync(agyCmd, ['models'], {
      stdio: 'inherit',
      shell: isWindows
    })
    if (!result.error && result.status === 0) {
      return
    }
  }

  // Fallback to built-in available models list
  printAvailableModels(currentConfig)
}

const handleHarnessesCommand = (args = []) => {
  const currentConfig = loadConfig()
  const wantsJson = args.includes('--json')

  if (wantsJson) {
    console.log(JSON.stringify(BUILTIN_HARNESSES, null, 2))
    return
  }

  printAvailableHarnesses(currentConfig)
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
  handleModelsCommand(rawArgs.slice(1))
  process.exit(0)
}

if (rawArgs[0] === 'harnesses') {
  handleHarnessesCommand(rawArgs.slice(1))
  process.exit(0)
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
let cliModel = null
let cliEffort = null
let cliOutputFormat = null
let cliHarness = null

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

  if (arg === '--model') {
    cliModel = rawArgs[i + 1]
    skipNext = true
    continue
  }

  if (arg === '--effort') {
    cliEffort = rawArgs[i + 1]
    skipNext = true
    continue
  }

  if (arg === '--output-format') {
    cliOutputFormat = rawArgs[i + 1]
    skipNext = true
    continue
  }

  if (arg === '--harness') {
    cliHarness = rawArgs[i + 1]
    skipNext = true
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

const globalConfig = readJsonSafe(getGlobalConfigPath())
const localPath = getLocalConfigPath()
const localConfig = localPath ? readJsonSafe(localPath) : {}

const activeHarness = (cliHarness || localConfig.harness || globalConfig.harness || DEFAULT_HARNESS).toLowerCase()
const harnessDef = HARNESS_ADAPTERS[activeHarness]

if (!harnessDef) {
  console.error(`Error: unknown harness "${activeHarness}". Supported harnesses: ${Object.keys(HARNESS_ADAPTERS).join(', ')}`)
  process.exit(1)
}

const explicitModel = cliModel || localConfig.model || globalConfig.model
const activeModel = explicitModel ? normalizeModel(explicitModel) : harnessDef.defaultModel
const activeEffort = cliEffort || localConfig.effort || globalConfig.effort || DEFAULT_EFFORT
const activeOutputFormat = cliOutputFormat || localConfig.outputFormat || globalConfig.outputFormat || DEFAULT_OUTPUT_FORMAT

const targetCmd = harnessDef.command(isWindows)
const targetArgs = harnessDef.buildArgs({
  promptContent,
  skipPermissions,
  activeModel,
  activeEffort,
  activeOutputFormat,
  forwardedArgs
})

const result = spawnSync(targetCmd, targetArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  shell: isWindows
})

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error(`Error: "${targetCmd}" command not found on PATH. Make sure ${harnessDef.displayName} is installed and available.`)
  } else {
    console.error(`Error executing ${activeHarness}: ${result.error.message}`)
  }
  process.exit(1)
}

process.exit(result.status ?? 0)

