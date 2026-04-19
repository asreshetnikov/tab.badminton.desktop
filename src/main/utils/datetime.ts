/**
 * Format a Date as a local ISO string (YYYY-MM-DDTHH:MM:SS) without UTC conversion.
 * Use this everywhere scheduling-related datetimes are written to the DB so that
 * stored values always reflect the organiser's local clock, not UTC.
 */
export function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/**
 * Format a Date as a local date string (YYYY-MM-DD) without UTC conversion.
 */
export function toLocalDateStr(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
