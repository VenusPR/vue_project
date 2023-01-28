import path from 'path'

type TypeScript = typeof import('typescript/lib/tsserverlibrary')

let ts: TypeScript
let info: ts.server.PluginCreateInfo
let appDirRegExp: RegExp

export function log(message: string) {
  info.project.projectService.logger.info(message)
}

// This function has to be called initially.
export function init(opts: {
  ts: TypeScript
  info: ts.server.PluginCreateInfo
}) {
  ts = opts.ts
  info = opts.info
  const projectDir = info.project.getCurrentDirectory()
  appDirRegExp = new RegExp(
    '^' + (projectDir + '(/src)?/app').replace(/[\\/]/g, '[\\/]')
  )
  log('Starting Next.js TypeScript plugin: ' + projectDir)
}

export function getTs() {
  return ts
}

export function getTypeChecker() {
  return info.languageService.getProgram()?.getTypeChecker()
}

export function getSource(fileName: string) {
  return info.languageService.getProgram()?.getSourceFile(fileName)
}

export function removeStringQuotes(str: string): string {
  return str.replace(/^['"`]|['"`]$/g, '')
}

export const isPositionInsideNode = (position: number, node: ts.Node) => {
  const start = node.getFullStart()
  return start <= position && position <= node.getFullWidth() + start
}

export const isDefaultFunctionExport = (
  node: ts.Node
): node is ts.FunctionDeclaration => {
  if (ts.isFunctionDeclaration(node)) {
    let hasExportKeyword = false
    let hasDefaultKeyword = false

    if (node.modifiers) {
      for (const modifier of node.modifiers) {
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
          hasExportKeyword = true
        } else if (modifier.kind === ts.SyntaxKind.DefaultKeyword) {
          hasDefaultKeyword = true
        }
      }
    }

    // `export default function`
    if (hasExportKeyword && hasDefaultKeyword) {
      return true
    }
  }
  return false
}

export const isAppEntryFile = (filePath: string) => {
  return (
    appDirRegExp.test(filePath) &&
    /^(page|layout)\.(mjs|js|jsx|ts|tsx)$/.test(path.basename(filePath))
  )
}
export const isPageFile = (filePath: string) => {
  return (
    appDirRegExp.test(filePath) &&
    /^page\.(mjs|js|jsx|ts|tsx)$/.test(path.basename(filePath))
  )
}

// Check if a module is a client entry.
export function getIsClientEntry(
  fileName: string,
  throwOnInvalidDirective?: boolean
) {
  const source = info.languageService.getProgram()?.getSourceFile(fileName)
  if (source) {
    let isClientEntry = false
    let isDirective = true

    ts.forEachChild(source!, (node) => {
      if (
        ts.isExpressionStatement(node) &&
        ts.isStringLiteral(node.expression)
      ) {
        if (node.expression.text === 'use client') {
          if (isDirective) {
            isClientEntry = true
          } else {
            if (throwOnInvalidDirective) {
              const e = {
                messageText:
                  'The `"use client"` directive must be put at the top of the file.',
                start: node.expression.getStart(),
                length: node.expression.getWidth(),
              }
              throw e
            }
          }
        }
      } else {
        isDirective = false
      }
    })

    return isClientEntry
  }
  return false
}
