/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        webticket: {
          green: {
            DEFAULT: '#7fbd52',
            light: '#9ad072',
            dark: '#6aa340',
            deep: '#4f802d',
            soft: '#f1f8ed'
          },
          slate: {
            950: '#0d1522',
            900: '#162033',
            800: '#1f2e48',
            700: '#334155',
            600: '#475569',
            500: '#64748b'
          },
          charcoal: '#333b33',
          border: '#e2e8f0',
          bg: '#f8fafc'
        }
      },
      fontFamily: {
        sans: ['"Maven Pro"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 10px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 12px 24px -6px rgba(0, 0, 0, 0.12), 0 4px 8px -4px rgba(0, 0, 0, 0.06)',
        'pill': '0 2px 6px rgba(127, 189, 82, 0.25)',
      },
      borderRadius: {
        'pill': '24px'
      }
    },
  },
  plugins: [],
}
