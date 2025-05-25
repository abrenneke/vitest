import type { File } from '@vitest/runner'
import type { BaseOptions } from './base'
import c from 'tinyrainbow'
import { BaseReporter } from './base'
import { formatTime } from './renderers/utils'

export interface CollectTimeOptions extends BaseOptions {
  order?: 'total-time' | 'self-time'

  top?: number | 'all'
}

export class CollectTimeReporter extends BaseReporter implements Required<CollectTimeOptions> {
  order: 'total-time' | 'self-time'

  top: number | 'all'

  constructor(options: CollectTimeOptions) {
    super(options)
    this.order = options.order ?? 'total-time'
    this.top = options.top ?? 10
  }

  reportTestSummary(files: File[], errors: unknown[]): void {
    // Call the original summary first
    super.reportTestSummary(files, errors)

    // Then add our custom collect time breakdown
    this.reportCollectTimeSummary(files)
  }

  private reportCollectTimeSummary(files: File[]): void {
    this.log()
    this.log(c.bold(c.cyan(`📊 Import Duration Breakdown (ordered by ${this.order === 'self-time' ? 'Self Time' : 'Total Time'})${this.top === 'all' ? '' : ` (Top ${this.top})`}`)))
    this.log()

    // Collect all import durations from all files
    const allImports: Array<{ path: string; selfTime: number; totalTime: number; testFile: string }> = []

    for (const file of files) {
      if (file.importDurations) {
        for (const [importPath, { selfTime, totalTime }] of Object.entries(file.importDurations)) {
          if (selfTime > 0 || totalTime > 0) {
            allImports.push({
              path: importPath,
              selfTime,
              totalTime,
              testFile: this.relative(file.filepath),
            })
          }
        }
      }
    }

    // Group imports by path to combine duplicates
    const importMap = new Map<string, { selfTime: number; totalTime: number; testFiles: Set<string> }>()
    for (const imp of allImports) {
      const existing = importMap.get(imp.path)
      if (existing) {
        existing.selfTime += imp.selfTime // Sum durations if imported multiple times
        existing.totalTime += imp.totalTime
        existing.testFiles.add(imp.testFile)
      }
      else {
        importMap.set(imp.path, { selfTime: imp.selfTime, totalTime: imp.totalTime, testFiles: new Set([imp.testFile]) })
      }
    }

    // Convert to sorted array
    const sortedImports = Array.from(importMap.entries())
      .map(([path, data]) => ({ path, selfTime: data.selfTime, totalTime: data.totalTime, testFiles: Array.from(data.testFiles) }))
      .sort((a, b) => {
        const aDuration = this.order === 'self-time' ? a.selfTime : a.totalTime
        const bDuration = this.order === 'self-time' ? b.selfTime : b.totalTime
        return bDuration - aDuration
      })

    if (sortedImports.length === 0) {
      this.log(c.dim('  No import duration data available'))
      return
    }

    const maxOrderTime = Math.max(...sortedImports.map(imp => this.order === 'self-time' ? imp.selfTime : imp.totalTime))
    const maxPathLength = Math.max(...sortedImports.map(imp => this.relative(imp.path).length))

    // Calculate the maximum length of formatted time strings for dynamic padding
    const itemsToShow = sortedImports.slice(0, this.top === 'all' ? undefined : this.top)
    const maxSelfTimeLength = Math.max(...itemsToShow.map(imp => formatTime(imp.selfTime).length))
    const maxTotalTimeLength = Math.max(...itemsToShow.map(imp => formatTime(imp.totalTime).length))

    for (const importData of itemsToShow) {
      const { path, selfTime, totalTime } = importData
      const relativePath = this.relative(path)
      const paddedPath = relativePath.padEnd(maxPathLength)

      // Create a visual bar for the import time (based on order field)
      const orderDuration = this.order === 'self-time' ? selfTime : totalTime
      const barLength = Math.max(1, Math.round((orderDuration / maxOrderTime) * 20))
      const bar = '█'.repeat(barLength)

      // Color coding based on order duration
      let timeColor = c.green
      if (orderDuration > 100) {
        timeColor = c.yellow
      }
      if (orderDuration > 500) {
        timeColor = c.red
      }

      const formattedSelfTime = formatTime(selfTime).padStart(maxSelfTimeLength)
      const formattedTotalTime = formatTime(totalTime).padStart(maxTotalTimeLength)

      this.log(`  ${c.dim(paddedPath)} ${timeColor(`self: ${formattedSelfTime}  total: ${formattedTotalTime}`)} ${c.dim(bar)}`)
    }

    this.log()
    this.log(c.dim(`  Total imports: ${sortedImports.length}`))
    this.log(c.dim(`  Slowest import (${this.order}): ${formatTime(maxOrderTime)}`))
    this.log(c.dim(`  Total import time (self/total): ${formatTime(sortedImports.reduce((sum, imp) => sum + imp.selfTime, 0))} / ${formatTime(sortedImports.reduce((sum, imp) => sum + imp.totalTime, 0))}`))
    this.log()
  }
}
