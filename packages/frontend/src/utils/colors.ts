export const EXPANSION_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0f766e'
]

function normalizeColor(color?: string): string | undefined {
  if (!color) return undefined
  return EXPANSION_COLORS.includes(color) ? color : undefined
}

function pickRandomColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)]
}

export function getExpansionColor(usedColors: string[] = []): string {
  const normalizedUsedColors = usedColors
    .map((color) => normalizeColor(color))
    .filter((color): color is string => Boolean(color))
  const usedColorSet = new Set(normalizedUsedColors)
  const availableColors = EXPANSION_COLORS.filter((color) => !usedColorSet.has(color))
  return pickRandomColor(availableColors.length > 0 ? availableColors : EXPANSION_COLORS)
}
