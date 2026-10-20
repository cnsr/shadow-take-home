import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The app talks to the model through a dev-server proxy at /api/llm. This keeps
// your API key on the dev server (never shipped to the browser) and sidesteps
// CORS entirely. Configure it by copying .env.example -> .env.local.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_LLM_BASE_URL || 'https://api.groq.com/openai/v1';
  const apiKey = env.VITE_LLM_API_KEY || '';

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      proxy: {
        '/api/llm': {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/llm/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
            });
          },
        },
      },
    },
  };
});
