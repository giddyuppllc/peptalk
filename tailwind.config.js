/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Jamie's Women's Palette (Mango-inspired)
        peach: {
          50: '#FDF8F5',
          100: '#FCCBA8',
          200: '#FFBF82',
          300: '#F8A97A',
          400: '#E8885A',
          500: '#D97040',
        },
        blush: {
          50: '#FDF5F4',
          100: '#F9DCD9',
          200: '#F2B6B1',
          300: '#E8948E',
          400: '#D97270',
        },
        golden: {
          50: '#FDFBF0',
          100: '#F9F0C8',
          200: '#F4E285',
          300: '#E8C547',
          400: '#D4A853',
        },
        sage: {
          50: '#F4F7F3',
          100: '#D4E3D2',
          200: '#A9C4A6',
          300: '#8FAA8B',
          400: '#6E8B6A',
        },
        cream: '#F2E8E1',
        // Men's Palette
        sky: {
          50: '#F5F7FA',
          100: '#D6E4F0',
          200: '#8BB5D5',
          300: '#5B8DB8',
          400: '#3D7099',
        },
        amber: {
          50: '#FBF5E8',
          100: '#F0DDB0',
          200: '#E8C547',
          300: '#D4A853',
          400: '#B8913D',
        },
        // Semantic
        surface: {
          warm: '#FDF8F5',
          cool: '#F5F7FA',
        },
      },
      fontFamily: {
        'display': ['Playfair-Black'],
        'display-bold': ['Playfair-ExtraBold'],
        'display-regular': ['Playfair-Bold'],
        'sans': ['DMSans-Regular'],
        'sans-medium': ['DMSans-Medium'],
        'sans-semibold': ['DMSans-SemiBold'],
        'sans-bold': ['DMSans-Bold'],
      },
    },
  },
  plugins: [],
};
