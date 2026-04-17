/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#FFB7A5",
          secondary: "#FFDCCC",
          accent: "#A8D5BA",
          warm: "#FF8C6B",
          deep: "#E8603C",
        },
        surface: {
          bg: "#FFF7F2",
          card: "#FFFFFF",
          muted: "#FFF0E8",
          border: "#FFE4D6",
        },
        text: {
          primary: "#2D2D2D",
          secondary: "#5A5A5A",
          muted: "#9A9A9A",
          light: "#BDBDBD",
        },
        status: {
          success: "#A8D5BA",
          warning: "#FFD89B",
          error: "#FFB7B7",
          info: "#B7D4FF",
        }
      },
      fontFamily: {
        display: ['Poppins', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'card': '16px',
        'pill': '9999px',
        'xl2': '20px',
        'xl3': '24px',
      },
      boxShadow: {
        'soft': '0 4px 24px rgba(255, 140, 107, 0.10)',
        'card': '0 2px 16px rgba(0, 0, 0, 0.06)',
        'hover': '0 8px 32px rgba(255, 140, 107, 0.20)',
        'primary': '0 4px 24px rgba(255, 183, 165, 0.40)',
      },
      backgroundImage: {
        'warm-gradient': 'linear-gradient(135deg, #FFF7F2 0%, #FFE4D6 100%)',
        'card-gradient': 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,247,242,0.8) 100%)',
        'hero-gradient': 'linear-gradient(135deg, #FFB7A5 0%, #A8D5BA 100%)',
      }
    },
  },
  plugins: [],
}
