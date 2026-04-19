/**
 * Workflow scanner — finds `.github/workflows/*.yml` files that run
 * `npm publish`. Used by /npm-register so we can auto-detect which
 * workflow to point state.json's `publish_workflow` at.
 *
 * We intentionally do NOT parse the YAML with a real parser. A regex
 * over raw file bytes is:
 *   (a) fast, (b) dependency-free, (c) tolerant of weird but legal
 *   YAML variations (commented blocks, anchors, etc.) that a strict
 *   parser would trip on.
 *
 * The regex looks for `npm publish` as a word-boundary match on any
 * line, which catches:
 *   - `run: npm publish`
 *   - `run: npm publish --access public`
 *   - `- npm publish`
 *   - multi-line `run: |` blocks with `npm publish` on a continuation line
 *
 * It does NOT catch obfuscated variants like `npm  publish` (double
 * space) or `npm "publish"`. Those are rare enough that the manual
 * fallback (ask the user) is fine.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface WorkflowMatch {
  /** Path relative to the repo root, e.g. `.github/workflows/publish.yml`. */
  path: string
  /** First matching line for debug / disambiguation. */
  first_match: string
}

const NPM_PUBLISH_RE = /\bnpm\s+publish\b/

/**
 * Scan a YAML file for `npm publish`. Returns the first matching line
 * (trimmed) or `null` if the file doesn't publish.
 */
export function scanWorkflowContent(content: string): string | null {
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    if (NPM_PUBLISH_RE.test(line)) return line.trim()
  }
  return null
}

/**
 * Find workflow files under `<repoRoot>/.github/workflows/` that invoke
 * `npm publish`. Returns all matches — the caller (skill) decides what
 * to do when there's more than one.
 */
export async function findPublishWorkflows(repoRoot: string): Promise<WorkflowMatch[]> {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows')
  let entries: string[]
  try {
    entries = await fs.readdir(workflowsDir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  const matches: WorkflowMatch[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue
    const full = path.join(workflowsDir, entry)
    let content: string
    try {
      content = await fs.readFile(full, 'utf8')
    } catch {
      continue
    }
    const hit = scanWorkflowContent(content)
    if (hit) {
      matches.push({
        path: path.join('.github', 'workflows', entry),
        first_match: hit,
      })
    }
  }
  return matches
}
