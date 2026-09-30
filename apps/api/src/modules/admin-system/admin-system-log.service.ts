export type SystemLogLevel = 'success' | 'redirect' | 'client_error' | 'server_error'

type SystemLog = { id: number; timestamp: string; level: SystemLogLevel; status_code: number; message: string }

const MAX_LOGS = 100
let nextId = 1
const logs: SystemLog[] = []

export function writeSystemLog(statusCode: number, message: string) {
  const level: SystemLogLevel = statusCode >= 500
    ? 'server_error'
    : statusCode >= 400
      ? 'client_error'
      : statusCode >= 300
        ? 'redirect'
        : 'success'
  logs.push({ id: nextId++, timestamp: new Date().toISOString(), level, status_code: statusCode, message })
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
}

export function getSystemLogs() {
  return { logs: [...logs].reverse() }
}
