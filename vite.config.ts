import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    clearScreen: false,
    server: {
      port: 3000,
      strictPort: true,
      host: '0.0.0.0',
      watch: {
        // TauriのRustビルド成果物（src-tauri/target/**）のファイルロックによるEBUSYエラーを防止
        ignored: ['**/src-tauri/**'],
      },
    },
  };
});
