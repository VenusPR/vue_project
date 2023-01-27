#!/usr/bin/env node
import arg from 'next/dist/compiled/arg/index.js'
import { startServer } from '../server/lib/start-server'
import { getPort, printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { startedDevelopmentServer } from '../build/output'
import { CliCommand } from '../lib/commands'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { CONFIG_FILES, PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import path from 'path'
import type { NextConfig } from '../../types'
import type { NextConfigComplete } from '../server/config-shared'
import { traceGlobals } from '../trace/shared'
import { isIPv6 } from 'net'
import cluster from 'cluster'
import { Telemetry } from '../telemetry/storage'
import loadConfig from '../server/config'
import { findPagesDir } from '../lib/find-pages-dir'
import { fileExists } from '../lib/file-exists'
import Watchpack from 'next/dist/compiled/watchpack'
import stripAnsi from 'next/dist/compiled/strip-ansi'

let isTurboSession = false
let sessionStopHandled = false
let sessionStarted = Date.now()
let dir: string
let unwatchConfigFiles: () => void

const handleSessionStop = async () => {
  if (sessionStopHandled) return
  sessionStopHandled = true

  try {
    const { eventCliSession } =
      require('../telemetry/events/session-stopped') as typeof import('../telemetry/events/session-stopped')

    const config = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      dir,
      undefined,
      undefined,
      true
    )

    let telemetry =
      (traceGlobals.get('telemetry') as InstanceType<
        typeof import('../telemetry/storage').Telemetry
      >) ||
      new Telemetry({
        distDir: path.join(dir, config.distDir),
      })

    let appDir: boolean = !!traceGlobals.get('pagesDir')
    let pagesDir: boolean = !!traceGlobals.get('appDir')

    if (
      typeof traceGlobals.get('pagesDir') === 'undefined' ||
      typeof traceGlobals.get('appDir') === 'undefined'
    ) {
      const pagesResult = await findPagesDir(dir, !!config.experimental.appDir)
      appDir = !!pagesResult.appDir
      pagesDir = !!pagesResult.pagesDir
    }

    telemetry.record(
      eventCliSession({
        cliCommand: 'dev',
        turboFlag: isTurboSession,
        durationMilliseconds: Date.now() - sessionStarted,
        pagesDir,
        appDir,
      }),
      true
    )
    telemetry.flushDetached('dev', dir)
  } catch (_) {
    // errors here aren't actionable so don't add
    // noise to the output
  }
  process.exit(0)
}

if (cluster.isMaster) {
  process.on('SIGINT', handleSessionStop)
  process.on('SIGTERM', handleSessionStop)
} else {
  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))
}

function watchConfigFiles(dirToWatch: string) {
  if (unwatchConfigFiles) {
    unwatchConfigFiles()
  }

  const wp = new Watchpack()
  wp.watch({ files: CONFIG_FILES.map((file) => path.join(dirToWatch, file)) })
  wp.on('change', (filename) => {
    console.log(
      `\n> Found a change in ${path.basename(
        filename
      )}. Restart the server to see the changes in effect.`
    )
  })
  return () => wp.close()
}

const nextDev: CliCommand = async (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    '--port': Number,
    '--hostname': String,
    '--turbo': Boolean,

    // To align current messages with native binary.
    // Will need to adjust subcommand later.
    '--show-all': Boolean,
    '--root': String,

    // Aliases
    '-h': '--help',
    '-p': '--port',
    '-H': '--hostname',
  }
  let args: arg.Result<arg.Spec>
  try {
    args = arg(validArgs, { argv })
  } catch (error) {
    if (isError(error) && error.code === 'ARG_UNKNOWN_OPTION') {
      return printAndExit(error.message, 1)
    }
    throw error
  }
  if (args['--help']) {
    console.log(`
      Description
        Starts the application in development mode (hot-code reloading, error
        reporting, etc.)

      Usage
        $ next dev <dir> -p <port number>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      Options
        --port, -p      A port number on which to start the application
        --hostname, -H  Hostname on which to start the application (default: 0.0.0.0)
        --help, -h      Displays this message
    `)
    process.exit(0)
  }

  dir = getProjectDir(process.env.NEXT_PRIVATE_DEV_DIR || args._[0])
  unwatchConfigFiles = watchConfigFiles(dir)

  // Check if pages dir exists and warn if not
  if (!(await fileExists(dir, 'directory'))) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  async function preflight() {
    const { getPackageVersion } = await Promise.resolve(
      require('../lib/get-package-version')
    )
    const [sassVersion, nodeSassVersion] = await Promise.all([
      getPackageVersion({ cwd: dir, name: 'sass' }),
      getPackageVersion({ cwd: dir, name: 'node-sass' }),
    ])
    if (sassVersion && nodeSassVersion) {
      Log.warn(
        'Your project has both `sass` and `node-sass` installed as dependencies, but should only use one or the other. ' +
          'Please remove the `node-sass` dependency from your project. ' +
          ' Read more: https://nextjs.org/docs/messages/duplicate-sass'
      )
    }
  }

  const port = getPort(args)
  // If neither --port nor PORT were specified, it's okay to retry new ports.
  const allowRetry =
    args['--port'] === undefined && process.env.PORT === undefined

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = args['--hostname']

  const devServerOptions = {
    allowRetry,
    dev: true,
    dir,
    hostname: host,
    isNextDevCommand: true,
    port,
  }

  const supportedTurbopackNextConfigOptions = [
    'configFileName',
    'env',
    'experimental.appDir',
    'experimental.resolveAlias',
    'experimental.serverComponentsExternalPackages',
    'experimental.turbopackLoaders',
    'images',
    'pageExtensions',
    'onDemandEntries',
    'rewrites',
    'redirects',
    'headers',
    'reactStrictMode',
    'swcMinify',
    'transpilePackages',
  ]

  // check for babelrc, swc plugins
  async function validateNextConfig(isCustomTurbopack: boolean) {
    const { getPkgManager } =
      require('../lib/helpers/get-pkg-manager') as typeof import('../lib/helpers/get-pkg-manager')
    const { getBabelConfigFile } =
      require('../build/webpack-config') as typeof import('../build/webpack-config')
    const { defaultConfig } =
      require('../server/config-shared') as typeof import('../server/config-shared')
    const chalk =
      require('next/dist/compiled/chalk') as typeof import('next/dist/compiled/chalk')
    const { interopDefault } =
      require('../lib/interop-default') as typeof import('../lib/interop-default')

    // To regenerate the TURBOPACK gradient require('gradient-string')('blue', 'red')('>>> TURBOPACK')
    const isTTY = process.stdout.isTTY

    const turbopackGradient = `${chalk.bold(
      isTTY
        ? '\x1B[38;2;0;0;255m>\x1B[39m\x1B[38;2;23;0;232m>\x1B[39m\x1B[38;2;46;0;209m>\x1B[39m \x1B[38;2;70;0;185mT\x1B[39m\x1B[38;2;93;0;162mU\x1B[39m\x1B[38;2;116;0;139mR\x1B[39m\x1B[38;2;139;0;116mB\x1B[39m\x1B[38;2;162;0;93mO\x1B[39m\x1B[38;2;185;0;70mP\x1B[39m\x1B[38;2;209;0;46mA\x1B[39m\x1B[38;2;232;0;23mC\x1B[39m\x1B[38;2;255;0;0mK\x1B[39m'
        : '>>> TURBOPACK'
    )} ${chalk.dim('(alpha)')}\n\n`

    let thankYouMsg = `Thank you for trying Next.js v13 with Turbopack! As a reminder,\nTurbopack is currently in alpha and not yet ready for production.\nWe appreciate your ongoing support as we work to make it ready\nfor everyone.\n`

    let unsupportedParts = ''
    let babelrc = await getBabelConfigFile(dir)
    if (babelrc) babelrc = path.basename(babelrc)

    let hasNonDefaultConfig
    let rawNextConfig: NextConfig = {}

    try {
      rawNextConfig = interopDefault(
        await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, undefined, true)
      ) as NextConfig

      if (typeof rawNextConfig === 'function') {
        rawNextConfig = (rawNextConfig as any)(PHASE_DEVELOPMENT_SERVER, {
          defaultConfig,
        })
      }

      const checkUnsupportedCustomConfig = (
        configKey = '',
        parentUserConfig: any,
        parentDefaultConfig: any
      ): boolean => {
        try {
          // these should not error
          if (
            // we only want the key after the dot for experimental options
            supportedTurbopackNextConfigOptions
              .map((key) => key.split('.').splice(-1)[0])
              .includes(configKey)
          ) {
            return false
          }
          let userValue = parentUserConfig?.[configKey]
          let defaultValue = parentDefaultConfig?.[configKey]

          if (typeof defaultValue !== 'object') {
            return defaultValue !== userValue
          }
          return Object.keys(userValue || {}).some((key: string) => {
            return checkUnsupportedCustomConfig(key, userValue, defaultValue)
          })
        } catch (e) {
          console.error(
            `Unexpected error occurred while checking ${configKey}`,
            e
          )
          return false
        }
      }

      hasNonDefaultConfig = Object.keys(rawNextConfig).some((key) =>
        checkUnsupportedCustomConfig(key, rawNextConfig, defaultConfig)
      )
    } catch (e) {
      console.error('Unexpected error occurred while checking config', e)
    }

    const hasWarningOrError = babelrc || hasNonDefaultConfig
    if (!hasWarningOrError) {
      thankYouMsg = chalk.dim(thankYouMsg)
    }
    console.log(turbopackGradient + thankYouMsg)

    let feedbackMessage = `Learn more about Next.js v13 and Turbopack: ${chalk.underline(
      'https://nextjs.link/with-turbopack'
    )}\nPlease direct feedback to: ${chalk.underline(
      'https://nextjs.link/turbopack-feedback'
    )}\n`

    if (!hasWarningOrError) {
      feedbackMessage = chalk.dim(feedbackMessage)
    }

    if (babelrc) {
      unsupportedParts += `\n- Babel detected (${chalk.cyan(
        babelrc
      )})\n  ${chalk.dim(
        `Babel is not yet supported. To use Turbopack at the moment,\n  you'll need to remove your usage of Babel.`
      )}`
    }
    if (hasNonDefaultConfig) {
      unsupportedParts += `\n\n- Unsupported Next.js configuration option(s) (${chalk.cyan(
        'next.config.js'
      )})\n  ${chalk.dim(
        `The only configurations options supported are:\n${supportedTurbopackNextConfigOptions
          .map((name) => `    - ${chalk.cyan(name)}\n`)
          .join('')}  To use Turbopack, remove other configuration options.`
      )}   `
    }

    if (unsupportedParts) {
      const pkgManager = getPkgManager(dir)

      console.error(
        `${chalk.bold.red(
          'Error:'
        )} You are using configuration and/or tools that are not yet\nsupported by Next.js v13 with Turbopack:\n${unsupportedParts}\n
If you cannot make the changes above, but still want to try out\nNext.js v13 with Turbopack, create the Next.js v13 playground app\nby running the following commands:

  ${chalk.bold.cyan(
    `${
      pkgManager === 'npm'
        ? 'npx create-next-app'
        : `${pkgManager} create next-app`
    } --example with-turbopack with-turbopack-app`
  )}\n  cd with-turbopack-app\n  ${pkgManager} run dev
        `
      )
      console.warn(feedbackMessage)

      if (!isCustomTurbopack) {
        process.exit(1)
      } else {
        console.warn(
          `\n${chalk.bold.yellow(
            'Warning:'
          )} Unsupported config found; but continuing with custom Turbopack binary.\n`
        )
      }
    }
    console.log(feedbackMessage)

    return rawNextConfig
  }

  if (args['--turbo']) {
    isTurboSession = true

    const { loadBindings, __isCustomTurbopackBinary } =
      require('../build/swc') as typeof import('../build/swc')
    const { eventCliSession } =
      require('../telemetry/events/version') as typeof import('../telemetry/events/version')
    const { setGlobal } = require('../trace') as typeof import('../trace')
    require('../telemetry/storage') as typeof import('../telemetry/storage')
    const findUp =
      require('next/dist/compiled/find-up') as typeof import('next/dist/compiled/find-up')

    const isCustomTurbopack = await __isCustomTurbopackBinary()
    const rawNextConfig = await validateNextConfig(isCustomTurbopack)

    const distDir = path.join(dir, rawNextConfig.distDir || '.next')
    const { pagesDir, appDir } = findPagesDir(
      dir,
      !!rawNextConfig.experimental?.appDir
    )
    const telemetry = new Telemetry({
      distDir,
    })
    setGlobal('appDir', appDir)
    setGlobal('pagesDir', pagesDir)
    setGlobal('telemetry', telemetry)

    if (!isCustomTurbopack) {
      telemetry.record(
        eventCliSession(distDir, rawNextConfig as NextConfigComplete, {
          webpackVersion: 5,
          cliCommand: 'dev',
          isSrcDir: path
            .relative(dir, pagesDir || appDir || '')
            .startsWith('src'),
          hasNowJson: !!(await findUp('now.json', { cwd: dir })),
          isCustomServer: false,
          turboFlag: true,
          pagesDir: !!pagesDir,
          appDir: !!appDir,
        })
      )
    }

    const turboJson = findUp.sync('turbo.json', { cwd: dir })
    // eslint-disable-next-line no-shadow
    const packagePath = findUp.sync('package.json', { cwd: dir })

    let bindings: any = await loadBindings()
    let server = bindings.turbo.startDev({
      ...devServerOptions,
      showAll: args['--show-all'] ?? false,
      root:
        args['--root'] ??
        (turboJson
          ? path.dirname(turboJson)
          : packagePath
          ? path.dirname(packagePath)
          : undefined),
    })
    // Start preflight after server is listening and ignore errors:
    preflight().catch(() => {})

    await telemetry.flush()
    return server
  } else {
    // we're using a sub worker to avoid memory leaks. When memory usage exceeds 90%, we kill the worker and restart it.
    // this is a temporary solution until we can fix the memory leaks.
    // the logic for the worker killing itself is in `packages/next/server/lib/start-server.ts`
    if (!process.env.__NEXT_DISABLE_MEMORY_WATCHER && cluster.isMaster) {
      let config: NextConfig

      const setupFork = (env?: Parameters<typeof cluster.fork>[0]) => {
        const startDir = dir
        let shouldFilter = false
        cluster.fork({
          ...env,
          FORCE_COLOR: '1',
        })

        // since errors can start being logged from the fork
        // before we detect the project directory rename
        // attempt suppressing them long enough to check
        const filterForkErrors = (chunk: Buffer, fd: 'stdout' | 'stderr') => {
          const cleanChunk = stripAnsi(chunk + '')
          if (
            cleanChunk.match(
              /(ENOENT|Module build failed|Module not found|Cannot find module)/
            )
          ) {
            if (startDir === dir) {
              try {
                // check if start directory is still valid
                const result = findPagesDir(
                  startDir,
                  !!config.experimental?.appDir
                )
                shouldFilter = !Boolean(result.pagesDir || result.appDir)
              } catch (_) {
                shouldFilter = true
              }
            }
            if (shouldFilter || startDir !== dir) {
              shouldFilter = true
              return
            }
          }
          process[fd].write(chunk)
        }

        for (const workerId in cluster.workers) {
          cluster.workers[workerId]?.process.stdout?.on('data', (chunk) => {
            filterForkErrors(chunk, 'stdout')
          })
          cluster.workers[workerId]?.process.stderr?.on('data', (chunk) => {
            filterForkErrors(chunk, 'stderr')
          })
        }
      }

      const handleClusterExit = () => {
        const callback = async (worker: cluster.Worker) => {
          // ignore if we killed the worker
          if ((worker as any).killed) return

          // TODO: we should track how many restarts are
          // occurring and how long in-between them
          if (worker.exitedAfterDisconnect) {
            setupFork()
          } else if (!sessionStopHandled) {
            await handleSessionStop()
            process.exit(1)
          }
        }
        cluster.addListener('exit', callback)
        return () => cluster.removeListener('exit', callback)
      }
      let clusterExitUnsub = handleClusterExit()
      // x-ref: https://nodejs.org/api/cluster.html#clustersettings
      // @ts-expect-error type is incorrect
      cluster.settings.windowsHide = true
      cluster.settings.stdio = ['ipc', 'pipe', 'pipe']

      setupFork()
      config = await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        dir,
        undefined,
        undefined,
        true
      )

      const handleProjectDirRename = (newDir: string) => {
        clusterExitUnsub()

        for (const workerId in cluster.workers) {
          try {
            // @ts-expect-error custom field
            cluster.workers[workerId].killed = true
            cluster.workers[workerId]!.process.kill('SIGKILL')
          } catch (_) {}
        }
        process.chdir(newDir)
        // @ts-expect-error type is incorrect
        cluster.settings.cwd = newDir
        cluster.settings.exec = cluster.settings.exec?.replace(dir, newDir)
        setupFork({
          ...Object.keys(process.env).reduce((newEnv, key) => {
            newEnv[key] = process.env[key]?.replace(dir, newDir)
            return newEnv
          }, {} as typeof process.env),
          NEXT_PRIVATE_DEV_DIR: newDir,
        })
        clusterExitUnsub = handleClusterExit()
      }
      const parentDir = path.join('/', dir, '..')
      const watchedEntryLength = parentDir.split('/').length + 1
      const previousItems = new Set()

      const wp = new Watchpack({
        ignored: (entry: string) => {
          // watch only one level
          return !(entry.split('/').length <= watchedEntryLength)
        },
      })

      wp.watch({ directories: [parentDir], startTime: 0 })

      wp.on('aggregated', () => {
        const knownFiles = wp.getTimeInfoEntries()
        const newFiles: string[] = []
        let hasPagesApp = false

        // if the dir still exists nothing to check
        try {
          const result = findPagesDir(dir, !!config.experimental?.appDir)
          hasPagesApp = Boolean(result.pagesDir || result.appDir)
        } catch (err) {
          // if findPagesDir throws validation error let this be
          // handled in the dev-server itself in the fork
          if ((err as any).message?.includes('experimental')) {
            return
          }
        }

        // try to find new dir introduced
        if (previousItems.size) {
          for (const key of knownFiles.keys()) {
            if (!previousItems.has(key)) {
              newFiles.push(key)
            }
          }
          previousItems.clear()
        }

        for (const key of knownFiles.keys()) {
          previousItems.add(key)
        }

        if (hasPagesApp) {
          return
        }

        // if we failed to find the new dir it may have been moved
        // to a new parent directory which we can't track as easily
        // so exit gracefully
        try {
          const result = findPagesDir(
            newFiles[0],
            !!config.experimental?.appDir
          )
          hasPagesApp = Boolean(result.pagesDir || result.appDir)
        } catch (_) {}

        if (hasPagesApp && newFiles.length === 1) {
          Log.info(
            `Detected project directory rename, restarting in new location`
          )
          handleProjectDirRename(newFiles[0])
          watchConfigFiles(newFiles[0])
          dir = newFiles[0]
        } else {
          Log.error(
            `Project directory could not be found, restart Next.js in your new directory`
          )
          process.exit(0)
        }
      })
    } else {
      startServer(devServerOptions)
        .then(async (app) => {
          const appUrl = `http://${app.hostname}:${app.port}`
          const hostname = host || '0.0.0.0'
          startedDevelopmentServer(
            appUrl,
            `${isIPv6(hostname) ? `[${hostname}]` : hostname}:${app.port}`
          )
          // Start preflight after server is listening and ignore errors:
          preflight().catch(() => {})
          // Finalize server bootup:
          await app.prepare()
        })
        .catch((err) => {
          if (err.code === 'EADDRINUSE') {
            let errorMessage = `Port ${port} is already in use.`
            const pkgAppPath = require('next/dist/compiled/find-up').sync(
              'package.json',
              {
                cwd: dir,
              }
            )
            const appPackage = require(pkgAppPath)
            if (appPackage.scripts) {
              const nextScript = Object.entries(appPackage.scripts).find(
                (scriptLine) => scriptLine[1] === 'next'
              )
              if (nextScript) {
                errorMessage += `\nUse \`npm run ${nextScript[0]} -- -p <some other port>\`.`
              }
            }
            console.error(errorMessage)
          } else {
            console.error(err)
          }
          process.nextTick(() => process.exit(1))
        })
    }
  }
}

export { nextDev }
