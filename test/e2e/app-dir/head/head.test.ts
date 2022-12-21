import fs from 'fs-extra'
import path from 'path'
import { createNextDescribe } from 'e2e-utils'
import escapeStringRegexp from 'escape-string-regexp'

createNextDescribe(
  'app dir head',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should use head from index page', async () => {
      const $ = await next.render$('/')
      const headTags = $('head').children().toArray()

      // should not include default tags in page with head.js provided
      expect($.html()).not.toContain(
        '<meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>'
      )
      expect(headTags.find((el) => el.attribs.src === '/hello.js')).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should use correct head for /blog', async () => {
      const $ = await next.render$('/blog')
      const headTags = $('head').children().toArray()

      expect(headTags.find((el) => el.attribs.src === '/hello3.js')).toBeFalsy()
      expect(
        headTags.find((el) => el.attribs.src === '/hello1.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/hello2.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should use head from layout when not on page', async () => {
      const $ = await next.render$('/blog/about')
      const headTags = $('head').children().toArray()

      expect(
        headTags.find((el) => el.attribs.src === '/hello1.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/hello2.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should pass params to head for dynamic path', async () => {
      const $ = await next.render$('/blog/post-1')
      const headTags = $('head').children().toArray()

      expect(
        headTags.find(
          (el) =>
            el.attribs.src === '/hello3.js' &&
            el.attribs['data-slug'] === 'post-1'
        )
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should apply head when navigating client-side', async () => {
      const browser = await next.browser('/')

      const getTitle = () => browser.elementByCss('title').text()

      expect(await getTitle()).toBe('hello from index')
      await browser
        .elementByCss('#to-blog')
        .click()
        .waitForElementByCss('#layout', 2000)

      expect(await getTitle()).toBe('hello from blog layout')
      await browser.back().waitForElementByCss('#to-blog', 2000)
      expect(await getTitle()).toBe('hello from index')
      await browser
        .elementByCss('#to-blog-slug')
        .click()
        .waitForElementByCss('#layout', 2000)
      expect(await getTitle()).toBe('hello from dynamic blog page post-1')
    })

    it('should treat next/head as client components but not apply', async () => {
      const errors = []
      next.on('stderr', (args) => {
        errors.push(args)
      })
      const html = await next.render('/next-head')
      expect(html).not.toMatch(/<title>legacy-head<\/title>/)

      if (globalThis.isNextDev) {
        expect(
          errors.filter(
            (output) =>
              output ===
              `Warning: You're using \`next/head\` inside app directory, please migrate to \`head.js\`. Checkout https://beta.nextjs.org/docs/api-reference/file-conventions/head for details.\n`
          ).length
        ).toBe(1)

        const dynamicChunkPath = path.join(
          next.testDir,
          '.next',
          'static/chunks/_app-client_app_next-head_client-head_js.js'
        )
        const content = await fs.readFile(dynamicChunkPath, 'utf-8')
        expect(content).not.toMatch(
          new RegExp(escapeStringRegexp(`next/dist/shared/lib/head.js`), 'm')
        )
        expect(content).toMatch(
          new RegExp(
            escapeStringRegexp(`next/dist/client/components/noop-head.js`),
            'm'
          )
        )
      }
    })
  }
)
