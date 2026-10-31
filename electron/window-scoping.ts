/**
 * Unstuck - Window Scoping & Geometry Guard
 * 
 * Inspects the active foreground window on Windows and returns its identity and geometry.
 * When MINDORA itself owns focus, it selects the uppermost visible external window in
 * Windows' Z order. Application-specific guidance is enabled only for positively
 * identified LibreOffice Calc windows.
 */

import { execFileSync } from 'node:child_process';

export interface WindowBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ForegroundWindowInfo {
  hWnd: number;
  title: string;
  process: string;
  bounds: WindowBounds;
  isCalc: boolean;
}

const POWERSHELL_WIN_INFO_SCRIPT = `
$code = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinScoper {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
$h = [WinScoper]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[WinScoper]::GetWindowText($h, $sb, 256) | Out-Null
$targetPid = [uint32]0
[WinScoper]::GetWindowThreadProcessId($h, [ref]$targetPid) | Out-Null
$r = New-Object WinScoper+RECT
[WinScoper]::GetWindowRect($h, [ref]$r) | Out-Null
$pName = ""
if ($targetPid -gt 0) { $pName = (Get-Process -Id $targetPid -ErrorAction SilentlyContinue).ProcessName }

# If MINDORA owns focus (for example because the user requested a check from its
# window), inspect top-level windows in actual Windows Z order. Never prefer Calc
# or choose a process by enumeration order.
$tStr = $sb.ToString()
$isMindoraInternal = ($tStr -match '^(MINDORA($|\s|\u2014|\u2013|-)|MIKO\s*\u00b7\s*MINDORA)') -and ($pName -in @("electron", "mindora", "unstuck"))
$isLegacyUnstuckInternal = $tStr -match '^Unstuck($|\s|\u2014|\u2013|-)' -and ($pName -in @("electron", "mindora", "unstuck"))
$isSelf = (($pName -in @("mindora", "unstuck")) -or ($pName -eq "electron" -and ($isMindoraInternal -or $isLegacyUnstuckInternal))) -or $h -eq [IntPtr]::Zero
if ($isSelf) {
    $candidate = [WinScoper]::GetTopWindow([IntPtr]::Zero)
    for ($i = 0; $candidate -ne [IntPtr]::Zero -and $i -lt 256; $i++) {
        if ([WinScoper]::IsWindowVisible($candidate) -and -not [WinScoper]::IsIconic($candidate)) {
            $candidateText = New-Object System.Text.StringBuilder 512
            [WinScoper]::GetWindowText($candidate, $candidateText, 512) | Out-Null
            $candidatePid = [uint32]0
            [WinScoper]::GetWindowThreadProcessId($candidate, [ref]$candidatePid) | Out-Null
            $candidateProcess = ""
            if ($candidatePid -gt 0) { $candidateProcess = (Get-Process -Id $candidatePid -ErrorAction SilentlyContinue).ProcessName }
            $candidateTitle = $candidateText.ToString()
            $candidateIsMindora = ($candidateProcess -in @("mindora", "unstuck")) -or ($candidateProcess -eq "electron" -and $candidateTitle -match '^(MINDORA($|\s|\u2014|\u2013|-)|MIKO\s*\u00b7\s*MINDORA|Unstuck($|\s|\u2014|\u2013|-))')
            $candidateIsDesktop = $candidateProcess -eq 'explorer' -and ($candidateTitle -eq '' -or $candidateTitle -eq 'Program Manager' -or $candidateTitle -eq 'Desktop')
            if ($candidateTitle -and -not $candidateIsMindora -and -not $candidateIsDesktop) {
                $h = $candidate
                $sb = $candidateText
                $targetPid = $candidatePid
                $pName = $candidateProcess
                [WinScoper]::GetWindowRect($h, [ref]$r) | Out-Null
                break
            }
        }
        $candidate = [WinScoper]::GetWindow($candidate, 2)
    }
}

@{
    hWnd = $h.ToInt64()
    title = $sb.ToString()
    process = $pName
    left = $r.Left
    top = $r.Top
    right = $r.Right
    bottom = $r.Bottom
    width = ($r.Right - $r.Left)
    height = ($r.Bottom - $r.Top)
} | ConvertTo-Json -Compress
`;

const POWERSHELL_TARGET_WINDOWS_SCRIPT = `
$code = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Runtime.InteropServices;
public class WinTargetEnumerator {
  public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public static List<Dictionary<string, object>> GetTargets() {
    var result = new List<Dictionary<string, object>>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd) || IsIconic(hWnd)) return true;
      var titleBuilder = new StringBuilder(512);
      GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);
      var title = titleBuilder.ToString().Trim();
      if (String.IsNullOrWhiteSpace(title)) return true;
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      string process = "";
      try { process = Process.GetProcessById((int)pid).ProcessName; } catch {}
      RECT rect;
      if (!GetWindowRect(hWnd, out rect)) return true;
      result.Add(new Dictionary<string, object> {
        { "hWnd", hWnd.ToInt64() }, { "title", title }, { "process", process },
        { "left", rect.Left }, { "top", rect.Top }, { "right", rect.Right }, { "bottom", rect.Bottom },
        { "width", rect.Right - rect.Left }, { "height", rect.Bottom - rect.Top }
      });
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@
Add-Type -TypeDefinition $code -ErrorAction Stop
[WinTargetEnumerator]::GetTargets() | ConvertTo-Json -Compress -Depth 4
`;

/**
 * Checks whether the detected window title or process belongs to LibreOffice Calc.
 */
export function isCalcWindow(process: string, title: string): boolean {
  const p = (process || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  const isCalcProcess = p === 'soffice' || p === 'soffice.bin';
  const isCalcTitle = t.includes('libreoffice calc') || (isCalcProcess && (t.includes('chart wizard') || t.includes('insert chart')));

  return isCalcTitle;
}

/**
 * Checks whether the detected window title or process belongs to MINDORA or the legacy Unstuck app.
 */
export function isMindoraWindow(process: string, title: string): boolean {
  const p = (process || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  // If the process is clearly a non-Electron desktop app or editor, it's not Unstuck
  if (p === 'mindora' || p === 'unstuck') return true;
  if (p !== 'electron') {
    return false;
  }

  // Avoid falsely classifying external IDEs/editors/browsers with product text in a document title
  if (
    t.includes('antigravity') ||
    t.includes('visual studio code') ||
    t.includes('code - ') ||
    t.includes('chrome') ||
    t.includes('edge') ||
    t.includes('firefox')
  ) {
    return false;
  }

  // Match MINDORA windows and retain legacy title detection during app migration
  return (
    t === 'mindora' ||
    t === 'miko · mindora' ||
    t.startsWith('mindora coach') ||
    t.startsWith('mindora overlay') ||
    t.startsWith('mindora —') ||
    t.startsWith('mindora -') ||
    t === 'unstuck' ||
    t === 'unstuck coach' ||
    t.startsWith('unstuck coach') ||
    t.startsWith('unstuck —') ||
    t.startsWith('unstuck - find your next move') ||
    t.startsWith('unstuck - less stuck')
  );
}

/**
 * Checks whether the detected window is the desktop / explorer shell background.
 */
export function isDesktopWindow(process: string, title: string, hWnd = 0): boolean {
  const p = (process || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();
  if (hWnd === 0 && !p && !t) return true;
  if (p === 'explorer' && (!t || t === 'program manager' || t === 'desktop')) return true;
  return false;
}

/**
 * Validates whether a foreground window is a valid external target application.
 * Excludes Unstuck itself and desktop/explorer shell surfaces.
 */
export function isValidTargetWindow(info: ForegroundWindowInfo): boolean {
  if (info.hWnd === 0 && !info.title && !info.process) return false;
  if (isMindoraWindow(info.process, info.title)) return false;
  if (isDesktopWindow(info.process, info.title, info.hWnd)) return false;
  return true;
}

/**
 * Queries the active foreground window geometry and identity.
 */
export function getForegroundWindowInfo(): ForegroundWindowInfo {
  try {
    const stdout = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_WIN_INFO_SCRIPT], {
      encoding: 'utf-8',
      timeout: 3000
    });

    const parsed = JSON.parse(stdout.trim());
    const bounds: WindowBounds = {
      left: Number(parsed.left) || 0,
      top: Number(parsed.top) || 0,
      right: Number(parsed.right) || 0,
      bottom: Number(parsed.bottom) || 0,
      width: Number(parsed.width) || 0,
      height: Number(parsed.height) || 0
    };

    const isCalc = isCalcWindow(parsed.process, parsed.title);

    return {
      hWnd: Number(parsed.hWnd) || 0,
      title: String(parsed.title || ''),
      process: String(parsed.process || ''),
      bounds,
      isCalc
    };
  } catch (err) {
    // Fallback if PowerShell call fails
    return {
      hWnd: 0,
      title: '',
      process: '',
      bounds: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
      isCalc: false
    };
  }
}

/** Returns visible, non-minimized external top-level windows in Windows Z order. */
export function getVisibleTargetWindows(): ForegroundWindowInfo[] {
  if (process.platform !== 'win32') return [];
  try {
    const stdout = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_TARGET_WINDOWS_SCRIPT], {
      encoding: 'utf-8', timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024
    });
    const parsed = JSON.parse(stdout.trim() || '[]') as Array<Record<string, unknown>> | Record<string, unknown>;
    const rows = parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => {
      const process = String(row.process || '');
      const title = String(row.title || '');
      return {
        hWnd: Number(row.hWnd) || 0, title, process,
        bounds: {
          left: Number(row.left) || 0, top: Number(row.top) || 0,
          right: Number(row.right) || 0, bottom: Number(row.bottom) || 0,
          width: Number(row.width) || 0, height: Number(row.height) || 0
        },
        isCalc: isCalcWindow(process, title)
      };
    }).filter((info) => info.hWnd > 0 && info.title && info.bounds.width >= 120 && info.bounds.height >= 80 && isValidTargetWindow(info)).slice(0, 80);
  } catch {
    return [];
  }
}

/**
 * Checks if a bounding box (in physical capture pixel space) falls within the window bounds.
 * Allows a small tolerance for attached menus, dropdown popups, and titlebar margins.
 */
export function isBoxWithinWindow(
  box: { x: number; y: number; width: number; height: number },
  windowBounds: WindowBounds,
  scaleFactor = 1.25,
  toleranceLogical = 120
): boolean {
  // If window bounds are 0x0 (e.g. desktop unqueried), do not filter out
  if (windowBounds.width <= 0 || windowBounds.height <= 0) {
    return true;
  }

  // Convert box to logical desktop space for comparison with OS window bounds
  const logicalX = box.x / scaleFactor;
  const logicalY = box.y / scaleFactor;
  const logicalRight = (box.x + box.width) / scaleFactor;
  const logicalBottom = (box.y + box.height) / scaleFactor;

  const minX = windowBounds.left - toleranceLogical;
  const maxX = windowBounds.right + toleranceLogical;
  const minY = windowBounds.top - toleranceLogical;
  const maxY = windowBounds.bottom + toleranceLogical;

  return (
    logicalX >= minX &&
    logicalRight <= maxX &&
    logicalY >= minY &&
    logicalBottom <= maxY
  );
}
