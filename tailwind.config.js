/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./boutique/**/*.{html,js}",
    "./admin/**/*.{html,js}",
    "./script.js",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#1a365d',
        'secondary': '#2d5282',
        'accent': '#bee3f8',
        'cream': '#fafafa',
        'paper': '#ffffff',
      },
      fontFamily: {
        'display': ['Fleur de Leah', 'Georgia', 'serif'],
        'sans': ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      letterSpacing: {
        'widest': '0.2em',
      },
      borderWidth: {
        '1': '1px',
      }
    }
  },
  plugins: [],
}
