import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#2C5F8A', hover: '#214A6D' },
        secondary: '#6B7A8D',
        accent: '#E8A020',
        background: '#F5F6F7',
        surface: { DEFAULT: '#FFFFFF', alt: '#ECEEF0' },
        'room-outline': '#2A3441',
        'furniture-fill': '#E8F0F8',
        'furniture-border': '#4A7AAB',
        success: '#2E7D52',
        warning: '#C17B10',
        error: '#C0392B',
        border: '#D4D8DE',
        'text-muted': '#6B7A8D',
      },
      fontFamily: {
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      fontSize: {
        xs: ['0.6875rem', { lineHeight: '1.2' }],
        sm: ['0.75rem', { lineHeight: '1.4' }],
        base: ['0.875rem', { lineHeight: '1.5' }],
        md: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.4' }],
      },
      spacing: {
        '1': '4px', '2': '8px', '3': '12px', '4': '16px',
        '5': '20px', '6': '24px', '8': '32px', '10': '40px',
        '12': '48px', '16': '64px',
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
      },
      boxShadow: {
        modal: '0 4px 16px rgba(0,0,0,0.12)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
      },
    },
  },
  plugins: [],
};

export default config;
