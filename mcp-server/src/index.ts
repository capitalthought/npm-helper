#!/usr/bin/env node
/**
 * npm-helper MCP Server.
 *
 * Ships the deterministic npm error classifier + wrappers around npm,
 * 1Password, and GitHub Actions that the slash-command skills call.
 *
 * Transport: stdio (standard for Claude Code).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { classifyError } from './tools/classify.js'
import * as npm from './tools/npm.js'
import * as onepass from './tools/onepass.js'
import * as gh from './tools/gh.js'
import { fingerprintToken, loadState, saveState, statePath } from './state.js'

const server = new McpServer(
  { name: 'npm-helper-mcp', version: '0.1.0' },
  {
    capabilities: { tools: {} },
    instructions:
      'npm-helper — automates npm auth / publish / token rotation. Always call npm.classify_error on any npm publish failure before deciding what to do.',
  }
)

function ok<T>(data: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

server.registerTool(
  'npm_classify_error',
  {
    description:
      'Classify an npm stderr into a recovery action. Owns the decision tree — LLM must not re-interpret npm errors.',
    inputSchema: { stderr: z.string() },
  },
  async (args) => ok(classifyError(args.stderr))
)

server.registerTool(
  'npm_whoami',
  { description: 'Current npm login.', inputSchema: {} },
  async () => ok(await npm.whoami())
)

server.registerTool(
  'npm_profile_get',
  { description: 'npm account profile including 2FA level.', inputSchema: {} },
  async () => ok(await npm.profileGet())
)

server.registerTool(
  'npm_token_list',
  { description: 'List npm tokens on the current account.', inputSchema: {} },
  async () => ok(await npm.tokenList())
)

server.registerTool(
  'npm_package_access',
  {
    description: 'Read the publishing-access policy for a package.',
    inputSchema: { pkg: z.string() },
  },
  async (args) => ok(await npm.packageAccess(args.pkg))
)

server.registerTool(
  'npm_publish',
  {
    description:
      'Run `npm publish` with optional --access / --dry-run / inline token. Returns stdout, stderr, and exit_code so the caller can pass stderr to npm_classify_error.',
    inputSchema: {
      access: z.enum(['public', 'restricted']).optional(),
      dryRun: z.boolean().optional(),
      token: z.string().optional(),
    },
  },
  async (args) => ok(await npm.publish(args))
)

server.registerTool(
  'onepass_get_field',
  {
    description: 'Read a field from a 1Password item. Never log the returned value.',
    inputSchema: {
      item_id: z.string(),
      field: z.string(),
      vault: z.string().optional(),
    },
  },
  async (args) => {
    const value = await onepass.getField(args.item_id, args.field, args.vault)
    return ok({ value })
  }
)

server.registerTool(
  'onepass_set_field',
  {
    description: 'Write a field to a 1Password item.',
    inputSchema: {
      item_id: z.string(),
      field: z.string(),
      value: z.string(),
      type: z.enum(['password', 'text']).optional(),
      vault: z.string().optional(),
    },
  },
  async (args) => {
    await onepass.setField(args.item_id, args.field, args.value, args.type, args.vault)
    return ok({ ok: true })
  }
)

server.registerTool(
  'gh_secret_set',
  {
    description: 'Push a value to a GitHub Actions repo secret (never readable back).',
    inputSchema: {
      repo: z.string(),
      name: z.string(),
      value: z.string(),
    },
  },
  async (args) => {
    await gh.setSecret(args.repo, args.name, args.value)
    return ok({ ok: true })
  }
)

server.registerTool(
  'gh_workflow_run',
  {
    description: 'Dispatch a GitHub Actions workflow on a ref (tag or branch).',
    inputSchema: {
      repo: z.string(),
      workflow: z.string(),
      ref: z.string(),
    },
  },
  async (args) => {
    await gh.workflowRun(args.repo, args.workflow, args.ref)
    return ok({ ok: true })
  }
)

server.registerTool(
  'gh_latest_run',
  {
    description: 'Latest run of a workflow — status + conclusion.',
    inputSchema: {
      repo: z.string(),
      workflow: z.string(),
    },
  },
  async (args) => ok(await gh.latestRun(args.repo, args.workflow))
)

server.registerTool(
  'state_fingerprint',
  {
    description: 'SHA-256 of a token. Safe to log; use to compare stored token vs. live.',
    inputSchema: { token: z.string() },
  },
  async (args) => ok({ sha256: fingerprintToken(args.token) })
)

server.registerTool(
  'state_load',
  { description: 'Load the plugin state file.', inputSchema: {} },
  async () => ok({ path: statePath(), state: await loadState() })
)

server.registerTool(
  'state_save',
  {
    description: 'Overwrite the plugin state file.',
    inputSchema: {
      state: z.object({
        accounts: z.record(z.any()),
        packages: z.record(z.any()),
      }),
    },
  },
  async (args) => {
    await saveState(args.state as never)
    return ok({ ok: true })
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`npm-helper-mcp fatal: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
