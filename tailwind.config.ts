import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      container: { center: true, padding: "1rem" },
      colors: {
        primary: "#1677ff",
        "primary-light": "#40a9ff",
        error: "#ff4d4f",
      },
    },
  },
  plugins: [],
} satisfies Config;
