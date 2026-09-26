---
name: yoakai
description: Use when the user wants to run Google Antigravity (agy) headlessly with a prompt file, configure default models and reasoning effort for headless agent runs, or execute non-interactive agent tasks.
---

# Yoakai

Runs Google Antigravity CLI (`agy`) in headless mode using a relative prompt file, auto-approving permissions by default and applying persistent model and effort configurations.

## How to run

Pick the first option that applies:

1. **Plugin (when running as a plugin):** the bundled script is shipped with the plugin and available at `${CLAUDE_PLUGIN_ROOT}/bin/yoakai.js`. Run:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/bin/yoakai.js" <path-to-prompt-file>
   ```

2. **CLI installed globally:** if `command -v yoakai` resolves, run:

   ```sh
   yoakai <path-to-prompt-file>
   ```

3. **Fallback:** run via Node directly:

   ```sh
   node path/to/yoakai/bin/yoakai.js <path-to-prompt-file>
   ```

## Configuration

Yoakai persists user defaults in `~/.config/yoakai/config.json`:

```sh
# Set default model (normalizes underscores to hyphens)
yoakai config.model gemini_3.8_flash
yoakai config.model gemini-3.8-flash-high

# Set default reasoning effort (low, medium, high)
yoakai config.effort high

# List available agy models
yoakai models

# View current configuration
yoakai config
```

## Options & Flags

- `<prompt-file-path>`: Relative path to the markdown or text prompt file.
- `--output-format <text|json|stream-json>`: Output format from `agy` (defaults to `text`).
- `--model <slug>`: Model slug to use (defaults to `gemini-3.8-flash` or configured default).
- `--effort <low|medium|high>`: Reasoning effort to use (defaults to `high` or configured default).
- `--no-permissions`, `--no-skip-permissions`: Do not pass `--dangerously-skip-permissions`.
- Extra flags (e.g. `--continue`, `--conversation <id>`, `--print-timeout <duration>`) are passed through to `agy`.
