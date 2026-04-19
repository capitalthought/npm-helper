#!/usr/bin/env bash
# PostToolUse hook — only fires on Bash tool calls. Filters for
# `npm publish` failures and appends a classified hint to Claude's
# output so it knows which recovery action to take next. Silent
# on success or non-npm commands.
#
# Contract with Claude Code: hook reads hook event JSON on stdin,
# writes either nothing (passthrough) or an `additional_context`
# JSON payload on stdout.

set -euo pipefail

# Read the hook event payload. Claude Code passes a single JSON object.
PAYLOAD=$(cat)

# Pull the command + exit status + stderr out of the payload. Use jq if
# available; fall back to grep for minimal-dep environments.
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // ""')
  EXIT=$(printf '%s' "$PAYLOAD" | jq -r '.tool_response.exit_code // 0')
  STDERR=$(printf '%s' "$PAYLOAD" | jq -r '.tool_response.stderr // .tool_response.output // ""')
else
  # Degrade gracefully — just exit without injecting anything.
  exit 0
fi

# Only intercept npm publish failures.
case "$CMD" in
  *"npm publish"*|*"npm pub "*) ;;
  *) exit 0 ;;
esac

if [ "$EXIT" = "0" ]; then
  exit 0
fi

# Classify the failure. Mirrors the matrix in mcp-server/src/tools/classify.ts
# so the hook can give a hint even when the MCP server isn't running.
HINT=""
case "$STDERR" in
  *"EOTP"*)
    HINT='npm EOTP: this account has account-level 2FA set to auth-and-writes, so publish keeps prompting for an OTP. Run /npm-set-2fa auth-only (flips to auth-only, needs one security-key tap), then re-run the publish. Classic automation tokens do NOT bypass auth-and-writes — only a granular token with bypass-2fa does.'
    ;;
  *"requires granular token"*|*"granular access token with bypass"*)
    HINT='npm E403 (package policy): the package requires a granular access token with bypass-2fa. Run /npm-rotate-token to mint one via the web UI and push it to the GH secret.'
    ;;
  *"Incorrect password"*|*"bad password"*|*"401 Unauthorized"*)
    HINT='npm 401 (bad password): the password cached in 1Password is stale relative to npm. Run /npm-doctor to diff, then reset at npmjs.com/settings/<user>/account and update the 1P Npmjs item. All CLI flows needing --password will keep failing until this is fixed.'
    ;;
  *"403 Forbidden"*)
    HINT='npm E403: check package.json `publishConfig.access` (probably needs `public` for scoped packages) and confirm the token has write scope on the package.'
    ;;
  *"404 Not Found"*|*"no such package"*)
    HINT='npm E404: scope/package mismatch. Check the `name` field in package.json against the scope your token is authorized for. The first publish of a scoped package needs --access=public.'
    ;;
  *"rate limit"*|*"Too Many Requests"*|*"HTTP 429"*)
    HINT='npm rate-limited. Back off 60s and retry. If this was gh api, the limit is per-user 5000/hr for authed requests — the next publish attempt is unlikely to fix it; wait.'
    ;;
  *)
    # No known pattern — skip injection rather than guess.
    exit 0
    ;;
esac

# Emit the hint as structured context. Claude Code reads this as
# additional_context appended to the transcript.
jq -n --arg hint "$HINT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $hint
  }
}'
