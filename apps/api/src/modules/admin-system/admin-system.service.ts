import { readdir, stat, statfs } from 'node:fs/promises'
import { availableParallelism, cpus, freemem, totalmem } from 'node:os'
import { resolve } from 'node:path'

type CpuSample = { idle: number; total: number }

let previousCpuSample: CpuSample | null = null
const ASSETS_DIRECTORY = resolve(import.meta.dir, '../../../assets')
const ASSETS_USAGE_CACHE_MS = 30_000
type AssetsUsage = { total_bytes: number; folders: Array<{ name: string; bytes: number }> }
let assetsUsageCache: { loadedAt: number; data: AssetsUsage } | null = null

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

async function directorySize(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true })
  let total = 0
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) total += await directorySize(path)
    else if (entry.isFile()) total += Number((await stat(path)).size)
  }
  return total
}

async function readAssetsUsage() {
  if (assetsUsageCache && Date.now() - assetsUsageCache.loadedAt < ASSETS_USAGE_CACHE_MS) return assetsUsageCache.data
  try {
    const entries = await readdir(ASSETS_DIRECTORY, { withFileTypes: true })
    const folders = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({ name: entry.name, bytes: await directorySize(resolve(ASSETS_DIRECTORY, entry.name)) })))
    const value = { total_bytes: folders.reduce((total, folder) => total + folder.bytes, 0), folders: folders.sort((a, b) => b.bytes - a.bytes) }
    assetsUsageCache = { loadedAt: Date.now(), data: value }
    return value
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { total_bytes: 0, folders: [] }
    throw error
  }
}

export async function getSystemMetrics() {
  const filesystemPath = process.platform === 'win32' ? process.cwd().slice(0, 3) : '/'
  const [cpuUsagePercent, filesystem, assets] = await Promise.all([
    readCpuUsagePercent(),
    statfs(filesystemPath),
    readAssetsUsage(),
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
    assets,
  }
}
