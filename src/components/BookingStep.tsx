"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

type FreeSlot = {
  date: string; // YYYY-MM-DD
  times: string[]; // ['13:30', '14:00', ...]
};

type BookingStepProps = {
  formSlug: string;
  timezone: string;
  onSelect: (slotISO: string) => void;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

export default function BookingStep({
  formSlug,
  timezone,
  onSelect,
}: BookingStepProps) {
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Debounced availability fetching
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounce = (cb: () => void, ms = 300) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(cb, ms);
  };

  // Transform API response (array of ISO strings) to our format
  const transformSlotsFromAPI = (apiSlots: string[]): FreeSlot[] => {
    const grouped: Record<string, string[]> = {};

    apiSlots.forEach((slotISO) => {
      const date = new Date(slotISO);
      const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
      const timeStr = date.toTimeString().split(" ")[0].substring(0, 5); // HH:MM

      if (!grouped[dateStr]) {
        grouped[dateStr] = [];
      }
      grouped[dateStr].push(timeStr);
    });

    return Object.entries(grouped).map(([date, times]) => ({
      date,
      times: times.sort(),
    }));
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

        // API now returns normalized flat array - transform to our format
        const normalizedSlots = data.slots || [];
        console.log("[BookingStep] received slots", {
          count: normalizedSlots.length,
          traceId: data.traceId,
        });

        const transformedSlots = transformSlotsFromAPI(normalizedSlots);
        setSlots(transformedSlots);

        // Auto-select first available date if none selected
        if (!selectedDate && transformedSlots.length > 0) {
          const firstSlot = transformedSlots.find(
            (slot: FreeSlot) => slot.times.length > 0
          );
          if (firstSlot) {
            setSelectedDate(firstSlot.date);
          }
        }
      } catch (e: any) {
        console.error("[BookingStep] availability error:", e);
        setError(e.message || "Failed to load availability");
      } finally {
        setLoading(false);
      }
    },
    [formSlug, timezone, selectedDate]
  );

  // Fetch availability on mount and when month changes
  useEffect(() => {
    const start = new Date(currentMonth);
    start.setDate(1);
    const end = new Date(currentMonth);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // Last day of current month

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    debounce(() => fetchAvailability(startStr, endStr));
  }, [currentMonth, fetchAvailability]);

  // Group slots by date for easier display
  const slotsByDate = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    slots.forEach((slot) => {
      if (slot.times.length > 0) {
        grouped[slot.date] = slot.times;
      }
    });
    return grouped;
  }, [slots]);

  // Get available dates for current month
  const availableDates = useMemo(() => {
    return Object.keys(slotsByDate).sort();
  }, [slotsByDate]);

  // Get times for selected date
  const availableTimes = useMemo(() => {
    if (!selectedDate) return [];
    return slotsByDate[selectedDate] || [];
  }, [selectedDate, slotsByDate]);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null); // Reset time selection
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);

    // Create ISO string for the selected slot
    const slotISO = new Date(`${selectedDate}T${time}:00`).toISOString();
    onSelect(slotISO);
  };

  const handleMonthChange = (direction: "prev" | "next") => {
    const newMonth = new Date(currentMonth);
    if (direction === "prev") {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const isSlotSelected = selectedDate && selectedTime;

  return (
    <div className="space-y-6">
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
        {/* Date Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">
              Available Dates
            </h3>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleMonthChange("prev")}
                disabled={loading}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600 min-w-[120px] text-center">
                {currentMonth.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                type="button"
                onClick={() => handleMonthChange("next")}
                disabled={loading}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
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
          ) : availableDates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available dates this month
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availableDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => handleDateSelect(date)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedDate === date
                      ? "bg-blue-100 text-blue-900 border border-blue-300"
                      : "hover:bg-gray-100 text-gray-900"
                  }`}
                >
                  {formatDate(date)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time Selection */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">
            Available Times
            {selectedDate && (
              <span className="text-gray-500 font-normal">
                {" "}
                for {formatDate(selectedDate)}
              </span>
            )}
          </h3>

          {!selectedDate ? (
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
          ) : availableTimes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available times for this date
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {availableTimes.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => handleTimeSelect(time)}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedTime === time
                      ? "bg-blue-100 text-blue-900 border border-blue-300"
                      : "hover:bg-gray-100 text-gray-900 border border-gray-200"
                  }`}
                >
                  {formatTime(time)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selection Summary */}
      {isSlotSelected && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="text-sm text-green-800">
            <strong>Selected:</strong> {formatDate(selectedDate!)} at{" "}
            {formatTime(selectedTime!)}
          </div>
        </div>
      )}
    </div>
  );
}
