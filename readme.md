# Yoakai

Execute Google Antigravity (`agy`) in headless mode using a relative prompt file, with auto-approved permissions, persistent model/effort configuration, and 0 runtime dependencies.

Based on the [Google Antigravity Headless Mode documentation](https://antigravity.google/docs/cli/headless/).

Ships as both:

- a **CLI** (`yoakai` on your `PATH`)
- a **plugin** (skill + `/yoakai` slash command)

## What it does

1. Reads a prompt file from a relative path (e.g. `yoakai ./prompts/task.md`)
2. Injects the prompt content into `agy -p "<content>"`
3. Auto-approves tool permissions by default via `--dangerously-skip-permissions`
4. Uses **Gemini 3.8 Flash (`gemini-3.8-flash`)** and **`high` reasoning effort** by default (customizable via config or flags)
5. Streams clean response text without tool call noise (or JSON when requested)
6. Forwards any additional CLI flags directly to `agy`

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

```
/plugin marketplace add iamhi/yoakai
/plugin install yoakai@yoakai
```

## Usage

### Run with a prompt file

```sh
yoakai ./prompt.md
```

### Override model or effort on the fly

```sh
yoakai ./prompt.md --model gemini-3.8-flash-high --effort high
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

Persist your preferred default model and effort across sessions:

```sh
# Set default model (supports underscores or hyphens)
yoakai config.model gemini_3.8_flash
yoakai config.model gemini-3.8-flash-high

# Set default reasoning effort
yoakai config.effort high

# Check available models
yoakai models

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
.claude-plugin/
  plugin.json         plugin manifest
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
