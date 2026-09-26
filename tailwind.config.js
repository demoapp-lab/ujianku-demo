/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0C2E24",
          soft: "#164537",
          line: "#C9D2CC",
          mute: "#5C6B64",
        },
        paper: {
          DEFAULT: "#F4F5F1",
          card: "#FFFFFF",
        },
        brass: {
          DEFAULT: "#A67B1E",
          soft: "#F3E9CF",
        },
        signal: "#B3261E",
        "signal-soft": "#F8E3E1",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        sheet: "0 1px 0 0 rgba(12,46,36,0.06)",
      },
    },
  },
  plugins: [],
};
