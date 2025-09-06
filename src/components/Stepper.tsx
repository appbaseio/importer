import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { useImportStore } from "@/stores/useImportStore";

interface Step {
  id: string;
  label: string;
  element: React.ReactNode;
}
export function Stepper({ steps }: { steps: readonly Step[] }) {
  const store = useImportStore();
  const [i, setI] = useState(0);

  const readyFlags = useMemo(
    () => ({
      upload: !!store.upload.file,
      cluster: !!store.cluster,
      index: !!store.index,
      import: !!store.importDone,
    }),
    [store.upload.file, store.cluster, store.index, store.importDone]
  );

  const stepReady = (idx: number) => {
    switch (idx) {
      case 0:
        return readyFlags.upload;
      case 1:
        return readyFlags.cluster;
      case 2:
        return readyFlags.index;
      case 3:
        return readyFlags.import;
      default:
        return false;
    }
  };

  const canPrev = i > 0 && !store.importRunning;
  const allPrevReady = Array.from({ length: i + 1 }, (_, k) =>
    stepReady(k)
  ).every(Boolean);
  const canNext = i < steps.length - 1 && allPrevReady;

  const lastCompleted = Math.max(
    -1,
    ...steps.map((_, idx) => (stepReady(idx) ? idx : -1))
  );
  const progress = steps.length > 1 ? lastCompleted / (steps.length - 1) : 0;
  return (
    <div className="grid gap-6">
      {/* Nodes with segment connectors */}
      <div className={clsx("grid", "grid-cols-4")}>
        {steps.map((s, idx) => {
          const completed = stepReady(idx);
          const active = idx === i && !completed;
          const leftDone = idx > 0 && stepReady(idx - 1);
          const rightDone = idx < steps.length - 1 && stepReady(idx);
          return (
            <div key={s.id} className="relative flex flex-col items-center">
              {/* left connector */}
              {idx > 0 && (
                <div className="absolute top-4 left-0 w-1/2 h-0.5">
                  <div className="w-full h-full bg-neutral-200" />
                  {leftDone && (
                    <div className="w-full h-full bg-primary absolute inset-0" />
                  )}
                </div>
              )}
              {/* right connector */}
              {idx < steps.length - 1 && (
                <div className="absolute top-4 left-1/2 w-1/2 h-0.5">
                  <div className="w-full h-full bg-neutral-200" />
                  {rightDone && (
                    <div className="w-full h-full bg-primary absolute inset-0" />
                  )}
                </div>
              )}
              <div
                className={clsx(
                  "rounded-full z-10",
                  active ? "p-1 bg-primary/20" : "p-1"
                )}
              >
                <div
                  className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    completed
                      ? "bg-primary text-white"
                      : active
                      ? "bg-white border-2 border-primary"
                      : "bg-white border border-neutral-300"
                  )}
                >
                  {completed ? (
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
                  ) : active ? (
                    <span className="w-2 h-2 rounded-full bg-primary block" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-neutral-300 block" />
                  )}
                </div>
              </div>
              <div
                className={clsx(
                  "mt-3 text-sm font-medium",
                  completed || active ? "text-primary" : "text-neutral-600"
                )}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border bg-white p-4">
        {steps[i].element}
      </section>
      <div className="flex justify-between">
        <button
          disabled={!canPrev}
          onClick={() => setI(i - 1)}
          className="px-4 py-2 rounded bg-gray-200 text-gray-700 disabled:opacity-50"
        >
          Previous
        </button>
        {i === 3 && store.importDone && store.index && store.cluster ? (
          (() => {
            let clusterHref = store.cluster!.url;
            try {
              const u = new URL(clusterHref);
              const auth: string | null | undefined = (store as any).authHeader;
              if (auth && auth.startsWith("Basic ")) {
                const b64 = auth.slice(6).trim();
                try {
                  const creds = atob(b64);
                  const [user, ...rest] = creds.split(":");
                  const pass = rest.join(":");
                  if (user) {
                    u.username = user;
                    u.password = pass;
                  }
                } catch {}
              }
              clusterHref = u.toString();
            } catch {}
            const href = `https://dejavu.reactivesearch.io/?appname=${encodeURIComponent(
              store.index.name
            )}&url=${encodeURIComponent(clusterHref)}&mode=edit`;
            return (
              <a
                className="px-4 py-2 rounded bg-primary text-white hover:bg-primary-light"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                View data in Dejavu
              </a>
            );
          })()
        ) : i < steps.length - 1 ? (
          <button
            disabled={!canNext}
            onClick={() => {
              // If moving from Ingestion to Import, trigger auto-start
              if (i === 2 && typeof store.setImportAutoStart === "function") {
                store.setImportAutoStart(true);
              }
              setI(i + 1);
            }}
            className="px-4 py-2 rounded bg-primary text-white hover:bg-primary-light disabled:opacity-50"
          >
            {i === 0
              ? "Connect to Cluster"
              : i === 1
              ? "Configure Ingestion"
              : i === 2
              ? "Start Import"
              : "Next"}
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
