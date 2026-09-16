Add-Type -AssemblyName System.Drawing

$size = 64
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Outer glow gradient (Cyan to Indigo)
$rect = New-Object System.Drawing.Rectangle 2, 2, 60, 60
$c1 = [System.Drawing.Color]::FromArgb(255, 6, 182, 212)
$c2 = [System.Drawing.Color]::FromArgb(255, 99, 102, 241)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45.0
$g.FillEllipse($brush, 2, 2, 60, 60)

# Inner dark circle
$innerColor = [System.Drawing.Color]::FromArgb(255, 11, 17, 32)
$innerBrush = New-Object System.Drawing.SolidBrush $innerColor
$g.FillEllipse($innerBrush, 6, 6, 52, 52)

# High-tech Cyberpunk 'H' Logo (Vector geometric)
$logoColor = [System.Drawing.Color]::FromArgb(255, 34, 211, 238)
$logoBrush = New-Object System.Drawing.SolidBrush $logoColor

# Left vertical pillar
$g.FillRectangle($logoBrush, 20, 18, 6, 28)
# Right vertical pillar
$g.FillRectangle($logoBrush, 38, 18, 6, 28)
# Horizontal connecting crossbar
$g.FillRectangle($logoBrush, 20, 29, 24, 6)

# Glowing accent top-right dot
$dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 129, 140, 248))
$g.FillEllipse($dotBrush, 43, 11, 7, 7)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$icoPath = Join-Path $PSScriptRoot "app.ico"
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()

$icon.Dispose()
$bmp.Dispose()
$g.Dispose()

Write-Host "Icon successfully generated at: $icoPath" -ForegroundColor Green
