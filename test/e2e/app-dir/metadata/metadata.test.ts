import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { BrowserInterface } from 'test/lib/browsers/base'
import cheerio from 'cheerio'

createNextDescribe(
  'app dir - metadata',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    const getTitle = (browser: BrowserInterface) =>
      browser.elementByCss('title').text()

    async function checkMeta(
      browser: BrowserInterface,
      queryValue: string,
      expected: string | string[],
      queryKey: string = 'property',
      tag: string = 'meta',
      domAttributeField: string = 'content'
    ) {
      const values = await browser.eval(
        `[...document.querySelectorAll('${tag}[${queryKey}="${queryValue}"]')].map((el) => el.getAttribute("${domAttributeField}"))`
      )
      if (Array.isArray(expected)) {
        expect(values).toEqual(expected)
      } else {
        expect(values[0]).toBe(expected)
      }
    }

    function createDomMatcher(browser: BrowserInterface) {
      /**
       * @param tag - tag name, e.g. 'meta'
       * @param query - query string, e.g. 'name="description"'
       * @param expectedObject - expected object, e.g. { content: 'my description' }
       * @returns {Promise<void>} - promise that resolves when the check is done
       *
       * @example
       * const matchDom = createDomMatcher(browser)
       * await matchDom('meta', 'name="description"', { content: 'description' })
       */
      return async (
        tag: string,
        query: string,
        expectedObject: Record<string, string>
      ) => {
        const props = await browser.eval(`
          const el = document.querySelector('${tag}[${query}]');
          const res = {}
          const keys = ${JSON.stringify(Object.keys(expectedObject))}
          for (const k of keys) {
            res[k] = el?.getAttribute(k)
          }
          res
        `)
        expect(props).toEqual(expectedObject)
      }
    }

    function createMultiHtmlMatcher($: ReturnType<typeof cheerio.load>) {
      /**
       * @param tag - tag name, e.g. 'meta'
       * @param queryKey - query key, e.g. 'property'
       * @param domAttributeField - dom attribute field, e.g. 'content'
       * @param expected - expected object, e.g. { description: 'my description' }
       * @returns {Promise<void>} - promise that resolves when the check is done
       *
       * @example
       *
       * const $ = await next.render$('html')
       * const matchHtml = createHtmlMatcher($)
       * await matchHtml('meta', 'name', 'property', {
       *   description: 'description',
       *   og: 'og:description'
       * })
       *
       */
      return (
        tag: string,
        queryKey: string,
        domAttributeField: string,
        expected: Record<string, string | string[]>
      ) => {
        const res = {}
        for (const key of Object.keys(expected)) {
          const el = $(`${tag}[${queryKey}="${key}"]`)
          if (el.length > 1) {
            res[key] = el.toArray().map((el) => el.attribs[domAttributeField])
          } else {
            res[key] = el.attr(domAttributeField)
          }
        }
        expect(res).toEqual(expected)
      }
    }

    function createMultiDomMatcher(browser: BrowserInterface) {
      /**
       * @param tag - tag name, e.g. 'meta'
       * @param queryKey - query key, e.g. 'property'
       * @param domAttributeField - dom attribute field, e.g. 'content'
       * @param expected - expected object, e.g. { description: 'my description' }
       * @returns {Promise<void>} - promise that resolves when the check is done
       *
       * @example
       * const matchMultiDom = createMultiDomMatcher(browser)
       * await matchMultiDom('meta', 'property', 'content', {
       *   description: 'description',
       *   'og:title': 'title',
       *   'twitter:title': 'title'
       * })
       *
       */
      return async (
        tag: string,
        queryKey: string,
        domAttributeField: string,
        expected: Record<string, string | string[]>
      ) => {
        await Promise.all(
          Object.keys(expected).map(async (key) => {
            return checkMeta(
              browser,
              key,
              expected[key],
              queryKey,
              tag,
              domAttributeField
            )
          })
        )
      }
    }

    const checkMetaNameContentPair = (
      browser: BrowserInterface,
      name: string,
      content: string | string[]
    ) => checkMeta(browser, name, content, 'name')

    const checkLink = (
      browser: BrowserInterface,
      rel: string,
      content: string | string[]
    ) => checkMeta(browser, rel, content, 'rel', 'link', 'href')

    describe('basic', () => {
      it('should support title and description', async () => {
        const browser = await next.browser('/title')
        expect(await browser.eval(`document.title`)).toBe(
          'this is the page title'
        )
        await checkMetaNameContentPair(
          browser,
          'description',
          'this is the layout description'
        )
      })

      it('should support title template', async () => {
        const browser = await next.browser('/title-template')
        // Use the parent layout (root layout) instead of app/title-template/layout.tsx
        expect(await browser.eval(`document.title`)).toBe('Page')
      })

      it('should support stashed title in one layer of page and layout', async () => {
        const browser = await next.browser('/title-template/extra')
        // Use the parent layout (app/title-template/layout.tsx) instead of app/title-template/extra/layout.tsx
        expect(await browser.eval(`document.title`)).toBe('Extra Page | Layout')
      })

      it('should use parent layout title when no title is defined in page', async () => {
        const browser = await next.browser('/title-template/use-layout-title')
        expect(await browser.eval(`document.title`)).toBe(
          'title template layout default'
        )
      })

      it('should support stashed title in two layers of page and layout', async () => {
        const $inner = await next.render$('/title-template/extra/inner')
        expect(await $inner('title').text()).toBe('Inner Page | Extra Layout')

        const $deep = await next.render$('/title-template/extra/inner/deep')
        expect(await $deep('title').text()).toBe(
          'extra layout default | Layout'
        )
      })

      it('should support other basic tags', async () => {
        const browser = await next.browser('/basic')
        const matchDom = createDomMatcher(browser)
        const matchMultiDom = createMultiDomMatcher(browser)

        await matchMultiDom('meta', 'name', 'content', {
          generator: 'next.js',
          'application-name': 'test',
          referrer: 'origin-when-cross-origin',
          keywords: 'next.js,react,javascript',
          author: ['huozhi', 'tree'],
          'color-scheme': 'dark',
          viewport:
            'width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-visual',
          creator: 'shu',
          publisher: 'vercel',
          robots: 'index, follow',
          'format-detection': 'telephone=no, address=no, email=no',
        })

        await matchMultiDom('link', 'rel', 'href', {
          manifest: 'https://github.com/manifest.json',
          author: 'https://tree.com',
          preconnect: '/preconnect-url',
          preload: '/preload-url',
          'dns-prefetch': '/dns-prefetch-url',
        })

        await matchDom('meta', 'name="theme-color"', {
          media: '(prefers-color-scheme: dark)',
          content: 'cyan',
        })
      })

      it('should support apple related tags `itunes` and `appWebApp`', async () => {
        const browser = await next.browser('/apple')
        const matchMultiDom = createMultiDomMatcher(browser)

        await matchMultiDom('meta', 'name', 'content', {
          'apple-itunes-app': 'app-id=myAppStoreID, app-argument=myAppArgument',
          'apple-mobile-web-app-capable': 'yes',
          'apple-mobile-web-app-title': 'Apple Web App',
          'apple-mobile-web-app-status-bar-style': 'black-translucent',
        })

        const matchDom = createDomMatcher(browser)

        await matchDom(
          'link',
          'href="/assets/startup/apple-touch-startup-image-768x1004.png"',
          {
            rel: 'apple-touch-startup-image',
            media: null,
          }
        )

        await matchDom(
          'link',
          'href="/assets/startup/apple-touch-startup-image-1536x2008.png"',
          {
            rel: 'apple-touch-startup-image',
            media: '(device-width: 768px) and (device-height: 1024px)',
          }
        )
      })

      it('should support alternate tags', async () => {
        const browser = await next.browser('/alternate')
        await checkLink(browser, 'canonical', 'https://example.com')
        await checkMeta(
          browser,
          'en-US',
          'https://example.com/en-US',
          'hreflang',
          'link',
          'href'
        )
        await checkMeta(
          browser,
          'de-DE',
          'https://example.com/de-DE',
          'hreflang',
          'link',
          'href'
        )
        await checkMeta(
          browser,
          'only screen and (max-width: 600px)',
          '/mobile',
          'media',
          'link',
          'href'
        )
        const matchDom = createDomMatcher(browser)

        await matchDom('link', 'title="js title"', {
          type: 'application/rss+xml',
          href: 'blog/js.rss',
        })
        await matchDom('link', 'title="rss"', {
          type: 'application/rss+xml',
          href: 'blog.rss',
        })
      })

      it('should support robots tags', async () => {
        const $ = await next.render$('/robots')
        const matchMultiDom = createMultiHtmlMatcher($)

        await matchMultiDom('meta', 'name', 'content', {
          robots: 'noindex, follow, nocache',
          googlebot:
            'index, nofollow, noimageindex, max-video-preview:standard, max-image-preview:-1, max-snippet:-1',
        })
      })

      it('should support verification tags', async () => {
        const $ = await next.render$('/verification')
        const matchMultiDom = createMultiHtmlMatcher($)
        await matchMultiDom('meta', 'name', 'content', {
          'google-site-verification': 'google',
          y_key: 'yahoo',
          'yandex-verification': 'yandex',
          me: ['my-email', 'my-link'],
        })
      })

      it('should support appLinks tags', async () => {
        const browser = await next.browser('/app-links')
        const matchMultiDom = createMultiDomMatcher(browser)
        await matchMultiDom('meta', 'property', 'content', {
          'al:ios:url': 'https://example.com/ios',
          'al:ios:app_store_id': 'app_store_id',
          'al:android:package': 'com.example.android/package',
          'al:android:app_name': 'app_name_android',
          'al:web:should_fallback': 'true',
        })
      })

      it('should apply metadata when navigating client-side', async () => {
        const browser = await next.browser('/')

        expect(await getTitle(browser)).toBe('index page')
        await browser
          .elementByCss('#to-basic')
          .click()
          .waitForElementByCss('#basic')

        await checkMetaNameContentPair(
          browser,
          'referrer',
          'origin-when-cross-origin'
        )
        await browser.back().waitForElementByCss('#index')
        expect(await getTitle(browser)).toBe('index page')
        await browser
          .elementByCss('#to-title')
          .click()
          .waitForElementByCss('#title')
        expect(await getTitle(browser)).toBe('this is the page title')
      })

      it('should support generateMetadata export', async () => {
        const browser = await next.browser('/async/slug')
        expect(await getTitle(browser)).toBe('params - slug')

        await checkMetaNameContentPair(browser, 'keywords', 'parent,child')

        await browser.loadPage(next.url + '/async/blog?q=xxx')
        await check(
          () => browser.elementByCss('p').text(),
          /params - blog query - xxx/
        )
      })

      it('should support notFound and redirect in generateMetadata', async () => {
        const resNotFound = await next.fetch('/async/not-found')
        expect(resNotFound.status).toBe(404)
        const notFoundHtml = await resNotFound.text()
        expect(notFoundHtml).not.toBe('not-found-text')
        expect(notFoundHtml).toContain('This page could not be found.')

        const resRedirect = await next.fetch('/async/redirect')
        expect(resRedirect.status).toBe(307)
      })

      it('should handle metadataBase for urls resolved as only URL type', async () => {
        // including few urls in opengraph and alternates
        const url$ = await next.render$('/metadata-base/url')

        // compose with metadataBase
        expect(url$('link[rel="canonical"]').attr('href')).toBe(
          'https://bar.example/url/subpath'
        )

        // override metadataBase
        const urlInstance$ = await next.render$('/metadata-base/url-instance')
        expect(urlInstance$('meta[property="og:url"]').attr('content')).toBe(
          'http://https//outerspace.com/huozhi.png'
        )
      })
    })

    describe('opengraph', () => {
      it('should support opengraph tags', async () => {
        const browser = await next.browser('/opengraph')
        const matchMultiDom = createMultiDomMatcher(browser)
        await matchMultiDom('meta', 'property', 'content', {
          'og:title': 'My custom title',
          'og:description': 'My custom description',
          'og:url': 'https://example.com/',
          'og:site_name': 'My custom site name',
          'og:locale': 'en-US',
          'og:type': 'website',
          'og:image': [
            'https://example.com/image.png',
            'https://example.com/image2.png',
          ],
          'og:image:width': ['800', '1800'],
          'og:image:height': ['600', '1600'],
          'og:image:alt': 'My custom alt',
        })
      })

      it('should support opengraph with article type', async () => {
        const browser = await next.browser('/opengraph/article')
        const matchMultiDom = createMultiDomMatcher(browser)
        await matchMultiDom('meta', 'property', 'content', {
          'og:title': 'My custom title',
          'og:description': 'My custom description',
          'og:type': 'article',
          'article:published_time': '2023-01-01T00:00:00.000Z',
          'article:author': ['author1', 'author2', 'author3'],
        })
      })

      it('should pick up opengraph-image and twitter-image as static metadata files', async () => {
        const $ = await next.render$('/opengraph/static')
        expect($('[property="og:image"]').attr('content')).toMatch(
          /https:\/\/example.com\/_next\/static\/media\/metadata\/opengraph-image.\w+.png/
        )
        expect($('[property="og:image:type"]').attr('content')).toBe(
          'image/png'
        )
        expect($('[property="og:image:width"]').attr('content')).toBe('114')
        expect($('[property="og:image:height"]').attr('content')).toBe('114')

        expect($('[name="twitter:image"]').attr('content')).toMatch(
          /https:\/\/example.com\/_next\/static\/media\/metadata\/twitter-image.\w+.png/
        )
        expect($('[name="twitter:card"]').attr('content')).toBe(
          'summary_large_image'
        )

        // favicon shouldn't be overridden
        const $icon = $('link[rel="icon"]')
        expect($icon.attr('href')).toMatch(
          /_next\/static\/media\/metadata\/favicon.\w+.ico/
        )
      })
    })

    describe('icons', () => {
      it('should support basic object icons field', async () => {
        const browser = await next.browser('/icons')

        await checkLink(browser, 'shortcut icon', '/shortcut-icon.png')
        await checkLink(browser, 'icon', '/icon.png')
        await checkLink(browser, 'apple-touch-icon', '/apple-icon.png')
        await checkLink(browser, 'other-touch-icon', '/other-touch-icon.png')
      })

      it('should support basic string icons field', async () => {
        const browser = await next.browser('/icons/string')
        await checkLink(browser, 'icon', '/icon.png')
      })

      it('should support basic complex descriptor icons field', async () => {
        const browser = await next.browser('/icons/descriptor')
        const matchDom = createDomMatcher(browser)

        await checkLink(browser, 'shortcut icon', '/shortcut-icon.png')
        await checkLink(browser, 'icon', [
          '/icon.png',
          'https://example.com/icon.png',
        ])
        await checkLink(browser, 'apple-touch-icon', [
          '/apple-icon.png',
          '/apple-icon-x3.png',
        ])

        await checkLink(browser, 'other-touch-icon', '/other-touch-icon.png')

        await matchDom('link', 'href="/apple-icon-x3.png"', {
          sizes: '180x180',
          type: 'image/png',
        })
      })

      it('should not hoist meta[itemProp] to head', async () => {
        const $ = await next.render$('/')
        expect($('head meta[itemProp]').length).toBe(0)
        expect($('header meta[itemProp]').length).toBe(1)
      })

      it('should support root level of favicon.ico', async () => {
        let $ = await next.render$('/')
        let $icon = $('link[rel="icon"]')
        expect($icon.attr('href')).toMatch(
          /_next\/static\/media\/metadata\/favicon.\w+.ico/
        )
        expect($icon.attr('type')).toBe('image/x-icon')
        expect($icon.attr('sizes')).toBe('any')

        $ = await next.render$('/basic')
        $icon = $('link[rel="icon"]')
        expect($icon.attr('href')).toMatch(
          /_next\/static\/media\/metadata\/favicon.\w+.ico/
        )
        expect($icon.attr('sizes')).toBe('any')
      })
    })

    describe('file based icons', () => {
      it('should render icon and apple touch icon meta if their images are specified', async () => {
        const $ = await next.render$('/icons/static/nested')

        const $icon = $('head > link[rel="icon"][type!="image/x-icon"]')
        const $appleIcon = $('head > link[rel="apple-touch-icon"]')

        expect($icon.attr('href')).toMatch(
          /\/_next\/static\/media\/metadata\/icon1\.\w+\.png/
        )
        expect($icon.attr('sizes')).toBe('32x32')
        expect($icon.attr('type')).toBe('image/png')
        expect($appleIcon.attr('href')).toMatch(
          /\/_next\/static\/media\/metadata\/apple-icon\.\w+\.png/
        )
        expect($appleIcon.attr('type')).toBe('image/png')
        expect($appleIcon.attr('sizes')).toMatch('114x114')
      })

      it('should not render if image file is not specified', async () => {
        const $ = await next.render$('/icons/static')

        const $icon = $('head > link[rel="icon"][type!="image/x-icon"]')
        const $appleIcon = $('head > link[rel="apple-touch-icon"]')

        expect($icon.attr('href')).toMatch(
          /\/_next\/static\/media\/metadata\/icon\.\w+\.png/
        )
        expect($icon.attr('sizes')).toBe('114x114')

        expect($appleIcon.length).toBe(0)
      })

      if (isNextDev) {
        it('should handle hmr updates to the file icon', async () => {
          await next.renameFile(
            'app/icons/static/icon.png',
            'app/icons/static/icon2.png'
          )

          await check(async () => {
            const $ = await next.render$('/icons/static')
            const $icon = $('head > link[rel="icon"][type!="image/x-icon"]')
            return $icon.attr('href')
          }, /\/_next\/static\/media\/metadata\/icon2\.\w+\.png/)

          await next.renameFile(
            'app/icons/static/icon2.png',
            'app/icons/static/icon.png'
          )
        })
      }
    })

    describe('twitter', () => {
      it('should support default twitter summary card', async () => {
        const browser = await next.browser('/twitter')
        const matchMultiDom = createMultiDomMatcher(browser)

        await matchMultiDom('meta', 'name', 'content', {
          'twitter:title': 'Twitter Title',
          'twitter:description': 'Twitter Description',
          'twitter:site:id': 'siteId',
          'twitter:creator': 'creator',
          'twitter:creator:id': 'creatorId',
          'twitter:image': 'https://twitter.com/image.png',
          'twitter:card': 'summary',
        })
      })

      it('should support default twitter summary_large_image card', async () => {
        const browser = await next.browser('/twitter/large-image')
        const matchMultiDom = createMultiDomMatcher(browser)

        await matchMultiDom('meta', 'name', 'content', {
          'twitter:title': 'Twitter Title',
          'twitter:description': 'Twitter Description',
          'twitter:site:id': 'siteId',
          'twitter:creator': 'creator',
          'twitter:creator:id': 'creatorId',
          'twitter:image': 'https://twitter.com/image.png',
          'twitter:image:alt': 'image-alt',
          'twitter:card': 'summary_large_image',
        })
      })

      it('should support default twitter player card', async () => {
        const browser = await next.browser('/twitter/player')
        const matchMultiDom = createMultiDomMatcher(browser)

        await matchMultiDom('meta', 'name', 'content', {
          'twitter:title': 'Twitter Title',
          'twitter:description': 'Twitter Description',
          'twitter:site:id': 'siteId',
          'twitter:creator': 'creator',
          'twitter:creator:id': 'creatorId',
          'twitter:image': 'https://twitter.com/image.png',
          // player properties
          'twitter:card': 'player',
          'twitter:player': 'https://twitter.com/player',
          'twitter:player:stream': 'https://twitter.com/stream',
          'twitter:player:width': '100',
          'twitter:player:height': '100',
        })
      })

      it('should support default twitter app card', async () => {
        const browser = await next.browser('/twitter/app')
        const matchMultiDom = createMultiDomMatcher(browser)

        await matchMultiDom('meta', 'name', 'content', {
          'twitter:title': 'Twitter Title',
          'twitter:description': 'Twitter Description',
          'twitter:site:id': 'siteId',
          'twitter:creator': 'creator',
          'twitter:creator:id': 'creatorId',
          'twitter:image': [
            'https://twitter.com/image-100x100.png',
            'https://twitter.com/image-200x200.png',
          ],
          // app properties
          'twitter:card': 'app',
          'twitter:app:id:iphone': 'twitter_app://iphone',
          'twitter:app:id:ipad': 'twitter_app://ipad',
          'twitter:app:id:googleplay': 'twitter_app://googleplay',
          'twitter:app:url:iphone': 'https://iphone_url',
          'twitter:app:url:ipad': 'https://ipad_url',
          'twitter:app:url:googleplay': undefined,
        })
      })
    })

    describe('react cache', () => {
      it('should have same title and page value on initial load', async () => {
        const browser = await next.browser('/cache-deduping')
        const value = await browser.elementByCss('#value').text()
        const value2 = await browser.elementByCss('#value2').text()
        // Value in the title should match what's shown on the page component
        const title = await browser.eval(`document.title`)
        const obj = JSON.parse(title)
        // Check `cache()`
        expect(obj.val.toString()).toBe(value)
        // Check `fetch()`
        // TODO-APP: Investigate why fetch deduping doesn't apply but cache() does.
        if (!isNextDev) {
          expect(obj.val2.toString()).toBe(value2)
        }
      })

      it('should have same title and page value when navigating', async () => {
        const browser = await next.browser('/cache-deduping/navigating')
        await browser
          .elementByCss('#link-to-deduping-page')
          .click()
          .waitForElementByCss('#value')
        const value = await browser.elementByCss('#value').text()
        const value2 = await browser.elementByCss('#value2').text()
        // Value in the title should match what's shown on the page component
        const title = await browser.eval(`document.title`)
        const obj = JSON.parse(title)
        // Check `cache()`
        expect(obj.val.toString()).toBe(value)
        // Check `fetch()`
        // TODO-APP: Investigate why fetch deduping doesn't apply but cache() does.
        if (!isNextDev) {
          expect(obj.val2.toString()).toBe(value2)
        }
      })
    })
  }
)
