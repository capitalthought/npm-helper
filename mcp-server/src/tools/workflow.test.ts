import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findPublishWorkflows, scanWorkflowContent } from './workflow.js'

describe('scanWorkflowContent', () => {
  it('matches plain `run: npm publish`', () => {
    expect(scanWorkflowContent('      - run: npm publish')).toBe('- run: npm publish')
  })

  it('matches `npm publish` with flags', () => {
    expect(
      scanWorkflowContent(
        'steps:\n  - run: npm publish --access public --provenance\n'
      )
    ).toBe('- run: npm publish --access public --provenance')
  })

  it('matches inside a multi-line `run: |` block', () => {
    const yml = `jobs:
  publish:
    steps:
      - run: |
          npm ci
          npm publish
`
    expect(scanWorkflowContent(yml)).toBe('npm publish')
  })

  it('returns null when publish is absent', () => {
    const yml = `jobs:
  ci:
    steps:
      - run: npm test
      - run: npm run build
`
    expect(scanWorkflowContent(yml)).toBeNull()
  })

  it('does not match `npm publishconfig` or other near-misses', () => {
    expect(scanWorkflowContent('      - run: npm publishconfig')).toBeNull()
  })

  it('does not match commented-out publish', () => {
    // A comment is still a line match by design — we want visibility, not false
    // confidence. But `# npm publish` with no actual step is caught so the
    // skill can show it and let the user decide.
    const yml = '      # - run: npm publish  # disabled'
    expect(scanWorkflowContent(yml)).toContain('npm publish')
  })
})

describe('findPublishWorkflows', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), 'npm-helper-wf-'))
    await fs.mkdir(path.join(root, '.github', 'workflows'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('returns empty when .github/workflows is missing', async () => {
    const bare = await fs.mkdtemp(path.join(tmpdir(), 'npm-helper-wf-bare-'))
    try {
      expect(await findPublishWorkflows(bare)).toEqual([])
    } finally {
      await fs.rm(bare, { recursive: true, force: true })
    }
  })

  it('finds the one workflow that publishes', async () => {
    await fs.writeFile(
      path.join(root, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - run: npm test\n'
    )
    await fs.writeFile(
      path.join(root, '.github', 'workflows', 'publish.yml'),
      'jobs:\n  pub:\n    steps:\n      - run: npm publish --access public\n'
    )
    const matches = await findPublishWorkflows(root)
    expect(matches).toHaveLength(1)
    expect(matches[0].path).toBe('.github/workflows/publish.yml')
    expect(matches[0].first_match).toContain('npm publish')
  })

  it('returns all matches when multiple workflows publish', async () => {
    await fs.writeFile(
      path.join(root, '.github', 'workflows', 'publish-a.yml'),
      '- run: npm publish\n'
    )
    await fs.writeFile(
      path.join(root, '.github', 'workflows', 'publish-b.yaml'),
      '- run: npm publish\n'
    )
    const matches = await findPublishWorkflows(root)
    expect(matches.map((m) => m.path).sort()).toEqual([
      '.github/workflows/publish-a.yml',
      '.github/workflows/publish-b.yaml',
    ])
  })

  it('ignores non-yaml files', async () => {
    await fs.writeFile(path.join(root, '.github', 'workflows', 'notes.md'), 'npm publish\n')
    expect(await findPublishWorkflows(root)).toEqual([])
  })
})
