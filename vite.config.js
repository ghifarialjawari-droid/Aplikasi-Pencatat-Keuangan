import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' membuat hasil build bisa dibuka dari sub-folder (mis. GitHub Pages: user.github.io/nama-repo/)
export default defineConfig({
  base: './',
  plugins: [react()],
});
