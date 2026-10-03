import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite --mode developer` is the Developer site: port 5174, talking to the sandbox server on 3002.
export default defineConfig(({ mode }) => {
  const api = `http://127.0.0.1:${mode === 'developer' ? 3002 : 3001}`;
  return {
    plugins: [react()],
    server: {
      port: mode === 'developer' ? 5174 : 5173,
      strictPort: true,
      proxy: { '/api': api, '/uploads': api },
    },
  };
});
