# CLAUDE.md

This file provides guidance when working with code in this repository.

## What this repo is

Yoakai is a single-purpose tool: execute AI agent CLIs (Google Antigravity `agy`, GitHub Copilot CLI `copilot`, Claude Code `claude`) in headless mode using a relative prompt file, with auto-approved permissions by default, configurable harness/model/effort defaults, and zero runtime dependencies.

It is shipped through multiple surfaces from the same repo:

- npm CLI (`yoakai` binary on `PATH`, via `package.json` `bin`)
- GitHub Copilot Plugin & Skill (`plugin.json`, `agents/yoakai.agent.md`, `.agents/skills/yoakai/SKILL.md`)
- Claude Plugin (skill + `/yoakai` slash command, via `.claude-plugin/`)

All surfaces ultimately execute `bin/yoakai.js`. Keep the behavior identical across them.

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
   - Handles `yoakai config.model <value>`, `yoakai config.harness <value>` (`agy`, `copilot`, `claude`), `yoakai config.effort <value>`, `yoakai models [--json]`, `yoakai harnesses`.
   - Uses `HARNESS_ADAPTERS` to translate arguments:
     - `agy`: `-p "<content>"`, `--dangerously-skip-permissions`, `--model`, `--effort`, `--output-format`
     - `copilot`: `-p "<content>"`, `--no-ask-user`, `--allow-all-tools`, `-s`, `--model`, `--output-format`
     - `claude`: `-p "<content>"`, `--dangerously-skip-permissions`, `--model`, `--effort`, `--output-format`
   - Spawns the harness with `stdio: 'inherit'` to preserve exit codes and real-time streaming output.

2. **Copilot Plugin & Skills**:
   - `plugin.json` — Agent Plugins 1.0 manifest for GitHub Copilot.
   - `com.github.copilot/agents/yoakai.agent.md` & `agents/yoakai.agent.md` — Copilot custom agent definitions.
   - `.agents/skills/yoakai/SKILL.md` (Google Antigravity) & `skills/yoakai/SKILL.md` (Agent Plugins / Claude) — Agent skills.

3. **Claude Plugin**:
   - `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
   - `commands/yoakai.md` — `/yoakai` slash command.

## Testing model

`test/yoakai.test.js` uses `node:test`. Each test runs in an isolated temporary directory with mock `agy`, `copilot`, and `claude` binaries prefixed on `PATH`. The real daemons/APIs are never called during tests.

## Constraints to preserve

- Zero runtime dependencies in `bin/yoakai.js`. Node.js stdlib only.
- Auto-approve permissions by default (`--dangerously-skip-permissions` for `agy`/`claude`, `--allow-all-tools` for `copilot`), with `--no-permissions` opt-out.
- Support persistent config (`config.model`, `config.harness`, `config.effort`).
- Preserve exit status from underlying agent CLIs.

