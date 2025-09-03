import type { Config } from "tailwindcss";

// Tailwind v4 can run plugin loading from CSS via @plugin.
// Keep globs minimal here; plugin loading is handled in globals.css.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
};
export default config;
