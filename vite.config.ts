import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2023",
    // Exception to Vite's 500 kB default: the game is one page that needs all
    // of its code before it can draw anything, so splitting it would not load
    // anything sooner, and the desktop app loads it from disk. In November
    // 2026 the bundle was 1,135 kB minified: Three.js about 605 kB, the game
    // about 530 kB. The limit is there to catch an unexpected jump, such as
    // importing Three.js's WebGPU build (about 1.6 MB more). Review if the
    // bundle passes 1,350 kB, or if the game gains screens that could be
    // loaded on demand.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      // Treat every bundler warning as an error. Vite 8 reports a chunk over
      // the limit only once the build has finished, and swallows an error
      // thrown from here at that point, which hid the warning and passed the
      // build. So print the warning and set the exit code as well as throwing:
      // the throw stops a build that is still running, the exit code fails one
      // that has finished.
      onwarn(warning) {
        const message = `Build warning: ${warning.message}`;
        console.error(message);
        process.exitCode = 1;
        throw new Error(message);
      },
    },
  },
});
