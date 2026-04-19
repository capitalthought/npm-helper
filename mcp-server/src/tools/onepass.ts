/**
 * Typed wrapper over the 1Password CLI. Reads + writes secret fields
 * by item ID. Never prints secret values — everything returned either
 * goes straight to another tool or is the string itself (caller must
 * not log it).
 */

import { spawn } from 'node:child_process'

function run(args: string[]): Promise<{ stdout: string; stderr: string; exit_code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('op', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('close', (code) => resolve({ stdout, stderr, exit_code: code ?? -1 }))
    proc.stdin.end()
  })
}

export async function getField(itemId: string, field: string, vault = 'Employee'): Promise<string> {
  const r = await run([
    'item',
    'get',
    itemId,
    '--vault',
    vault,
    '--fields',
    `label=${field}`,
    '--reveal',
  ])
  if (r.exit_code !== 0) {
    throw new Error(`op item get failed: ${r.stderr}`)
  }
  return r.stdout.trim()
}

export async function setField(
  itemId: string,
  field: string,
  value: string,
  type: 'password' | 'text' = 'password',
  vault = 'Employee'
): Promise<void> {
  const r = await run([
    'item',
    'edit',
    itemId,
    '--vault',
    vault,
    `${field}[${type}]=${value}`,
  ])
  if (r.exit_code !== 0) {
    throw new Error(`op item edit failed: ${r.stderr}`)
  }
}
