/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#131a24',
        accent: '#3dd9b7',
        bg: '#090d14'
      }
    }
  },
  plugins: []
};
