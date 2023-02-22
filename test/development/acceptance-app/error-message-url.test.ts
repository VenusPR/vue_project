import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'
import { sandbox } from './helpers'

createNextDescribe(
  'Error overlay - error message urls',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    it('should be possible to click url in build error', async () => {
      const { session, browser, cleanup } = await sandbox(next)

      const content = await next.readFile('app/page.js')

      await session.patch(
        'app/page.js',
        content + '\nexport function getServerSideProps() {}'
      )

      expect(await session.hasRedbox(true)).toBe(true)

      const link = await browser.elementByCss('[data-nextjs-terminal] a')
      const text = await link.text()
      const href = await link.getAttribute('href')
      expect(text).toEqual(
        'https://beta.nextjs.org/docs/data-fetching/fundamentals'
      )
      expect(href).toEqual(
        'https://beta.nextjs.org/docs/data-fetching/fundamentals'
      )

      await cleanup()
    })

    it('should be possible to click url in runtime error', async () => {
      const { session, browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `'use client'
            export default function Page() {
              return typeof window === 'undefined' ? 'HELLO' : 'WORLD'
            }
            `,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      const link = await browser.elementByCss(
        '#nextjs__container_errors_desc a'
      )
      const text = await link.text()
      const href = await link.getAttribute('href')
      expect(text).toEqual(
        'https://nextjs.org/docs/messages/react-hydration-error'
      )
      expect(href).toEqual(
        'https://nextjs.org/docs/messages/react-hydration-error'
      )

      await cleanup()
    })
  }
)
