<#
  Creates a "Claude Skills" shortcut in your Start menu.

    .\install-shortcut.ps1                    # Start menu
    .\install-shortcut.ps1 -Desktop           # Start menu + Desktop
    .\install-shortcut.ps1 -Remove            # delete the shortcuts again
    .\install-shortcut.ps1 -Name "My Skills"  # name it something else, so your
                                              # own copy can sit beside the
                                              # original instead of replacing it

  Normally driven by `claude-skills-manager install-shortcut`, which passes
  -Name for you. It still works on its own.

  The shortcut targets wscript.exe (a real executable), which is what lets
  Windows pin it to the Start menu and the taskbar.
#>
[CmdletBinding()]
param(
  [switch]$Desktop,
  [switch]$Remove,
  [string]$Name = 'Claude Skills'
)

$ErrorActionPreference = 'Stop'

$appDir   = $PSScriptRoot
$startDir = [Environment]::GetFolderPath('Programs')
$targets  = @(Join-Path $startDir "$Name.lnk")

if ($Desktop -or $Remove) {
  $targets += Join-Path ([Environment]::GetFolderPath('Desktop')) "$Name.lnk"
}

if ($Remove) {
  foreach ($path in $targets) {
    if (Test-Path $path) { Remove-Item $path -Force; "Removed $path" }
  }
  return
}

$icon = Join-Path $appDir 'assets\icon.ico'
if (-not (Test-Path $icon)) {
  & node (Join-Path $appDir 'tools\make-icon.js') | Out-Null
}

$launcher = Join-Path $appDir 'launch.vbs'
if (-not (Test-Path $launcher)) { throw "Cannot find $launcher" }

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shell = New-Object -ComObject WScript.Shell

foreach ($path in ($targets | Select-Object -Unique)) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath       = $wscript
  $lnk.Arguments        = '"{0}"' -f $launcher
  $lnk.WorkingDirectory = $appDir
  $lnk.IconLocation     = "$icon,0"
  $lnk.Description      = 'See and manage your Claude Code skills'
  $lnk.WindowStyle      = 7   # minimised; the launcher is windowless anyway
  $lnk.Save()
  "Created $path"
}
