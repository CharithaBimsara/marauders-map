/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: "#fbf6e8",
          100: "#f6eed6",
          200: "#eddab2",
          300: "#e2c38a",
          400: "#d3a763",
          500: "#c08b45",
          600: "#a56f36",
          700: "#84552b",
          800: "#684425",
          900: "#53371f"
        },
        house: {
          gryffindor: "#ae0001",
          slytherin: "#2a623d",
          hufflepuff: "#ecb939",
          ravenclaw: "#222f5b"
        }
      },
      boxShadow: {
        "parchment": "0 20px 80px rgba(41, 24, 16, 0.35)"
      },
      fontFamily: {
        magical: ["Crimson Text", "Spectral SC", "serif"]
      }
    }
  },
  plugins: []
};
