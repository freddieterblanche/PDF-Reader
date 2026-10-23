; Registers PDF Reader as a PDF handler for the current user, so it appears in
; "Open with" and in Settings > Apps > Default apps. Windows requires the user to
; confirm the default choice, so this never takes over .pdf files on its own.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\PDFReader.Document" "" "PDF Document"
  WriteRegStr HKCU "Software\Classes\PDFReader.Document" "FriendlyTypeName" "PDF Document"
  WriteRegStr HKCU "Software\Classes\PDFReader.Document\DefaultIcon" "" "$INSTDIR\resources\pdf.ico"
  WriteRegStr HKCU "Software\Classes\PDFReader.Document\shell\open" "FriendlyAppName" "PDF Reader"
  WriteRegStr HKCU "Software\Classes\PDFReader.Document\shell\open\command" "" '"$INSTDIR\PDF Reader.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "PDFReader.Document" ""
  WriteRegStr HKCU "Software\Classes\Applications\PDF Reader.exe" "FriendlyAppName" "PDF Reader"
  WriteRegStr HKCU "Software\Classes\Applications\PDF Reader.exe\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\PDF Reader.exe\shell\open\command" "" '"$INSTDIR\PDF Reader.exe" "%1"'
  WriteRegStr HKCU "Software\PDFReader\Capabilities" "ApplicationName" "PDF Reader"
  WriteRegStr HKCU "Software\PDFReader\Capabilities" "ApplicationDescription" "Read, compare and print PDF documents"
  WriteRegStr HKCU "Software\PDFReader\Capabilities" "ApplicationIcon" "$INSTDIR\PDF Reader.exe,0"
  WriteRegStr HKCU "Software\PDFReader\Capabilities\FileAssociations" ".pdf" "PDFReader.Document"
  WriteRegStr HKCU "Software\RegisteredApplications" "PDF Reader" "Software\PDFReader\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "PDF Reader"
  DeleteRegKey HKCU "Software\PDFReader"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "PDFReader.Document"
  DeleteRegKey HKCU "Software\Classes\PDFReader.Document"
  DeleteRegKey HKCU "Software\Classes\Applications\PDF Reader.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
