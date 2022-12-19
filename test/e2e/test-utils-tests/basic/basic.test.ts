import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('createNext', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: __dirname,
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const res = await fetchViaHTTP(next.url, '/')
    expect(await res.text()).toContain('Hello World')
  })
})
