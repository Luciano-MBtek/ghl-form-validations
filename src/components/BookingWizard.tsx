"use client";

import { useState, useCallback } from "react";
import type { FormConfig } from "@/lib/formsRegistry";
import type { Prefill } from "@/lib/prefill";
import BookingStep from "./BookingStep";
import LeadForm from "./LeadForm";

type BookingWizardProps = {
  formSlug: string;
  formConfig: FormConfig;
  legal?: {
    privacy?: { label: string; href: string };
    terms?: { label: string; href: string };
  };
  prefill?: Prefill;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

export default function BookingWizard({
  formSlug,
  formConfig,
  legal,
  prefill,
}: BookingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedSlotISO, setSelectedSlotISO] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>(
    prefill?.apptTz ||
      formConfig.booking?.timezone ||
      process.env.BOOKING_TIMEZONE_DEFAULT ||
      "America/New_York"
  );

  const handleSlotSelect = useCallback((slotISO: string) => {
    setSelectedSlotISO(slotISO);
  }, []);

  const handleContinue = useCallback(() => {
    if (selectedSlotISO) {
      setStep(2);
    }
  }, [selectedSlotISO]);

  const handleBack = useCallback(() => {
    setStep(1);
  }, []);

  const handleFormSubmit = useCallback(async (formData: any) => {
    // This will be handled by the LeadForm component
    // The form will call /api/appointments instead of /api/lead
    return formData;
  }, []);

  // Check if booking is enabled for this form
  if (!formConfig.booking?.enabled || !formConfig.booking?.calendarId) {
    // Fallback to regular form if booking not configured
    return (
      <LeadForm
        formSlug={formSlug}
        formConfig={formConfig}
        legal={legal}
        prefill={prefill}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-center space-x-4">
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
            step >= 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
          }`}
        >
          1
        </div>
        <div
          className={`w-12 h-0.5 ${step >= 2 ? "bg-blue-600" : "bg-gray-200"}`}
        />
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
            step >= 2 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
          }`}
        >
          2
        </div>
      </div>

      {/* Step labels */}
      <div className="flex justify-center space-x-16">
        <div
          className={`text-sm font-medium ${
            step === 1 ? "text-blue-600" : "text-gray-500"
          }`}
        >
          Select Time
        </div>
        <div
          className={`text-sm font-medium ${
            step === 2 ? "text-blue-600" : "text-gray-500"
          }`}
        >
          Contact Info
        </div>
      </div>

      {/* Step 1: Booking */}
      {step === 1 && (
        <div className="space-y-6">
          <BookingStep
            formSlug={formSlug}
            timezone={timezone}
            onSelect={handleSlotSelect}
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!selectedSlotISO}
              className={`${BUTTON_BASE} ${
                selectedSlotISO
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "opacity-50 cursor-not-allowed bg-gray-300 text-gray-600"
              }`}
            >
              Continue to Contact Info
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Form */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Selected appointment summary */}
          {selectedSlotISO && (
            <div className="rounded-md bg-blue-50 p-4">
              <div className="text-sm text-blue-800">
                <strong>Selected Appointment:</strong>{" "}
                {new Date(selectedSlotISO).toLocaleString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: timezone,
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={handleBack}
              className={`${BUTTON_BASE} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
            >
              ← Back to Time Selection
            </button>
          </div>

          <LeadForm
            formSlug={formSlug}
            formConfig={formConfig}
            legal={legal}
            prefill={{
              ...prefill,
              apptStart: selectedSlotISO,
              apptTz: timezone,
            }}
            isBookingWizard={true}
            selectedSlotISO={selectedSlotISO}
            timezone={timezone}
          />
        </div>
      )}
    </div>
  );
}
