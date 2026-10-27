import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Mesmo atalho "@/..." do tsconfig, pros testes importarem o código do app.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
})
