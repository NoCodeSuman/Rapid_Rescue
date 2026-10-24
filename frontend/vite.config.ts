/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repository = process.env.GITHUB_REPOSITORY;
const [owner, repositoryName] = repository?.split('/') ?? [];
const base = process.env.GITHUB_ACTIONS && repositoryName
  ? repositoryName === `${owner}.github.io` ? '/' : `/${repositoryName}/`
  : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
