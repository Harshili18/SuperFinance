/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        sage: "var(--sage)",
        "surface-soft": "var(--surface-soft)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
        },
        positive: "var(--positive)",
        negative: "var(--negative)",
        warning: "var(--warning)",
        sf: {
          bg: "var(--sf-bg)",
          surface: "var(--sf-surface)",
          card: "var(--sf-card)",
          text: "var(--sf-text)",
          muted: "var(--sf-muted)",
          border: "var(--sf-border)",
          primary: "var(--primary)",
          accent: "var(--negative)",
          success: "var(--positive)",
          warning: "var(--warning)",
          info: "var(--sage)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 6px)",
        xl: "calc(var(--radius) + 2px)",
        "2xl": "calc(var(--radius) + 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(18, 24, 22, 0.04)",
        card: "var(--shadow-soft)",
        soft: "var(--shadow-soft)",
      },
    },
  },
  plugins: [],
};
