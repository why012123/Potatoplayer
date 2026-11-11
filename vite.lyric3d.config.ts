import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^three$/, replacement: fileURLToPath(new URL("./public/lyric3d/vendor/three.module.js", import.meta.url)) },
      { find: /^three\/addons\//, replacement: fileURLToPath(new URL("./public/lyric3d/vendor/addons/", import.meta.url)) },
    ],
  },
  build: {
    outDir: "public/lyric3d",
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: fileURLToPath(new URL("./public/lyric3d/show.js", import.meta.url)),
      formats: ["iife"],
      name: "Lyric3DStage",
      fileName: () => "stage.bundle.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
