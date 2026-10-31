param([switch]$Cleanup)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MindoraSmokeWindowCloser {
    private delegate bool EnumWindowsCallback(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, System.Text.StringBuilder text, int maxCount);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    public static void CloseProcessWindows(int targetProcessId) {
        EnumWindows((window, state) => {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processId == targetProcessId && IsWindowVisible(window)) PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
    }
    public static string[] GetProcessWindowTitles(int[] targetProcessIds) {
        var targets = new System.Collections.Generic.HashSet<int>(targetProcessIds ?? new int[0]);
        var titles = new System.Collections.Generic.List<string>();
        EnumWindows((window, state) => {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (targets.Contains((int)processId) && IsWindowVisible(window)) {
                var text = new System.Text.StringBuilder(512);
                GetWindowText(window, text, text.Capacity);
                if (text.Length > 0) titles.Add(text.ToString());
            }
            return true;
        }, IntPtr.Zero);
        return titles.ToArray();
    }
}
'@

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.installer-smoke-test'))
$installerPath = Join-Path $repoRoot 'dist\MINDORA-Setup-x64.exe'
$installPath = Join-Path $testRoot 'application'
$appDataPath = Join-Path $testRoot 'appdata'
$localAppDataPath = Join-Path $testRoot 'local-appdata'
$sentinelPath = Join-Path (Join-Path $appDataPath 'MINDORA') 'preservation-sentinel.txt'

if ($Cleanup) {
  $resolvedRepo = [IO.Path]::GetFullPath($repoRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolvedTest = [IO.Path]::GetFullPath($testRoot)
  if (-not $resolvedTest.StartsWith($resolvedRepo, [StringComparison]::OrdinalIgnoreCase)) { throw 'Smoke-test cleanup path escaped the repository root.' }
  $appPath = Join-Path $installPath 'MINDORA.exe'
  $pids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appPath } | ForEach-Object Id)
  foreach ($processId in $pids) { [MindoraSmokeWindowCloser]::CloseProcessWindows($processId) }
  Start-Sleep -Seconds 3
  foreach ($processId in $pids) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc) { $proc.Kill(); $proc.WaitForExit() }
  }
  $uninstaller = Get-ChildItem -LiteralPath $installPath -Filter '*uninstall*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
  if ($uninstaller) { Start-Process -FilePath $uninstaller -ArgumentList @('/S') -Wait -WindowStyle Hidden }
  if (Test-Path -LiteralPath $sentinelPath) { Write-Output 'Isolated preservation sentinel remains intact.' }
  if (Test-Path -LiteralPath $resolvedTest) { Remove-Item -LiteralPath $resolvedTest -Recurse -Force }
  Write-Output 'Removed only the isolated installer-smoke test installation.'
  return
}

if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) { throw "Installer not found: $installerPath" }
if (Test-Path -LiteralPath $testRoot) { throw "Smoke-test path already exists; refusing to overwrite it: $testRoot" }

New-Item -ItemType Directory -Path (Split-Path -Parent $sentinelPath) -Force | Out-Null
New-Item -ItemType Directory -Path $localAppDataPath -Force | Out-Null
Set-Content -LiteralPath $sentinelPath -Value 'keep-this-user-data' -NoNewline

$installer = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$installPath") -PassThru -Wait -WindowStyle Hidden
if ($installer.ExitCode -ne 0) { throw "Installer returned exit code $($installer.ExitCode)." }

$appPath = Join-Path $installPath 'MINDORA.exe'
$uninstallerPath = Get-ChildItem -LiteralPath $installPath -Filter '*uninstall*.exe' -File | Select-Object -First 1 -ExpandProperty FullName
if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) { throw 'Installed MINDORA.exe is missing.' }
if (-not $uninstallerPath) { throw 'The installed uninstaller is missing.' }

$programsPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
$startMenuShortcut = Get-ChildItem -LiteralPath $programsPath -Filter 'MINDORA.lnk' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $startMenuShortcut) { throw 'The MINDORA Start Menu shortcut was not created.' }

$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $appPath
$startInfo.WorkingDirectory = $installPath
$startInfo.UseShellExecute = $false
$startInfo.Environment['MINDORA_USER_DATA_DIR'] = Join-Path $appDataPath 'MINDORA'
$startInfo.Environment['MINDORA_SMOKE_TEST'] = '1'
$app = [Diagnostics.Process]::Start($startInfo)
if (-not $app) { throw 'Could not start the installed MINDORA application.' }

$windowFound = $false
$petWindowFound = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Seconds 1
  $app.Refresh()
  if ($app.HasExited) { throw "Installed MINDORA exited during startup with code $($app.ExitCode)." }
  $matchingPids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appPath } | ForEach-Object Id)
  $titles = [MindoraSmokeWindowCloser]::GetProcessWindowTitles($matchingPids)
  if ($titles | Where-Object { $_.StartsWith('MINDORA', [StringComparison]::OrdinalIgnoreCase) -and $_ -notmatch 'Coach|Overlay|MIKO' }) { $windowFound = $true }
  if ($titles | Where-Object { $_ -match '^MIKO' }) { $petWindowFound = $true }
  if ($windowFound -and $petWindowFound) { break }
}
if (-not $windowFound) { throw 'The installed app did not create its MINDORA main window within 45 seconds.' }
if (-not $petWindowFound) { throw 'The installed app did not create its independent MIKO desktop window within 45 seconds.' }

$shell = New-Object -ComObject WScript.Shell
if (-not $shell.AppActivate($app.Id)) { throw 'Could not activate isolated MINDORA smoke-test process.' }
$shell.SendKeys('%{F4}')
Start-Sleep -Seconds 2
$matchingPids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appPath } | ForEach-Object Id)
$titlesAfterMainClose = [MindoraSmokeWindowCloser]::GetProcessWindowTitles($matchingPids)
if ($app.HasExited) { throw 'MINDORA exited when only the main window was closed; the companion did not remain independent.' }
if (-not ($titlesAfterMainClose | Where-Object { $_ -match '^MIKO' })) { throw 'The independent MIKO window did not remain visible after the main window closed.' }
$shell.SendKeys('^+{F12}')
if (-not $app.WaitForExit(15000)) { throw 'Installed MINDORA did not shut down through app.quit() in the smoke-test run.' }
$app.Dispose()

if (-not (Test-Path -LiteralPath $sentinelPath -PathType Leaf)) { throw 'The app modified or removed the isolated user-data sentinel.' }
$uninstall = Start-Process -FilePath $uninstallerPath -ArgumentList @('/S') -PassThru -Wait -WindowStyle Hidden
if ($uninstall.ExitCode -ne 0) { throw "Uninstaller returned exit code $($uninstall.ExitCode)." }
if (Test-Path -LiteralPath $appPath) { throw 'MINDORA.exe remains after uninstall.' }
if (-not (Test-Path -LiteralPath $sentinelPath -PathType Leaf)) { throw 'Uninstall removed user data; expected preservation sentinel is missing.' }

Write-Output "Installer, Start Menu shortcut, installed launch, independent MIKO window, main-window close with companion persistence, explicit shutdown, uninstaller, and user-data preservation passed."
Write-Output "Isolated user-data sentinel survived uninstall: $sentinelPath"

$resolvedRepo = [IO.Path]::GetFullPath($repoRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$resolvedTest = [IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTest.StartsWith($resolvedRepo, [StringComparison]::OrdinalIgnoreCase)) { throw 'Smoke-test cleanup path escaped the repository root.' }
Remove-Item -LiteralPath $resolvedTest -Recurse -Force
