import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Variáveis definidas por next/font em src/app/layout.tsx.
        display: ['var(--font-display)', 'Times New Roman', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace']
      },
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        'paper-3': 'var(--paper-3)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        navy: 'var(--navy)',
        'navy-2': 'var(--navy-2)',
        brass: 'var(--brass)',
        'brass-2': 'var(--brass-2)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        late: 'var(--late)'
      }
    }
  },
  plugins: []
};

export default config;
