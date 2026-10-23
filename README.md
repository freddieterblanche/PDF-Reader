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

Bump `version` in `package.json` and the version label in `src/index.html`, build, then publish a GitHub release tagged `v<version>` with the installer attached. Installed copies check the latest release and offer to update.

## Bundled components

- PDF.js (Mozilla, Apache 2.0) for display, search and text selection
- pdf-lib (MIT) for page organising
- Poppler pdftocairo (GPL) for the Fast print method
- SumatraPDF (GPL) for the Standard print method
- Microsoft Visual C++ runtime DLLs, redistributed for the print engine
