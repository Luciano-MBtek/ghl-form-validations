export type TriValid = true | false | null;

export type EmailResult = {
  valid: TriValid;
  reason: string; // e.g., 'bad_format', 'mx_not_found', 'smtp_fail', 'catch_all', 'low_score', 'disposable', 'role', 'provider_missing', 'timeout_soft_pass'
};

export type PhoneResult = {
  valid: TriValid;
  reason: string; // e.g., 'bad_format', 'country_mismatch', 'line_type_blocked', 'voip_blocked', 'provider_missing', 'timeout_soft_pass'
  normalized?: string; // E.164 if available
};
