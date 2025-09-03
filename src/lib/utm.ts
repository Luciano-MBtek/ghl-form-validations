export type UtmParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
};

export function collectUtmFromUrl(url: string): UtmParams {
  try {
    const u = new URL(
      url,
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin
    );
    const p = u.searchParams;
    return {
      utm_source: p.get("utm_source") || undefined,
      utm_medium: p.get("utm_medium") || undefined,
      utm_campaign: p.get("utm_campaign") || undefined,
      utm_term: p.get("utm_term") || undefined,
      utm_content: p.get("utm_content") || undefined,
    };
  } catch {
    return {};
  }
}
