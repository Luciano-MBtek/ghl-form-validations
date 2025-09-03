import REGISTRY from "../app/forms/registry.json";

export type Registry = typeof REGISTRY;
export type FormConfig = Registry["forms"][number];
export type LegalLink = { label: string; href: string };
export type LegalConfig = { privacy: LegalLink; terms: LegalLink };
export type FormConfigResolved = FormConfig & {
  locationId?: string;
  workflowId?: string;
  legal: LegalConfig;
};

function resolveEnv(key?: string) {
  return key ? process.env[key] || "" : "";
}

export function listForms(): FormConfigResolved[] {
  return REGISTRY.forms.map((f) => {
    const legal: LegalConfig =
      (f as any).legal ?? (REGISTRY as any).legalDefaults;
    return {
      ...(f as any),
      // resolve env-bound ids now for convenience
      locationId: resolveEnv((f as any).locationIdEnv),
      workflowId: resolveEnv((f as any).workflowIdEnv),
      legal,
    } as FormConfigResolved;
  });
}

export function getFormBySlug(slug: string): FormConfigResolved | null {
  const form = listForms().find((f) => f.slug === slug) || null;
  return form;
}
