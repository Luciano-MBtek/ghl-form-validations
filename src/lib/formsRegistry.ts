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

function resolveIdFromEnv(key?: string): string | undefined {
  if (!key) return undefined;
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

export function listForms(): FormConfigResolved[] {
  return REGISTRY.forms.map((f) => {
    const legal: LegalConfig =
      (f as any).legal ?? (REGISTRY as any).legalDefaults;
    // Normalize fields: resolve mapCustomFieldId only for fields that declare mapping
    const sections = (f as any).sections?.map((section: any) => {
      const fields = (section.fields ?? []).map((field: any) => {
        const envKey = field.mapCustomFieldIdEnv as string | undefined;
        const out: any = { ...field };
        if (envKey) {
          const resolved = resolveIdFromEnv(envKey);
          if (resolved) {
            out.mapCustomFieldId = resolved;
          } else if (process.env.NODE_ENV !== "production") {
            console.warn("[formsRegistry] missing mapCustomFieldId for", {
              slug: (f as any).slug,
              key: field.id ?? field.key,
              envKey,
            });
          }
        } else if (field.mapCustomFieldId) {
          out.mapCustomFieldId = field.mapCustomFieldId;
        } else {
          // core field without custom mapping → no warning
        }
        delete out.mapCustomFieldIdEnv;
        return out;
      });
      return { ...section, fields };
    });

    return {
      ...(f as any),
      sections,
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
