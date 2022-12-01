import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  getRedboxDescription,
  waitForAndOpenRuntimeError,
} from 'next-test-utils'
import path from 'path'
import webdriver from 'next-webdriver'

describe('dynamic-href', () => {
  const isDev = (global as any).isNextDev
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'dynamic-href')),
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
    })
  })
  afterAll(() => next.destroy())

  if (isDev) {
    it('should error when using dynamic href.pathname in app dir', async () => {
      const browser = await webdriver(next.url, '/object')

      // Error should show up
      await waitForAndOpenRuntimeError(browser)
      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"Error: Dynamic href \`/object/[slug]\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href"`
      )

      // Fix error
      const pageContent = await next.readFile('app/object/page.js')
      await next.patchFile(
        'app/object/page.js',
        pageContent.replace(
          "pathname: '/object/[slug]'",
          "pathname: '/object/slug'"
        )
      )
      expect(await browser.waitForElementByCss('#link').text()).toBe('to slug')

      // Navigate to new page
      await browser.elementByCss('#link').click()
      expect(await browser.waitForElementByCss('#pathname').text()).toBe(
        '/object/slug'
      )
      expect(await browser.elementByCss('#slug').text()).toBe('1')
    })

    it('should error when using dynamic href in app dir', async () => {
      const browser = await webdriver(next.url, '/string')

      // Error should show up
      await waitForAndOpenRuntimeError(browser)
      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"Error: Dynamic href \`/object/[slug]\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href"`
      )
    })
  } else {
    it('should not error on /object in prod', async () => {
      const browser = await webdriver(next.url, '/object')
      expect(await browser.elementByCss('#link').text()).toBe('to slug')
    })
    it('should not error on /string in prod', async () => {
      const browser = await webdriver(next.url, '/string')
      expect(await browser.elementByCss('#link').text()).toBe('to slug')
    })
  }
})
