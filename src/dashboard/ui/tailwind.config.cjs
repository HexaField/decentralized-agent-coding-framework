/** @type {import('tailwindcss').Config} */
const path = require('path')
module.exports = {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx}')
  ],
  theme: { extend: {} },
  plugins: [],
}
