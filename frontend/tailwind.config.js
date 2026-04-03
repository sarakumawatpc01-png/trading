/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'oracle-bg': '#0D1117',
        'oracle-secondary': '#161B22',
        'oracle-tertiary': '#21262D',
        'oracle-border': '#30363D',
        'oracle-gold': '#D4A017',
        'oracle-gold-light': '#F0C040',
        'oracle-text-primary': '#E6EDF3',
        'oracle-text-secondary': '#8B949E',
        'oracle-green': '#3FB950',
        'oracle-red': '#F85149',
        'oracle-blue': '#58A6FF',
        'oracle-orange': '#F0883E',
        'oracle-purple': '#BC8CFF',
        panel: '#131a24',
        accent: '#3dd9b7',
        bg: '#090d14'
      }
    }
  },
  plugins: []
};
