/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: '#090d16',
          panel: '#0f172a',
          border: '#1e293b',
          accent: '#06b6d4'
        }
      }
    },
  },
  plugins: [],
}
