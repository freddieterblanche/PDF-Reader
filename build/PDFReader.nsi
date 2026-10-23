; PDF Reader installer (per-user, no administrator rights needed)
Unicode true
!include "MUI2.nsh"
!include "build/installer.nsh"

!ifndef VERSION
  !define VERSION "2.0.0"
!endif
!define APPNAME "PDF Reader"
!define EXE "PDF Reader.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PDFReader"

Name "${APPNAME}"
OutFile "dist/PDF-Reader-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\PDF Reader"
InstallDirRegKey HKCU "Software\PDFReader" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "PDF Reader ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} installer"
VIAddVersionKey "CompanyName" "Terblanche Inc."
VIAddVersionKey "LegalCopyright" "Terblanche Inc."
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!define MUI_ICON "build/icon.ico"
!define MUI_UNICON "build/icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install PDF Reader ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "PDF Reader opens, compares and prints PDF documents.$\r$\n$\r$\nIt installs for your Windows account only and does not need administrator rights. If PDF Reader is open, it will be closed during setup."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open PDF Reader"
!define MUI_FINISHPAGE_TEXT "PDF Reader is installed.$\r$\n$\r$\nTo make it your default PDF app: right-click any PDF, choose Open with, then Choose another app, select PDF Reader and tick Always."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!macro CloseRunningApp
  nsExec::Exec 'taskkill /IM "${EXE}"'
  Sleep 1500
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 500
!macroend

Section "Install"
  !insertmacro CloseRunningApp
  SetOutPath "$INSTDIR"
  File /r /x "app-update.yml" /x "elevate.exe" "dist/win-unpacked/*.*"
  WriteUninstaller "$INSTDIR\Uninstall PDF Reader.exe"

  CreateShortCut "$SMPROGRAMS\PDF Reader.lnk" "$INSTDIR\${EXE}"
  CreateShortCut "$DESKTOP\PDF Reader.lnk" "$INSTDIR\${EXE}"

  WriteRegStr HKCU "Software\PDFReader" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Terblanche Inc."
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall PDF Reader.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  !insertmacro customInstall
  ; After a silent update, reopen PDF Reader
  IfSilent 0 +2
    Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section "Uninstall"
  !insertmacro CloseRunningApp
  !insertmacro customUnInstall
  Delete "$SMPROGRAMS\PDF Reader.lnk"
  Delete "$DESKTOP\PDF Reader.lnk"
  DeleteRegKey HKCU "${UNINSTKEY}"
  RMDir /r "$INSTDIR"
SectionEnd
