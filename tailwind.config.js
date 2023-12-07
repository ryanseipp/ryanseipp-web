const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      maxWidth: {
        prose: "80ch",
      },
      fontFamily: {
        sans: ['"Source Sans 3 Variable"', ...defaultTheme.fontFamily.sans],
        mono: ["Source Code Pro Variable", ...defaultTheme.fontFamily.mono],
      },
    },
  },
  plugins: [],
  darkMode: "class",
};
