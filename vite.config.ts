import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // URL fija para las pruebas: no dependen del .env local, que no se versiona.
    env: { VITE_API_URL: 'http://api.test' },
  },
})
