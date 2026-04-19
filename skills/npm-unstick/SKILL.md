---
name: npm-unstick
description: Invoked after a failed npm publish to classify the failure, take the right recovery action, and retry once. Called automatically by the PostToolUse hook — the user rarely invokes this directly.
---

# npm-unstick

Unstick a failed publish in one shot instead of pinging the user twelve times.

## Flow

1. **Read the failure.** Pull last `npm publish` stderr from scrollback or from the hook's additionalContext hint.
2. **Classify.** Pass stderr to MCP `npm.classify_error`. Returns one of:
   - `{ action: "flip-2fa-auth-only" }`
   - `{ action: "rotate-granular-token" }`
   - `{ action: "reset-password", blocking: true }`
   - `{ action: "retry", after_seconds: N }`
   - `{ action: "fix-publishconfig", fix: { ... } }`
   - `{ action: "unknown", stderr: "..." }` → print and ask user
3. **Take the action.**
   - For each action above, invoke the corresponding skill (`/npm-set-2fa`, `/npm-rotate-token`, `/npm-doctor`).
   - For `retry` → wait and re-run the exact same `npm publish` or `git push --tags`.
   - For `fix-publishconfig` → patch the file, commit, retry.
4. **Single retry.** After one recovery + retry cycle, if it still fails, STOP. Print the new stderr, hand off to the user. Do not loop.

## Rules

- One retry. One. A second failure means we're in a new failure mode that needs diagnosis, not more retries.
- Never skip a blocking recovery (`reset-password` is blocking because it needs the human).
- If classifier returns `unknown`, do not guess — print stderr and stop. Unknown failures go into the classifier test fixtures for next time.
