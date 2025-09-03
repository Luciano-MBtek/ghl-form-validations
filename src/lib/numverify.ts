import { config } from "./config";

type NumverifyResponse = {
  valid: boolean;
  number: string;
  local_format?: string | null;
  international_format?: string | null;
  country_prefix?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  location?: string | null;
  carrier?: string | null;
  line_type?: string | null; // mobile, landline, voip
  success?: boolean;
  error?: { code: number; type: string; info: string };
};

export type PhoneValidationResult = {
  phoneValid: boolean;
  phoneReason: string;
  normalized: string;
  raw?: NumverifyResponse | null;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (val) => {
        clearTimeout(id);
        resolve(val);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      }
    );
  });
}

export async function validatePhone(
  phone: string,
  country?: string
): Promise<PhoneValidationResult> {
  const key = config.numverifyApiKey;
  if (!key) {
    return {
      phoneValid: true,
      phoneReason: "timeout_soft_pass",
      normalized: phone,
      raw: null,
    };
  }
  // HTTP per docs for free tier; newer endpoints may use https on paid plans
  const url = new URL("http://apilayer.net/api/validate");
  url.searchParams.set("access_key", key);
  url.searchParams.set("number", phone);
  if (country) {
    url.searchParams.set("country_code", country.toUpperCase());
  }

  try {
    const res = await withTimeout(
      fetch(url.toString(), { cache: "no-store" }),
      config.validationTimeoutMs
    );
    const data = (await res.json()) as NumverifyResponse;
    if ((data as any).success === false) {
      return {
        phoneValid: true,
        phoneReason: "timeout_soft_pass",
        normalized: phone,
        raw: data,
      };
    }

    let valid = data.valid === true;
    const reasons: string[] = [];
    if (!valid) {
      reasons.push("Number invalid");
    }

    const normalized = data.international_format || phone;

    if (
      valid &&
      config.blockVoip &&
      (data.line_type || "").toLowerCase() === "voip"
    ) {
      valid = false;
      reasons.push("Unsupported line type (VOIP)");
    }

    return {
      phoneValid: valid,
      phoneReason: valid ? "" : reasons.join(", "),
      normalized,
      raw: data,
    };
  } catch (e) {
    return {
      phoneValid: true,
      phoneReason: "timeout_soft_pass",
      normalized: phone,
      raw: null,
    };
  }
}
