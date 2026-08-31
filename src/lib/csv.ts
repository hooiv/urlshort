/**
 * Lightweight, zero-dependency, RFC 4180 compliant CSV parser and serializer.
 */

export function parseCsv(text: string): string[][] {
  const result: string[][] = []
  let row: string[] = []
  let inQuotes = false
  let current = ''
  let i = 0

  const len = text.length
  while (i < len) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          // Escaped quote ("")
          current += '"'
          i += 2
          continue
        } else {
          // Closing quote
          inQuotes = false
          i += 1
          continue
        }
      } else {
        current += char
        i += 1
        continue
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i += 1
        continue
      } else if (char === ',') {
        row.push(current.trim())
        current = ''
        i += 1
        continue
      } else if (char === '\r') {
        if (i + 1 < len && text[i + 1] === '\n') {
          i += 1
        }
        row.push(current.trim())
        if (row.some((cell) => cell.length > 0)) {
          result.push(row)
        }
        row = []
        current = ''
        i += 1
        continue
      } else if (char === '\n') {
        row.push(current.trim())
        if (row.some((cell) => cell.length > 0)) {
          result.push(row)
        }
        row = []
        current = ''
        i += 1
        continue
      } else {
        current += char
        i += 1
        continue
      }
    }
  }

  row.push(current.trim())
  if (row.some((cell) => cell.length > 0)) {
    result.push(row)
  }

  return result
}

export function serializeCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '""'
          const str = String(cell)
          if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return `"${str}"`
        })
        .join(',')
    )
    .join('\n')
}
