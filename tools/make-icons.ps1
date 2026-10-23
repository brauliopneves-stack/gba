# Draws the app icons (indigo GBA-style tile with a cartridge) into icons/
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw([int]$size, [string]$name, [float]$inset, [string]$dir = $out) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $s = $size / 512.0

  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF 0, $size), ([System.Drawing.Color]::FromArgb(0x5a, 0x4a, 0xbd)), ([System.Drawing.Color]::FromArgb(0x2b, 0x23, 0x65))
  $g.FillRectangle($bg, 0, 0, $size, $size)

  # Cartridge, scaled down for the maskable safe zone
  $k = $s * $inset
  $ox = ($size - 300 * $k) / 2
  $oy = ($size - 236 * $k) / 2 - 18 * $k
  $shell = RoundRect $ox $oy (300 * $k) (236 * $k) (22 * $k)
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0xd3, 0xd0, 0xdf))), $shell)
  $ridge = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0x9c, 0x98, 0xb0))
  for ($i = 0; $i -lt 12; $i++) {
    $g.FillRectangle($ridge, $ox + (70 + $i * 14) * $k, $oy + 14 * $k, 6 * $k, 18 * $k)
  }
  $label = RoundRect ($ox + 26 * $k) ($oy + 46 * $k) (248 * $k) (164 * $k) (12 * $k)
  $lb = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, ($oy + 46 * $k)), (New-Object System.Drawing.PointF 0, ($oy + 210 * $k)), ([System.Drawing.Color]::FromArgb(0xff, 0x5d, 0x73)), ([System.Drawing.Color]::FromArgb(0x4e, 0x6c, 0xff))
  $g.FillPath($lb, $label)

  $font = New-Object System.Drawing.Font 'Arial Black', ([float](64 * $k)), ([System.Drawing.FontStyle]::Italic), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF ($ox + 26 * $k), ($oy + 46 * $k), (248 * $k), (164 * $k)
  $shadowRect = New-Object System.Drawing.RectangleF ($rect.X + 4 * $k), ($rect.Y + 4 * $k), $rect.Width, $rect.Height
  $g.DrawString('GBA', $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 0, 0, 0))), $shadowRect, $fmt)
  $g.DrawString('GBA', $font, [System.Drawing.Brushes]::White, $rect, $fmt)

  # Link arrows under the cartridge
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([float](14 * $k))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $cy = $oy + 280 * $k
  $cx = $size / 2
  $g.DrawLine($pen, $cx - 80 * $k, $cy, $cx + 80 * $k, $cy)
  $g.DrawLine($pen, $cx + 80 * $k, $cy, $cx + 55 * $k, $cy - 22 * $k)
  $g.DrawLine($pen, $cx - 80 * $k, $cy, $cx - 55 * $k, $cy + 22 * $k)

  $bmp.Save((Join-Path $dir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw 512 'icon-512.png' 1.0
Draw 192 'icon-192.png' 1.0
Draw 180 'apple-touch-icon.png' 1.0
Draw 512 'icon-maskable-512.png' 0.78
# Native iPhone app icon (iOS rounds the corners itself)
Draw 1024 'icon-1024.png' 1.0 (Join-Path $PSScriptRoot '..\ios\Sources\Assets.xcassets\AppIcon.appiconset')
