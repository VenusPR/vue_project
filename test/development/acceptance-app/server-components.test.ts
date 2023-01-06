/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'
import { check } from 'next-test-utils'

createNextDescribe(
  'Error Overlay for server components',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    describe('createContext called in Server Component', () => {
      it('should show error when React.createContext is called', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        import React from 'react'
        const Context = React.createContext()
        export default function Page() {
          return (
            <>
                <Context.Provider value="hello">
                    <h1>Page</h1>
                </Context.Provider>
            </>
          )
        }`,
            ],
          ])
        )

        expect(await session.hasRedbox(true)).toBe(true)
        await check(async () => {
          expect(await session.getRedboxSource(true)).toContain(
            `TypeError: createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component`
          )
          return 'success'
        }, 'success')
        expect(next.cliOutput).toContain(
          'createContext only works in Client Components'
        )

        await cleanup()
      })

      it('should show error when React.createContext is called in external package', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'node_modules/my-package/index.js',
              `
          const React = require('react')
          module.exports = React.createContext()
        `,
            ],
            [
              'node_modules/my-package/package.json',
              `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
            ],
            [
              'app/page.js',
              `
        import Context from 'my-package'
        export default function Page() {
          return (
            <>
                <Context.Provider value="hello">
                    <h1>Page</h1>
                </Context.Provider>
            </>
          )
        }`,
            ],
          ])
        )

        expect(await session.hasRedbox(true)).toBe(true)

        await check(async () => {
          expect(await session.getRedboxSource(true)).toContain(
            `TypeError: createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component`
          )
          return 'success'
        }, 'success')

        expect(next.cliOutput).toContain(
          'createContext only works in Client Components'
        )

        await cleanup()
      })

      it('should show error when createContext is called in external package', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'node_modules/my-package/index.js',
              `
          const { createContext } = require('react')
          module.exports = createContext()
        `,
            ],
            [
              'node_modules/my-package/package.json',
              `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
            ],
            [
              'app/page.js',
              `
        import Context from 'my-package'
        export default function Page() {
          return (
            <>
                <Context.Provider value="hello">
                    <h1>Page</h1>
                </Context.Provider>
            </>
          )
        }`,
            ],
          ])
        )

        expect(await session.hasRedbox(true)).toBe(true)

        await check(async () => {
          expect(await session.getRedboxSource(true)).toContain(
            `TypeError: createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component`
          )
          return 'success'
        }, 'success')

        expect(next.cliOutput).toContain(
          'createContext only works in Client Components'
        )
        await cleanup()
      })
    })

    describe('React component hooks called in Server Component', () => {
      it('should show error when React.<client-hook> is called', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        import React from 'react'
        export default function Page() {
          const ref = React.useRef()
          return "Hello world" 
        }`,
            ],
          ])
        )

        expect(await session.hasRedbox(true)).toBe(true)

        await check(async () => {
          expect(await session.getRedboxSource(true)).toContain(
            `Error: useRef only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
          )
          return 'success'
        }, 'success')

        expect(next.cliOutput).toContain(
          'useRef only works in Client Components'
        )

        await cleanup()
      })

      it('should show error when React.<client-hook> is called in external package', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'node_modules/my-package/index.js',
              `
          const React = require('react')
          module.exports = function Component() {
            const [state, useState] = React.useState()
            return "Hello world"
          }
        `,
            ],
            [
              'node_modules/my-package/package.json',
              `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
            ],
            [
              'app/page.js',
              `
        import Component from 'my-package'
        export default function Page() {
          return <Component />
        }`,
            ],
          ])
        )

        expect(await session.hasRedbox(true)).toBe(true)

        await check(async () => {
          expect(await session.getRedboxSource(true)).toContain(
            `Error: useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
          )
          return 'success'
        }, 'success')

        expect(next.cliOutput).toContain(
          'useState only works in Client Components'
        )

        await cleanup()
      })

      it('should show error when React client hook is called in external package', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'node_modules/my-package/index.js',
              `
          const { useEffect } = require('react')
          module.exports = function Component() {
            useEffect(() => {}, [])
            return "Hello world"
          }
        `,
            ],
            [
              'node_modules/my-package/package.json',
              `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
            ],
            [
              'app/page.js',
              `
            import Component from 'my-package'
            export default function Page() {
              return <Component />
            }`,
            ],
          ])
        )

        expect(await session.hasRedbox(true)).toBe(true)

        await check(async () => {
          expect(await session.getRedboxSource(true)).toContain(
            `Error: useEffect only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
          )
          return 'success'
        }, 'success')

        expect(next.cliOutput).toContain(
          'useEffect only works in Client Components'
        )

        await cleanup()
      })
    })

    describe('Next.js component hooks called in Server Component', () => {
      it.each([
        // TODO-APP: add test for useParams
        // ["useParams"],
        ['useRouter'],
        ['useSearchParams'],
        ['useSelectedLayoutSegment'],
        ['useSelectedLayoutSegments'],
        ['usePathname'],
      ])('should show error when %s is called', async (hook: string) => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        import { ${hook} } from 'next/navigation'
        export default function Page() {
          ${hook}() 
          return "Hello world" 
        }`,
            ],
          ])
        )

        expect(await session.hasRedbox(true)).toBe(true)

        await check(async () => {
          expect(await session.getRedboxSource(true)).toContain(
            `Error: ${hook} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
          )
          return 'success'
        }, 'success')

        expect(next.cliOutput).toContain(
          `${hook} only works in Client Components`
        )

        await cleanup()
      })
    })
  }
)
