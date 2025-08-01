/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './providers/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: '#ff4d00',
          50: '#fff7f0',
          100: '#ffeee0',
          200: '#ffd4b8',
          300: '#ffb085',
          400: '#ff7d42',
          500: '#ff4d00',
          600: '#e63900',
          700: '#cc2f00',
          800: '#b32600',
          900: '#991f00',
        },
        orange: {
          DEFAULT: '#ff4d00',
          50: '#fff7f0',
          100: '#ffeee0',
          200: '#ffd4b8',
          300: '#ffb085',
          400: '#ff7d42',
          500: '#ff4d00',
          600: '#e63900',
          700: '#cc2f00',
          800: '#b32600',
          900: '#991f00',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Arial', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'Courier New', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}; 