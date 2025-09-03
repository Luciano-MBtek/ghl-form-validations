import { config } from "./config";

type MailboxlayerResponse = {
  email: string;
  did_you_mean?: string | null;
  format_valid: boolean;
  mx_found: boolean;
  smtp_check: boolean;
  catch_all?: boolean;
  role: boolean;
  disposable: boolean;
  score: number;
  success?: boolean;
  error?: { code: number; type: string; info: string };
};

export type EmailValidationResult = {
  emailValid: boolean;
  emailReason: string;
  raw?: MailboxlayerResponse | null;
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

export async function validateEmail(
  email: string
): Promise<EmailValidationResult> {
  const key = config.mailboxlayerApiKey;
  if (!key) {
    // Soft-pass if missing key, but mark reason
    return { emailValid: true, emailReason: "timeout_soft_pass", raw: null };
  }
  const url = new URL("https://apilayer.net/api/check");
  url.searchParams.set("access_key", key);
  url.searchParams.set("email", email);
  url.searchParams.set("smtp", "1");
  url.searchParams.set("format", "1");

  try {
    const res = await withTimeout(
      fetch(url.toString(), { cache: "no-store" }),
      config.validationTimeoutMs
    );
    const data = (await res.json()) as MailboxlayerResponse;
    if ((data as any).success === false) {
      // API error
      return { emailValid: true, emailReason: "timeout_soft_pass", raw: data };
    }

    const reasons: string[] = [];
    let valid = true;
    if (!data.format_valid) {
      reasons.push("Invalid email format");
      valid = false;
    }
    if (!data.mx_found) {
      reasons.push("No MX records");
      valid = false;
    }
    if (!data.smtp_check) {
      reasons.push("Mailbox didn’t accept validation");
      valid = false;
    }
    if (data.disposable) {
      reasons.push("Disposable address");
      valid = false;
    }
    if (config.blockRoleEmails && data.role) {
      reasons.push("Role address");
      valid = false;
    }
    if (data.score < config.validationScoreThreshold) {
      reasons.push("Low quality score");
      valid = false;
    }

    return {
      emailValid: valid,
      emailReason: valid ? "" : reasons.join(", "),
      raw: data,
    };
  } catch (e) {
    return { emailValid: true, emailReason: "timeout_soft_pass", raw: null };
  }
}
