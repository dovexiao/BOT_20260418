/**
 * 简单单例日志：时间戳 + 级别 + 内容。
 */
class Logger {
  private static _instance: Logger | undefined

  constructor() {
    if (Logger._instance) return Logger._instance
    Logger._instance = this
  }

  private _ts(): string {
    return new Date().toISOString()
  }

  private _line(level: string, stream: (...args: unknown[]) => void, parts: unknown[]): void {
    stream(`[${this._ts()}] [${level}]`, ...parts)
  }

  info(...args: unknown[]): void {
    this._line('INFO', console.log, args)
  }

  success(...args: unknown[]): void {
    this._line('OK', console.log, args)
  }

  warn(...args: unknown[]): void {
    this._line('WARN', console.warn, args)
  }

  error(...args: unknown[]): void {
    this._line('ERROR', console.error, args)
  }
}

export default new Logger()
