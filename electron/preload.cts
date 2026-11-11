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
// the names it needs, which those types check.
import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopBridge,
  OpenSaveFileResult,
  BridgeChannels,
  SaveFileResult,
  bridgeName as BridgeName,
} from "./desktop-bridge.js";

const channels: BridgeChannels = {
  saveFile: "moonbase:save-file",
  openSaveFile: "moonbase:open-save-file",
};
const bridgeName: typeof BridgeName = "moonbase";

// Save and load, with the operating system's dialogs (save-dialogs.ts).
const bridge: DesktopBridge = {
  saveFile: (suggestedName, contents) =>
    ipcRenderer.invoke(
      channels.saveFile,
      suggestedName,
      contents,
    ) as Promise<SaveFileResult>,
  openSaveFile: () =>
    ipcRenderer.invoke(channels.openSaveFile) as Promise<OpenSaveFileResult>,
};

contextBridge.exposeInMainWorld(bridgeName, bridge);
