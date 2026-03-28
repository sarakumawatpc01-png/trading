export function normalizeIndianSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return normalized;
  return normalized.endsWith('.NS') ? normalized : `${normalized}.NS`;
}
