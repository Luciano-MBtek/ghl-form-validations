/**
 * Helper function to resolve option labels from registry options
 * Used to map internal form values to display labels for LeadConnector
 */

export function resolveOptionLabel(
  raw: unknown,
  options?: Array<{ value: string; label: string }>
): string | null {
  if (!options || options.length === 0) return raw == null ? null : String(raw);

  const s = String(raw).trim();

  // First try to match by value (case-insensitive)
  const byValue = options.find(
    (o) => o.value.toLowerCase() === s.toLowerCase()
  );
  if (byValue) return byValue.label;

  // Then try to match by label (case-insensitive)
  const byLabel = options.find(
    (o) => o.label.toLowerCase() === s.toLowerCase()
  );
  if (byLabel) return byLabel.label;

  return null;
}
