/** Design tokens live here (colors, type, radii, shadows, z-index) and as CSS vars in src/index.css */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
    extend: {
      colors: {
        navy: { 50: '#eef2f8', 100: '#d5deee', 200: '#a9bcdc', 300: '#7d99c9', 400: '#4f72ad', 500: '#2f568f', 600: '#1e4073', 700: '#152f59', 800: '#0f2344', 900: '#0a1a33', 950: '#06101f' },
        brand: { 50: '#eaf6ff', 100: '#d0ebff', 200: '#a3d8ff', 300: '#66bdf9', 400: '#2f9fec', 500: '#0b84d6', 600: '#0a6bb1', 700: '#0d578e', 800: '#114a75', 900: '#133f61' },
        danger: { 50: '#fff1f1', 100: '#ffdfdf', 500: '#e5383b', 600: '#c92a2d', 700: '#a61e21' },
        success: { 50: '#ecfdf3', 100: '#d1fadf', 500: '#16a34a', 600: '#15803d', 700: '#166534' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#b45309', 700: '#92400e' },
        surface: { DEFAULT: '#ffffff', muted: '#f4f6fa', border: '#dde3ee' },
        ink: { DEFAULT: '#0f1b2d', soft: '#44536b', faint: '#6b7a93' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      fontSize: { xs: ['0.75rem', '1.1rem'], sm: ['0.875rem', '1.35rem'], base: ['1rem', '1.6rem'], lg: ['1.125rem', '1.7rem'], xl: ['1.25rem', '1.8rem'], '2xl': ['1.5rem', '2rem'], '3xl': ['1.875rem', '2.3rem'], '4xl': ['2.5rem', '2.9rem'] },
      borderRadius: { md: '0.5rem', lg: '0.75rem', xl: '1rem' },
      boxShadow: { card: '0 1px 2px rgba(15,27,45,0.06), 0 1px 3px rgba(15,27,45,0.05)', pop: '0 8px 24px rgba(15,27,45,0.14)' },
      zIndex: { sidebar: '30', header: '40', dropdown: '50', modal: '60', toast: '70' },
      ringColor: { DEFAULT: '#0b84d6' },
    },
  },
  plugins: [],
};
