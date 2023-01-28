/**
 * This is a TypeScript language service plugin for Next.js app directory,
 * it provides the following features:
 *
 * - Warns about disallowed React APIs in server components.
 * - Warns about disallowed layout and page exports.
 * - Autocompletion for entry configurations.
 * - Hover hint and docs for entry configurations.
 */

import {
  init,
  getIsClientEntry,
  isAppEntryFile,
  isDefaultFunctionExport,
  isPositionInsideNode,
  getSource,
} from './utils'
import { NEXT_TS_ERRORS } from './constant'

import entryConfig from './rules/config'
import serverLayer from './rules/server'
import entryDefault from './rules/entry'
import clientBoundary from './rules/client-boundary'

export function createTSPlugin(modules: {
  typescript: typeof import('typescript/lib/tsserverlibrary')
}) {
  const ts = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    init({
      ts,
      info,
    })

    // Set up decorator object
    const proxy = Object.create(null)
    for (let k of Object.keys(info.languageService)) {
      const x = (info.languageService as any)[k]
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args)
    }

    // Auto completion
    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: any
    ) => {
      let prior = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      ) || {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      }
      if (!isAppEntryFile(fileName)) return prior

      // Remove specified entries from completion list if it's a server entry.
      if (!getIsClientEntry(fileName)) {
        prior.entries = serverLayer.filterCompletionsAtPosition(prior.entries)
      }

      // Add auto completions for export configs.
      const entries = entryConfig.getCompletionsAtPosition(fileName, position)
      prior.entries = [...prior.entries, ...entries]

      const source = getSource(fileName)
      if (!source) return prior

      ts.forEachChild(source!, (node) => {
        // Auto completion for default export function's props.
        if (
          isPositionInsideNode(position, node) &&
          isDefaultFunctionExport(node)
        ) {
          prior.entries.push(
            ...entryDefault.getCompletionsAtPosition(
              fileName,
              node as ts.FunctionDeclaration,
              position
            )
          )
        }
      })

      return prior
    }

    // Show auto completion details
    proxy.getCompletionEntryDetails = (
      fileName: string,
      position: number,
      entryName: string,
      formatOptions: ts.FormatCodeOptions,
      source: string,
      preferences: ts.UserPreferences,
      data: ts.CompletionEntryData
    ) => {
      const entryCompletionEntryDetails = entryConfig.getCompletionEntryDetails(
        entryName,
        data
      )
      if (entryCompletionEntryDetails) return entryCompletionEntryDetails

      return info.languageService.getCompletionEntryDetails(
        fileName,
        position,
        entryName,
        formatOptions,
        source,
        preferences,
        data
      )
    }

    // Quick info
    proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
      const prior = info.languageService.getQuickInfoAtPosition(
        fileName,
        position
      )
      if (!isAppEntryFile(fileName)) return prior

      // Remove type suggestions for disallowed APIs in server components.
      if (!getIsClientEntry(fileName)) {
        const definitions = info.languageService.getDefinitionAtPosition(
          fileName,
          position
        )
        if (
          definitions &&
          serverLayer.hasDisallowedReactAPIDefinition(definitions)
        ) {
          return
        }
      }

      const overriden = entryConfig.getQuickInfoAtPosition(fileName, position)
      if (overriden) return overriden

      return prior
    }

    // Show errors for disallowed imports
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const prior = info.languageService.getSemanticDiagnostics(fileName)
      const source = getSource(fileName)
      if (!source) return prior

      let isClientEntry = false
      const isAppEntry = isAppEntryFile(fileName)

      try {
        isClientEntry = getIsClientEntry(fileName, true)
      } catch (e: any) {
        prior.push({
          file: source,
          category: ts.DiagnosticCategory.Error,
          code: NEXT_TS_ERRORS.MISPLACED_CLIENT_ENTRY,
          ...e,
        })
        isClientEntry = false
      }

      ts.forEachChild(source!, (node) => {
        if (ts.isImportDeclaration(node)) {
          if (isAppEntry) {
            if (!isClientEntry) {
              // Check if it has valid imports in the server layer
              const diagnostics =
                serverLayer.getSemanticDiagnosticsForImportDeclaration(
                  source,
                  node
                )
              prior.push(...diagnostics)
            }
          }
        } else if (
          ts.isVariableStatement(node) &&
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          // export const ...
          if (isAppEntry) {
            // Check if it has correct option exports
            const diagnostics =
              entryConfig.getSemanticDiagnosticsForExportVariableStatement(
                source,
                node
              )
            prior.push(...diagnostics)
          }

          if (isClientEntry) {
            prior.push(
              ...clientBoundary.getSemanticDiagnosticsForExportVariableStatement(
                source,
                node
              )
            )
          }
        } else if (isDefaultFunctionExport(node)) {
          // export default function ...
          if (isAppEntry) {
            const diagnostics = entryDefault.getSemanticDiagnostics(
              fileName,
              source,
              node
            )
            prior.push(...diagnostics)
          }

          if (isClientEntry) {
            prior.push(
              ...clientBoundary.getSemanticDiagnosticsForFunctionExport(
                source,
                node
              )
            )
          }
        } else if (
          ts.isFunctionDeclaration(node) &&
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          // export function ...
          if (isClientEntry) {
            prior.push(
              ...clientBoundary.getSemanticDiagnosticsForFunctionExport(
                source,
                node
              )
            )
          }
        }
      })

      return prior
    }

    return proxy
  }

  return { create }
}
