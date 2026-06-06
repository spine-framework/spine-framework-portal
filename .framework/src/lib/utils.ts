/**
 * @module src/lib/utils
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * General-purpose frontend utility functions. Pure helpers only — no React,
 * no Supabase, no side effects. Safe to use in any component or hook.
 *
 * **Exports:** `cn`, `formatDate`, `formatTime`, `formatDateTime`,
 * `formatRelativeTime`, `formatFileSize`, `formatCurrency`, `formatNumber`,
 * `truncateText`, `generateSlug`, `capitalize`, `debounce`, `throttle`,
 * `isValidUrl`, `getFileExtension`, `generateId`, `deepClone`
 *
 * @seeAlso src/lib/api.ts (fetch utilities)
 * @seeAlso functions/_shared/schema-utils.ts (server-side field formatters
 *   for storage-layer data; parallel set to the date/currency helpers here)
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ─── TAILWIND HELPERS ───────────────────────────────────────────────────────────

/**
 * Merges Tailwind class strings with conflict resolution via `tailwind-merge`
 * and conditional class support via `clsx`. The standard utility for
 * composing class names in all Spine components.
 *
 * @param inputs - Any number of class values (strings, arrays, objects)
 * @returns Merged, deduplicated class string
 * @throws never
 * @example
 * ```ts
 * cn('px-4 py-2', isActive && 'bg-blue-500', 'px-6') // → 'py-2 bg-blue-500 px-6'
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── DATE FORMATTERS ────────────────────────────────────────────────────────────

/**
 * Formats a date as a locale date string ('Jan 15, 2024').
 * Returns `'N/A'` for null/undefined, `'Invalid Date'` for non-parseable input.
 * @param date - ISO string, Date object, null, or undefined
 * @param options - Optional `Intl.DateTimeFormatOptions` overrides
 * @throws never
 */
export function formatDate(date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!date) return 'N/A'
  
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Check if date is invalid
  if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid Date'
  
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  })
}

/**
 * Formats a date as a locale time string ('02:30 PM').
 * Returns `'N/A'` for null/undefined, `'Invalid Date'` for bad input.
 * @throws never
 */
export function formatTime(date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!date) return 'N/A'
  
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Check if date is invalid
  if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid Date'
  
  return dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}

/**
 * Formats a date as a locale date+time string ('Jan 15, 2024, 02:30 PM').
 * Returns `'N/A'` for null/undefined, `'Invalid Date'` for bad input.
 * @throws never
 */
export function formatDateTime(date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!date) return 'N/A'
  
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Check if date is invalid
  if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid Date'
  
  return dateObj.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}

/**
 * Formats a date as a human-readable relative string
 * ('just now', '5 minutes ago', '3 days ago', or falls back to `formatDate`
 * for dates older than 7 days).
 * Returns `'N/A'` for null/undefined, `'Invalid Date'` for bad input.
 * @throws never
 */
export function formatRelativeTime(date: string | Date | null | undefined) {
  if (!date) return 'N/A'
  
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Check if date is invalid
  if (isNaN(dateObj.getTime())) return 'Invalid Date'
  
  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return 'just now'
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else {
    return formatDate(dateObj)
  }
}

// ─── NUMBER FORMATTERS ───────────────────────────────────────────────────────────

/**
 * Formats bytes as a human-readable size string ('1.23 MB').
 * Returns `'0 Bytes'` for 0.
 * @param bytes - Non-negative byte count
 * @param decimals - Decimal places (default 2)
 * @throws never
 */
export function formatFileSize(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Formats a number as a locale currency string ('$1,234.56').
 * @param amount - Numeric value
 * @param currency - ISO 4217 code (default 'USD')
 * @param locale - BCP 47 locale tag (default 'en-US')
 * @throws never
 */
export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Formats a number using `Intl.NumberFormat` with optional format options.
 * @throws never
 */
export function formatNumber(num: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat('en-US', options).format(num)
}

// ─── STRING UTILITIES ────────────────────────────────────────────────────────────

/**
 * Truncates text to `maxLength` characters, appending `'...'` if truncated.
 * Returns the original string if it fits within `maxLength`.
 * @throws never
 */
export function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Converts text to a URL-friendly slug: lowercased, diacritics stripped,
 * spaces/underscores/hyphens collapsed to single `-`, leading/trailing
 * hyphens removed.
 * @throws never
 */
export function generateSlug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Capitalises the first character of a string. @throws never */
export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ─── TIMING UTILITIES ────────────────────────────────────────────────────────────

/**
 * Returns a debounced wrapper that delays invoking `func` until `wait` ms
 * after the last call. Resets the timer on each call.
 * @param func - The function to debounce
 * @param wait - Delay in milliseconds
 * @throws never (the wrapper itself never throws; `func` may throw)
 * @example
 * ```ts
 * const search = debounce((q: string) => fetchResults(q), 300)
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Returns a throttled wrapper that invokes `func` at most once per `limit` ms.
 * Subsequent calls within the window are dropped.
 * @param func - The function to throttle
 * @param limit - Throttle window in milliseconds
 * @throws never
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// ─── VALIDATION & FILE UTILITIES ────────────────────────────────────────────────────

/** Returns true if `url` is a valid absolute URL (any protocol). @throws never */
export function isValidUrl(url: string) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Extracts the file extension from a filename. Returns an empty string if
 * there is no extension. Works correctly for dotfiles (e.g. `.gitignore` → `''`).
 * @throws never
 */
export function getFileExtension(filename: string) {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2)
}

/** Generates a random alphanumeric ID of the given length (default 8). @throws never */
export function generateId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// ─── OBJECT UTILITIES ─────────────────────────────────────────────────────────────

/**
 * Recursively deep-clones an object, array, or Date. Primitives and null
 * are returned by value. Does not handle Maps, Sets, or class instances
 * with custom prototypes.
 * @throws never
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T
  if (typeof obj === 'object') {
    const clonedObj = {} as T
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key])
      }
    }
    return clonedObj
  }
  return obj
}
