// The preload script runs before the page, sandboxed and isolated from it, and
// is the only bridge between the page and the main process. Each thing the
// page may ask for gets one narrow, typed function here, exposed with
// contextBridge, and a matching handler in the main process, which checks who
// asked and what with. The page never gets ipcRenderer, Node or general file
// access.
//
// It is CommonJS (.cts) because a sandboxed preload script can't be an ES
// module, and it can't load the game's other files at run time either, only
// Electron's, so it imports only types from desktop-bridge.ts and spells out
// the names it needs, which those types check: a channel name that differs
// from desktop-bridge.ts's `channels` fails type checking.
import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopBridge,
  OpenSaveFileResult,
  BridgeChannels,
  SaveFileResult,
  UnsavedSave,
  bridgeName as BridgeName,
} from "./desktop-bridge.js";

const channels = {
  saveFile: "moonbase:save-file",
  openSaveFile: "moonbase:open-save-file",
  toggleFullScreen: "moonbase:toggle-full-screen",
  isFullScreen: "moonbase:is-full-screen",
  fullScreenChanged: "moonbase:full-screen-changed",
  closeWindow: "moonbase:close-window",
  unsavedProgressAsked: "moonbase:unsaved-progress-asked",
  unsavedProgressAnswered: "moonbase:unsaved-progress-answered",
} as const satisfies BridgeChannels;
const bridgeName: typeof BridgeName = "moonbase";

// Before the window closes, the main process asks for the Campaign's unsaved
// progress (close-window.ts), by a number it answers with. Until the page
// says how to find it, the game hasn't started, so there is none. If finding
// it fails, no answer is sent, and the main process asks the player whether to
// close anyway.
let unsavedProgress: (() => UnsavedSave | null) | undefined;
ipcRenderer.on(channels.unsavedProgressAsked, (_event, id: unknown) => {
  if (typeof id !== "number") return;
  const answer = unsavedProgress === undefined ? null : unsavedProgress();
  ipcRenderer.send(channels.unsavedProgressAnswered, id, answer);
});

// Save and load, with the operating system's dialogs (save-dialogs.ts), the
// window's fullscreen (full-screen.ts), closing the window, and the Campaign's
// unsaved progress, for the question before closing (close-window.ts).
const bridge: DesktopBridge = {
  saveFile: (suggestedName, contents) =>
    ipcRenderer.invoke(
      channels.saveFile,
      suggestedName,
      contents,
    ) as Promise<SaveFileResult>,
  openSaveFile: () =>
    ipcRenderer.invoke(channels.openSaveFile) as Promise<OpenSaveFileResult>,
  toggleFullScreen: () =>
    ipcRenderer.invoke(channels.toggleFullScreen) as Promise<void>,
  isFullScreen: () =>
    ipcRenderer.invoke(channels.isFullScreen) as Promise<boolean>,
  // The listener gets whether the window is full screen and nothing else, not
  // the IPC event, which would reach ipcRenderer.
  onFullScreenChange: (listener) => {
    ipcRenderer.on(
      channels.fullScreenChanged,
      (_event, fullScreen: unknown) => {
        if (typeof fullScreen === "boolean") listener(fullScreen);
      },
    );
  },
  closeWindow: () => ipcRenderer.invoke(channels.closeWindow) as Promise<void>,
  answerUnsavedProgress: (unsaved) => {
    unsavedProgress = unsaved;
  },
};

contextBridge.exposeInMainWorld(bridgeName, bridge);
