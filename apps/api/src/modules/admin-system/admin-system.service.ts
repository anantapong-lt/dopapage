import { statfs } from 'node:fs/promises'
import { availableParallelism } from 'node:os'

type CpuSample = { idle: number; total: number }

let previousCpuSample: CpuSample | null = null

async function readCpuUsagePercent(): Promise<number> {
  const stat = await Bun.file('/proc/stat').text()
  const fields = stat.split('\n')[0]?.trim().split(/\s+/).slice(1).map(Number) ?? []
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
  const total = fields.reduce((sum, value) => sum + value, 0)
  const previous = previousCpuSample
  previousCpuSample = { idle, total }

  if (!previous || total <= previous.total) return 0
  return Number(((1 - (idle - previous.idle) / (total - previous.total)) * 100).toFixed(1))
}

export async function getSystemMetrics() {
  const [cpuUsagePercent, memory, filesystem] = await Promise.all([
    readCpuUsagePercent(),
    Bun.file('/proc/meminfo').text(),
    statfs('/'),
  ])
  const memoryValues = Object.fromEntries(memory.split('\n')
    .map((line) => line.match(/^(\w+):\s+(\d+)/))
    .filter((entry): entry is RegExpMatchArray => entry !== null)
    .map((entry) => [entry[1], Number(entry[2]) * 1024]),
  ) as Record<string, number>
  const memoryTotalBytes = memoryValues.MemTotal ?? 0
  const memoryAvailableBytes = memoryValues.MemAvailable ?? 0
  const memoryUsedBytes = Math.max(0, memoryTotalBytes - memoryAvailableBytes)
  const blockSize = Number(filesystem.bsize)
  const storageTotalBytes = Number(filesystem.blocks) * blockSize
  const storageAvailableBytes = Number(filesystem.bavail) * blockSize
  const storageUsedBytes = Math.max(0, storageTotalBytes - storageAvailableBytes)

  return {
    updated_at: new Date().toISOString(),
    cpu: { usage_percent: cpuUsagePercent, cores: availableParallelism() },
    memory: { total_bytes: memoryTotalBytes, used_bytes: memoryUsedBytes, available_bytes: memoryAvailableBytes },
    storage: { total_bytes: storageTotalBytes, used_bytes: storageUsedBytes, available_bytes: storageAvailableBytes },
  }
}
