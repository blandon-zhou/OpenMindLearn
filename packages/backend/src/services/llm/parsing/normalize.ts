export function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
