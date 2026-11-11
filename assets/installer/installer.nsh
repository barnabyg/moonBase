; Added to the NSIS installer that electron-builder builds (package.json's
; build.nsis.include). See docs/desktop-release.md.
;
; The installer keeps a copy of itself, over 100 MB, in
; %LOCALAPPDATA%\moon-base-updater\installer.exe, for electron-updater's
; differential downloads, and electron-builder's uninstaller leaves it there.
; A full uninstall removes it. An update, which runs the old version's
; uninstaller first, keeps it, as the new installer then replaces it.
;
; Nothing else is added: the uninstaller still leaves the player's save files,
; wherever they were saved, and the app's user-data folder,
; %APPDATA%\moon-base, alone.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\moon-base-updater"
  ${endIf}
!macroend
