// The preload script runs before the page, sandboxed and isolated from it, and
// is the only bridge between the page and the main process. Each thing the
// page may ask for (such as the native save and load dialogs) gets one narrow,
// typed function here, exposed with contextBridge, and a matching handler in
// the main process. The page never gets ipcRenderer, Node or general file
// access.
//
// Nothing is exposed yet. It is CommonJS (.cts) because a sandboxed preload
// script can't be an ES module.
