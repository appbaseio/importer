import React from "react";

export function StatusBadge({
  status,
  ok,
}: {
  status?: number | null;
  ok?: boolean | null;
}) {
  const isOk =
    typeof ok === "boolean"
      ? ok
      : typeof status === "number"
      ? status >= 200 && status < 300
      : false;
  if (status == null || status === 0) return null;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded px-2 py-0.5 border " +
        (isOk
          ? "text-green-700 bg-green-50 border-green-200"
          : "text-rose-700 bg-rose-50 border-rose-200")
      }
    >
      {isOk ? (
        <svg
          className="w-4 h-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414L9 13l4.707-4.707z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.293 7.293a1 1 0 011.414 0L10 7.586l.293-.293a1 1 0 111.414 1.414L11.414 9l.293.293a1 1 0 01-1.414 1.414L10 10.414l-.293.293a1 1 0 01-1.414-1.414L8.586 9l-.293-.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {status}
    </span>
  );
}
