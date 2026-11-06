param([int]$ProcessId, [string]$Output, [ValidateSet('Capture','Close','Hotkey')][string]$Action = 'Capture', [string]$Shortcut)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class TimerCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd,int attribute,out Rect rect,int size);
}
'@
[TimerCapture]::SetProcessDPIAware() | Out-Null
[TimerCapture]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$timerProcess = Get-Process -Id $ProcessId
if ($Action -eq 'Hotkey') {
    if ($timerProcess.ProcessName -ne 'timer') { throw 'Expected the owned timer test process.' }
    $timerKeys = switch ($Shortcut) {
        'Ctrl+Shift+F11' { '^+{F11}' }
        'Ctrl+Shift+F10' { '^+{F10}' }
        default { throw 'Unrecognized test shortcut.' }
    }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait($timerKeys)
    exit
}
if ($timerProcess.MainWindowHandle -eq 0) { throw 'No visible timer window.' }
if ($Action -eq 'Close') {
    [TimerCapture]::PostMessage($timerProcess.MainWindowHandle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null
    exit
}
$timerRect = New-Object TimerCapture+Rect
[TimerCapture]::GetWindowRect($timerProcess.MainWindowHandle,[ref]$timerRect) | Out-Null
$timerWidth = $timerRect.Right-$timerRect.Left
$timerHeight = $timerRect.Bottom-$timerRect.Top
if ($timerWidth -lt 100 -or $timerHeight -lt 100) { throw 'Invalid timer window bounds.' }
$timerWindow = New-Object Drawing.Bitmap($timerWidth,$timerHeight)
$timerGraphics = [Drawing.Graphics]::FromImage($timerWindow)
$timerDc = $timerGraphics.GetHdc()
try { $timerCaptured = [TimerCapture]::PrintWindow($timerProcess.MainWindowHandle,$timerDc,2) }
finally { $timerGraphics.ReleaseHdc($timerDc) }
if (!$timerCaptured) { throw 'Native window capture failed.' }
$timerFrame = New-Object TimerCapture+Rect
$timerDwmResult = [TimerCapture]::DwmGetWindowAttribute($timerProcess.MainWindowHandle,9,[ref]$timerFrame,16)
if ($timerDwmResult -ne 0) { $timerFrame = $timerRect }
$timerFrameWidth = $timerFrame.Right-$timerFrame.Left
$timerFrameHeight = $timerFrame.Bottom-$timerFrame.Top
if ($timerFrameWidth -gt 1920 -or $timerFrameHeight -gt 1080) { throw 'Native window exceeds screenshot canvas.' }
$timerSource = New-Object Drawing.Rectangle(($timerFrame.Left-$timerRect.Left),($timerFrame.Top-$timerRect.Top),$timerFrameWidth,$timerFrameHeight)
$timerCrop = $timerWindow.Clone($timerSource, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
    $timerCrop.Save($Output,[Drawing.Imaging.ImageFormat]::Png)
} finally {
    $timerCrop.Dispose()
    $timerGraphics.Dispose()
    $timerWindow.Dispose()
}
