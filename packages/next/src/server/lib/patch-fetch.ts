import type { StaticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'
const CACHE_ONE_YEAR = 31536000

// we patch fetch to collect cache information used for
// determining if a page is static or not
export function patchFetch({
  serverHooks,
  staticGenerationAsyncStorage,
}: {
  serverHooks: typeof import('../../client/components/hooks-server-context')
  staticGenerationAsyncStorage: StaticGenerationAsyncStorage
}) {
  if ((globalThis.fetch as any).patched) return

  const { DynamicServerError } = serverHooks

  const originFetch = fetch
  // @ts-ignore
  // eslint-disable-next-line no-native-reassign
  fetch = async (input: RequestInfo | URL, init: RequestInit | undefined) => {
    const staticGenerationStore = staticGenerationAsyncStorage.getStore()

    // If the staticGenerationStore is not available, we can't do any special
    // treatment of fetch, therefore fallback to the original fetch
    // implementation.
    if (!staticGenerationStore) {
      return originFetch(input, init)
    }

    let revalidate: number | undefined | boolean

    if (typeof init?.next?.revalidate === 'number') {
      revalidate = init.next.revalidate
    }

    if (init?.next?.revalidate === false) {
      revalidate = CACHE_ONE_YEAR
    }

    if (
      !staticGenerationStore.revalidate ||
      (typeof revalidate === 'number' &&
        revalidate < staticGenerationStore.revalidate)
    ) {
      staticGenerationStore.revalidate = revalidate
    }

    let cacheKey: string | undefined

    const doOriginalFetch = async () => {
      return originFetch(input, init).then(async (res) => {
        if (
          staticGenerationStore.incrementalCache &&
          cacheKey &&
          typeof revalidate === 'number' &&
          revalidate > 0
        ) {
          const clonedRes = res.clone()

          let base64Body = ''

          if (process.env.NEXT_RUNTIME === 'edge') {
            let string = ''
            new Uint8Array(await clonedRes.arrayBuffer()).forEach((byte) => {
              string += String.fromCharCode(byte)
            })
            base64Body = btoa(string)
          } else {
            base64Body = Buffer.from(await clonedRes.arrayBuffer()).toString(
              'base64'
            )
          }

          await staticGenerationStore.incrementalCache.set(
            cacheKey,
            {
              kind: 'FETCH',
              data: {
                headers: Object.fromEntries(clonedRes.headers.entries()),
                body: base64Body,
              },
              revalidate,
            },
            revalidate,
            true
          )
        }
        return res
      })
    }

    if (
      staticGenerationStore.incrementalCache &&
      typeof revalidate === 'number' &&
      revalidate > 0
    ) {
      cacheKey = await staticGenerationStore.incrementalCache.fetchCacheKey(
        input.toString(),
        init
      )
      const entry = await staticGenerationStore.incrementalCache.get(
        cacheKey,
        true
      )

      if (entry?.value && entry.value.kind === 'FETCH') {
        // when stale and is revalidating we wait for fresh data
        // so the revalidated entry has the updated data
        if (!staticGenerationStore.isRevalidate || !entry.isStale) {
          if (entry.isStale) {
            if (!staticGenerationStore.pendingRevalidates) {
              staticGenerationStore.pendingRevalidates = []
            }
            staticGenerationStore.pendingRevalidates.push(
              doOriginalFetch().catch(console.error)
            )
          }

          const resData = entry.value.data
          let decodedBody = ''

          // TODO: handle non-text response bodies
          if (process.env.NEXT_RUNTIME === 'edge') {
            decodedBody = atob(resData.body)
          } else {
            decodedBody = Buffer.from(resData.body, 'base64').toString()
          }

          return new Response(decodedBody, {
            headers: resData.headers,
            status: resData.status,
          })
        }
      }
    }

    if (staticGenerationStore.isStaticGeneration) {
      if (init && typeof init === 'object') {
        const cache = init.cache
        // Delete `cache` property as Cloudflare Workers will throw an error
        if (isEdgeRuntime) {
          delete init.cache
        }
        if (cache === 'no-store') {
          staticGenerationStore.revalidate = 0
          // TODO: ensure this error isn't logged to the user
          // seems it's slipping through currently
          const dynamicUsageReason = `no-store fetch ${input}${
            staticGenerationStore.pathname
              ? ` ${staticGenerationStore.pathname}`
              : ''
          }`
          const err = new DynamicServerError(dynamicUsageReason)
          staticGenerationStore.dynamicUsageStack = err.stack
          staticGenerationStore.dynamicUsageDescription = dynamicUsageReason

          throw err
        }

        const hasNextConfig = 'next' in init
        const next = init.next || {}
        if (
          typeof next.revalidate === 'number' &&
          (typeof staticGenerationStore.revalidate === 'undefined' ||
            next.revalidate < staticGenerationStore.revalidate)
        ) {
          const forceDynamic = staticGenerationStore.forceDynamic

          if (!forceDynamic || next.revalidate !== 0) {
            staticGenerationStore.revalidate = next.revalidate
          }

          if (!forceDynamic && next.revalidate === 0) {
            const dynamicUsageReason = `revalidate: ${
              next.revalidate
            } fetch ${input}${
              staticGenerationStore.pathname
                ? ` ${staticGenerationStore.pathname}`
                : ''
            }`
            const err = new DynamicServerError(dynamicUsageReason)
            staticGenerationStore.dynamicUsageStack = err.stack
            staticGenerationStore.dynamicUsageDescription = dynamicUsageReason

            throw err
          }
        }
        if (hasNextConfig) delete init.next
      }
    }

    return doOriginalFetch()
  }
  ;(globalThis.fetch as any).patched = true
}
