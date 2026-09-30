import { appendFile, mkdir, readFile, readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

export type SystemLogLevel = 'success' | 'redirect' | 'client_error' | 'server_error'

export type SystemLog = {
  timestamp: string
  level: SystemLogLevel
  status_code: number
  message: string
}

type SystemLogsQuery = {
  page?: number
  limit?: number
  status?: 'all' | '2xx' | '3xx' | '4xx' | '5xx'
  search?: string
  date?: string
}

const LOG_DIRECTORY = resolve(import.meta.dir, '../../../assets/logs/api')
const RETENTION_DAYS = 30
const DAILY_LOG_FILE = /^\d{4}-\d{2}-\d{2}\.log$/
let lastCleanupDate = ''

function logDate(timestamp = new Date()): string {
  return timestamp.toISOString().slice(0, 10)
}

function logPath(date: string): string {
  return resolve(LOG_DIRECTORY, `${date}.log`)
}

function levelFor(statusCode: number): SystemLogLevel {
  if (statusCode >= 500) return 'server_error'
  if (statusCode >= 400) return 'client_error'
  if (statusCode >= 300) return 'redirect'
  return 'success'
}

function parseLog(value: string): SystemLog | null {
  try {
    const log = JSON.parse(value) as Partial<SystemLog>
    return typeof log.timestamp === 'string'
      && typeof log.message === 'string'
      && typeof log.status_code === 'number'
      && (log.level === 'success' || log.level === 'redirect' || log.level === 'client_error' || log.level === 'server_error')
      ? log as SystemLog
      : null
  } catch {
    return null
  }
}

async function readDailyLogs(date: string): Promise<SystemLog[]> {
  try {
    const content = await readFile(logPath(date), 'utf8')
    return content
      .split('\n')
      .filter(Boolean)
      .map(parseLog)
      .filter((log): log is SystemLog => log !== null)
      .reverse()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

async function removeExpiredLogs(today: string) {
  if (lastCleanupDate === today) return
  const cutoff = new Date(`${today}T00:00:00.000Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - (RETENTION_DAYS - 1))
  const cutoffDate = logDate(cutoff)
  const files = await readdir(LOG_DIRECTORY)
  await Promise.all(files
    .filter((file) => DAILY_LOG_FILE.test(file) && file.slice(0, 10) < cutoffDate)
    .map((file) => unlink(resolve(LOG_DIRECTORY, file))))
  lastCleanupDate = today
}

export async function writeSystemLog(statusCode: number, message: string) {
  const timestamp = new Date()
  const log: SystemLog = {
    timestamp: timestamp.toISOString(),
    level: levelFor(statusCode),
    status_code: statusCode,
    message,
  }
  await mkdir(LOG_DIRECTORY, { recursive: true })
  const date = logDate(timestamp)
  await removeExpiredLogs(date)
  await appendFile(logPath(date), `${JSON.stringify(log)}\n`, 'utf8')
}

export async function getSystemLogs(query: SystemLogsQuery) {
  const page = query.page ?? 1
  const limit = query.limit ?? 50
  const status = query.status ?? 'all'
  const search = query.search?.trim().toLowerCase() ?? ''
  const date = query.date ?? logDate()
  const filteredLogs = (await readDailyLogs(date)).filter((log) => {
    const matchesStatus = status === 'all' || String(log.status_code).startsWith(status[0] ?? '')
    return matchesStatus && (!search || log.message.toLowerCase().includes(search))
  })
  const total = filteredLogs.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit

  return {
    date,
    logs: filteredLogs.slice(start, start + limit),
    pagination: { page: safePage, limit, total, totalPages },
  }
}
