const { relative, basename, resolve, join, dirname } = require('path')
// eslint-disable-next-line import/no-extraneous-dependencies
const glob = require('glob')
// eslint-disable-next-line import/no-extraneous-dependencies
const fs = require('fs-extra')
// eslint-disable-next-line import/no-extraneous-dependencies
const resolveFrom = require('resolve-from')

export async function next__polyfill_nomodule(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@next/polyfill-nomodule')))
    .target('dist/build/polyfills')
}

export async function next__polyfill_module(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@next/polyfill-module')))
    .target('dist/build/polyfills')
}

export async function browser_polyfills(task, opts) {
  await task.parallel(
    ['next__polyfill_nomodule', 'next__polyfill_module'],
    opts
  )
}

// eslint-disable-next-line camelcase
export async function copy_regenerator_runtime(task, opts) {
  await task
    .source(join(dirname(require.resolve('regenerator-runtime')), '**/*'))
    .target('src/compiled/regenerator-runtime')
}

// eslint-disable-next-line camelcase
export async function copy_styled_jsx_assets(task, opts) {
  // we copy the styled-jsx types so that we can reference them
  // in the next-env.d.ts file so it doesn't matter if the styled-jsx
  // package is hoisted out of Next.js' node_modules or not
  const styledJsxPath = dirname(require.resolve('styled-jsx/package.json'))
  const typeFiles = glob.sync('*.d.ts', { cwd: styledJsxPath })
  const outputDir = join(__dirname, 'dist/styled-jsx')
  // Separate type files into different folders to avoid conflicts between
  // dev dep `styled-jsx` and `next/dist/styled-jsx` for duplicated declare modules
  const typesDir = join(outputDir, 'types')
  await fs.ensureDir(typesDir)

  for (const file of typeFiles) {
    const content = await fs.readFile(join(styledJsxPath, file), 'utf8')
    await fs.writeFile(join(typesDir, file), content)
  }
}

const externals = {
  // don't bundle caniuse-lite data so users can
  // update it manually
  'caniuse-lite': 'caniuse-lite',
  '/caniuse-lite(/.*)/': 'caniuse-lite$1',

  'node-fetch': 'node-fetch',
  postcss: 'postcss',
  // Ensure latest version is used
  'postcss-safe-parser': 'next/dist/compiled/postcss-safe-parser',
  'cssnano-simple': 'next/dist/build/cssnano-simple',

  // sass-loader
  // (also responsible for these dependencies in package.json)
  'node-sass': 'node-sass',
  sass: 'sass',
  fibers: 'fibers',

  chokidar: 'chokidar',
  'jest-worker': 'jest-worker',

  'terser-webpack-plugin':
    'next/dist/build/webpack/plugins/terser-webpack-plugin',

  // TODO: Add @swc/helpers to externals once @vercel/ncc switch to swc-loader

  undici: 'undici',
}
// eslint-disable-next-line camelcase
externals['node-html-parser'] = 'next/dist/compiled/node-html-parser'
export async function ncc_node_html_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('node-html-parser')))
    .ncc({ packageName: 'node-html-parser', externals, target: 'es5' })
    .target('src/compiled/node-html-parser')
}

export async function ncc_next_server(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('next/dist/server/next-server'))
    )
    .ncc({
      bundleName: 'next-server',
      // minify: false,
      externals: {
        ...externals,

        '/(.*)route-resolver/': '$1route-resolver',

        sharp: 'sharp',
        react: 'react',
        'react-dom': 'react-dom',

        'next/dist/compiled/compression': 'next/dist/compiled/compression',

        critters: 'critters',

        'next/dist/compiled/jest-worker': 'next/dist/compiled/jest-worker',

        'next/dist/compiled/react': 'next/dist/compiled/react',
        '/next/dist/compiled/react(/.+)/': 'next/dist/compiled/react$1',
        'next/dist/compiled/react-dom': 'next/dist/compiled/react-dom',
        '/next/dist/compiled/react-dom(/.+)/': 'next/dist/compiled/react-dom$1',

        // react contexts must be external
        '/(.*)server-inserted-html/':
          'next/dist/shared/lib/server-inserted-html.js',

        '/(.+/)router-context/': 'next/dist/shared/lib/router-context.js',

        '/(.*)loadable-context/': 'next/dist/shared/lib/loadable-context.js',

        '/(.*)image-config-context/':
          'next/dist/shared/lib/image-config-context.js',

        '/(.*)head-manager-context/':
          'next/dist/shared/lib/head-manager-context.js',

        '/(.*)app-router-context/':
          'next/dist/shared/lib/app-router-context.js',

        '/(.*)amp-context/': 'next/dist/shared/lib/amp-context.js',

        '/(.*)hooks-client-context/':
          'next/dist/shared/lib/hooks-client-context.js',

        '/(.*)html-context/': 'next/dist/shared/lib/html-context.js',

        // 'next/dist/compiled/undici': 'next/dist/compiled/undici',
        // 'next/dist/compiled/node-fetch': 'next/dist/compiled/node-fetch',

        // '/(.*)google-font-metrics.json/': '$1google-font-metrics.json',
        '/(.*)next-config-validate.js/': '$1/next-config-validate.js',

        '/(.*)server/web(.*)/': '$1server/web$2',
        './web/sandbox': './web/sandbox',
        'next/dist/compiled/edge-runtime': 'next/dist/compiled/edge-runtime',
        '(.*)@edge-runtime/primitives': '$1@edge-runtime/primitives',

        '/(.*)compiled/webpack(/.*)/': '$1webpack$2',
        './image-optimizer': './image-optimizer',
        '/(.*)@ampproject/toolbox-optimizer/':
          '$1@ampproject/toolbox-optimizer',
      },
    })
    .target('dist/compiled/next-server')
}

// eslint-disable-next-line camelcase
externals['@babel/runtime'] = 'next/dist/compiled/@babel/runtime'
export async function copy_babel_runtime(task, opts) {
  const runtimeDir = dirname(require.resolve('@babel/runtime/package.json'))
  const outputDir = join(__dirname, 'src/compiled/@babel/runtime')
  const runtimeFiles = glob.sync('**/*', {
    cwd: runtimeDir,
    ignore: ['node_modules/**/*'],
  })

  for (const file of runtimeFiles) {
    const inputPath = join(runtimeDir, file)
    const outputPath = join(outputDir, file)

    if (!fs.statSync(inputPath).isFile()) {
      continue
    }
    let contents = fs.readFileSync(inputPath, 'utf8')

    if (inputPath.endsWith('.js')) {
      contents = contents
        .replace(
          'regenerator-runtime',
          'next/dist/compiled/regenerator-runtime'
        )
        .replace('@babel/runtime', 'next/dist/compiled/@babel/runtime')
    }

    if (inputPath.endsWith('package.json')) {
      contents = JSON.stringify({
        ...JSON.parse(contents),
        dependencies: {},
      })
    }

    fs.mkdirSync(dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, contents)
  }
}

// eslint-disable-next-line camelcase
externals['node-fetch'] = 'next/dist/compiled/node-fetch'
export async function ncc_node_fetch(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('node-fetch')))
    .ncc({ packageName: 'node-fetch', externals })
    .target('src/compiled/node-fetch')
}

externals['anser'] = 'next/dist/compiled/anser'
export async function ncc_node_anser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('anser')))
    .ncc({ packageName: 'anser', externals })
    .target('src/compiled/anser')
}

externals['stacktrace-parser'] = 'next/dist/compiled/stacktrace-parser'
export async function ncc_node_stacktrace_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('stacktrace-parser')))
    .ncc({ packageName: 'stacktrace-parser', externals })
    .target('src/compiled/stacktrace-parser')
}

externals['data-uri-to-buffer'] = 'next/dist/compiled/data-uri-to-buffer'
export async function ncc_node_data_uri_to_buffer(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('data-uri-to-buffer')))
    .ncc({ packageName: 'data-uri-to-buffer', externals })
    .target('src/compiled/data-uri-to-buffer')
}

externals['css.escape'] = 'next/dist/compiled/css.escape'
export async function ncc_node_cssescape(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('css.escape')))
    .ncc({ packageName: 'css.escape', externals })
    .target('src/compiled/css.escape')
}

externals['shell-quote'] = 'next/dist/compiled/shell-quote'
export async function ncc_node_shell_quote(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('shell-quote')))
    .ncc({ packageName: 'shell-quote', externals })
    .target('src/compiled/shell-quote')
}

externals['platform'] = 'next/dist/compiled/platform'
export async function ncc_node_platform(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('platform')))
    .ncc({ packageName: 'platform', externals })
    .target('src/compiled/platform')

  const clientFile = join(__dirname, 'src/compiled/platform/platform.js')
  const content = fs.readFileSync(clientFile, 'utf8')
  // remove AMD define branch as this forces the module to not
  // be treated as commonjs in serverless/client mode
  fs.writeFileSync(
    clientFile,
    content.replace(
      new RegExp(
        'if(typeof define=="function"&&typeof define.amd=="object"&&define.amd){r.platform=d;define((function(){return d}))}else '.replace(
          /[|\\{}()[\]^$+*?.-]/g,
          '\\$&'
        ),
        'g'
      ),
      ''
    )
  )
}

externals['undici'] = 'next/dist/compiled/undici'
export async function ncc_undici(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('undici')))
    .ncc({ packageName: 'undici', externals })
    .target('src/compiled/undici')
}

// eslint-disable-next-line camelcase
export async function compile_config_schema(task, opts) {
  const { configSchema } = require('./dist/server/config-schema')
  // eslint-disable-next-line
  const Ajv = require('ajv')
  // eslint-disable-next-line
  const standaloneCode = require('ajv/dist/standalone').default
  // eslint-disable-next-line
  const ajv = new Ajv({
    code: { source: true },
    allErrors: true,
    verbose: true,
  })

  // errorMessage keyword will be consumed by @segment/ajv-human-errors to provide a custom error message
  ajv.addKeyword('errorMessage')

  ajv.addKeyword({
    keyword: 'isFunction',
    schemaType: 'boolean',
    compile() {
      return (data) => data instanceof Function
    },
    code(ctx) {
      const { data } = ctx
      ctx.fail(Ajv._`!(${data} instanceof Function)`)
    },
    metaSchema: {
      anyOf: [{ type: 'boolean' }],
    },
  })

  const compiled = ajv.compile(configSchema)
  const validateCode = standaloneCode(ajv, compiled)
  const preNccFilename = join(__dirname, 'dist', 'next-config-validate.js')
  await fs.writeFile(preNccFilename, validateCode)
  await task
    .source('./dist/next-config-validate.js')
    .ncc({})
    .target('dist/next-config-validate')

  await fs.unlink(preNccFilename)
  await fs.rename(
    join(__dirname, 'dist/next-config-validate/next-config-validate.js'),
    join(__dirname, 'dist/next-config-validate.js')
  )
  await fs.rmdir(join(__dirname, 'dist/next-config-validate'))
}

// eslint-disable-next-line camelcase
externals['acorn'] = 'next/dist/compiled/acorn'
export async function ncc_acorn(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('acorn')))
    .ncc({ packageName: 'acorn', externals })
    .target('src/compiled/acorn')
}

// eslint-disable-next-line camelcase
externals['@edge-runtime/primitives'] =
  'next/dist/compiled/@edge-runtime/primitives'

export async function ncc_edge_runtime_primitives() {
  // `@edge-runtime/primitives` is precompiled and pre-bundled
  // so we vendor the package as it is.
  const dest = 'src/compiled/@edge-runtime/primitives'
  const pkg = await fs.readJson(
    require.resolve('@edge-runtime/primitives/package.json')
  )
  await fs.remove(dest)

  for (const file of pkg.files) {
    if (['dist', 'types'].includes(file)) {
      continue
    }

    externals[
      `@edge-runtime/primitives/${file}`
    ] = `next/dist/compiled/@edge-runtime/primitives/${file}`
    const dest2 = `src/compiled/@edge-runtime/primitives/${file}`
    await fs.outputJson(join(dest2, 'package.json'), {
      main: `../${file}.js`,
      types: `../${file}.d.ts`,
    })

    await fs.copy(
      require.resolve(`@edge-runtime/primitives/${file}`),
      join(dest, `${file}.js`)
    )
    await fs.copy(
      require.resolve(`@edge-runtime/primitives/types/${file}.d.ts`),
      join(dest, `${file}.d.ts`)
    )
  }

  await fs.outputJson(join(dest, 'package.json'), {
    name: '@edge-runtime/primitives',
    version: pkg.version,
    main: './index.js',
    license: pkg.license,
  })
  await fs.copy(
    require.resolve('@edge-runtime/primitives'),
    join(dest, 'index.js')
  )
}

// eslint-disable-next-line camelcase
externals['edge-runtime'] = 'next/dist/compiled/edge-runtime'
export async function ncc_edge_runtime(task, opts) {
  const vmPath = resolveFrom(
    dirname(require.resolve('edge-runtime')),
    '@edge-runtime/vm/dist/edge-vm'
  )

  const content = await fs.readFile(vmPath, 'utf8')

  // ensure ncc doesn't attempt to bundle dynamic requires
  // so that they work at runtime correctly
  await fs.writeFile(
    vmPath,
    content.replace(
      /require\.resolve\('@edge-runtime\/primitives/g,
      `__non_webpack_require__.resolve('next/dist/compiled/@edge-runtime/primitives`
    )
  )

  await task
    .source(relative(__dirname, require.resolve('edge-runtime')))
    .ncc({ packageName: 'edge-runtime', externals })
    .target('src/compiled/edge-runtime')

  const outputFile = join(__dirname, 'src/compiled/edge-runtime/index.js')

  await fs.writeFile(
    outputFile,
    (
      await fs.readFile(outputFile, 'utf8')
    ).replace(/eval\("require"\)/g, 'require')
  )
}

// eslint-disable-next-line camelcase
export async function ncc_next__react_dev_overlay(task, opts) {
  const overlayExternals = {
    ...externals,
    react: 'react',
    'react-dom': 'react-dom',
  }
  // dev-overlay needs a newer source-map version
  delete overlayExternals['source-map']

  await task
    .source(
      relative(
        __dirname,
        require.resolve('@next/react-dev-overlay/dist/middleware')
      )
    )
    .ncc({
      precompiled: false,
      packageName: '@next/react-dev-overlay',
      externals: overlayExternals,
      target: 'es2018',
    })
    .target('dist/compiled/@next/react-dev-overlay/dist')

  await task
    .source(
      relative(
        __dirname,
        require.resolve('@next/react-dev-overlay/dist/client')
      )
    )
    .ncc({
      precompiled: false,
      packageName: '@next/react-dev-overlay',
      externals: overlayExternals,
      target: 'es5',
    })
    .target('dist/compiled/@next/react-dev-overlay/dist')

  const clientFile = join(
    __dirname,
    'dist/compiled/@next/react-dev-overlay/dist/client.js'
  )
  const content = fs.readFileSync(clientFile, 'utf8')
  // remove AMD define branch as this forces the module to not
  // be treated as commonjs in serverless/client mode
  fs.writeFileSync(
    clientFile,
    content.replace(
      new RegExp(
        'if(typeof define=="function"&&typeof define.amd=="object"&&define.amd){r.platform=b;define((function(){return b}))}else '.replace(
          /[|\\{}()[\]^$+*?.-]/g,
          '\\$&'
        ),
        'g'
      ),
      ''
    )
  )
}

// eslint-disable-next-line camelcase
externals['watchpack'] = 'next/dist/compiled/watchpack'
export async function ncc_watchpack(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('watchpack')))
    .ncc({ packageName: 'watchpack', externals })
    .target('src/compiled/watchpack')
}

// eslint-disable-next-line camelcase
externals['jest-worker'] = 'next/dist/compiled/jest-worker'
export async function ncc_jest_worker(task, opts) {
  await fs.remove(join(__dirname, 'src/compiled/jest-worker'))
  await fs.ensureDir(join(__dirname, 'src/compiled/jest-worker/workers'))

  const workers = ['processChild.js', 'threadChild.js']

  await task
    .source(relative(__dirname, require.resolve('jest-worker')))
    .ncc({ packageName: 'jest-worker', externals })
    .target('src/compiled/jest-worker')

  for (const worker of workers) {
    const content = await fs.readFile(
      join(
        dirname(require.resolve('jest-worker/package.json')),
        'build/workers',
        worker
      ),
      'utf8'
    )
    await fs.writeFile(
      join(
        dirname(require.resolve('jest-worker/package.json')),
        'build/workers',
        worker + '.tmp.js'
      ),
      content.replace(/require\(file\)/g, '__non_webpack_require__(file)')
    )
    await task
      .source(
        relative(
          __dirname,
          join(
            dirname(require.resolve('jest-worker/package.json')),
            'build/workers',
            worker + '.tmp.js'
          )
        )
      )
      .ncc({ externals })
      .target('src/compiled/jest-worker/out')

    await fs.move(
      join(__dirname, 'src/compiled/jest-worker/out', worker + '.tmp.js'),
      join(__dirname, 'src/compiled/jest-worker', worker),
      { overwrite: true }
    )
  }
  await fs.remove(join(__dirname, 'src/compiled/jest-worker/workers'))
  await fs.remove(join(__dirname, 'src/compiled/jest-worker/out'))
}

// eslint-disable-next-line camelcase
export async function ncc_react_refresh_utils(task, opts) {
  await fs.remove(join(__dirname, 'dist/compiled/react-refresh'))
  await fs.copy(
    dirname(require.resolve('react-refresh/package.json')),
    join(__dirname, 'dist/compiled/react-refresh')
  )

  const srcDir = join(
    dirname(require.resolve('@next/react-refresh-utils/package.json')),
    'dist'
  )
  const destDir = join(
    __dirname,
    'dist/compiled/@next/react-refresh-utils/dist'
  )
  await fs.remove(destDir)
  await fs.ensureDir(destDir)

  const files = glob.sync('**/*.{js,json}', { cwd: srcDir })

  for (const file of files) {
    if (file === 'tsconfig.json') continue

    const content = await fs.readFile(join(srcDir, file), 'utf8')
    const outputFile = join(destDir, file)

    await fs.ensureDir(dirname(outputFile))
    await fs.writeFile(
      outputFile,
      content.replace(
        /react-refresh\/runtime/g,
        'next/dist/compiled/react-refresh/runtime'
      )
    )
  }
}

// eslint-disable-next-line camelcase
externals['chalk'] = 'next/dist/compiled/chalk'
export async function ncc_chalk(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('chalk')))
    .ncc({ packageName: 'chalk', externals })
    .target('src/compiled/chalk')
}

// eslint-disable-next-line camelcase
externals['browserslist'] = 'next/dist/compiled/browserslist'
export async function ncc_browserslist(task, opts) {
  const browserslistModule = require.resolve('browserslist')
  const nodeFile = join(dirname(browserslistModule), 'node.js')

  const content = await fs.readFile(nodeFile, 'utf8')
  // ensure ncc doesn't attempt to bundle dynamic requires
  // so that they work at runtime correctly
  await fs.writeFile(
    nodeFile,
    content.replace(
      /require\(require\.resolve\(/g,
      `__non_webpack_require__(__non_webpack_require__.resolve(`
    )
  )

  await task
    .source(relative(__dirname, require.resolve('browserslist')))
    .ncc({ packageName: 'browserslist', externals })
    .target('src/compiled/browserslist')

  await fs.writeFile(nodeFile, content)
}

// eslint-disable-next-line camelcase
externals['@napi-rs/triples'] = 'next/dist/compiled/@napi-rs/triples'
export async function ncc_napirs_triples(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@napi-rs/triples')))
    .ncc({ packageName: '@napi-rs/triples', externals })
    .target('src/compiled/@napi-rs/triples')
}

// eslint-disable-next-line camelcase
externals['cssnano-simple'] = 'next/dist/compiled/cssnano-simple'
export async function ncc_cssnano_simple(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cssnano-simple')))
    .ncc({ packageName: 'cssnano-simple', externals })
    .target('src/compiled/cssnano-simple')
}

// eslint-disable-next-line camelcase
externals['p-limit'] = 'next/dist/compiled/p-limit'
export async function ncc_p_limit(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('p-limit')))
    .ncc({ packageName: 'p-limit', externals })
    .target('src/compiled/p-limit')
}

// eslint-disable-next-line camelcase
externals['raw-body'] = 'next/dist/compiled/raw-body'
export async function ncc_raw_body(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('raw-body')))
    .ncc({ packageName: 'raw-body', externals })
    .target('src/compiled/raw-body')
}

// eslint-disable-next-line camelcase
externals['image-size'] = 'next/dist/compiled/image-size'
export async function ncc_image_size(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('image-size')))
    .ncc({ packageName: 'image-size', externals })
    .target('src/compiled/image-size')
}

// eslint-disable-next-line camelcase
externals['get-orientation'] = 'next/dist/compiled/get-orientation'
export async function ncc_get_orientation(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('get-orientation')))
    .ncc({ packageName: 'get-orientation', externals })
    .target('src/compiled/get-orientation')
}

// eslint-disable-next-line camelcase
externals['@hapi/accept'] = 'next/dist/compiled/@hapi/accept'
export async function ncc_hapi_accept(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@hapi/accept')))
    .ncc({ packageName: '@hapi/accept', externals })
    .target('src/compiled/@hapi/accept')
}

// eslint-disable-next-line camelcase
externals['amphtml-validator'] = 'next/dist/compiled/amphtml-validator'
export async function ncc_amphtml_validator(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('amphtml-validator')))
    .ncc({ packageName: 'amphtml-validator', externals })
    .target('src/compiled/amphtml-validator')
}

// eslint-disable-next-line camelcase
export async function ncc_assert(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('assert/')))
    .ncc({
      packageName: 'assert',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/assert')
}

// eslint-disable-next-line camelcase
export async function ncc_browser_zlib(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('browserify-zlib/')))
    .ncc({
      packageName: 'browserify-zlib',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/browserify-zlib')
}

// eslint-disable-next-line camelcase
export async function ncc_buffer(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('buffer/')))
    .ncc({
      packageName: 'buffer',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/buffer')
}

// eslint-disable-next-line camelcase
export async function copy_react_is(task, opts) {
  await task
    .source(join(dirname(require.resolve('react-is/package.json')), '**/*'))
    .target('src/compiled/react-is')
}

// eslint-disable-next-line camelcase
export async function copy_constants_browserify(task, opts) {
  await fs.mkdir(join(__dirname, 'src/compiled/constants-browserify'), {
    recursive: true,
  })
  await fs.writeFile(
    join(__dirname, 'src/compiled/constants-browserify/package.json'),
    JSON.stringify({ name: 'constants-browserify', main: './constants.json' })
  )
  await task
    .source(require.resolve('constants-browserify'))
    .target('src/compiled/constants-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_crypto_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('crypto-browserify/')))
    .ncc({
      packageName: 'crypto-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/crypto-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_domain_browser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('domain-browser/')))
    .ncc({
      packageName: 'domain-browser',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/domain-browser')
}

// eslint-disable-next-line camelcase
export async function ncc_events(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('events/')))
    .ncc({
      packageName: 'events',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/events')
}

// eslint-disable-next-line camelcase
export async function ncc_stream_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('stream-browserify/')))
    .ncc({
      packageName: 'stream-browserify',
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/stream-browserify')

  // while ncc'ing readable-stream the browser mapping does not replace the
  // require('stream') with require('events').EventEmitter correctly so we
  // patch this manually as leaving require('stream') causes a circular
  // reference breaking the browser polyfill
  const outputFile = join(__dirname, 'src/compiled/stream-browserify/index.js')

  fs.writeFileSync(
    outputFile,
    fs
      .readFileSync(outputFile, 'utf8')
      .replace(`require("stream")`, `require("events").EventEmitter`)
  )
}

// eslint-disable-next-line camelcase
export async function ncc_stream_http(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('stream-http/')))
    .ncc({
      packageName: 'stream-http',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/stream-http')
}

// eslint-disable-next-line camelcase
export async function ncc_https_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('https-browserify/')))
    .ncc({
      packageName: 'https-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/https-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_os_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('os-browserify/browser')))
    .ncc({
      packageName: 'os-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/os-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_path_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('path-browserify/')))
    .ncc({
      packageName: 'path-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/path-browserify')

  const filePath = join(__dirname, 'src/compiled/path-browserify/index.js')
  const content = fs.readFileSync(filePath, 'utf8')

  // Remove process usage from path-browserify polyfill for edge-runtime
  await fs.writeFile(filePath, content.replace(/process\.cwd\(\)/g, '""'))
}

// eslint-disable-next-line camelcase
export async function ncc_process(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('process/browser')))
    .ncc({
      packageName: 'process',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/process')
}

// eslint-disable-next-line camelcase
export async function ncc_querystring_es3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('querystring-es3/')))
    .ncc({
      packageName: 'querystring-es3',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/querystring-es3')
}

// eslint-disable-next-line camelcase
export async function ncc_string_decoder(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('string_decoder/')))
    .ncc({
      packageName: 'string_decoder',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/string_decoder')
}

// eslint-disable-next-line camelcase
export async function ncc_util(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('util/')))
    .ncc({
      packageName: 'util',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/util')
}

// eslint-disable-next-line camelcase
export async function ncc_punycode(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('punycode/')))
    .ncc({
      packageName: 'punycode',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/punycode')
}

// eslint-disable-next-line camelcase
export async function ncc_set_immediate(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('setimmediate/')))
    .ncc({
      packageName: 'setimmediate',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/setimmediate')
}

// eslint-disable-next-line camelcase
export async function ncc_timers_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('timers-browserify/')))
    .ncc({
      packageName: 'timers-browserify',
      externals: {
        ...externals,
        setimmediate: 'next/dist/compiled/setimmediate',
      },
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/timers-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_tty_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('tty-browserify/')))
    .ncc({
      packageName: 'tty-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/tty-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_vm_browserify(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('vm-browserify/')))
    .ncc({
      packageName: 'vm-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('src/compiled/vm-browserify')
}

// eslint-disable-next-line camelcase
externals['@ampproject/toolbox-optimizer'] =
  'next/dist/compiled/@ampproject/toolbox-optimizer'
export async function ncc_amp_optimizer(task, opts) {
  await task
    .source(
      relative(__dirname, require.resolve('@ampproject/toolbox-optimizer'))
    )
    .ncc({
      externals,
      precompiled: false,
      packageName: '@ampproject/toolbox-optimizer',
    })
    .target('dist/compiled/@ampproject/toolbox-optimizer')
}
// eslint-disable-next-line camelcase
externals['arg'] = 'next/dist/compiled/arg'
export async function ncc_arg(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('arg')))
    .ncc({ packageName: 'arg' })
    .target('src/compiled/arg')
}
// eslint-disable-next-line camelcase
externals['async-retry'] = 'next/dist/compiled/async-retry'
export async function ncc_async_retry(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('async-retry')))
    .ncc({
      packageName: 'async-retry',
      externals,
    })
    .target('src/compiled/async-retry')
}
// eslint-disable-next-line camelcase
externals['async-sema'] = 'next/dist/compiled/async-sema'
export async function ncc_async_sema(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('async-sema')))
    .ncc({ packageName: 'async-sema', externals })
    .target('src/compiled/async-sema')
}
// eslint-disable-next-line camelcase
export async function ncc_segment_ajv_human_errors(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@segment/ajv-human-errors/')))
    .ncc({
      packageName: '@segment/ajv-human-errors/',
      externals,
    })
    .target('src/compiled/@segment/ajv-human-errors')
}

const babelCorePackages = {
  'code-frame': 'next/dist/compiled/babel/code-frame',
  '@babel/generator': 'next/dist/compiled/babel/generator',
  '@babel/traverse': 'next/dist/compiled/babel/traverse',
  '@babel/types': 'next/dist/compiled/babel/types',
  '@babel/core': 'next/dist/compiled/babel/core',
  '@babel/parser': 'next/dist/compiled/babel/parser',
  '@babel/core/lib/config': 'next/dist/compiled/babel/core-lib-config',
  '@babel/core/lib/transformation/normalize-file':
    'next/dist/compiled/babel/core-lib-normalize-config',
  '@babel/core/lib/transformation/normalize-opts':
    'next/dist/compiled/babel/core-lib-normalize-opts',
  '@babel/core/lib/transformation/block-hoist-plugin':
    'next/dist/compiled/babel/core-lib-block-hoisting-plugin',
  '@babel/core/lib/transformation/plugin-pass':
    'next/dist/compiled/babel/core-lib-plugin-pass',
}

Object.assign(externals, babelCorePackages)

// eslint-disable-next-line camelcase
export async function ncc_babel_bundle(task, opts) {
  const bundleExternals = {
    ...externals,
    'next/dist/compiled/babel-packages': 'next/dist/compiled/babel-packages',
  }
  for (const pkg of Object.keys(babelCorePackages)) {
    delete bundleExternals[pkg]
  }
  await task
    .source('bundles/babel/bundle.js')
    .ncc({
      packageName: '@babel/core',
      bundleName: 'babel',
      externals: bundleExternals,
    })
    .target('src/compiled/babel')
}

// eslint-disable-next-line camelcase
export async function ncc_babel_bundle_packages(task, opts) {
  const eslintParseFile = join(
    dirname(require.resolve('@babel/eslint-parser')),
    './parse.cjs'
  )
  const content = fs.readFileSync(eslintParseFile, 'utf-8')
  // Let parser.cjs require @babel/parser directly
  const replacedContent = content
    .replace(
      `const babelParser = require((`,
      `function noop(){};\nconst babelParser = require('@babel/parser');noop((`
    )
    .replace(/require.resolve/g, 'noop')
  await fs.writeFile(eslintParseFile, replacedContent)

  await task
    .source('bundles/babel/packages-bundle.js')
    .ncc({
      externals: externals,
    })
    .target(`src/compiled/babel-packages`)

  await fs.writeFile(
    join(__dirname, 'src/compiled/babel-packages/package.json'),
    JSON.stringify({ name: 'babel-packages', main: './packages-bundle.js' })
  )

  await task.source('bundles/babel/packages/*').target('src/compiled/babel')
}

// eslint-disable-next-line camelcase
externals['bytes'] = 'next/dist/compiled/bytes'
export async function ncc_bytes(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('bytes')))
    .ncc({ packageName: 'bytes', externals })
    .target('src/compiled/bytes')
}
// eslint-disable-next-line camelcase
externals['ci-info'] = 'next/dist/compiled/ci-info'
export async function ncc_ci_info(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ci-info')))
    .ncc({ packageName: 'ci-info', externals })
    .target('src/compiled/ci-info')
}
// eslint-disable-next-line camelcase
externals['cli-select'] = 'next/dist/compiled/cli-select'
export async function ncc_cli_select(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cli-select')))
    .ncc({ packageName: 'cli-select', externals })
    .target('src/compiled/cli-select')
}
externals['comment-json'] = 'next/dist/compiled/comment-json'
export async function ncc_comment_json(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('comment-json')))
    .ncc({ packageName: 'comment-json', externals })
    .target('src/compiled/comment-json')
}
// eslint-disable-next-line camelcase
externals['compression'] = 'next/dist/compiled/compression'
export async function ncc_compression(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('compression')))
    .ncc({ packageName: 'compression', externals })
    .target('src/compiled/compression')
}
// eslint-disable-next-line camelcase
externals['conf'] = 'next/dist/compiled/conf'
export async function ncc_conf(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('conf')))
    .ncc({ packageName: 'conf', externals })
    .target('src/compiled/conf')
}
// eslint-disable-next-line camelcase
externals['content-disposition'] = 'next/dist/compiled/content-disposition'
export async function ncc_content_disposition(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('content-disposition')))
    .ncc({ packageName: 'content-disposition', externals })
    .target('src/compiled/content-disposition')
}
// eslint-disable-next-line camelcase
externals['content-type'] = 'next/dist/compiled/content-type'
export async function ncc_content_type(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('content-type')))
    .ncc({ packageName: 'content-type', externals })
    .target('src/compiled/content-type')
}
// eslint-disable-next-line camelcase
externals['cookie'] = 'next/dist/compiled/cookie'
export async function ncc_cookie(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cookie')))
    .ncc({ packageName: 'cookie', externals })
    .target('src/compiled/cookie')
}
// eslint-disable-next-line camelcase
externals['cross-spawn'] = 'next/dist/compiled/cross-spawn'
export async function ncc_cross_spawn(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cross-spawn')))
    .ncc({ packageName: 'cross-spawn', externals })
    .target('src/compiled/cross-spawn')
}
// eslint-disable-next-line camelcase
externals['debug'] = 'next/dist/compiled/debug'
export async function ncc_debug(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('debug')))
    .ncc({ packageName: 'debug', externals })
    .target('src/compiled/debug')
}
// eslint-disable-next-line camelcase
externals['devalue'] = 'next/dist/compiled/devalue'
export async function ncc_devalue(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('devalue')))
    .ncc({ packageName: 'devalue', externals })
    .target('src/compiled/devalue')
}

// eslint-disable-next-line camelcase
externals['find-cache-dir'] = 'next/dist/compiled/find-cache-dir'
export async function ncc_find_cache_dir(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('find-cache-dir')))
    .ncc({ packageName: 'find-cache-dir', externals })
    .target('src/compiled/find-cache-dir')
}
// eslint-disable-next-line camelcase
externals['find-up'] = 'next/dist/compiled/find-up'
export async function ncc_find_up(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('find-up')))
    .ncc({ packageName: 'find-up', externals })
    .target('src/compiled/find-up')
}
// eslint-disable-next-line camelcase
externals['fresh'] = 'next/dist/compiled/fresh'
export async function ncc_fresh(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('fresh')))
    .ncc({ packageName: 'fresh', externals })
    .target('src/compiled/fresh')
}
// eslint-disable-next-line camelcase
externals['glob'] = 'next/dist/compiled/glob'
export async function ncc_glob(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('glob')))
    .ncc({ packageName: 'glob', externals })
    .target('src/compiled/glob')
}
// eslint-disable-next-line camelcase
externals['gzip-size'] = 'next/dist/compiled/gzip-size'
export async function ncc_gzip_size(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('gzip-size')))
    .ncc({ packageName: 'gzip-size', externals })
    .target('src/compiled/gzip-size')
}
// eslint-disable-next-line camelcase
externals['http-proxy'] = 'next/dist/compiled/http-proxy'
export async function ncc_http_proxy(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('http-proxy')))
    .ncc({ packageName: 'http-proxy', externals })
    .target('src/compiled/http-proxy')
}
// eslint-disable-next-line camelcase
externals['ignore-loader'] = 'next/dist/compiled/ignore-loader'
export async function ncc_ignore_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ignore-loader')))
    .ncc({ packageName: 'ignore-loader', externals })
    .target('src/compiled/ignore-loader')
}
// eslint-disable-next-line camelcase
externals['is-animated'] = 'next/dist/compiled/is-animated'
export async function ncc_is_animated(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-animated')))
    .ncc({ packageName: 'is-animated', externals })
    .target('src/compiled/is-animated')
}
// eslint-disable-next-line camelcase
externals['is-docker'] = 'next/dist/compiled/is-docker'
export async function ncc_is_docker(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-docker')))
    .ncc({ packageName: 'is-docker', externals })
    .target('src/compiled/is-docker')
}
// eslint-disable-next-line camelcase
externals['is-wsl'] = 'next/dist/compiled/is-wsl'
export async function ncc_is_wsl(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-wsl')))
    .ncc({ packageName: 'is-wsl', externals })
    .target('src/compiled/is-wsl')
}
// eslint-disable-next-line camelcase
externals['json5'] = 'next/dist/compiled/json5'
export async function ncc_json5(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('json5')))
    .ncc({ packageName: 'json5', externals })
    .target('src/compiled/json5')
}
// eslint-disable-next-line camelcase
externals['jsonwebtoken'] = 'next/dist/compiled/jsonwebtoken'
export async function ncc_jsonwebtoken(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('jsonwebtoken')))
    .ncc({ packageName: 'jsonwebtoken', externals })
    .target('src/compiled/jsonwebtoken')
}
// eslint-disable-next-line camelcase
externals['loader-utils'] = 'error loader-utils version not specified'
externals['loader-utils2'] = 'next/dist/compiled/loader-utils2'
export async function ncc_loader_utils2(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('loader-utils2')))
    .ncc({ packageName: 'loader-utils2', externals })
    .target('src/compiled/loader-utils2')
}
// eslint-disable-next-line camelcase
externals['loader-utils3'] = 'next/dist/compiled/loader-utils3'
export async function ncc_loader_utils3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('loader-utils3')))
    .ncc({ packageName: 'loader-utils3', externals })
    .target('src/compiled/loader-utils3')
}
// eslint-disable-next-line camelcase
externals['lodash.curry'] = 'next/dist/compiled/lodash.curry'
export async function ncc_lodash_curry(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('lodash.curry')))
    .ncc({ packageName: 'lodash.curry', externals })
    .target('src/compiled/lodash.curry')
}
// eslint-disable-next-line camelcase
externals['lru-cache'] = 'next/dist/compiled/lru-cache'
export async function ncc_lru_cache(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('lru-cache')))
    .ncc({ packageName: 'lru-cache', externals })
    .target('src/compiled/lru-cache')
}
// eslint-disable-next-line camelcase
externals['nanoid'] = 'next/dist/compiled/nanoid'
export async function ncc_nanoid(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('nanoid')))
    .ncc({ packageName: 'nanoid', externals })
    .target('src/compiled/nanoid')
}
// eslint-disable-next-line camelcase
externals['native-url'] = 'next/dist/compiled/native-url'
export async function ncc_native_url(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('native-url')))
    .ncc({ packageName: 'native-url', externals, target: 'es5' })
    .target('src/compiled/native-url')
}
// eslint-disable-next-line camelcase
externals['neo-async'] = 'next/dist/compiled/neo-async'
export async function ncc_neo_async(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('neo-async')))
    .ncc({ packageName: 'neo-async', externals })
    .target('src/compiled/neo-async')
}

// eslint-disable-next-line camelcase
externals['ora'] = 'next/dist/compiled/ora'
export async function ncc_ora(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ora')))
    .ncc({ packageName: 'ora', externals })
    .target('src/compiled/ora')
}
// eslint-disable-next-line camelcase
externals['postcss-flexbugs-fixes'] =
  'next/dist/compiled/postcss-flexbugs-fixes'
export async function ncc_postcss_flexbugs_fixes(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-flexbugs-fixes')))
    .ncc({ packageName: 'postcss-flexbugs-fixes', externals })
    .target('src/compiled/postcss-flexbugs-fixes')
}
// eslint-disable-next-line camelcase
export async function ncc_postcss_safe_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-safe-parser')))
    .ncc({ packageName: 'postcss-safe-parser', externals })
    .target('src/compiled/postcss-safe-parser')
}
// eslint-disable-next-line camelcase
externals['postcss-preset-env'] = 'next/dist/compiled/postcss-preset-env'
export async function ncc_postcss_preset_env(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-preset-env')))
    .ncc({ packageName: 'postcss-preset-env', externals })
    .target('src/compiled/postcss-preset-env')
}
// eslint-disable-next-line camelcase
externals['postcss-scss'] = 'next/dist/compiled/postcss-scss'
export async function ncc_postcss_scss(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-scss')))
    .ncc({
      packageName: 'postcss-scss',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-scss')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-extract-imports'] =
  'next/dist/compiled/postcss-modules-extract-imports'
export async function ncc_postcss_modules_extract_imports(task, opts) {
  await task
    .source(
      relative(__dirname, require.resolve('postcss-modules-extract-imports'))
    )
    .ncc({
      packageName: 'postcss-modules-extract-imports',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-extract-imports')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-local-by-default'] =
  'next/dist/compiled/postcss-modules-local-by-default'
export async function ncc_postcss_modules_local_by_default(task, opts) {
  await task
    .source(
      relative(__dirname, require.resolve('postcss-modules-local-by-default'))
    )
    .ncc({
      packageName: 'postcss-modules-local-by-default',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-local-by-default')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-scope'] = 'next/dist/compiled/postcss-modules-scope'
export async function ncc_postcss_modules_scope(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-modules-scope')))
    .ncc({
      packageName: 'postcss-modules-scope',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-scope')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-values'] =
  'next/dist/compiled/postcss-modules-values'
export async function ncc_postcss_modules_values(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-modules-values')))
    .ncc({
      packageName: 'postcss-modules-values',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-modules-values')
}
// eslint-disable-next-line camelcase
externals['postcss-value-parser'] = 'next/dist/compiled/postcss-value-parser'
export async function ncc_postcss_value_parser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-value-parser')))
    .ncc({
      packageName: 'postcss-value-parser',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/postcss-value-parser')
}
// eslint-disable-next-line camelcase
externals['icss-utils'] = 'next/dist/compiled/icss-utils'
export async function ncc_icss_utils(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('icss-utils')))
    .ncc({
      packageName: 'icss-utils',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('src/compiled/icss-utils')
}

externals['scheduler'] = 'next/dist/compiled/scheduler'
export async function ncc_react(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('scheduler')))
    .ncc({ packageName: 'scheduler', externals })
    .target('src/compiled/scheduler')

  const reactDir = dirname(
    relative(__dirname, require.resolve(`react-builtin/package.json`))
  )
  const reactDomDir = dirname(
    relative(__dirname, require.resolve(`react-dom-builtin/package.json`))
  )

  // TODO-APP: remove unused fields from package.json and unused files
  await task.source(join(reactDir, '*.{json,js}')).target(`src/compiled/react`)
  await task.source(join(reactDir, 'LICENSE')).target(`src/compiled/react`)
  await task
    .source(join(reactDir, 'cjs/**/*.js'))
    .target(`src/compiled/react/cjs`)

  await task
    .source(join(reactDomDir, '*.{json,js}'))
    .target(`src/compiled/react-dom`)
  await task
    .source(join(reactDomDir, 'LICENSE'))
    .target(`src/compiled/react-dom`)
  await task
    .source(join(reactDomDir, 'cjs/**/*.js'))
    // eslint-disable-next-line require-yield
    .run({ every: true }, function* (file) {
      const source = file.data.toString()
      // We replace the module/chunk loading code with our own implementaion in Next.js.
      file.data = source.replace(
        /require\(["']scheduler["']\)/g,
        'require("next/dist/compiled/scheduler")'
      )
    })
    .target(`src/compiled/react-dom/cjs`)

  // Remove unused files
  const reactDomCompiledDir = join(__dirname, 'src/compiled/react-dom')
  await fs.remove(join(reactDomCompiledDir, 'static.js'))
  await fs.remove(join(reactDomCompiledDir, 'static.node.js'))
  await fs.remove(join(reactDomCompiledDir, 'static.browser.js'))
  await fs.remove(join(reactDomCompiledDir, 'unstable_testing.js'))
  await fs.remove(join(reactDomCompiledDir, 'test-utils.js'))
  await fs.remove(join(reactDomCompiledDir, 'profiling.js'))
  await fs.remove(join(reactDomCompiledDir, 'server.bun.js'))
  await fs.remove(
    join(reactDomCompiledDir, 'cjs/react-dom-server.bun.development.js')
  )
  await fs.remove(
    join(reactDomCompiledDir, 'cjs/react-dom-server.bun.production.min.js')
  )
  await fs.remove(
    join(reactDomCompiledDir, 'cjs/react-dom-test-utils.development.js')
  )
  await fs.remove(
    join(reactDomCompiledDir, 'cjs/react-dom-test-utils.production.min.js')
  )

  await fs.remove(
    join(reactDomCompiledDir, 'unstable_server-external-runtime.js')
  )
}

// eslint-disable-next-line camelcase
export async function ncc_rsc_poison_packages(task, opts) {
  await task
    .source(join(dirname(require.resolve('server-only')), '*'))
    .target('src/compiled/server-only')
  await task
    .source(join(dirname(require.resolve('client-only')), '*'))
    .target('src/compiled/client-only')
}

// eslint-disable-next-line camelcase
export async function ncc_react_server_dom_webpack(task, opts) {
  // Use installed versions instead of bundled version
  const peerDeps = {
    react: 'react',
    'react-dom': 'react-dom',
  }
  await fs.mkdir(join(__dirname, 'src/compiled/react-server-dom-webpack'), {
    recursive: true,
  })
  await fs.writeFile(
    join(__dirname, 'src/compiled/react-server-dom-webpack/package.json'),
    JSON.stringify({ name: 'react-server-dom-webpack', main: './index.js' })
  )
  await task
    .source(require.resolve('react-server-dom-webpack/client'))
    .target('src/compiled/react-server-dom-webpack')
  await task
    .source(require.resolve('react-server-dom-webpack/server.browser'))
    .target('src/compiled/react-server-dom-webpack')

  // Replace webpack internal apis before bundling
  await task
    .source(
      join(
        dirname(require.resolve('react-server-dom-webpack/package.json')),
        'cjs/react-server-dom-webpack-*'
      )
    )
    // eslint-disable-next-line require-yield
    .run({ every: true }, function* (file) {
      const source = file.data.toString()
      // We replace the module/chunk loading code with our own implementation in Next.js.
      file.data = source
        .replace(/__webpack_chunk_load__/g, 'globalThis.__next_chunk_load__')
        .replace(/__webpack_require__/g, 'globalThis.__next_require__')
    })
    .target('src/compiled/react-server-dom-webpack/cjs')

  // Compile entries
  await task
    .source('src/compiled/react-server-dom-webpack/server.browser.js')
    .ncc({
      minify: false,
      externals: peerDeps,
    })
    .target('src/compiled/react-server-dom-webpack')

  await task
    .source('src/compiled/react-server-dom-webpack/client.js')
    .ncc({
      minify: false,
      externals: peerDeps,
    })
    .target('src/compiled/react-server-dom-webpack')

  await fs.remove(join(__dirname, 'src/compiled/react-server-dom-webpack/cjs'))
}

externals['sass-loader'] = 'next/dist/compiled/sass-loader'
// eslint-disable-next-line camelcase
export async function ncc_sass_loader(task, opts) {
  const sassLoaderPath = require.resolve('sass-loader')
  const utilsPath = join(dirname(sassLoaderPath), 'utils.js')
  const originalContent = await fs.readFile(utilsPath, 'utf8')

  await fs.writeFile(
    utilsPath,
    originalContent.replace(
      /require\.resolve\(["'](sass|node-sass)["']\)/g,
      'eval("require").resolve("$1")'
    )
  )

  await task
    .source(relative(__dirname, sassLoaderPath))
    .ncc({
      packageName: 'sass-loader',
      externals: {
        ...externals,
        'schema-utils': externals['schema-utils3'],
        'loader-utils': externals['loader-utils2'],
      },
      target: 'es5',
    })
    .target('src/compiled/sass-loader')
}
// eslint-disable-next-line camelcase
externals['schema-utils'] = 'MISSING_VERSION schema-utils version not specified'
externals['schema-utils2'] = 'next/dist/compiled/schema-utils2'
export async function ncc_schema_utils2(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('schema-utils2')))
    .ncc({
      packageName: 'schema-utils',
      bundleName: 'schema-utils2',
      externals,
    })
    .target('src/compiled/schema-utils2')
}
// eslint-disable-next-line camelcase
externals['schema-utils3'] = 'next/dist/compiled/schema-utils3'
export async function ncc_schema_utils3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('schema-utils3')))
    .ncc({
      packageName: 'schema-utils',
      bundleName: 'schema-utils3',
      externals,
    })
    .target('src/compiled/schema-utils3')
}
externals['semver'] = 'next/dist/compiled/semver'
export async function ncc_semver(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('semver')))
    .ncc({ packageName: 'semver', externals })
    .target('src/compiled/semver')
}
// eslint-disable-next-line camelcase
externals['send'] = 'next/dist/compiled/send'
export async function ncc_send(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('send')))
    .ncc({ packageName: 'send', externals })
    .target('src/compiled/send')
}
// eslint-disable-next-line camelcase
// NB: Used by other dependencies, but Vercel version is a duplicate
// version so can be inlined anyway (although may change in future)
externals['source-map'] = 'next/dist/compiled/source-map'
export async function ncc_source_map(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('source-map')))
    .ncc({ packageName: 'source-map', externals })
    .target('src/compiled/source-map')
}
// eslint-disable-next-line camelcase
externals['string-hash'] = 'next/dist/compiled/string-hash'
export async function ncc_string_hash(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('string-hash')))
    .ncc({ packageName: 'string-hash', externals })
    .target('src/compiled/string-hash')
}
// eslint-disable-next-line camelcase
externals['strip-ansi'] = 'next/dist/compiled/strip-ansi'
export async function ncc_strip_ansi(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('strip-ansi')))
    .ncc({ packageName: 'strip-ansi', externals })
    .target('src/compiled/strip-ansi')
}
// eslint-disable-next-line camelcase
externals['@vercel/nft'] = 'next/dist/compiled/@vercel/nft'
export async function ncc_nft(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('@vercel/nft')))
    .ncc({ packageName: '@vercel/nft', externals })
    .target('src/compiled/@vercel/nft')
}

// eslint-disable-next-line camelcase
externals['tar'] = 'next/dist/compiled/tar'
export async function ncc_tar(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('tar')))
    .ncc({ packageName: 'tar', externals })
    .target('src/compiled/tar')
}

// eslint-disable-next-line camelcase
externals['terser'] = 'next/dist/compiled/terser'
export async function ncc_terser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('terser')))
    .ncc({ packageName: 'terser', externals })
    .target('src/compiled/terser')
}
// eslint-disable-next-line camelcase
externals['text-table'] = 'next/dist/compiled/text-table'
export async function ncc_text_table(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('text-table')))
    .ncc({ packageName: 'text-table', externals })
    .target('src/compiled/text-table')
}
// eslint-disable-next-line camelcase
externals['unistore'] = 'next/dist/compiled/unistore'
export async function ncc_unistore(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('unistore')))
    .ncc({ packageName: 'unistore', externals })
    .target('src/compiled/unistore')
}
// eslint-disable-next-line camelcase
externals['web-vitals'] = 'next/dist/compiled/web-vitals'
export async function ncc_web_vitals(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        resolve(resolveFrom(__dirname, 'web-vitals'), '../web-vitals.js')
      )
    )
    // web-vitals@3.0.0 is pure ESM, compile to CJS for pre-compiled
    .ncc({ packageName: 'web-vitals', externals, target: 'es5', esm: false })
    .target('src/compiled/web-vitals')
}
// eslint-disable-next-line camelcase
externals['web-vitals-attribution'] =
  'next/dist/compiled/web-vitals-attribution'
export async function ncc_web_vitals_attribution(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        resolve(require.resolve('web-vitals'), '../web-vitals.attribution.js')
      )
    )
    .ncc({
      packageName: 'web-vitals',
      bundleName: 'web-vitals-attribution',
      externals,
      target: 'es5',
      esm: false,
    })
    .target('src/compiled/web-vitals-attribution')
}
// eslint-disable-next-line camelcase
externals['webpack-sources'] = 'error webpack-sources version not specified'
externals['webpack-sources1'] = 'next/dist/compiled/webpack-sources1'
export async function ncc_webpack_sources1(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('webpack-sources1')))
    .ncc({ packageName: 'webpack-sources1', externals, target: 'es5' })
    .target('src/compiled/webpack-sources1')
}
// eslint-disable-next-line camelcase
externals['webpack-sources3'] = 'next/dist/compiled/webpack-sources3'
export async function ncc_webpack_sources3(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('webpack-sources3')))
    .ncc({ packageName: 'webpack-sources3', externals, target: 'es5' })
    .target('src/compiled/webpack-sources3')
}

// eslint-disable-next-line camelcase
externals['micromatch'] = 'next/dist/compiled/micromatch'
export async function ncc_minimatch(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('micromatch')))
    .ncc({ packageName: 'micromatch', externals })
    .target('src/compiled/micromatch')
}

// eslint-disable-next-line camelcase
externals['mini-css-extract-plugin'] =
  'next/dist/compiled/mini-css-extract-plugin'

export async function ncc_mini_css_extract_plugin(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        resolve(require.resolve('mini-css-extract-plugin'), '../index.js')
      )
    )
    .ncc({
      externals: {
        ...externals,
        './index': './index.js',
        'schema-utils': externals['schema-utils3'],
        'webpack-sources': externals['webpack-sources1'],
      },
    })
    .target('src/compiled/mini-css-extract-plugin')
  await task
    .source(
      relative(
        __dirname,
        resolve(
          require.resolve('mini-css-extract-plugin'),
          '../hmr/hotModuleReplacement.js'
        )
      )
    )
    .ncc({
      externals: {
        ...externals,
        './hmr': './hmr',
        'schema-utils': 'next/dist/compiled/schema-utils3',
      },
    })
    .target('src/compiled/mini-css-extract-plugin/hmr')
  await task
    .source(relative(__dirname, require.resolve('mini-css-extract-plugin')))
    .ncc({
      packageName: 'mini-css-extract-plugin',
      externals: {
        ...externals,
        './index': './index.js',
        'schema-utils': externals['schema-utils3'],
      },
    })
    .target('src/compiled/mini-css-extract-plugin')
}

// eslint-disable-next-line camelcase
externals['ua-parser-js'] = 'next/dist/compiled/ua-parser-js'
export async function ncc_ua_parser_js(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ua-parser-js')))
    .ncc({ packageName: 'ua-parser-js', externals })
    .target('src/compiled/ua-parser-js')
}
// eslint-disable-next-line camelcase
export async function ncc_webpack_bundle5(task, opts) {
  const bundleExternals = {
    ...externals,
    'schema-utils': externals['schema-utils3'],
    'webpack-sources': externals['webpack-sources3'],
  }
  for (const pkg of Object.keys(webpackBundlePackages)) {
    delete bundleExternals[pkg]
  }
  await task
    .source('bundles/webpack/bundle5.js')
    .ncc({
      packageName: 'webpack',
      bundleName: 'webpack',
      customEmit(path) {
        if (path.endsWith('.runtime.js')) return `'./${basename(path)}'`
      },
      externals: bundleExternals,
      target: 'es5',
    })
    .target('src/compiled/webpack')
}

const webpackBundlePackages = {
  webpack: 'next/dist/compiled/webpack/webpack-lib',
  'webpack/lib/NormalModule': 'next/dist/compiled/webpack/NormalModule',
  'webpack/lib/node/NodeTargetPlugin':
    'next/dist/compiled/webpack/NodeTargetPlugin',
}

Object.assign(externals, webpackBundlePackages)

export async function ncc_webpack_bundle_packages(task, opts) {
  await task
    .source('bundles/webpack/packages/*')
    .target('src/compiled/webpack/')
}

// eslint-disable-next-line camelcase
externals['ws'] = 'next/dist/compiled/ws'
export async function ncc_ws(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ws')))
    .ncc({ packageName: 'ws', externals })
    .target('src/compiled/ws')
}

externals['path-to-regexp'] = 'next/dist/compiled/path-to-regexp'
export async function path_to_regexp(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('path-to-regexp')))
    .target('dist/compiled/path-to-regexp')
}

export async function precompile(task, opts) {
  await task.parallel(
    [
      'browser_polyfills',
      'path_to_regexp',
      'copy_ncced',
      'copy_styled_jsx_assets',
    ],
    opts
  )
}

// eslint-disable-next-line camelcase
export async function copy_ncced(task) {
  // we don't ncc every time we build since these won't change
  // that often and can be committed to the repo saving build time
  await task.source('src/compiled/**/*').target('dist/compiled')
}

export async function ncc(task, opts) {
  await task
    .clear('compiled')
    .parallel(
      [
        'ncc_node_html_parser',
        'ncc_watchpack',
        'ncc_chalk',
        'ncc_napirs_triples',
        'ncc_p_limit',
        'ncc_raw_body',
        'ncc_cssnano_simple',
        'ncc_image_size',
        'ncc_get_orientation',
        'ncc_hapi_accept',
        'ncc_node_fetch',
        'ncc_node_anser',
        'ncc_node_stacktrace_parser',
        'ncc_node_data_uri_to_buffer',
        'ncc_node_cssescape',
        'ncc_node_platform',
        'ncc_node_shell_quote',
        'ncc_undici',
        'ncc_acorn',
        'ncc_amphtml_validator',
        'ncc_arg',
        'ncc_async_retry',
        'ncc_async_sema',
        'ncc_segment_ajv_human_errors',
        'ncc_assert',
        'ncc_browser_zlib',
        'ncc_buffer',
        'ncc_crypto_browserify',
        'ncc_domain_browser',
        'ncc_events',
        'ncc_stream_browserify',
        'ncc_stream_http',
        'ncc_https_browserify',
        'ncc_os_browserify',
        'ncc_path_browserify',
        'ncc_process',
        'ncc_querystring_es3',
        'ncc_string_decoder',
        'ncc_util',
        'ncc_punycode',
        'ncc_set_immediate',
        'ncc_timers_browserify',
        'ncc_tty_browserify',
        'ncc_vm_browserify',
        'ncc_babel_bundle',
        'ncc_bytes',
        'ncc_ci_info',
        'ncc_cli_select',
        'ncc_comment_json',
        'ncc_compression',
        'ncc_conf',
        'ncc_content_disposition',
        'ncc_content_type',
        'ncc_cookie',
        'ncc_cross_spawn',
        'ncc_debug',
        'ncc_devalue',
        'ncc_find_cache_dir',
        'ncc_find_up',
        'ncc_fresh',
        'ncc_glob',
        'ncc_gzip_size',
        'ncc_http_proxy',
        'ncc_ignore_loader',
        'ncc_is_animated',
        'ncc_is_docker',
        'ncc_is_wsl',
        'ncc_json5',
        'ncc_jsonwebtoken',
        'ncc_loader_utils2',
        'ncc_loader_utils3',
        'ncc_lodash_curry',
        'ncc_lru_cache',
        'ncc_nanoid',
        'ncc_native_url',
        'ncc_neo_async',
        'ncc_ora',
        'ncc_postcss_safe_parser',
        'ncc_postcss_flexbugs_fixes',
        'ncc_postcss_preset_env',
        'ncc_postcss_scss',
        'ncc_postcss_modules_extract_imports',
        'ncc_postcss_modules_local_by_default',
        'ncc_postcss_modules_scope',
        'ncc_postcss_modules_values',
        'ncc_postcss_value_parser',
        'ncc_icss_utils',
        'ncc_schema_utils2',
        'ncc_schema_utils3',
        'ncc_semver',
        'ncc_send',
        'ncc_source_map',
        'ncc_string_hash',
        'ncc_strip_ansi',
        'ncc_nft',
        'ncc_tar',
        'ncc_terser',
        'ncc_text_table',
        'ncc_unistore',
        'ncc_web_vitals',
        'ncc_web_vitals_attribution',
        'ncc_webpack_bundle5',
        'ncc_webpack_sources1',
        'ncc_webpack_sources3',
        'ncc_ws',
        'ncc_ua_parser_js',
        'ncc_minimatch',
        'ncc_mini_css_extract_plugin',
      ],
      opts
    )
  await task.parallel(['ncc_webpack_bundle_packages'], opts)
  await task.parallel(['ncc_babel_bundle_packages'], opts)
  await task.serial(
    [
      'ncc_browserslist',
      'copy_regenerator_runtime',
      'copy_babel_runtime',
      'copy_constants_browserify',
      'ncc_react',
      'ncc_react_server_dom_webpack',
      'copy_react_is',
      'ncc_sass_loader',
      'ncc_jest_worker',
      'ncc_edge_runtime_primitives',
      'ncc_edge_runtime',
    ],
    opts
  )
}

export async function compile(task, opts) {
  await task.parallel(
    [
      'cli',
      'bin',
      'server',
      'server_esm',
      'nextbuild',
      'nextbuildjest',
      'nextbuildstatic',
      'nextbuild_esm',
      'pages',
      'pages_esm',
      'lib',
      'lib_esm',
      'client',
      'client_esm',
      'telemetry',
      'trace',
      'shared',
      'shared_esm',
      'shared_re_exported',
      'shared_re_exported_esm',
      'server_wasm',
      // we compile this each time so that fresh runtime data is pulled
      // before each publish
      'ncc_amp_optimizer',
    ],
    opts
  )
  await task.serial([
    'ncc_react_refresh_utils',
    'ncc_next__react_dev_overlay',
    'ncc_next_server',
  ])
}

export async function bin(task, opts) {
  await task
    .source('src/bin/*')
    .swc('server', { stripExtension: true, dev: opts.dev })
    .target('dist/bin', { mode: '0755' })
}

export async function cli(task, opts) {
  await task
    .source('src/cli/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/cli')
}

export async function lib(task, opts) {
  await task
    .source('src/lib/**/*.+(js|ts|tsx|json)')
    .swc('server', { dev: opts.dev })
    .target('dist/lib')
}

export async function lib_esm(task, opts) {
  await task
    .source('src/lib/**/*.+(js|ts|tsx|json)')
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/esm/lib')
}

export async function server(task, opts) {
  await task
    .source('src/server/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/server')

  await fs.copyFile(
    join(__dirname, 'src/server/google-font-metrics.json'),
    join(__dirname, 'dist/server/google-font-metrics.json')
  )
}

export async function server_esm(task, opts) {
  await task
    .source('src/server/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/esm/server')
}

export async function nextbuild(task, opts) {
  await task
    .source('src/build/**/*.+(js|ts|tsx)', {
      ignore: ['**/fixture/**', '**/tests/**', '**/jest/**'],
    })
    .swc('server', { dev: opts.dev })
    .target('dist/build')
}

export async function nextbuild_esm(task, opts) {
  await task
    .source('src/build/**/*.+(js|ts|tsx)', {
      ignore: ['**/fixture/**', '**/tests/**', '**/jest/**'],
    })
    .swc('server', { dev: opts.dev, esm: true })
    .target('dist/esm/build')
}

export async function nextbuildjest(task, opts) {
  await task
    .source('src/build/jest/**/*.+(js|ts|tsx)', {
      ignore: ['**/fixture/**', '**/tests/**'],
    })
    .swc('server', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/build/jest')
}

export async function client(task, opts) {
  await task
    .source('src/client/**/*.+(js|ts|tsx)')
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/client')
}

export async function client_esm(task, opts) {
  await task
    .source('src/client/**/*.+(js|ts|tsx)')
    .swc('client', { dev: opts.dev, esm: true })
    .target('dist/esm/client')
}

// export is a reserved keyword for functions
export async function nextbuildstatic(task, opts) {
  await task
    .source('src/export/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/export')
}

export async function pages_app(task, opts) {
  await task
    .source('src/pages/_app.tsx')
    .swc('client', {
      dev: opts.dev,
      keepImportAssertions: true,
      interopClientDefaultExport: true,
    })
    .target('dist/pages')
}

export async function pages_error(task, opts) {
  await task
    .source('src/pages/_error.tsx')
    .swc('client', {
      dev: opts.dev,
      keepImportAssertions: true,
      interopClientDefaultExport: true,
    })
    .target('dist/pages')
}

export async function pages_document(task, opts) {
  await task
    .source('src/pages/_document.tsx')
    .swc('server', { dev: opts.dev, keepImportAssertions: true })
    .target('dist/pages')
}

export async function pages_app_esm(task, opts) {
  await task
    .source('src/pages/_app.tsx')
    .swc('client', { dev: opts.dev, keepImportAssertions: true, esm: true })
    .target('dist/esm/pages')
}

export async function pages_error_esm(task, opts) {
  await task
    .source('src/pages/_error.tsx')
    .swc('client', { dev: opts.dev, keepImportAssertions: true, esm: true })
    .target('dist/esm/pages')
}

export async function pages_document_esm(task, opts) {
  await task
    .source('src/pages/_document.tsx')
    .swc('server', { dev: opts.dev, keepImportAssertions: true, esm: true })
    .target('dist/esm/pages')
}

export async function pages(task, opts) {
  await task.parallel(['pages_app', 'pages_error', 'pages_document'], opts)
}

export async function pages_esm(task, opts) {
  await task.parallel(
    ['pages_app_esm', 'pages_error_esm', 'pages_document_esm'],
    opts
  )
}

export async function telemetry(task, opts) {
  await task
    .source('src/telemetry/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/telemetry')
}

export async function trace(task, opts) {
  await task
    .source('src/trace/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/trace')
}

export async function build(task, opts) {
  await task.serial(['precompile', 'compile', 'compile_config_schema'], opts)
}

export default async function (task) {
  const opts = { dev: true }
  await task.clear('dist')
  await task.start('build', opts)
  await task.watch('src/bin', 'bin', opts)
  await task.watch('src/pages', 'pages', opts)
  await task.watch('src/server', ['server', 'server_esm', 'server_wasm'], opts)
  await task.watch(
    'src/build',
    ['nextbuild', 'nextbuild_esm', 'nextbuildjest'],
    opts
  )
  await task.watch('src/export', 'nextbuildstatic', opts)
  await task.watch('src/client', 'client', opts)
  await task.watch('src/client', 'client_esm', opts)
  await task.watch('src/lib', 'lib', opts)
  await task.watch('src/lib', 'lib_esm', opts)
  await task.watch('src/cli', 'cli', opts)
  await task.watch('src/telemetry', 'telemetry', opts)
  await task.watch('src/trace', 'trace', opts)
  await task.watch(
    'src/shared',
    ['shared_re_exported', 'shared_re_exported_esm', 'shared', 'shared_esm'],
    opts
  )
  await task.watch(
    '../react-dev-overlay/dist',
    'ncc_next__react_dev_overlay',
    opts
  )
}

export async function shared(task, opts) {
  await task
    .source(
      'src/shared/**/!(amp|config|constants|dynamic|head|runtime-config).+(js|ts|tsx)'
    )
    .swc('client', { dev: opts.dev })
    .target('dist/shared')
}

export async function shared_esm(task, opts) {
  await task
    .source('src/shared/**/!(amp|config|constants|dynamic|head).+(js|ts|tsx)')
    .swc('client', { dev: opts.dev, esm: true })
    .target('dist/esm/shared')
}

export async function shared_re_exported(task, opts) {
  await task
    .source(
      'src/shared/**/{amp,config,constants,dynamic,head,runtime-config}.+(js|ts|tsx)'
    )
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/shared')
}

export async function shared_re_exported_esm(task, opts) {
  await task
    .source('src/shared/**/{amp,config,constants,dynamic,head}.+(js|ts|tsx)')
    .swc('client', {
      dev: opts.dev,
      esm: true,
    })
    .target('dist/esm/shared')
}

export async function server_wasm(task, opts) {
  await task.source('src/server/**/*.+(wasm)').target('dist/server')
}

export async function release(task) {
  await task.clear('dist').start('build')
}
