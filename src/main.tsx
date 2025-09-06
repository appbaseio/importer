import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
// Vite will transform the imported ICO into a URL
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import faviconUrl from "./assets/favicon.ico?url";

const qc = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

// Set favicon at runtime to avoid 404 when not in public/
try {
  const link: HTMLLinkElement =
    (document.querySelector("link[rel='icon']") as HTMLLinkElement) ||
    document.createElement("link");
  link.rel = "icon";
  link.href = faviconUrl as string;
  if (!link.parentNode) document.head.appendChild(link);
} catch {}
