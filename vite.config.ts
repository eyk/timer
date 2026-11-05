import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'exclude-development-adapters',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          if (/src\/preview\.ts$|@tauri-apps\/api\/mocks\./.test(id.replaceAll('\\', '/'))) {
            this.error('Development IPC adapter included in a production bundle: ' + id);
          }
        }
      }
    },
  }],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/.tooling/**', '**/work/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
