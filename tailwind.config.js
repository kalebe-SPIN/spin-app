/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Kalebe 2026-10-01: modo claro/escuro. O portal foi desenhado escuro
        // com "branco translúcido" por cima do fundo noite; no modo claro as
        // duas cores-base se invertem (globals.css, data-tema="claro") e todas
        // as telas acompanham sem mexer nelas. PDFs ficam fixos (.tema-fixo).
        white: 'rgb(var(--c-branco) / <alpha-value>)',
        // Paleta v3 Spin Solar (mesma do menu-spin pra consistência visual)
        noite: {
          0: 'rgb(var(--c-noite-0) / <alpha-value>)',   // background mais escuro
          DEFAULT: 'rgb(var(--c-noite) / <alpha-value>)',
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
