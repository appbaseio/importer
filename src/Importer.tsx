import React, { useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import {
  ImporterConfig,
  ImporterConfigProvider,
} from "./context/ImporterConfig";
import "./index.css";

export interface ImporterProps {
  config?: ImporterConfig;
}

export function Importer({ config }: ImporterProps) {
  const qcRef = useRef<QueryClient | null>(null);
  if (!qcRef.current) qcRef.current = new QueryClient();
  return (
    <React.StrictMode>
      <QueryClientProvider client={qcRef.current}>
        <ImporterConfigProvider value={config || {}}>
          <App />
        </ImporterConfigProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

export default Importer;
