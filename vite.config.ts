import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'frontend',
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: true,
  },
  plugins: [react()],
  optimizeDeps: {
    include: ['@babel/parser'],
  },
  resolve: {
    conditions: process.env.VITEST
      ? ['node', 'import', 'module', 'default']
      : ['browser', 'module', 'import', 'default'],
  },
});