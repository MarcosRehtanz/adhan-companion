; Hooks personalizados para el instalador y desinstalador NSIS de Adhan Companion.
;
; En Windows, la aplicacion es tray-first: al cerrar la ventana se oculta a la bandeja
; del sistema (prevent_close) para continuar el seguimiento de rezos y los avisos.
;
; Antes de sobreescribir archivos en una actualizacion o borrarlos al desinstalar,
; estos ganchos cierran de forma forzosa y silenciosa cualquier instancia activa
; (incluso minimizada en la bandeja o en segundo plano) para liberar bloqueos en disco
; y evitar el cartel "Failed to kill Adhan Companion. Please close it first then try again".

!macro KillAdhanCompanion
    DetailPrint "Deteniendo instancias previas de Adhan Companion..."
    nsExec::Exec 'cmd.exe /c taskkill /F /IM "Adhan Companion.exe" /T'
    Pop $0
    nsExec::Exec 'cmd.exe /c taskkill /F /IM "adhan-companion.exe" /T'
    Pop $0
    Sleep 1000
!macroend

!macro NSIS_HOOK_PREINSTALL
    !insertmacro KillAdhanCompanion
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    !insertmacro KillAdhanCompanion
!macroend
