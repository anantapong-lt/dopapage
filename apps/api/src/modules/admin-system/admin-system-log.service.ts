export type SystemLogLevel = 'info' | 'error'

type SystemLog = { id: number; timestamp: string; level: SystemLogLevel; message: string }

const MAX_LOGS = 100
let nextId = 1
const logs: SystemLog[] = []

export function writeSystemLog(level: SystemLogLevel, message: string) {
  logs.push({ id: nextId++, timestamp: new Date().toISOString(), level, message })
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
}

export function getSystemLogs() {
  return { logs: [...logs].reverse() }
}
