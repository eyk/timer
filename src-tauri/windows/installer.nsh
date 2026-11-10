!macro NSIS_HOOK_POSTINSTALL
  ${If} $NoShortcutMode = 1
    Goto timer_hotkey_done
  ${EndIf}

  StrCpy $R0 "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !insertmacro IsShortcutTarget "$R0" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 <> 1
    Delete "$INSTDIR\launch-shortcut.txt"
    Goto timer_hotkey_done
  ${EndIf}

  ; Keep the key across upgrades, when Explorer may already have it registered.
  StrCpy $R1 ""
  ClearErrors
  FileOpen $R3 "$INSTDIR\launch-shortcut.txt" r
  ${IfNot} ${Errors}
    FileRead $R3 $R1
    FileClose $R3
  ${EndIf}
  ; The link stores the virtual key below the shift/control modifier byte.
  ${If} $R1 == "Ctrl+Shift+F11"
    StrCpy $R2 0x037A
  ${ElseIf} $R1 == "Ctrl+Shift+F10"
    StrCpy $R2 0x0379
  ${Else}
    ; Probe both keys without taking either one away from an existing binding.
    System::Call 'user32::RegisterHotKey(p 0, i 0x4559, i 6, i 0x7A) i.r0'
    ${If} $0 <> 0
      StrCpy $R1 "Ctrl+Shift+F11"
      StrCpy $R2 0x037A
    ${Else}
      System::Call 'user32::RegisterHotKey(p 0, i 0x4559, i 6, i 0x79) i.r0'
      ${If} $0 = 0
        Goto timer_hotkey_done
      ${EndIf}
      StrCpy $R1 "Ctrl+Shift+F10"
      StrCpy $R2 0x0379
    ${EndIf}
    System::Call 'user32::UnregisterHotKey(p 0, i 0x4559)'
  ${EndIf}

  ; Update Tauri's existing link in place to retain its Windows app identity.
  StrCpy $R4 0
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
  ${If} $0 P<> 0
    ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
    ${If} $1 P<> 0
      ${IPersistFile::Load} $1 '(w "$R0", ${STGM_READWRITE}).r2'
      ${If} $2 = 0
        ${IShellLink::SetHotkey} $0 '($R2).r2'
        ${If} $2 = 0
          ${IPersistFile::Save} $1 '(w "$R0", 1).r2'
          ${If} $2 = 0
            StrCpy $R4 1
          ${EndIf}
        ${EndIf}
      ${EndIf}
      ${IUnknown::Release} $1 ""
    ${EndIf}
    ${IUnknown::Release} $0 ""
  ${EndIf}

  ${If} $R4 = 1
    System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x1005, w "$R0", p 0)'
    ClearErrors
    FileOpen $R3 "$INSTDIR\launch-shortcut.txt" w
    ${IfNot} ${Errors}
      FileWrite $R3 "$R1"
      FileClose $R3
    ${EndIf}
  ${Else}
    Delete "$INSTDIR\launch-shortcut.txt"
  ${EndIf}

  timer_hotkey_done:
  ClearErrors
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    Delete "$INSTDIR\launch-shortcut.txt"
  ${EndIf}
!macroend
