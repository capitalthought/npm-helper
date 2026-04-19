/**
 * GitHub Actions + workflow wrappers via the `gh` CLI. We don't read
 * secret values (can't) — only set + list + wait-for-run.
 */

import { spawn } from 'node:child_process'

function run(args: string[], input?: string): Promise<{ stdout: string; stderr: string; exit_code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('close', (code) => resolve({ stdout, stderr, exit_code: code ?? -1 }))
    if (input) proc.stdin.write(input)
    proc.stdin.end()
  })
}

export async function setSecret(repo: string, name: string, value: string): Promise<void> {
  const r = await run(['secret', 'set', name, '-R', repo], value)
  if (r.exit_code !== 0) {
    throw new Error(`gh secret set failed: ${r.stderr}`)
  }
}

export async function listSecrets(repo: string): Promise<Array<{ name: string; updated_at: string }>> {
  const r = await run(['secret', 'list', '-R', repo, '--json', 'name,updatedAt'])
  if (r.exit_code !== 0) return []
  try {
    return JSON.parse(r.stdout).map((s: { name: string; updatedAt: string }) => ({
      name: s.name,
      updated_at: s.updatedAt,
    }))
  } catch {
    return []
  }
}

export async function workflowRun(repo: string, workflow: string, ref: string): Promise<void> {
  const r = await run(['workflow', 'run', workflow, '--ref', ref, '-R', repo])
  if (r.exit_code !== 0) {
    throw new Error(`gh workflow run failed: ${r.stderr}`)
  }
}

export interface WorkflowRunStatus {
  id: string
  status: string
  conclusion: string
  createdAt: string
}

export async function latestRun(repo: string, workflow: string): Promise<WorkflowRunStatus | null> {
  const r = await run([
    'run',
    'list',
    '--workflow',
    workflow,
    '--limit',
    '1',
    '-R',
    repo,
    '--json',
    'databaseId,status,conclusion,createdAt',
  ])
  if (r.exit_code !== 0) return null
  try {
    const [row] = JSON.parse(r.stdout)
    if (!row) return null
    return {
      id: String(row.databaseId),
      status: row.status,
      conclusion: row.conclusion,
      createdAt: row.createdAt,
    }
  } catch {
    return null
  }
}
