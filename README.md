# PDF Reader

A Windows PDF reader for Terblanche Inc.: side-by-side reading of up to three documents, remembered reading positions, fast printing, search, page thumbnails, and page organising (delete, reorder, rotate, extract, insert, combine, split).

## Building the installer

Requirements: Node.js 22, NSIS (`makensis`).

```
npm install
npx electron-builder --win dir --x64
makensis -NOCD -DVERSION=<version> build/PDFReader.nsi
```

The installer is written to `dist/PDF-Reader-Setup-<version>.exe`.

## Releasing an update

1. Bump `version` in `package.json` and the version label in `src/index.html`, then build the installer.
2. Replace the single commit on the `updates` branch with the new installer and an updated `latest.json` (version, file, size, sha256, notes), and force-push it. Keeping one commit stops the repository growing with old installers.
3. The `Publish release` workflow on that branch creates the GitHub release `v<version>` with the installer attached.

Installed copies check the latest release when they open (and every 6 hours) and show an Update now banner.

## Bundled components

- PDF.js (Mozilla, Apache 2.0) for display, search and text selection
- pdf-lib (MIT) for page organising
- Poppler pdftocairo (GPL) for the Fast print method
- SumatraPDF (GPL) for the Standard print method
- Microsoft Visual C++ runtime DLLs, redistributed for the print engine
