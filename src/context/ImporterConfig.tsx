import React, { createContext, useContext } from "react";

export type SampleDatasetConfig = {
  url: string;
  label?: string;
  filename?: string;
};

export type ImporterConfig = {
  sampleDataset?: SampleDatasetConfig;
};

const Ctx = createContext<ImporterConfig>({});

export function ImporterConfigProvider({
  value,
  children,
}: {
  value: ImporterConfig;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useImporterConfig() {
  return useContext(Ctx);
}
