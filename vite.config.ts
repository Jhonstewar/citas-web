import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Puerto propio de este workspace (ver `REACT_PORT` en el .env de la raíz). `strictPort`
    // es deliberado: si el puerto está ocupado, Vite debe fallar en vez de saltar al siguiente.
    // Saltando, el origen deja de coincidir con `FRONTEND_ORIGIN` y el backend responde con un
    // fallo de CORS que en la interfaz parece "no pudimos contactar al servidor".
    port: 5174,
    strictPort: true,
  },
  test: {
    // URL fija para las pruebas: no dependen del .env local, que no se versiona.
    env: { VITE_API_URL: 'http://api.test' },
  },
})
