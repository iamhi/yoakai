---
description: Execute AI agents (Google Antigravity, GitHub Copilot CLI, or Claude Code) headlessly with a prompt file.
---

Run yoakai against a prompt file path.

Steps:

1. Verify the prompt file path exists in the cwd. If missing, alert the user.
2. Run the bundled script:
   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/bin/yoakai.js" <prompt-file-path> [options...]
   ```
   Or if `${CLAUDE_PLUGIN_ROOT}` is not set, run `yoakai <prompt-file-path> [options...]`.
3. Report the agent run result and status to the user.
