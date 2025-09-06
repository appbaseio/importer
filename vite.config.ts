import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2022",
    // When building for production, produce both app (default) and allow lib builds via env flag
    lib: process.env.LIB_BUILD
      ? {
          entry: path.resolve(__dirname, "src/index.ts"),
          name: "DataImporter",
          fileName: (format) => `data-importer.${format}.js`,
          formats: ["es", "umd"],
        }
      : undefined,
    rollupOptions: process.env.LIB_BUILD
      ? {
          external: ["react", "react-dom", "@tanstack/react-query"],
          output: {
            globals: {
              react: "React",
              "react-dom": "ReactDOM",
              "@tanstack/react-query": "TanstackReactQuery",
            },
          },
        }
      : undefined,
  },
}));
