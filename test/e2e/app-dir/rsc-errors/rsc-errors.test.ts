import { check } from 'next-test-utils'
import { createNextDescribe } from 'e2e-utils'

if (!(globalThis as any).isNextDev) {
  it('should skip tests for next-start', () => {})
} else {
  createNextDescribe(
    'app dir - rsc errors',
    {
      files: __dirname,
      skipDeployment: true,
    },
    ({ next }) => {
      it('should throw an error when getServerSideProps is used', async () => {
        const pageFile = 'app/client-with-errors/get-server-side-props/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace(
          '// export function getServerSideProps',
          'export function getServerSideProps'
        )
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch(
          '/client-with-errors/get-server-side-props'
        )
        await next.patchFile(pageFile, content)

        await check(async () => {
          const { status } = await next.fetch(
            '/client-with-errors/get-server-side-props'
          )
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          '"getServerSideProps\\" is not supported in app/'
        )
      })

      it('should throw an error when getStaticProps is used', async () => {
        const pageFile = 'app/client-with-errors/get-static-props/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace(
          '// export function getStaticProps',
          'export function getStaticProps'
        )
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch('/client-with-errors/get-static-props')
        await next.patchFile(pageFile, content)
        await check(async () => {
          const { status } = await next.fetch(
            '/client-with-errors/get-static-props'
          )
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          '"getStaticProps\\" is not supported in app/'
        )
      })

      it('should error for styled-jsx imports on server side', async () => {
        const html = await next.render('/server-with-errors/styled-jsx')
        expect(html).toContain(
          'This module cannot be imported from a Server Component module. It should only be used from a Client Component.'
        )
      })

      it('should error when page component export is not valid', async () => {
        const html = await next.render('/server-with-errors/page-export')
        expect(html).toContain(
          'The default export is not a React Component in page:'
        )
      })

      it('should throw an error when "use client" is on the top level but after other expressions', async () => {
        const pageFile = 'app/swc/use-client/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace("// 'use client'", "'use client'")
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch('/swc/use-client')
        await next.patchFile(pageFile, content)

        await check(async () => {
          const { status } = await next.fetch('/swc/use-client')
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          'directive must be placed before other expressions'
        )
      })

      it('should throw an error when "Component" is imported in server components', async () => {
        const pageFile = 'app/server-with-errors/class-component/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace(
          "// import { Component } from 'react'",
          "import { Component } from 'react'"
        )
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch('/server-with-errors/class-component')
        await next.patchFile(pageFile, content)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          `You’re importing a class component. It only works in a Client Component`
        )
      })
    }
  )
}
