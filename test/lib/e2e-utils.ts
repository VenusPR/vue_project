import path from 'path'
import assert from 'assert'
import { flushAllTraces, setGlobal, trace } from 'next/src/trace'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { NextInstance, NextInstanceOpts } from './next-modes/base'
import { NextDevInstance } from './next-modes/next-dev'
import { NextStartInstance } from './next-modes/next-start'
import { NextDeployInstance } from './next-modes/next-deploy'
import { shouldRunTurboDevTest } from './next-test-utils'

// increase timeout to account for yarn install time
jest.setTimeout(240 * 1000)

const testsFolder = path.join(__dirname, '..')

let testFile
const testFileRegex = /\.test\.(js|tsx?)/

const visitedModules = new Set()
const checkParent = (mod) => {
  if (!mod?.parent || visitedModules.has(mod)) return
  testFile = mod.parent.filename || ''
  visitedModules.add(mod)

  if (!testFileRegex.test(testFile)) {
    checkParent(mod.parent)
  }
}
checkParent(module)

process.env.TEST_FILE_PATH = testFile

let testMode = process.env.NEXT_TEST_MODE

if (!testFileRegex.test(testFile)) {
  throw new Error(
    `e2e-utils imported from non-test file ${testFile} (must end with .test.(js,ts,tsx)`
  )
}

const testFolderModes = ['e2e', 'development', 'production']

const testModeFromFile = testFolderModes.find((mode) =>
  testFile.startsWith(path.join(testsFolder, mode))
)

if (testModeFromFile === 'e2e') {
  const validE2EModes = ['dev', 'start', 'deploy']

  if (!process.env.NEXT_TEST_JOB && !testMode) {
    require('console').warn(
      'Warn: no NEXT_TEST_MODE set, using default of start'
    )
    testMode = 'start'
  }
  assert(
    validE2EModes.includes(testMode),
    `NEXT_TEST_MODE must be one of ${validE2EModes.join(
      ', '
    )} for e2e tests but received ${testMode}`
  )
} else if (testModeFromFile === 'development') {
  testMode = 'dev'
} else if (testModeFromFile === 'production') {
  testMode = 'start'
}

if (testMode === 'dev') {
  ;(global as any).isNextDev = true
} else if (testMode === 'deploy') {
  ;(global as any).isNextDeploy = true
} else {
  ;(global as any).isNextStart = true
}

if (!testMode) {
  throw new Error(
    `No 'NEXT_TEST_MODE' set in environment, this is required for e2e-utils`
  )
}
require('console').warn(
  `Using test mode: ${testMode} in test folder ${testModeFromFile}`
)

/**
 * FileRef is wrapper around a file path that is meant be copied
 * to the location where the next instance is being created
 */
export class FileRef {
  public fsPath: string

  constructor(path: string) {
    this.fsPath = path
  }
}

let nextInstance: NextInstance | undefined = undefined

if (typeof afterAll === 'function') {
  afterAll(async () => {
    if (nextInstance) {
      await nextInstance.destroy()
      throw new Error(
        `next instance not destroyed before exiting, make sure to call .destroy() after the tests after finished`
      )
    }
  })
}

const setupTracing = () => {
  if (!process.env.NEXT_TEST_TRACE) return

  setGlobal('distDir', './test/.trace')
  // This is a hacky way to use tracing utils even for tracing test utils.
  // We want the same treatment as DEVELOPMENT_SERVER - adds a reasonable treshold for logs size.
  setGlobal('phase', PHASE_DEVELOPMENT_SERVER)
}

/**
 * Sets up and manages a Next.js instance in the configured
 * test mode. The next instance will be isolated from the monorepo
 * to prevent relying on modules that shouldn't be
 */
export async function createNext(
  opts: NextInstanceOpts & { skipStart?: boolean }
): Promise<NextInstance> {
  try {
    if (nextInstance) {
      throw new Error(`createNext called without destroying previous instance`)
    }

    setupTracing()
    return await trace('createNext').traceAsyncFn(async (rootSpan) => {
      const useTurbo = !!process.env.TEST_WASM
        ? false
        : opts?.turbo ?? shouldRunTurboDevTest()

      if (testMode === 'dev') {
        // next dev
        rootSpan.traceChild('init next dev instance').traceFn(() => {
          nextInstance = new NextDevInstance({
            ...opts,
            turbo: useTurbo,
          })
        })
      } else if (testMode === 'deploy') {
        // Vercel
        rootSpan.traceChild('init next deploy instance').traceFn(() => {
          nextInstance = new NextDeployInstance({
            ...opts,
            turbo: false,
          })
        })
      } else {
        // next build + next start
        rootSpan.traceChild('init next start instance').traceFn(() => {
          nextInstance = new NextStartInstance({
            ...opts,
            turbo: false,
          })
        })
      }

      nextInstance.on('destroy', () => {
        nextInstance = undefined
      })

      await nextInstance.setup(rootSpan)

      if (!opts.skipStart) {
        await rootSpan
          .traceChild('start next instance')
          .traceAsyncFn(async () => {
            await nextInstance.start()
          })
      }

      return nextInstance!
    })
  } catch (err) {
    require('console').error('Failed to create next instance', err)
    try {
      nextInstance.destroy()
    } catch (_) {}
    process.exit(1)
  } finally {
    flushAllTraces()
  }
}

export function createNextDescribe(
  name: string,
  options: Parameters<typeof createNext>[0] & {
    skipDeployment?: boolean
    dir?: string
  },
  fn: (context: {
    isNextDev: boolean
    isNextDeploy: boolean
    isNextStart: boolean
    next: NextInstance
  }) => void
): void {
  describe(name, () => {
    if (options.skipDeployment) {
      // When the environment is running for deployment tests.
      if ((global as any).isNextDeploy) {
        it('should skip next deploy', () => {})
        // No tests are run.
        return
      }
    }

    let next: NextInstance
    beforeAll(async () => {
      next = await createNext(options)
    })
    afterAll(async () => {
      await next.destroy()
    })

    const nextProxy = new Proxy<NextInstance>({} as NextInstance, {
      get: function (_target, property) {
        const prop = next[property]
        return typeof prop === 'function' ? prop.bind(next) : prop
      },
    })
    fn({
      get isNextDev(): boolean {
        return Boolean((global as any).isNextDev)
      },

      get isNextDeploy(): boolean {
        return Boolean((global as any).isNextDeploy)
      },
      get isNextStart(): boolean {
        return Boolean((global as any).isNextStart)
      },
      get next() {
        return nextProxy
      },
    })
  })
}
