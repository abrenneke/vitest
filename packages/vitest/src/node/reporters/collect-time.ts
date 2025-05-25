import type { File } from '@vitest/runner'
import c from 'tinyrainbow'
import { BaseReporter } from './base'
import { formatTime } from './renderers/utils'

export class CollectTimeReporter extends BaseReporter {
  reportTestSummary(files: File[], errors: unknown[]): void {
    // Call the original summary first
    super.reportTestSummary(files, errors)

    // Then add our custom collect time breakdown
    this.reportCollectTimeSummary(files)
  }

  private reportCollectTimeSummary(files: File[]): void {
    this.log()
    this.log(c.bold(c.cyan('📊 Import Duration Breakdown')))
    this.log()

    // Collect all import durations from all files
    const allImports: Array<{ path: string; duration: number; testFile: string }> = []

    for (const file of files) {
      if (file.importDurations) {
        for (const [importPath, duration] of Object.entries(file.importDurations)) {
          if (duration > 0) {
            allImports.push({
              path: importPath,
              duration,
              testFile: this.relative(file.filepath),
            })
          }
        }
      }
    }

    // Group imports by path to combine duplicates
    const importMap = new Map<string, { duration: number; testFiles: Set<string> }>()
    for (const imp of allImports) {
      const existing = importMap.get(imp.path)
      if (existing) {
        existing.duration += imp.duration // Sum durations if imported multiple times
        existing.testFiles.add(imp.testFile)
      }
      else {
        importMap.set(imp.path, { duration: imp.duration, testFiles: new Set([imp.testFile]) })
      }
    }

    // Convert to sorted array
    const sortedImports = Array.from(importMap.entries())
      .map(([path, data]) => ({ path, duration: data.duration, testFiles: Array.from(data.testFiles) }))
      .sort((a, b) => b.duration - a.duration)

    if (sortedImports.length === 0) {
      this.log(c.dim('  No import duration data available'))
      return
    }

    const maxImportTime = Math.max(...sortedImports.map(imp => imp.duration))
    const maxPathLength = Math.max(...sortedImports.map(imp => this.relative(imp.path).length))

    for (const importData of sortedImports) {
      const { path, duration, testFiles } = importData
      const relativePath = this.relative(path)
      const paddedPath = relativePath.padEnd(maxPathLength)

      // Create a visual bar for the import time
      const barLength = Math.max(1, Math.round((duration / maxImportTime) * 20))
      const bar = '█'.repeat(barLength)

      // Color coding based on import time
      let timeColor = c.green
      if (duration > 100) {
        timeColor = c.yellow
      }
      if (duration > 500) {
        timeColor = c.red
      }

      const formattedTime = formatTime(duration).padStart(8)

      this.log(`  ${c.dim(paddedPath)} ${timeColor(formattedTime)} ${c.dim(bar)}`)
    }

    this.log()
    this.log(c.dim(`  Total imports: ${sortedImports.length}`))
    this.log(c.dim(`  Slowest import: ${formatTime(maxImportTime)}`))
    this.log(c.dim(`  Total import time: ${formatTime(sortedImports.reduce((sum, imp) => sum + imp.duration, 0))}`))
    this.log()
  }
}
