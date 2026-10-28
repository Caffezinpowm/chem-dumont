import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Normaliza a base para sempre começar e terminar com barra. */
function normalizeBase(value: string | undefined): string {
  if (!value || value === '/') return '/';
  const clean = value.replace(/^\/+|\/+$/g, '');
  return `/${clean}/`;
}

/**
 * O roteador é próprio e usa History API. Para hospedagem estática,
 * gera um 404.html idêntico ao index.html (GitHub Pages) e usa _redirects
 * no Netlify. O servidor de desenvolvimento já faz fallback sozinho.
 */
function spaFallbackPlugin(): Plugin {
  return {
    name: 'guia-chem-spa-fallback',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist');
      const index = path.join(outDir, 'index.html');
      if (fs.existsSync(index)) fs.copyFileSync(index, path.join(outDir, '404.html'));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBase(env.VITE_BASE ?? process.env.VITE_BASE);
  return {
    base,
    plugins: [spaFallbackPlugin()],
    build: {
      target: 'es2022',
      sourcemap: false,
      assetsInlineLimit: 2048,
    },
    preview: {
      port: 4173,
    },
  };
});
