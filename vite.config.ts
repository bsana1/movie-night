import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub project Pages serves from https://<user>.github.io/<repo>/
const repoName = 'movie-night'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? `/${repoName}/` : '/',
})
