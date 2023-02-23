import type { FontManifest, FontConfig } from '../server/font-utils'
import type { DomainLocale, NextConfigComplete } from '../server/config-shared'
import { NextParsedUrlQuery } from '../server/request-meta'

// `NEXT_PREBUNDLED_REACT` env var is inherited from parent process,
// then override react packages here for export worker.
if (process.env.NEXT_PREBUNDLED_REACT) {
  require('../build/webpack/require-hook').overrideBuiltInReactPackages()
}
import '../server/node-polyfill-fetch'
import { loadRequireHook } from '../build/webpack/require-hook'

import { extname, join, dirname, sep, posix } from 'path'
import fs, { promises } from 'fs'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import {
  loadComponents,
  LoadComponentsReturnType,
} from '../server/load-components'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { SERVER_PROPS_EXPORT_ERROR } from '../lib/constants'
import { requireFontManifest } from '../server/require'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { trace } from '../trace'
import { isInAmpMode } from '../shared/lib/amp-mode'
import { setHttpClientAndAgentOptions } from '../server/config'
import RenderResult from '../server/render-result'
import isError from '../lib/is-error'
import { addRequestMeta } from '../server/request-meta'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { DYNAMIC_ERROR_CODE } from '../client/components/hooks-server-context'
import { IncrementalCache } from '../server/lib/incremental-cache'
import { isNotFoundError } from '../client/components/not-found'
import { isRedirectError } from '../client/components/redirect'
import { NEXT_DYNAMIC_NO_SSR_CODE } from '../shared/lib/lazy-dynamic/no-ssr-error'
import { mockRequest } from '../server/lib/mock-request'
import { RouteKind } from '../server/future/route-kind'
import { NodeNextRequest, NodeNextResponse } from '../server/base-http/node'
import { StaticGenerationContext } from '../server/future/route-handlers/app-route-route-handler'
import { isAppRouteRoute } from '../lib/is-app-route-route'

loadRequireHook()

const envConfig = require('../shared/lib/runtime-config')

;(globalThis as any).__NEXT_DATA__ = {
  nextExport: true,
}

interface AmpValidation {
  page: string
  result: {
    errors: AmpHtmlValidator.ValidationError[]
    warnings: AmpHtmlValidator.ValidationError[]
  }
}

interface PathMap {
  page: string
  query?: NextParsedUrlQuery
}

interface ExportPageInput {
  path: string
  pathMap: PathMap
  distDir: string
  outDir: string
  pagesDataDir: string
  renderOpts: RenderOpts
  buildExport?: boolean
  serverRuntimeConfig: { [key: string]: any }
  subFolders?: boolean
  optimizeFonts: FontConfig
  optimizeCss: any
  disableOptimizedLoading: any
  parentSpanId: any
  httpAgentOptions: NextConfigComplete['httpAgentOptions']
  serverComponents?: boolean
  appPaths: string[]
  enableUndici: NextConfigComplete['experimental']['enableUndici']
  debugOutput?: boolean
  isrMemoryCacheSize?: NextConfigComplete['experimental']['isrMemoryCacheSize']
  fetchCache?: boolean
  incrementalCacheHandlerPath?: string
}

interface ExportPageResults {
  ampValidations: AmpValidation[]
  fromBuildExportRevalidate?: number | false
  fromBuildExportMeta?: {
    status?: number
    headers?: Record<string, string>
  }
  error?: boolean
  ssgNotFound?: boolean
  duration: number
}

interface RenderOpts {
  runtimeConfig?: { [key: string]: any }
  params?: { [key: string]: string | string[] }
  ampPath?: string
  ampValidatorPath?: string
  ampSkipValidation?: boolean
  optimizeFonts?: FontConfig
  disableOptimizedLoading?: boolean
  optimizeCss?: any
  fontManifest?: FontManifest
  locales?: string[]
  locale?: string
  defaultLocale?: string
  domainLocales?: DomainLocale[]
  trailingSlash?: boolean
  supportsDynamicHTML?: boolean
  incrementalCache?: import('../server/lib/incremental-cache').IncrementalCache
}

// expose AsyncLocalStorage on globalThis for react usage
const { AsyncLocalStorage } = require('async_hooks')
;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage

export default async function exportPage({
  parentSpanId,
  path,
  pathMap,
  distDir,
  outDir,
  pagesDataDir,
  renderOpts,
  buildExport,
  serverRuntimeConfig,
  subFolders,
  optimizeFonts,
  optimizeCss,
  disableOptimizedLoading,
  httpAgentOptions,
  serverComponents,
  enableUndici,
  debugOutput,
  isrMemoryCacheSize,
  fetchCache,
  incrementalCacheHandlerPath,
}: ExportPageInput): Promise<ExportPageResults> {
  setHttpClientAndAgentOptions({
    httpAgentOptions,
    experimental: { enableUndici },
  })
  const exportPageSpan = trace('export-page-worker', parentSpanId)

  return exportPageSpan.traceAsyncFn(async () => {
    const start = Date.now()
    let results: Omit<ExportPageResults, 'duration'> = {
      ampValidations: [],
    }

    try {
      const { query: originalQuery = {} } = pathMap
      const { page } = pathMap
      const isAppDir = (pathMap as any)._isAppDir
      const isDynamicError = (pathMap as any)._isDynamicError
      const filePath = normalizePagePath(path)
      const isDynamic = isDynamicRoute(page)
      const ampPath = `${filePath}.amp`
      let renderAmpPath = ampPath
      let query = { ...originalQuery }
      let params: { [key: string]: string | string[] } | undefined
      const isRouteHandler = isAppDir && isAppRouteRoute(page)

      if (isAppDir) {
        outDir = join(distDir, 'server/app')
      }

      let updatedPath = query.__nextSsgPath || path
      let locale = query.__nextLocale || renderOpts.locale
      delete query.__nextLocale
      delete query.__nextSsgPath

      if (renderOpts.locale) {
        const localePathResult = normalizeLocalePath(path, renderOpts.locales)

        if (localePathResult.detectedLocale) {
          updatedPath = localePathResult.pathname
          locale = localePathResult.detectedLocale

          if (locale === renderOpts.defaultLocale) {
            renderAmpPath = `${normalizePagePath(updatedPath)}.amp`
          }
        }
      }

      // We need to show a warning if they try to provide query values
      // for an auto-exported page since they won't be available
      const hasOrigQueryValues = Object.keys(originalQuery).length > 0
      const queryWithAutoExportWarn = () => {
        if (hasOrigQueryValues) {
          throw new Error(
            `\nError: you provided query values for ${path} which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add \`getInitialProps\`\n`
          )
        }
      }

      // Check if the page is a specified dynamic route
      const nonLocalizedPath = normalizeLocalePath(
        path,
        renderOpts.locales
      ).pathname

      if (isDynamic && page !== nonLocalizedPath) {
        const normalizedPage = isAppDir ? normalizeAppPath(page) : page

        params =
          getRouteMatcher(getRouteRegex(normalizedPage))(updatedPath) ||
          undefined
        if (params) {
          query = {
            ...query,
            ...params,
          }
        } else {
          throw new Error(
            `The provided export path '${updatedPath}' doesn't match the '${page}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`
          )
        }
      }

      const { req, res } = mockRequest(updatedPath, {}, 'GET')

      for (const statusCode of [404, 500]) {
        if (
          [
            `/${statusCode}`,
            `/${statusCode}.html`,
            `/${statusCode}/index.html`,
          ].some((p) => p === updatedPath || `/${locale}${p}` === updatedPath)
        ) {
          res.statusCode = statusCode
        }
      }

      if (renderOpts.trailingSlash && !req.url?.endsWith('/')) {
        req.url += '/'
      }

      if (
        locale &&
        buildExport &&
        renderOpts.domainLocales &&
        renderOpts.domainLocales.some(
          (dl) =>
            dl.defaultLocale === locale || dl.locales?.includes(locale || '')
        )
      ) {
        addRequestMeta(req, '__nextIsLocaleDomain', true)
      }

      envConfig.setConfig({
        serverRuntimeConfig,
        publicRuntimeConfig: renderOpts.runtimeConfig,
      })

      const getHtmlFilename = (_path: string) =>
        subFolders ? `${_path}${sep}index.html` : `${_path}.html`
      let htmlFilename = getHtmlFilename(filePath)

      // dynamic routes can provide invalid extensions e.g. /blog/[...slug] returns an
      // extension of `.slug]`
      const pageExt = isDynamic || isAppDir ? '' : extname(page)
      const pathExt = isDynamic || isAppDir ? '' : extname(path)

      // force output 404.html for backwards compat
      if (path === '/404.html') {
        htmlFilename = path
      }
      // Make sure page isn't a folder with a dot in the name e.g. `v1.2`
      else if (pageExt !== pathExt && pathExt !== '') {
        const isBuiltinPaths = ['/500', '/404'].some(
          (p) => p === path || p === path + '.html'
        )
        // If the ssg path has .html extension, and it's not builtin paths, use it directly
        // Otherwise, use that as the filename instead
        const isHtmlExtPath = !isBuiltinPaths && path.endsWith('.html')
        htmlFilename = isHtmlExtPath ? getHtmlFilename(path) : path
      } else if (path === '/') {
        // If the path is the root, just use index.html
        htmlFilename = 'index.html'
      }

      const baseDir = join(outDir, dirname(htmlFilename))
      let htmlFilepath = join(outDir, htmlFilename)

      await promises.mkdir(baseDir, { recursive: true })
      let renderResult
      let curRenderOpts: RenderOpts = {}
      const { renderToHTML } = require('../server/render')
      let renderMethod = renderToHTML
      let inAmpMode = false,
        hybridAmp = false

      const renderedDuringBuild = (getStaticProps: any) => {
        return !buildExport && getStaticProps && !isDynamicRoute(path)
      }

      let components: LoadComponentsReturnType | null = null

      if (!isRouteHandler) {
        components = await loadComponents({
          distDir,
          pathname: page,
          hasServerComponents: !!serverComponents,
          isAppPath: isAppDir,
        })
        curRenderOpts = {
          ...components,
          ...renderOpts,
          ampPath: renderAmpPath,
          params,
          optimizeFonts,
          optimizeCss,
          disableOptimizedLoading,
          fontManifest: optimizeFonts ? requireFontManifest(distDir) : null,
          locale: locale as string,
          supportsDynamicHTML: false,
        }
      }

      // during build we attempt rendering app dir paths
      // and bail when dynamic dependencies are detected
      // only fully static paths are fully generated here
      if (isAppDir) {
        if (fetchCache) {
          let CacheHandler: any

          if (incrementalCacheHandlerPath) {
            CacheHandler = require(incrementalCacheHandlerPath)
            CacheHandler = CacheHandler.default || CacheHandler
          }

          curRenderOpts.incrementalCache = new IncrementalCache({
            dev: false,
            requestHeaders: {},
            flushToDisk: true,
            maxMemoryCacheSize: isrMemoryCacheSize,
            getPrerenderManifest: () => ({
              version: 4,
              routes: {},
              dynamicRoutes: {},
              preview: {
                previewModeEncryptionKey: '',
                previewModeId: '',
                previewModeSigningKey: '',
              },
              notFoundRoutes: [],
            }),
            fs: {
              readFile: (f) => fs.promises.readFile(f, 'utf8'),
              readFileSync: (f) => fs.readFileSync(f, 'utf8'),
              writeFile: (f, d) => fs.promises.writeFile(f, d, 'utf8'),
              mkdir: (dir) => fs.promises.mkdir(dir, { recursive: true }),
              stat: (f) => fs.promises.stat(f),
            },
            serverDistDir: join(distDir, 'server'),
            CurCacheHandler: CacheHandler,
          })
        }

        const isDynamicUsageError = (err: any) =>
          err.digest === DYNAMIC_ERROR_CODE ||
          isNotFoundError(err) ||
          err.digest === NEXT_DYNAMIC_NO_SSR_CODE ||
          isRedirectError(err)

        if (isRouteHandler) {
          const { AppRouteRouteHandler } =
            require('../server/future/route-handlers/app-route-route-handler') as typeof import('../server/future/route-handlers/app-route-route-handler')

          const nodeReq = new NodeNextRequest(req)
          const nodeRes = new NodeNextResponse(res)

          addRequestMeta(
            nodeReq.originalRequest,
            '__NEXT_INIT_URL',
            `http://localhost:3000${req.url}`
          )
          const staticContext: StaticGenerationContext = {
            supportsDynamicHTML: false,
            incrementalCache: curRenderOpts.incrementalCache,
          }

          try {
            const routeHandler = new AppRouteRouteHandler()
            const response: Response = await routeHandler.handle(
              {
                params: query,
                definition: {
                  filename: posix.join(distDir, 'server', 'app', page),
                  bundlePath: posix.join('app', page),
                  kind: RouteKind.APP_ROUTE,
                  page,
                  pathname: path,
                },
              },
              nodeReq,
              nodeRes,
              staticContext,
              true
            )
            // we don't consider error status for static generation
            // except for 404
            // TODO: do we want to cache other status codes?
            const isValidStatus =
              response.status < 400 || response.status === 404

            if (isValidStatus) {
              const body = await response.blob()
              const revalidate =
                ((staticContext as any).store as any as { revalidate?: number })
                  .revalidate || false

              results.fromBuildExportRevalidate = revalidate
              const headers = Object.fromEntries(response.headers)

              if (!headers['content-type'] && body.type) {
                headers['content-type'] = body.type
              }
              results.fromBuildExportMeta = {
                status: response.status,
                headers,
              }

              await promises.writeFile(
                htmlFilepath.replace(/\.html$/, '.body'),
                Buffer.from(await body.arrayBuffer()),
                'utf8'
              )
              await promises.writeFile(
                htmlFilepath.replace(/\.html$/, '.meta'),
                JSON.stringify({
                  status: response.status,
                  headers,
                })
              )
            } else {
              results.fromBuildExportRevalidate = 0
            }
          } catch (err) {
            if (!isDynamicUsageError(err)) {
              throw err
            }
            results.fromBuildExportRevalidate = 0
          }
        } else {
          const { renderToHTMLOrFlight } =
            require('../server/app-render') as typeof import('../server/app-render')

          try {
            curRenderOpts.params ||= {}

            const result = await renderToHTMLOrFlight(
              req as any,
              res as any,
              page,
              query,
              curRenderOpts as any
            )
            const html = result?.toUnchunkedString()
            const flightData = (curRenderOpts as any).pageData
            const revalidate = (curRenderOpts as any).revalidate
            results.fromBuildExportRevalidate = revalidate

            if (revalidate !== 0) {
              await promises.writeFile(htmlFilepath, html ?? '', 'utf8')
              await promises.writeFile(
                htmlFilepath.replace(/\.html$/, '.rsc'),
                flightData
              )
            } else if (isDynamicError) {
              throw new Error(
                `Page with dynamic = "error" encountered dynamic data method on ${path}.`
              )
            }

            const { staticBailoutInfo = {} } = curRenderOpts as any

            if (
              revalidate === 0 &&
              debugOutput &&
              staticBailoutInfo?.description
            ) {
              const bailErr = new Error(
                `Static generation failed due to dynamic usage on ${path}, reason: ${staticBailoutInfo.description}`
              )
              const stack = staticBailoutInfo.stack

              if (stack) {
                bailErr.stack =
                  bailErr.message + stack.substring(stack.indexOf('\n'))
              }
              console.warn(bailErr)
            }
          } catch (err: any) {
            if (!isDynamicUsageError(err)) {
              throw err
            }
          }
        }
        return { ...results, duration: Date.now() - start }
      }

      if (!components) {
        throw new Error(
          `invariant: components were not loaded correctly during export for path: ${path}`
        )
      }

      const ampState = {
        ampFirst: components.pageConfig?.amp === true,
        hasQuery: Boolean(query.amp),
        hybrid: components.pageConfig?.amp === 'hybrid',
      }
      inAmpMode = isInAmpMode(ampState)
      hybridAmp = ampState.hybrid

      if (components.getServerSideProps) {
        throw new Error(`Error for page ${page}: ${SERVER_PROPS_EXPORT_ERROR}`)
      }

      // for non-dynamic SSG pages we should have already
      // prerendered the file
      if (renderedDuringBuild(components.getStaticProps)) {
        return { ...results, duration: Date.now() - start }
      }

      // TODO: de-dupe the logic here between serverless and server mode
      if (components.getStaticProps && !htmlFilepath.endsWith('.html')) {
        // make sure it ends with .html if the name contains a dot
        htmlFilepath += '.html'
        htmlFilename += '.html'
      }

      if (typeof components.Component === 'string') {
        renderResult = RenderResult.fromStatic(components.Component)
        queryWithAutoExportWarn()
      } else {
        /**
         * This sets environment variable to be used at the time of static export by head.tsx.
         * Using this from process.env allows targeting both serverless and SSR by calling
         * `process.env.__NEXT_OPTIMIZE_FONTS`.
         * TODO(prateekbh@): Remove this when experimental.optimizeFonts are being cleaned up.
         */
        if (optimizeFonts) {
          process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(optimizeFonts)
        }
        if (optimizeCss) {
          process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true)
        }
        try {
          renderResult = await renderMethod(
            req,
            res,
            page,
            query,
            // @ts-ignore
            curRenderOpts
          )
        } catch (err: any) {
          if (err.digest !== NEXT_DYNAMIC_NO_SSR_CODE) {
            throw err
          }
        }
      }

      results.ssgNotFound = (curRenderOpts as any).isNotFound

      const validateAmp = async (
        rawAmpHtml: string,
        ampPageName: string,
        validatorPath?: string
      ) => {
        const validator = await AmpHtmlValidator.getInstance(validatorPath)
        const result = validator.validateString(rawAmpHtml)
        const errors = result.errors.filter((e) => e.severity === 'ERROR')
        const warnings = result.errors.filter((e) => e.severity !== 'ERROR')

        if (warnings.length || errors.length) {
          results.ampValidations.push({
            page: ampPageName,
            result: {
              errors,
              warnings,
            },
          })
        }
      }

      const html = renderResult ? renderResult.toUnchunkedString() : ''
      if (inAmpMode && !curRenderOpts.ampSkipValidation) {
        if (!results.ssgNotFound) {
          await validateAmp(html, path, curRenderOpts.ampValidatorPath)
        }
      } else if (hybridAmp) {
        // we need to render the AMP version
        let ampHtmlFilename = `${ampPath}${sep}index.html`
        if (!subFolders) {
          ampHtmlFilename = `${ampPath}.html`
        }
        const ampBaseDir = join(outDir, dirname(ampHtmlFilename))
        const ampHtmlFilepath = join(outDir, ampHtmlFilename)

        try {
          await promises.access(ampHtmlFilepath)
        } catch (_) {
          let ampRenderResult
          // make sure it doesn't exist from manual mapping
          try {
            ampRenderResult = await renderMethod(
              req,
              res,
              page,
              // @ts-ignore
              { ...query, amp: '1' },
              curRenderOpts as any
            )
          } catch (err: any) {
            if (err.digest !== NEXT_DYNAMIC_NO_SSR_CODE) {
              throw err
            }
          }

          const ampHtml = ampRenderResult
            ? ampRenderResult.toUnchunkedString()
            : ''
          if (!curRenderOpts.ampSkipValidation) {
            await validateAmp(ampHtml, page + '?amp=1')
          }
          await promises.mkdir(ampBaseDir, { recursive: true })
          await promises.writeFile(ampHtmlFilepath, ampHtml, 'utf8')
        }
      }

      if ((curRenderOpts as any).pageData) {
        const dataFile = join(
          pagesDataDir,
          htmlFilename.replace(/\.html$/, '.json')
        )

        await promises.mkdir(dirname(dataFile), { recursive: true })
        await promises.writeFile(
          dataFile,
          JSON.stringify((curRenderOpts as any).pageData),
          'utf8'
        )

        if (hybridAmp) {
          await promises.writeFile(
            dataFile.replace(/\.json$/, '.amp.json'),
            JSON.stringify((curRenderOpts as any).pageData),
            'utf8'
          )
        }
      }
      results.fromBuildExportRevalidate = (curRenderOpts as any).revalidate

      if (!results.ssgNotFound) {
        // don't attempt writing to disk if getStaticProps returned not found
        await promises.writeFile(htmlFilepath, html, 'utf8')
      }
    } catch (error) {
      console.error(
        `\nError occurred prerendering page "${path}". Read more: https://nextjs.org/docs/messages/prerender-error\n` +
          (isError(error) && error.stack ? error.stack : error)
      )
      results.error = true
    }
    return { ...results, duration: Date.now() - start }
  })
}
