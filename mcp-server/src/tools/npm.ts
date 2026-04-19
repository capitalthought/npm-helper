/**
 * npm CLI wrappers. Each tool is a thin shell around `npm` with the flags
 * set correctly + stdout/stderr captured so the classifier can inspect it.
 */

import { spawn } from 'node:child_process'

export interface NpmResult {
  stdout: string
  stderr: string
  exit_code: number
}

export async function runNpm(args: string[], input?: string): Promise<NpmResult> {
  return new Promise((resolve) => {
    const proc = spawn('npm', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('close', (code) => resolve({ stdout, stderr, exit_code: code ?? -1 }))
    if (input) proc.stdin.write(input)
    proc.stdin.end()
  })
}

export async function whoami(): Promise<NpmResult> {
  return runNpm(['whoami'])
}

export async function profileGet(): Promise<NpmResult> {
  return runNpm(['profile', 'get', '--json'])
}

export async function tokenList(): Promise<NpmResult> {
  return runNpm(['token', 'list', '--json'])
}

export async function tokenRevoke(id: string): Promise<NpmResult> {
  return runNpm(['token', 'revoke', id])
}

export async function packageAccess(pkg: string): Promise<NpmResult> {
  return runNpm(['access', 'get', pkg, '--json'])
}

export async function publish(opts: {
  access?: 'public' | 'restricted'
  dryRun?: boolean
  token?: string
}): Promise<NpmResult> {
  const args = ['publish']
  if (opts.access) args.push(`--access=${opts.access}`)
  if (opts.dryRun) args.push('--dry-run')
  if (opts.token) args.push(`--//registry.npmjs.org/:_authToken=${opts.token}`)
  return runNpm(args)
}
