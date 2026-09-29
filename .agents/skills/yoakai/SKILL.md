---
name: yoakai
description: Use when the user wants to run headless AI agents (Google Antigravity, GitHub Copilot CLI, or Claude Code) with a prompt file, configure default models, harnesses, and reasoning effort, or execute non-interactive agent tasks.
---

# Yoakai

Runs AI agent CLIs (Google Antigravity `agy`, GitHub Copilot CLI `copilot`, or Claude Code `claude`) in headless mode using a relative prompt file, auto-approving permissions by default and applying persistent model, harness, and effort configurations.

## How to run

Pick the first option that applies:

1. **CLI installed globally:** if `command -v yoakai` resolves, run:

   ```sh
   yoakai <path-to-prompt-file>
   ```

2. **Copilot / Claude Plugin:** if running as a plugin, run via the bundled script:

   ```sh
   node "${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-.}}/bin/yoakai.js" <path-to-prompt-file>
   ```

3. **Fallback:** run via Node directly:

   ```sh
   node path/to/yoakai/bin/yoakai.js <path-to-prompt-file>
   ```

## Configuration

Yoakai persists user defaults in `~/.config/yoakai/config.json`:

```sh
# Configure AI harness (copilot, agy, claude)
yoakai config.harness copilot
yoakai config.harness agy
yoakai config.harness claude

# Set default model (supports exact names, quotes, hyphens, or underscores)
yoakai config.model gpt-4o
yoakai config.model "GPT-6 Luna"
yoakai config.model gemini-3.8-flash

# Set default reasoning effort (low, medium, high)
yoakai config.effort high

# List available models (supports --json)
yoakai models
yoakai models --json

# List available AI harnesses
yoakai harnesses

# View current configuration
yoakai config
```

## Options & Flags

- `<prompt-file-path>`: Relative path to the markdown or text prompt file.
- `--harness <copilot|agy|claude>`: AI harness to use (defaults to `agy` or configured default).
- `--model <name|slug>`: Model to use (defaults to harness default or configured default).
- `--output-format <text|json|stream-json>`: Output format.
- `--effort <low|medium|high>`: Reasoning effort to use (defaults to `high` or configured default).
- `--no-permissions`, `--no-skip-permissions`: Do not auto-approve permissions (`--dangerously-skip-permissions` for `agy`/`claude`, `--allow-all-tools` for `copilot`).
- Extra flags (e.g. `--cloud`, `--allow-tool <tool>`, `--continue`) are forwarded directly to the selected harness CLI.

