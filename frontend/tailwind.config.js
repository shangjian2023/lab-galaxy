/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        warm: {
          50: "#faf7f5",
          100: "#f5f0eb",
          200: "#ede5db",
          300: "#e0d4c6",
          400: "#c9b8a4",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      spacing: {
        sidebar: "260px",
      },
      borderRadius: {
        card: "12px",
        modal: "24px",
        button: "12px",
        glass: "16px",
      },
      boxShadow: {
        "warm-sm": "0 1px 3px rgba(139,109,80,0.08), 0 1px 2px rgba(139,109,80,0.04)",
        "warm-md": "0 4px 12px rgba(139,109,80,0.1), 0 2px 4px rgba(139,109,80,0.06)",
        "warm-lg": "0 8px 24px rgba(139,109,80,0.12), 0 4px 8px rgba(139,109,80,0.06)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
