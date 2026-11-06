param([string]$Light, [string]$Dark, [string]$Output, [string]$WebsiteOutput)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$lightWindow = [Drawing.Bitmap]::new($Light)
$darkWindow = [Drawing.Bitmap]::new($Dark)
$width = $lightWindow.Width
$height = $lightWindow.Height
$combined = [Drawing.Bitmap]::new($width, $height)
$graphics = [Drawing.Graphics]::FromImage($combined)
$darkHalf = [Drawing.Drawing2D.GraphicsPath]::new()
$canvas = [Drawing.Bitmap]::new(1920, 1080)
$canvasGraphics = [Drawing.Graphics]::FromImage($canvas)
try {
    if ($width -ne $darkWindow.Width -or $height -ne $darkWindow.Height) {
        throw 'The light and dark window captures must have the same dimensions.'
    }
    if ($width -gt $canvas.Width -or $height -gt $canvas.Height) {
        throw 'The window exceeds the Store screenshot canvas.'
    }

    $windowBounds = [Drawing.Rectangle]::new(0, 0, $width, $height)
    $graphics.DrawImage($lightWindow, $windowBounds, $windowBounds, [Drawing.GraphicsUnit]::Pixel)
    $darkHalf.AddPolygon([Drawing.Point[]]@(
        [Drawing.Point]::new(0, 0), [Drawing.Point]::new($width, 0), [Drawing.Point]::new($width, $height)
    ))
    $graphics.SetClip($darkHalf)
    $graphics.DrawImage($darkWindow, $windowBounds, $windowBounds, [Drawing.GraphicsUnit]::Pixel)
    $graphics.Flush()

    $canvasGraphics.Clear([Drawing.Color]::FromArgb(221, 221, 221))
    $x = [int](($canvas.Width - $width) / 2)
    $y = [int](($canvas.Height - $height) / 2)
    $destination = [Drawing.Rectangle]::new($x, $y, $width, $height)
    $canvasGraphics.DrawImage($combined, $destination, $windowBounds, [Drawing.GraphicsUnit]::Pixel)
    $canvas.Save($Output, [Drawing.Imaging.ImageFormat]::Png)
    if ($WebsiteOutput) { $combined.Save($WebsiteOutput, [Drawing.Imaging.ImageFormat]::Png) }
} finally {
    $canvasGraphics.Dispose()
    $canvas.Dispose()
    $darkHalf.Dispose()
    $graphics.Dispose()
    $combined.Dispose()
    $darkWindow.Dispose()
    $lightWindow.Dispose()
}
