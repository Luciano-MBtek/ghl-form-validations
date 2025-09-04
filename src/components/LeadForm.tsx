"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormConfig } from "@/lib/formsRegistry";

const devLog = (...args: any[]) => {
  if (process.env.NODE_ENV !== "production") console.log(...args);
};

type ValidateResponse = {
  emailValid?: boolean | null;
  emailReason?: string;
  emailConfidence?: "good" | "medium" | "low" | "unknown";
  phoneValid?: boolean | null;
  phoneReason?: string;
  phoneConfidence?: "good" | "medium" | "low" | "unknown";
  phoneLineType?: string;
  echoEmail?: string;
  echoPhone?: string;
};

export default function LeadForm({
  formSlug,
  title,
  formConfig,
  legal,
}: {
  formSlug: string;
  title?: string;
  formConfig: FormConfig;
  legal?: {
    privacy?: { label: string; href: string };
    terms?: { label: string; href: string };
  };
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consentTransactional, setConsentTransactional] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  type ValidState = boolean | null;
  const [emailValid, setEmailValid] = useState<ValidState>(null);
  const [emailReason, setEmailReason] = useState<string>("");
  const [emailConfidence, setEmailConfidence] = useState<
    "good" | "medium" | "low" | "unknown"
  >("unknown");
  const [phoneValid, setPhoneValid] = useState<ValidState>(null);
  const [phoneReason, setPhoneReason] = useState<string>("");
  const [phoneConfidence, setPhoneConfidence] = useState<
    "good" | "medium" | "low" | "unknown"
  >("unknown");
  const [phoneLineType, setPhoneLineType] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [phonePending, setPhonePending] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<{
    contactId?: string;
  } | null>(null);

  // "attempted" flags - only show validation state after user interaction
  const [emailAttempted, setEmailAttempted] = useState(false);
  const [phoneAttempted, setPhoneAttempted] = useState(false);

  const [country, setCountry] = useState<string>("US");

  // Dynamic registry-driven answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dynErrors, setDynErrors] = useState<Record<string, string>>({});
  // Visibility helpers for conditional fields
  const isEqual = (val: unknown, target: string | string[]) => {
    if (Array.isArray(target)) return target.includes(String(val ?? ""));
    return String(val ?? "") === target;
  };

  const isVisible = (field: any, ans: Record<string, any>) => {
    if (!("showIf" in field) || !field.showIf) return true;
    const cond = field.showIf as { fieldId: string; equals: string | string[] };
    return isEqual(ans[cond.fieldId], cond.equals);
  };

  function setAnswer(id: string, v: string) {
    setAnswers((s) => ({ ...s, [id]: v }));
    setDynErrors((s) => {
      const { [id]: _drop, ...rest } = s;
      return rest;
    });
  }

  const CORE_MAPS = new Set([
    "firstName",
    "lastName",
    "email",
    "phone",
    "country",
    "consentTransactional",
    "consentMarketing",
  ]);

  const emailAbort = useRef<AbortController | null>(null);
  const phoneAbort = useRef<AbortController | null>(null);
  const latestEmail = useRef<string>("");
  const latestPhone = useRef<string>("");

  const canSubmit = useMemo(() => {
    const requiredOk =
      firstName.trim() && lastName.trim() && consentTransactional;
    // Only block on hard failures (false), allow uncertain cases (null) and valid (true)
    const validationsOk = emailValid !== false && phoneValid !== false;
    const nonePending = !emailPending && !phonePending && !submitting;
    return Boolean(requiredOk && validationsOk && nonePending);
  }, [
    firstName,
    lastName,
    consentTransactional,
    emailValid,
    phoneValid,
    emailPending,
    phonePending,
    submitting,
  ]);

  // Base class helpers (UI only)
  const INPUT_BASE =
    "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const BUTTON_BASE =
    "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2";
  function inputStateClasses(valid: boolean | null, pending: boolean) {
    if (valid === false)
      return "border-red-500 focus:ring-red-500 focus:border-red-500";
    if (valid === true && !pending)
      return "border-green-500 focus:ring-green-500 focus:border-green-500";
    return ""; // Use default INPUT_BASE styling
  }

  // Show validation state only after user interaction
  const showEmailState = emailPending || emailAttempted;
  const showPhoneState = phonePending || phoneAttempted;

  // Helper components
  function EmailHelper() {
    if (!emailAttempted) return null;
    if (emailPending)
      return <p className="mt-1 text-sm text-gray-500">Validating…</p>;
    if (emailValid === false)
      return <p className="mt-1 text-sm text-red-600">Invalid email.</p>;
    // valid === true or null → no helper
    return null;
  }

  function PhoneHelper() {
    if (!phoneAttempted) return null;
    if (phonePending)
      return <p className="mt-1 text-sm text-gray-500">Validating…</p>;
    if (phoneValid === false)
      return <p className="mt-1 text-sm text-red-600">Invalid phone number.</p>;
    return null;
  }

  function Spinner({
    className = "h-4 w-4 text-gray-400",
  }: {
    className?: string;
  }) {
    return (
      <svg
        className={`animate-spin ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
    );
  }

  const onEmailChange = useCallback((v: string) => {
    setEmail(v);
    if (!v) {
      setEmailAttempted(false);
      setEmailValid(null);
      setEmailReason("");
    }
  }, []);

  const onPhoneChange = useCallback((v: string) => {
    setPhone(v);
    if (!v) {
      setPhoneAttempted(false);
      setPhoneValid(null);
      setPhoneReason("");
    }
  }, []);

  const validateEmailField = useCallback(async () => {
    const value = email.trim();
    latestEmail.current = value;
    if (!value) {
      setEmailAttempted(false);
      setEmailValid(null);
      setEmailReason("");
      return;
    }
    setEmailAttempted(true);
    if (emailAbort.current) emailAbort.current.abort();
    const ac = new AbortController();
    emailAbort.current = ac;
    setEmailPending(true);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error("validate_failed");
      const data: ValidateResponse = await res.json();
      if ((data.echoEmail ?? value) !== value) return; // stale
      setEmailValid(data.emailValid ?? null);
      setEmailReason(data.emailReason || "");
      setEmailConfidence(data.emailConfidence || "unknown");

      // Dev logging
      devLog("[validate/email]", {
        valid: data.emailValid,
        reason: data.emailReason,
        confidence: data.emailConfidence,
        echo: data.echoEmail,
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setEmailValid(null);
      setEmailReason("timeout_soft_pass");
    } finally {
      setEmailPending(false);
    }
  }, [email]);

  const validatePhoneField = useCallback(async () => {
    const value = phone.trim();
    latestPhone.current = value;
    if (!value) {
      setPhoneAttempted(false);
      setPhoneValid(null);
      setPhoneReason("");
      return;
    }
    setPhoneAttempted(true);
    if (phoneAbort.current) phoneAbort.current.abort();
    const ac = new AbortController();
    phoneAbort.current = ac;
    setPhonePending(true);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value, country }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error("validate_failed");
      const data: ValidateResponse = await res.json();
      if ((data.echoPhone ?? value) !== value) return; // stale
      setPhoneValid(data.phoneValid ?? null);
      setPhoneReason(data.phoneReason || "");
      setPhoneConfidence(data.phoneConfidence || "unknown");
      setPhoneLineType(data.phoneLineType || "");

      // Dev logging
      devLog("[validate/phone]", {
        valid: data.phoneValid,
        reason: data.phoneReason,
        confidence: data.phoneConfidence,
        echo: data.echoPhone,
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setPhoneValid(null);
      setPhoneReason("timeout_soft_pass");
    } finally {
      setPhonePending(false);
    }
  }, [phone, country]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Required checks for dynamic fields
      const reqErrors: Record<string, string> = {};
      for (const section of formConfig.sections || []) {
        for (const field of section.fields || []) {
          if (!isVisible(field as any, answers)) continue;
          if ("map" in field && field.map && CORE_MAPS.has(field.map)) continue;
          if (field.required && !answers[field.id]) {
            reqErrors[field.id] = "This field is required.";
          }
        }
      }
      if (Object.keys(reqErrors).length) {
        setDynErrors(reqErrors);
        return;
      }

      if (!canSubmit) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formSlug: formSlug || "form-testing-n8n",
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            country,
            consentTransactional,
            consentMarketing,
            answers, // Send dynamic form answers
          }),
        });
        if (res.status === 429) {
          alert("Please try again in a moment.");
          return;
        }
        if (!res.ok) {
          let errJson: any = null;
          try {
            errJson = await res.json();
          } catch {}
          console.error("Lead submit error", res.status, errJson);
          alert(
            `Submit failed (${res.status}). ${
              errJson?.message || "See console for details."
            }`
          );
          return;
        }
        const data = await res.json();
        if (data.ok === false) {
          const errs = data.errors || {};
          if (errs.email) {
            setEmailValid(false);
            setEmailReason(String(errs.email));
          }
          if (errs.phone) {
            setPhoneValid(false);
            setPhoneReason(String(errs.phone));
          }
          return;
        }
        // success
        // Dev logging to verify what was sent
        if (process.env.NODE_ENV !== "production") {
          console.log("[LeadForm] submit success", {
            ok: data.ok,
            contactId: data.contactId,
            sentAnswers: answers,
            sentPayload: {
              formSlug: formSlug || "form-testing-n8n",
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: "<redacted>",
              phone: "<redacted>",
              country,
              consentTransactional,
              consentMarketing,
              answers,
            },
          });
        }

        // Clear form and show success panel
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setCountry("US");
        setConsentTransactional(false);
        setConsentMarketing(false);
        setEmailValid(null);
        setPhoneValid(null);
        setEmailReason("");
        setPhoneReason("");
        setAnswers({});
        setSubmitSuccess({ contactId: data.contactId });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } finally {
        setSubmitting(false);
      }
    },
    [
      canSubmit,
      firstName,
      lastName,
      email,
      phone,
      country,
      consentTransactional,
      consentMarketing,
      answers,
      formConfig,
      formSlug,
    ]
  );

  // Prune hidden answers and errors when visibility changes
  const purpose = answers["purpose"]; // drives visibility for contact-us
  useEffect(() => {
    const visibleIds = new Set<string>();
    for (const section of formConfig.sections || []) {
      for (const f of section.fields || []) {
        if (isVisible(f as any, answers)) visibleIds.add(f.id);
      }
    }

    Object.keys(answers).forEach((k) => {
      if (!visibleIds.has(k)) {
        setAnswers((a) => {
          const copy: any = { ...a };
          delete copy[k];
          return copy;
        });
        setDynErrors((e) => {
          const copy: any = { ...e };
          delete copy[k];
          return copy;
        });
      }
    });
  }, [purpose, formConfig, answers]);

  if (submitSuccess) {
    return (
      <div className="sm:col-span-2" role="status" aria-live="polite">
        <h1 className="text-xl font-semibold text-gray-900">
          Thanks! Your request was received.
        </h1>
        <p className="mt-2 text-sm text-gray-600">We’ll be in touch shortly.</p>
        {submitSuccess.contactId ? (
          <p className="mt-2 text-xs text-gray-500">
            Reference ID:{" "}
            <span className="font-mono">{submitSuccess.contactId}</span>
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setSubmitSuccess(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`${BUTTON_BASE} bg-blue-600 text-white hover:bg-blue-700`}
          >
            Submit another response
          </button>
          <a
            href="/forms/form-testing-n8n"
            className={`${BUTTON_BASE} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
          >
            Back to forms
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="space-y-1.5 sm:col-span-1">
        <label
          htmlFor="firstName"
          className="text-sm font-medium text-gray-800"
        >
          First Name <span className="text-red-500">*</span>
        </label>
        <input
          id="firstName"
          name="firstName"
          type="text"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5 sm:col-span-1">
        <label htmlFor="lastName" className="text-sm font-medium text-gray-800">
          Last Name <span className="text-red-500">*</span>
        </label>
        <input
          id="lastName"
          name="lastName"
          type="text"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor="email" className="text-sm font-medium text-gray-800">
          Email <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            onBlur={validateEmailField}
            className={`${INPUT_BASE} pr-9 ${
              showEmailState ? inputStateClasses(emailValid, emailPending) : ""
            }`}
            required
            aria-invalid={emailValid === false ? true : undefined}
            aria-describedby={
              emailAttempted && (emailPending || emailValid === false)
                ? "email-help"
                : undefined
            }
            placeholder="you@example.com"
          />
          {showEmailState && emailPending && (
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
              <Spinner />
            </div>
          )}
          {showEmailState && !emailPending && emailValid === true && (
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-green-600">
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.415 0l-3.2-3.2a1 1 0 111.415-1.414l2.493 2.493 6.493-6.493a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>
        {emailAttempted && (emailPending || emailValid === false) && (
          <div id="email-help" aria-live="polite">
            <EmailHelper />
          </div>
        )}
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor="phone" className="text-sm font-medium text-gray-800">
          Phone <span className="text-red-500">*</span>
        </label>
        <div
          className={`relative flex items-stretch rounded-md border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${
            showPhoneState ? inputStateClasses(phoneValid, phonePending) : ""
          }`}
        >
          <div className="PhoneInputCountry">
            <select
              aria-label="Country"
              className="PhoneInputCountrySelect"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="US">US</option>
              <option value="CA">CA</option>
              <option value="GB">GB</option>
              <option value="PA">PA</option>
              <option value="AU">AU</option>
            </select>
          </div>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onBlur={validatePhoneField}
            placeholder="+1234567890"
            className="PhoneInputInput flex-1 w-full bg-transparent border-0 outline-0 py-2 px-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:shadow-none"
            required
            aria-invalid={phoneValid === false ? true : undefined}
            aria-describedby={
              phoneAttempted && (phonePending || phoneValid === false)
                ? "phone-help"
                : undefined
            }
          />
          {showPhoneState && phonePending && (
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
              <Spinner />
            </div>
          )}
          {showPhoneState && !phonePending && phoneValid === true && (
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-green-600">
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.415 0l-3.2-3.2a1 1 0 111.415-1.414l2.493 2.493 6.493-6.493a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>
        {phoneAttempted && (phonePending || phoneValid === false) && (
          <div id="phone-help" aria-live="polite">
            <PhoneHelper />
          </div>
        )}
      </div>

      {/* Dynamic (non-core) fields from registry */}
      {(formConfig.sections || []).map((section: any, idx: number) => {
        const nonCore = (section.fields || [])
          .filter((f: any) => !(f.map && CORE_MAPS.has(f.map)))
          .filter((f: any) => isVisible(f, answers));
        if (!nonCore.length) return null;
        return (
          <div key={idx} className="space-y-4 sm:col-span-2">
            {section.title ? (
              <h3 className="text-base font-semibold text-gray-900">
                {section.title}
              </h3>
            ) : null}
            <div className="space-y-4">
              {nonCore.map((field: any) => (
                <RenderField key={field.id} field={field} />
              ))}
            </div>
            <hr className="my-4 border-gray-200" />
          </div>
        );
      })}

      <hr className="sm:col-span-2 my-6 border-gray-200" />

      <div className="sm:col-span-2 space-y-4">
        <div className="flex items-start gap-3">
          <input
            id="consentTransactional"
            type="checkbox"
            checked={consentTransactional}
            onChange={(e) => setConsentTransactional(e.target.checked)}
            className="mt-1"
          />

          <label
            htmlFor="consentTransactional"
            className="text-sm text-gray-900"
          >
            I Consent to Receive SMS Notifications, Alerts & Occasional
            Marketing Communication from company. Message frequency varies.
            Message & data rates may apply. You can reply STOP to unsubscribe at
            any time.
          </label>
        </div>
        <div className="flex items-start gap-3">
          <input
            id="consentMarketing"
            type="checkbox"
            checked={consentMarketing}
            onChange={(e) => setConsentMarketing(e.target.checked)}
            className="mt-1"
          />
          <label htmlFor="consentMarketing" className="text-sm text-gray-900">
            I agree to marketing communications
          </label>
        </div>
      </div>

      <hr className="sm:col-span-2 my-6 border-gray-200" />

      {legal?.privacy?.href && legal?.terms?.href ? (
        <p className="sm:col-span-2 mt-2 text-center text-sm text-gray-600">
          <a
            href={legal.privacy.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-800"
          >
            {legal.privacy.label || "Privacy Policy"}
          </a>
          <span className="mx-2 text-gray-300">|</span>
          <a
            href={legal.terms.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-800"
          >
            {legal.terms.label || "Terms of Service"}
          </a>
        </p>
      ) : null}

      <div className="sm:col-span-2 mt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className={`${BUTTON_BASE} ${
            canSubmit
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-300 text-gray-600 cursor-not-allowed"
          }`}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  );

  function RenderField({ field }: { field: any }) {
    if (field.map && CORE_MAPS.has(field.map)) return null;
    if (!isVisible(field, answers)) return null;
    const value = answers[field.id] ?? "";

    if (field.type === "radio") {
      return (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-800">
            {field.label}{" "}
            {field.required ? <span className="text-red-500">*</span> : null}
          </label>
          <div className="space-y-2">
            {(field.options || []).map((opt: any) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={field.id}
                  value={opt.value}
                  checked={value === String(opt.value)}
                  onChange={(e) => setAnswer(field.id, e.target.value)}
                  required={field.required}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {dynErrors[field.id] ? (
            <p className="text-sm text-red-600">{dynErrors[field.id]}</p>
          ) : null}
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-800">
            {field.label}{" "}
            {field.required ? <span className="text-red-500">*</span> : null}
          </label>
          <select
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={value}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            required={field.required}
          >
            <option value="" disabled hidden></option>
            {(field.options || []).map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {dynErrors[field.id] ? (
            <p className="text-sm text-red-600">{dynErrors[field.id]}</p>
          ) : null}
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-800">
            {field.label}{" "}
            {field.required ? <span className="text-red-500">*</span> : null}
          </label>
          <textarea
            rows={field.rows ?? 4}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={value}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
          {dynErrors[field.id] ? (
            <p className="text-sm text-red-600">{dynErrors[field.id]}</p>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-800">
          {field.label}{" "}
          {field.required ? <span className="text-red-500">*</span> : null}
        </label>
        <input
          type={field.type || "text"}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={value}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
        />
        {dynErrors[field.id] ? (
          <p className="text-sm text-red-600">{dynErrors[field.id]}</p>
        ) : null}
      </div>
    );
  }
}
