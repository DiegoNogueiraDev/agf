; windows-installer.nsi — NSIS script for the self-contained agf-windows-x64
; binary. Double-click installer, no admin required (RequestExecutionLevel
; user), installs to %LOCALAPPDATA%\agf and adds it to the user PATH.
;
; UNSIGNED by design (no paid code-signing credentials) — SmartScreen shows
; "Windows protected your PC" on first run; the documented workaround is
; "More info" -> "Run anyway" (see INSTALL.md).
;
; Built via: scripts/build-windows-installer.sh (runs makensis inside Docker,
; since NSIS isn't native to macOS).

!include "WinMessages.nsh"

!define APP_NAME "agf"
!ifndef APP_VERSION
  !define APP_VERSION "0.0.0"
!endif
!ifndef PAYLOAD_EXE
  !define PAYLOAD_EXE "dist-bun\agf-windows-x64.exe"
!endif

Name "agent-graph-flow (agf)"
OutFile "agf-setup-${APP_VERSION}-x64.exe"
InstallDir "$LOCALAPPDATA\agf"
RequestExecutionLevel user

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File "/oname=agf.exe" "${PAYLOAD_EXE}"

  ; Append $INSTDIR to the user's PATH (HKCU — no admin needed) and broadcast
  ; WM_SETTINGCHANGE so File Explorer / new terminals pick it up without a
  ; logout. Existing terminals still need to be reopened (documented in
  ; INSTALL.md), same caveat every PATH-mutating installer has.
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCpy $1 "$0;$INSTDIR"
  WriteRegExpandStr HKCU "Environment" "Path" "$1"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\agf.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
