import { check } from 'next-test-utils'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'
import { sandbox } from './helpers'

createNextDescribe(
  'Error overlay - RSC build errors',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'rsc-build-errors')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    it('should throw an error when getServerSideProps is used', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/client-with-errors/get-server-side-props'
      )

      const pageFile = 'app/client-with-errors/get-server-side-props/page.js'
      const content = await next.readFile(pageFile)
      const uncomment = content.replace(
        '// export function getServerSideProps',
        'export function getServerSideProps'
      )
      await session.patch(pageFile, uncomment)

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        '"getServerSideProps" is not supported in app/'
      )

      await cleanup()
    })

    it('should throw an error when getStaticProps is used', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/client-with-errors/get-static-props'
      )

      const pageFile = 'app/client-with-errors/get-static-props/page.js'
      const content = await next.readFile(pageFile)
      const uncomment = content.replace(
        '// export function getStaticProps',
        'export function getStaticProps'
      )
      await session.patch(pageFile, uncomment)
      await next.patchFile(pageFile, content)

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        '"getStaticProps" is not supported in app/'
      )

      await cleanup()
    })

    it('should error for styled-jsx imports on server side', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/server-with-errors/styled-jsx'
      )

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toInclude(
        'This module cannot be imported from a Server Component module. It should only be used from a Client Component.'
      )

      await cleanup()
    })

    it('should error when page component export is not valid', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/server-with-errors/page-export'
      )

      await next.patchFile(
        'app/server-with-errors/page-export/page.js',
        'export const a = 123'
      )

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toInclude(
        'The default export is not a React Component in page:'
      )

      await cleanup()
    })

    it('should throw an error when "use client" is on the top level but after other expressions', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/swc/use-client'
      )

      const pageFile = 'app/swc/use-client/page.js'
      const content = await next.readFile(pageFile)
      const uncomment = content.replace("// 'use client'", "'use client'")
      await next.patchFile(pageFile, uncomment)

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        'directive must be placed before other expressions'
      )

      await cleanup()
    })

    it('should throw an error when "Component" is imported in server components', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/server-with-errors/class-component'
      )

      const pageFile = 'app/server-with-errors/class-component/page.js'
      const content = await next.readFile(pageFile)
      const uncomment = content.replace(
        "// import { Component } from 'react'",
        "import { Component } from 'react'"
      )
      await session.patch(pageFile, uncomment)

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        `You’re importing a class component. It only works in a Client Component`
      )

      await cleanup()
    })

    it('should allow to use and handle rsc poisoning client-only', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/server-with-errors/client-only-in-server'
      )

      const file =
        'app/server-with-errors/client-only-in-server/client-only-lib.js'
      const content = await next.readFile(file)
      const uncomment = content.replace(
        "// import 'client-only'",
        "import 'client-only'"
      )
      await next.patchFile(file, uncomment)

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
      )

      await cleanup()
    })

    it('should allow to use and handle rsc poisoning server-only', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/client-with-errors/server-only-in-client'
      )

      const file =
        'app/client-with-errors/server-only-in-client/server-only-lib.js'
      const content = await next.readFile(file)
      const uncomment = content.replace(
        "// import 'server-only'",
        "import 'server-only'"
      )

      await session.patch(file, uncomment)

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a component that needs server-only. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component.`
      )

      await cleanup()
    })

    it('should error for invalid undefined module retuning from next dynamic', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/client-with-errors/dynamic'
      )

      const file = 'app/client-with-errors/dynamic/page.js'
      const content = await next.readFile(file)
      await session.patch(
        file,
        content.replace('() => <p>hello dynamic world</p>', 'undefined')
      )

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toInclude(
        `Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function.`
      )

      await cleanup()
    })

    it('should throw an error when error file is a server component', async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        '/server-with-errors/error-file'
      )

      // Remove "use client"
      await session.patch(
        'app/server-with-errors/error-file/error.js',
        'export default function Error() {}'
      )

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./app/server-with-errors/error-file/error.js
        ReactServerComponentsError:

        ./app/server-with-errors/error-file/error.js must be a Client Component. Add the \\"use client\\" directive the top of the file to resolve this issue.

           ,----
         1 | export default function Error() {}
           : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           \`----

        Import path:
        app/server-with-errors/error-file/error.js"
      `)

      // Add "use client"
      await session.patch(
        'app/server-with-errors/error-file/error.js',
        '"use client"'
      )
      expect(await session.hasRedbox(false)).toBe(false)

      // Empty file
      await session.patch('app/server-with-errors/error-file/error.js', '')

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./app/server-with-errors/error-file/error.js
        ReactServerComponentsError:

        ./app/server-with-errors/error-file/error.js must be a Client Component. Add the \\"use client\\" directive the top of the file to resolve this issue.

           ,----
         1 |  
           : ^
           \`----

        Import path:
        app/server-with-errors/error-file/error.js"
      `)

      await cleanup()
    })

    it('should be possible to open the import trace files in your editor', async () => {
      let editorRequestsCount = 0
      const { session, browser, cleanup } = await sandbox(
        next,
        undefined,
        '/editor-links',
        {
          beforePageLoad(page) {
            page.route('**/__nextjs_launch-editor**', (route) => {
              editorRequestsCount += 1
              route.fulfill()
            })
          },
        }
      )

      const componentFile = 'app/editor-links/component.js'
      const fileContent = await next.readFile(componentFile)

      await session.patch(
        componentFile,
        fileContent.replace(
          "// import { useState } from 'react'",
          "import { useState } from 'react'"
        )
      )

      expect(await session.hasRedbox(true)).toBe(true)
      await browser.waitForElementByCss('[data-with-open-in-editor-link]')
      const collapsedFrameworkGroups = await browser.elementsByCss(
        '[data-with-open-in-editor-link]'
      )
      for (const collapsedFrameworkButton of collapsedFrameworkGroups) {
        await collapsedFrameworkButton.click()
      }

      await check(() => editorRequestsCount, /2/)

      await cleanup()
    })
  }
)
