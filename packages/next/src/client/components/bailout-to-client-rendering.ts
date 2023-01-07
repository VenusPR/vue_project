import { suspense } from '../../shared/lib/dynamic-no-ssr'
import { staticGenerationAsyncStorage } from './static-generation-async-storage'

export function bailoutToClientRendering(): boolean | never {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.forceStatic) {
    return true
  }

  if (staticGenerationStore?.isStaticGeneration) {
    suspense()
  }

  return false
}
