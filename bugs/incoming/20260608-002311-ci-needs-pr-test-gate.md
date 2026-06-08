---
id: 20260608-002311-ci-needs-pr-test-gate
source_repo: procurement
target_repo: npm-helper
filed_at: 2026-06-08T00:23:11-05:00
filed_by: claude-opus-4-8
filed_from_machine: JoshM5
severity: low
status: open
repro_hash: 419cda5e
tags: [ci, branch-protection, auto-merge]
related_commit: null
gh_issue: null
---

## Summary
main is unprotected AND the only CI check on the default branch is `publish` — a release/tag workflow, NOT a PR validation gate. There is no build/test check that runs on pull_request, so there's nothing safe to require yet.

## Reproducer
# Do NOT require 'publish' as a status check — it doesn't run on pull_request and would deadlock every PR.
# Step 1: add a build/test job to a CI workflow triggered on pull_request to main.
# Step 2: then require it: gh api -X PUT .../branches/main/protection with contexts:["<that-job-name>"].

## Expected
A PR-triggered build/test check exists and is required on main, so auto-merge can't land broken code.

## Actual
Only a `publish` check exists (not PR-gated); main is unprotected. Requiring publish would block all PRs — needs a real test gate first (judgment call for the repo owner).

## Environment
- Filed from procurement during a cross-org branch-protection audit, 2026-06-08, JoshM5.
- Context: procurement closed the identical gap (PR #61 Node-22 CI fix + a required `build-test` status check on main). Josh asked to apply the same across capitalthought repos; routing via /bugfile per the stay-in-repo rule rather than mutating settings directly.
