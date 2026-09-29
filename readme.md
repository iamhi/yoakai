# Yoakai

Execute AI agents (Google Antigravity `agy`, GitHub Copilot CLI `copilot`, or Claude Code `claude`) in headless mode using a relative prompt file, with auto-approved permissions, persistent model/effort configuration, and 0 runtime dependencies.

Based on the [Google Antigravity Headless Mode](https://antigravity.google/docs/cli/headless/) and [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-copilot-cli) specifications.

Ships across multiple surfaces from the same repo:

- a **CLI** (`yoakai` on your `PATH`)
- a **GitHub Copilot Plugin & Skill** (Agent Plugins 1.0 `plugin.json`, custom agent, `.agents/skills/yoakai/SKILL.md`)
- a **Claude Code Plugin** (skill + `/yoakai` slash command)

## What it does

1. Reads a prompt file from a relative path (e.g. `yoakai ./prompts/task.md`)
2. Injects the prompt content into the target harness via `-p "<content>"`
3. Auto-approves permissions cleanly according to the selected harness:
   - For `copilot`: `--allow-all-tools --no-ask-user -s`
   - For `agy` and `claude`: `--dangerously-skip-permissions`
4. Uses default models per harness (`gemini-3.8-flash` for `agy`, `gpt-4o` for `copilot`, `claude-3-7-sonnet` for `claude`), customizable via config or flags
5. Streams clean response text without interactive prompt noise
6. Forwards any additional CLI flags directly to the underlying CLI

## Install

### Global CLI (npm)

```sh
npm install -g yoakai
```

Or from local source:

```sh
cd yoakai
npm link
```

The `yoakai` binary is now available on your `PATH`.

### As a Plugin

#### In GitHub Copilot CLI:
```sh
copilot plugin install iamhi/yoakai
```

#### In Claude Code:
```
/plugin marketplace add iamhi/yoakai
/plugin install yoakai@yoakai
```

## Usage

### Run with a prompt file (default harness: agy)

```sh
yoakai ./prompt.md
```

### Run using GitHub Copilot CLI

```sh
yoakai ./prompt.md --harness copilot
```

### Override model or effort on the fly

```sh
yoakai ./prompt.md --harness copilot --model o3-mini
yoakai ./prompt.md --harness agy --model gemini-3.8-flash-high --effort high
```

### JSON output format

```sh
yoakai ./prompt.md --output-format json
```

### Disable auto-approved permissions

```sh
yoakai ./prompt.md --no-permissions
```

## Configuration

Persist your preferred default harness, model, and reasoning effort across sessions:

```sh
# Configure AI harness (copilot, agy, claude)
yoakai config.harness copilot
yoakai config.harness agy
yoakai config.harness claude

# Set default model (supports exact names, quotes, hyphens, or underscores)
yoakai config.model "GPT-6 Luna"
yoakai config.model gpt-4o
yoakai config.model gemini-3.8-flash

# Or via `config set`
yoakai config set harness copilot
yoakai config set model gpt-4o

# Get active configuration
yoakai config.harness
yoakai config.model
yoakai config get model

# Set default reasoning effort
yoakai config.effort high

# Check available models (lists Google, Anthropic, OpenAI & custom models; supports --json)
yoakai models
yoakai models --json

# Check available AI harnesses
yoakai harnesses

# View active configuration
yoakai config
```

Configuration is stored globally at `~/.config/yoakai/config.json`. You can also place a `.yoakairc` or `.yoakai.json` in any project root to override settings locally.

## Development & Tests

```sh
npm test
```

## Repo layout

```
plugin.json           Agent Plugins 1.0 manifest (GitHub Copilot)
agents/
  yoakai.agent.md     Copilot custom agent definition
.agents/skills/
  yoakai/SKILL.md     Copilot agent skill definition
.claude-plugin/
  plugin.json         Claude plugin manifest
  marketplace.json    marketplace catalog
skills/yoakai/
  SKILL.md            LLM-facing skill instructions
commands/
  yoakai.md           /yoakai slash command
bin/
  yoakai.js           zero-dependency CLI entrypoint
test/
  yoakai.test.js      isolated integration tests (node:test)
package.json
CLAUDE.md
readme.md
```

## License

MIT
