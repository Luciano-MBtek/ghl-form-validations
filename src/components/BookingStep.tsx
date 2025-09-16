"use client";
/**
 * BookingStep renders Step 1 of the booking flow: date/time selection.
 *
 * Responsibilities:
 * - Fetches availability from /api/availability and renders ONLY the dates/slots provided by the API.
 * - Applies epoch-based lead-time disabling in the UI as a secondary guard.
 * - Emits the selected ISO slot to its parent (BookingWizard).
 *
 * Notes:
 * - THIS COMPONENT DOES NOT CALL LEADCONNECTOR DIRECTLY.
 * - No local calendar grid or synthetic half-hour generation is allowed.
 * - If the API returns no dates, render an explicit empty state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import {
  addMinutesEpoch,
  nowEpoch,
  labelFromDateKey,
  labelFromSlotISO,
} from "@/lib/time";

type ApiSlotsByDate = Record<string, { slots: string[] }>;

type BookingStepProps = {
  formSlug: string;
  timezone: string;
  minLeadMinutes: number;
  onSelect: (slotISO: string) => void;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

export default function BookingStep({
  formSlug,
  timezone,
  minLeadMinutes,
  onSelect,
}: BookingStepProps) {
  const [apiSlots, setApiSlots] = useState<ApiSlotsByDate>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const [selectedSlotISO, setSelectedSlotISO] = useState<string | null>(null);

  // Debounced availability fetching
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounce = (cb: () => void, ms = 300) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(cb, ms);
  };

  const fetchAvailability = useCallback(
    async (startDate: string, endDate: string) => {
      if (!formSlug) return;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          slug: formSlug,
          start: startDate,
          end: endDate,
          tz: timezone,
        });

        const res = await fetch(`/api/availability?${params.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          // Show detailed error from server
          const errorMessage =
            data.detail?.message ||
            data.error ||
            "Failed to fetch availability";
          throw new Error(errorMessage);
        }

        // API returns object with date keys
        const slotsByDate = (data.slots || {}) as ApiSlotsByDate;
        console.log("[BookingStep] received slots", {
          dateKeys: Object.keys(slotsByDate),
          traceId: data.traceId,
        });
        setApiSlots(slotsByDate);
        console.log(
          "[booking-ui] api slots keys",
          Object.keys(slotsByDate || {})
        );
      } catch (e: any) {
        console.error("[BookingStep] availability error:", e);
        setError(e.message || "Failed to load availability");
      } finally {
        setLoading(false);
      }
    },
    [formSlug, timezone]
  );

  // Fetch availability on mount (current month window)
  useEffect(() => {
    const start = new Date();
    start.setDate(1);
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // Last day of current month

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    debounce(() => fetchAvailability(startStr, endStr));
  }, [fetchAvailability]);

  // Compute date keys strictly from API data
  const dateKeys = useMemo(() => {
    const keys = Object.keys(apiSlots || {});
    const filtered = keys.filter(
      (k) =>
        Array.isArray(apiSlots[k]?.slots) &&
        (apiSlots[k]?.slots?.length || 0) > 0
    );
    return filtered.sort();
  }, [apiSlots]);

  // Dev-only runtime mismatch guard (keep warning only; no debug logs)
  if (process.env.NODE_ENV !== "production") {
    const todayKey = new Date().toISOString().slice(0, 10);
    const uiHasToday = dateKeys.includes(todayKey);
    if (uiHasToday) {
      console.warn(
        "[booking-ui] WARNING: API returned today as a date key, which is unexpected if filtering is active."
      );
    }
  }

  // Ensure activeDateKey is valid whenever data changes
  useEffect(() => {
    if (!dateKeys.length) {
      setActiveDateKey(null);
      setSelectedSlotISO(null);
      return;
    }
    if (!activeDateKey || !dateKeys.includes(activeDateKey)) {
      setActiveDateKey(dateKeys[0]);
      setSelectedSlotISO(null);
    }
  }, [dateKeys, activeDateKey]);

  // Slots for the active date (ISO strings)
  const slotsForDay: string[] = useMemo(() => {
    if (!activeDateKey) return [];
    const list = apiSlots?.[activeDateKey]?.slots;
    return Array.isArray(list) ? (list as string[]) : [];
  }, [apiSlots, activeDateKey]);

  // Lead-time cutoff (epoch)
  const cutoffEpoch = useMemo(
    () => addMinutesEpoch(nowEpoch(), minLeadMinutes),
    [minLeadMinutes]
  );
  const isDisabledIso = useCallback(
    (iso: string) => Date.parse(iso) < cutoffEpoch,
    [cutoffEpoch]
  );

  const handleSlotSelect = (iso: string) => {
    setSelectedSlotISO(iso);
    onSelect(iso);
  };

  // Removed local month navigation; dates come strictly from API

  const formatDate = (dateStr: string) => labelFromDateKey(dateStr, timezone);

  const formatTimeISO = (iso: string) => labelFromSlotISO(iso, timezone);

  const canContinue =
    !!selectedSlotISO &&
    !isDisabledIso(selectedSlotISO) &&
    slotsForDay.includes(selectedSlotISO);

  // Clean: remove debug logs in production build

  return (
    <div className="space-y-6">
      {/* dev watermark removed */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Select Date & Time
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose your preferred appointment time
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Date Selection (from API only) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">
              Available Dates
            </h3>
            <div />
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-gray-200 rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : dateKeys.length === 0 ? (
            <div className="text-sm text-gray-500">
              No available dates were returned by the API for this range. Try
              another form, or verify calendar availability in LeadConnector.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {dateKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveDateKey(k)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    activeDateKey === k
                      ? "bg-blue-100 text-blue-900 border border-blue-300"
                      : "hover:bg-gray-100 text-gray-900"
                  }`}
                >
                  {formatDate(k)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time Selection (from API only) */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">
            Available Times
            {activeDateKey && (
              <span className="text-gray-500 font-normal">
                {" "}
                for {formatDate(activeDateKey)}
              </span>
            )}
          </h3>

          {!activeDateKey ? (
            <div className="text-center py-8 text-gray-500">
              Select a date to see available times
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-8 bg-gray-200 rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : slotsForDay.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available times for this date
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {slotsForDay.map((iso) => {
                const disabled = isDisabledIso(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => !disabled && handleSlotSelect(iso)}
                    disabled={disabled}
                    title={
                      disabled
                        ? "Time has passed or lead time not met"
                        : undefined
                    }
                    className={`px-3 py-2 rounded-md text-sm transition-colors ${
                      disabled
                        ? "opacity-50 cursor-not-allowed bg-gray-100 text-gray-500 border border-gray-200"
                        : selectedSlotISO === iso
                        ? "bg-blue-100 text-blue-900 border border-blue-300"
                        : "hover:bg-gray-100 text-gray-900 border border-gray-200"
                    }`}
                  >
                    {formatTimeISO(iso)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selection Summary */}
      {selectedSlotISO && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="text-sm text-green-800">
            <strong>Selected:</strong>{" "}
            {new Date(selectedSlotISO).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </div>
      )}

      {/* debug overlay removed */}
    </div>
  );
}

// Static dev marker for verification from parent components
(BookingStep as any).__MARK = "API_ONLY_BOOKING_STEP_v1" as const;
