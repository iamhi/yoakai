# CLAUDE.md

This file provides guidance when working with code in this repository.

## What this repo is

Yoakai is a single-purpose tool: execute Google Antigravity (`agy`) in headless mode using a relative prompt file, with auto-approved permissions by default, configurable model and effort defaults, and zero runtime dependencies.

It is shipped through **two surfaces at once from the same repo**:

- npm CLI (`yoakai` binary on `PATH`, via `package.json` `bin`)
- Plugin (skill + `/yoakai` slash command, via `.claude-plugin/`)

Both surfaces ultimately execute `bin/yoakai.js`. Keep the behavior identical across them.

## Commands

```sh
npm test                          # run integration tests (node --test)
node --test test/yoakai.test.js   # same thing, explicit
node bin/yoakai.js <file>         # run the CLI directly (no install)
npm link                          # put `yoakai` on PATH for local dev
```

No build step, no lint config, no bundler. ESM only (`"type": "module"`), Node >=18.

## Architecture

1. **`bin/yoakai.js`** — the entire CLI implementation with zero runtime dependencies. Uses only Node.js standard libraries (`node:fs`, `node:path`, `node:child_process`, `node:os`, `node:process`).
   - Manages configuration (`~/.config/yoakai/config.json` and local `.yoakairc` / `.yoakai.json`).
   - Handles `yoakai config.model <value>`, `yoakai config.effort <value>`, `yoakai models`.
   - Reads relative prompt file, forwards prompt content via `-p "<content>"`, appends `--dangerously-skip-permissions` (unless disabled with `--no-permissions`), and passes through extra flags to `agy`.
   - Spawns `agy` with `stdio: 'inherit'` to preserve exit codes and real-time streaming output.

2. **`skills/yoakai/SKILL.md`** — LLM-facing instructions, activated when the user wants to run `agy` headlessly with a prompt file or manage model/effort configuration.

3. **`commands/yoakai.md`** — `/yoakai` slash command.

4. **Plugin packaging**: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.

## Testing model

`test/yoakai.test.js` uses `node:test`. Each test runs in an isolated temporary directory with a mock `agy` binary prefixed on `PATH`. The real `agy` daemon/API is never called during tests.

## Constraints to preserve

- Zero runtime dependencies in `bin/yoakai.js`. Node.js stdlib only.
- Auto-approve permissions by default (`--dangerously-skip-permissions`), with `--no-permissions` opt-out.
- Support persistent config (`config.model`, `config.effort`).
- Preserve exit status from `agy`.
