export type TriValid = true | false | null;
export type Confidence = "good" | "medium" | "low" | "unknown";

export interface EmailResult {
  valid: TriValid; // hard validity: false only for format/no-mx/smtp-fail/(optional disposable)
  reason?: string; // e.g., "bad_format", "no_mx", "smtp_fail", "timeout_soft_pass", "provider_error"
  score?: number; // mailboxlayer score if present
  confidence: Confidence; // derived from score or provider state
  disposable?: boolean;
  role?: boolean;
  catchAll?: boolean;
  domain?: string;
}

export interface PhoneResult {
  valid: TriValid;
  reason?: string;
  lineType?: string; // VOIP, mobile, landline, etc.
  confidence: Confidence; // simple mapping; valid true => good, null => unknown, etc.
  country?: string;
  normalized?: string; // E.164 if available
}
