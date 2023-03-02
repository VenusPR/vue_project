import { ChildProcess } from 'child_process'
import { Worker as JestWorker } from 'next/dist/compiled/jest-worker'
import { getNodeOptionsWithoutInspect } from '../server/lib/utils'
type FarmOptions = ConstructorParameters<typeof JestWorker>[1]

const RESTARTED = Symbol('restarted')

export class Worker {
  private _worker: JestWorker | undefined

  constructor(
    workerPath: string,
    options: FarmOptions & {
      timeout?: number
      onRestart?: (method: string, args: any[], attempts: number) => void
      exposedMethods: ReadonlyArray<string>
    }
  ) {
    let { timeout, onRestart, ...farmOptions } = options

    let restartPromise: Promise<typeof RESTARTED>
    let resolveRestartPromise: (arg: typeof RESTARTED) => void
    let activeTasks = 0

    this._worker = undefined

    const createWorker = () => {
      this._worker = new JestWorker(workerPath, {
        ...farmOptions,
        forkOptions: {
          ...farmOptions.forkOptions,
          env: {
            ...((farmOptions.forkOptions?.env || {}) as any),
            ...process.env,
            // we don't pass down NODE_OPTIONS as it can
            // extra memory usage
            NODE_OPTIONS: getNodeOptionsWithoutInspect()
              .replace(/--max-old-space-size=[\d]{1,}/, '')
              .trim(),
          } as any,
        },
      }) as JestWorker
      restartPromise = new Promise(
        (resolve) => (resolveRestartPromise = resolve)
      )

      for (const worker of ((this._worker as any)._workerPool?._workers ||
        []) as {
        _child: ChildProcess
      }[]) {
        worker._child.on('exit', (code, signal) => {
          if (code || signal) {
            console.error(
              `Static worker unexpectedly exited with code: ${code} and signal: ${signal}`
            )
          }
        })
      }

      this._worker.getStdout().pipe(process.stdout)
      this._worker.getStderr().pipe(process.stderr)
    }
    createWorker()

    const onHanging = () => {
      const worker = this._worker
      if (!worker) return
      const resolve = resolveRestartPromise
      createWorker()
      worker.end().then(() => {
        resolve(RESTARTED)
      })
    }

    let hangingTimer: NodeJS.Timeout | false = false

    const onActivity = () => {
      if (hangingTimer) clearTimeout(hangingTimer)
      hangingTimer = activeTasks > 0 && setTimeout(onHanging, timeout)
    }

    for (const method of farmOptions.exposedMethods) {
      if (method.startsWith('_')) continue
      ;(this as any)[method] = timeout
        ? // eslint-disable-next-line no-loop-func
          async (...args: any[]) => {
            activeTasks++
            try {
              let attempts = 0
              for (;;) {
                onActivity()
                const result = await Promise.race([
                  (this._worker as any)[method](...args),
                  restartPromise,
                ])
                if (result !== RESTARTED) return result
                if (onRestart) onRestart(method, args, ++attempts)
              }
            } finally {
              activeTasks--
              onActivity()
            }
          }
        : (this._worker as any)[method].bind(this._worker)
    }
  }

  end(): ReturnType<JestWorker['end']> {
    const worker = this._worker
    if (!worker) {
      throw new Error('Farm is ended, no more calls can be done to it')
    }
    this._worker = undefined
    return worker.end()
  }

  /**
   * Quietly end the worker if it exists
   */
  close(): void {
    if (this._worker) {
      this._worker.end()
    }
  }
}
