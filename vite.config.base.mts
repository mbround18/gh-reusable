import { defineConfig } from 'vite';

export type ActionViteConfigOptions = {
  entry: string;
  outDir?: string;
  target?: string;
};

export function createActionViteConfig(options: ActionViteConfigOptions) {
  return defineConfig({
    build: {
      emptyOutDir: true,
      outDir: options.outDir ?? 'dist',
      sourcemap: true,
      target: options.target ?? 'node20',
      ssr: options.entry,
      rollupOptions: {
        output: {
          entryFileNames: 'index.js',
          format: 'cjs'
        }
      }
    }
  });
}
