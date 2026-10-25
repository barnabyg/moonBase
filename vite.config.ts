import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2023",
    // Exception to Vite's 500 kB default: Three.js alone is about 530 kB
    // minified (about 135 kB gzipped) and the game is one page that needs all
    // of it before it can draw anything, so splitting it would not load
    // anything sooner. Review if the bundle grows past this limit or if the
    // game gains screens that could be loaded on demand.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      // Treat every bundler warning as an error.
      onwarn(warning) {
        throw new Error(`Build warning: ${warning.message}`);
      },
    },
  },
});
