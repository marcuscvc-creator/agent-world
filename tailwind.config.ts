import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        pixel: ["var(--font-pixel)", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        pixel: "0 0 0 2px #241b2f, 0 8px 0 #241b2f"
      }
    }
  },
  plugins: []
};

export default config;
