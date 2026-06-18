/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta v3 Spin Solar (mesma do menu-spin pra consistência visual)
        noite: {
          0: '#050B16',   // background mais escuro
          DEFAULT: '#0F1825',
        },
        sol: {
          DEFAULT: '#F5B400',  // amarelo principal
          claro: '#FFD64A',    // amarelo destaque
          glow: 'rgba(245, 180, 0, 0.35)',
        },
        weg: {
          azul: '#0047BB',     // azul oficial WEG
        },
        // Estados
        verde: '#4EDC8A',
        coral: '#E85C5C',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightish: '-0.01em',
        tighter2: '-0.02em',
      },
    },
  },
  plugins: [],
}
