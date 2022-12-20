/* eslint-env jest */
import { sandbox } from './helpers'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import path from 'path'

describe('ReactRefreshLogBox app', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      skipStart: true,
      dependencies: {
        sass: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  test('scss syntax errors', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.write('index.module.scss', `.button { font-size: 5px; }`)
    await session.patch(
      'index.js',
      `
        import './index.module.scss';
        export default () => {
          return (
            <div>
              <p>lol</p>
            </div>
          )
        }
      `
    )

    expect(await session.hasRedbox()).toBe(false)

    // Syntax error
    await session.patch('index.module.scss', `.button { font-size: :5px; }`)
    expect(await session.hasRedbox(true)).toBe(true)
    const source = await session.getRedboxSource()
    expect(source).toMatchSnapshot()

    // Fix syntax error
    await session.patch('index.module.scss', `.button { font-size: 5px; }`)
    expect(await session.hasRedbox()).toBe(false)

    // Not local error
    await session.patch('index.module.scss', `button { font-size: 5px; }`)
    expect(await session.hasRedbox(true)).toBe(true)
    const source2 = await session.getRedboxSource()
    expect(source2).toMatchSnapshot()

    await cleanup()
  })
})
