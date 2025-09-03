"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FormConfig } from "@/lib/formsRegistry";

type ValidateResponse = {
  emailValid?: boolean | null;
  emailReason?: string;
  phoneValid?: boolean | null;
  phoneReason?: string;
  echoEmail?: string;
  echoPhone?: string;
};

export default function LeadForm({
  formSlug,
  title,
  formConfig,
}: {
  formSlug: string;
  title?: string;
  formConfig: FormConfig;
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
  const [phoneValid, setPhoneValid] = useState<ValidState>(null);
  const [phoneReason, setPhoneReason] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [phonePending, setPhonePending] = useState(false);

  const [country, setCountry] = useState<string>("US");

  // Dynamic registry-driven answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dynErrors, setDynErrors] = useState<Record<string, string>>({});
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
    const validationsOk = emailValid === true && phoneValid === true;
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
    "block w-full rounded-md border bg-white px-3 py-2 pr-9 text-gray-900 placeholder-gray-400 focus:outline-none";
  const BUTTON_BASE =
    "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2";
  function inputStateClasses(valid: boolean | null, pending: boolean) {
    if (valid === false)
      return "border-red-500 focus:ring-red-500 focus:border-red-500";
    if (valid === true && !pending)
      return "border-green-500 focus:ring-green-500 focus:border-green-500";
    return "border-gray-300 focus:ring-blue-500 focus:border-blue-500";
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
    setEmailValid(null);
    setEmailReason("");
  }, []);

  const onPhoneChange = useCallback((v: string) => {
    setPhone(v);
    setPhoneValid(null);
    setPhoneReason("");
  }, []);

  const validateEmailField = useCallback(async () => {
    const value = email.trim();
    latestEmail.current = value;
    if (!value) {
      setEmailValid(null);
      setEmailReason("");
      return;
    }
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
      setPhoneValid(null);
      setPhoneReason("");
      return;
    }
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
        // Build customFields from answers
        const customFields: { id: string; value: string }[] = [];
        for (const section of formConfig.sections || []) {
          for (const field of section.fields || []) {
            if ("mapCustomFieldId" in field && field.mapCustomFieldId) {
              const v = answers[field.id];
              if (v != null && v !== "") {
                customFields.push({
                  id: String(field.mapCustomFieldId),
                  value: String(v),
                });
              }
            }
          }
        }

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
            customFields,
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
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setConsentTransactional(false);
        setConsentMarketing(false);
        setEmailValid(null);
        setPhoneValid(null);
        setEmailReason("");
        setPhoneReason("");
        setAnswers({});
        alert("Submitted!");
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
            className={`${INPUT_BASE} ${inputStateClasses(
              emailValid,
              emailPending
            )}`}
            required
            aria-invalid={emailValid === false}
            aria-describedby="email-help"
            placeholder="you@example.com"
          />
          {emailPending ? (
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
              <Spinner />
            </div>
          ) : emailValid === true ? (
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
          ) : null}
        </div>
        <p
          id="email-help"
          className={`text-sm ${
            emailPending
              ? "text-gray-500"
              : emailValid === false
              ? "text-red-600"
              : emailValid === true
              ? "text-green-600"
              : emailValid === null
              ? "text-gray-500"
              : "text-gray-500"
          }`}
          aria-live="polite"
        >
          {emailPending
            ? "Validating…"
            : emailValid === false
            ? emailReason || "Invalid email address"
            : emailValid === true
            ? "Looks good"
            : emailValid === null
            ? "Couldn't verify; we'll recheck on submit."
            : ""}
        </p>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor="phone" className="text-sm font-medium text-gray-800">
          Phone <span className="text-red-500">*</span>
        </label>
        <div
          className={`relative rounded-md border bg-white ${inputStateClasses(
            phoneValid,
            phonePending
          )}`}
        >
          <div className="flex items-center gap-2 px-3 py-2 pr-9">
            <select
              aria-label="Country"
              className="block rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="US">US</option>
              <option value="CA">CA</option>
              <option value="GB">GB</option>
              <option value="PA">PA</option>
              <option value="AU">AU</option>
            </select>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              onBlur={validatePhoneField}
              placeholder="+1234567890"
              className="w-full bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none"
              required
              aria-invalid={phoneValid === false}
              aria-describedby="phone-help"
            />
          </div>
          {phonePending ? (
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
              <Spinner />
            </div>
          ) : phoneValid === true ? (
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
          ) : null}
        </div>
        <p
          id="phone-help"
          className={`text-sm ${
            phonePending
              ? "text-gray-500"
              : phoneValid === false
              ? "text-red-600"
              : phoneValid === true
              ? "text-green-600"
              : phoneValid === null
              ? "text-gray-500"
              : "text-gray-500"
          }`}
          aria-live="polite"
        >
          {phonePending
            ? "Validating…"
            : phoneValid === false
            ? phoneReason || "Invalid phone number"
            : phoneValid === true
            ? "Looks good"
            : phoneValid === null
            ? "Couldn't verify; we'll recheck on submit."
            : ""}
        </p>
      </div>

      {/* Dynamic (non-core) fields from registry */}
      {(formConfig.sections || []).map((section: any, idx: number) => {
        const nonCore = (section.fields || []).filter(
          (f: any) => !(f.map && CORE_MAPS.has(f.map))
        );
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
