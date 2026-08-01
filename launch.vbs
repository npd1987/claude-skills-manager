' Starts Claude Skills with no console window, for the Start menu shortcut.
' The server opens your browser itself, and quits from the app's Quit button.
Option Explicit

Dim fso, shell, here
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = here

' Fail loudly rather than silently doing nothing if Node has gone missing.
If shell.Run("cmd /c where node", 0, True) <> 0 Then
  MsgBox "Claude Skills needs Node.js, which isn't on your PATH." & vbCrLf & vbCrLf & _
         "Install it from https://nodejs.org and try again.", 16, "Claude Skills"
  WScript.Quit 1
End If

shell.Run "cmd /c node """ & fso.BuildPath(here, "server.js") & """", 0, False
