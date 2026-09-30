import { statfs } from 'node:fs/promises'
import { availableParallelism, cpus, freemem, totalmem } from 'node:os'

type CpuSample = { idle: number; total: number }

let previousCpuSample: CpuSample | null = null

async function readCpuUsagePercent(): Promise<number> {
  const sample = cpus().reduce(
    (value, cpu) => ({
      idle: value.idle + cpu.times.idle,
      total: value.total + Object.values(cpu.times).reduce((sum, time) => sum + time, 0),
    }),
    { idle: 0, total: 0 },
  )
  const { idle, total } = sample
  const previous = previousCpuSample
  previousCpuSample = { idle, total }

  if (!previous || total <= previous.total) return 0
  return Number(((1 - (idle - previous.idle) / (total - previous.total)) * 100).toFixed(1))
}

export async function getSystemMetrics() {
  const filesystemPath = process.platform === 'win32' ? process.cwd().slice(0, 3) : '/'
  const [cpuUsagePercent, filesystem] = await Promise.all([
    readCpuUsagePercent(),
    statfs(filesystemPath),
  ])
  const memoryTotalBytes = totalmem()
  const memoryAvailableBytes = freemem()
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
