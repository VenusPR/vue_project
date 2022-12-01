import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import fs from 'fs-extra'
import { join } from 'path'

describe('og-api', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
      dependencies: {
        '@vercel/og': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should respond from index', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should work', async () => {
    const res = await fetchViaHTTP(next.url, '/api/og')
    expect(res.status).toBe(200)
    const body = await res.blob()
    expect(body.size).toBeGreaterThan(0)
  })

  if ((global as any).isNextStart) {
    it('should copy files correctly', async () => {
      expect(next.cliOutput).not.toContain('Failed to copy traced files')

      expect(
        await fs.pathExists(
          join(next.testDir, '.next/standalone/.next/server/pages/api/og.js')
        )
      ).toBe(true)
      expect(
        await fs.pathExists(
          join(next.testDir, '.next/standalone/.next/server/edge-chunks')
        )
      ).toBe(true)
    })
  }
})
