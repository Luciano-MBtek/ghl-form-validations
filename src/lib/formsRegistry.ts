import REGISTRY from "../app/forms/registry.json";

export type Registry = typeof REGISTRY;
export type FormConfig = Registry["forms"][number];

function resolveEnv(key?: string) {
  return key ? process.env[key] || "" : "";
}

export function listForms(): FormConfig[] {
  return REGISTRY.forms.map((f) => ({
    ...f,
    // resolve env-bound ids now for convenience
    locationId: resolveEnv(f.locationIdEnv),
    workflowId: resolveEnv(f.workflowIdEnv),
  })) as any;
}

export function getFormBySlug(
  slug: string
): (FormConfig & { locationId?: string; workflowId?: string }) | null {
  const form = listForms().find((f) => f.slug === slug);
  return form || null;
}
