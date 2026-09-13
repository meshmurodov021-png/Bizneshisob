Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [float]$x,
    [float]$y,
    [float]$w,
    [float]$h,
    [float]$r
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [float]($r * 2)
  if ($d -gt $w) { $d = $w }
  if ($d -gt $h) { $d = $h }
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-Icon {
  param([int]$Size, [string]$OutPath)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

  $radius = [float]($Size * 0.225)
  $bgPath = New-RoundedRectPath -x 0 -y 0 -w $Size -h $Size -r $radius
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.Point]::new(0, 0),
    [System.Drawing.Point]::new($Size, $Size),
    [System.Drawing.Color]::FromArgb(255, 0xC4, 0xB0, 0xFF),
    [System.Drawing.Color]::FromArgb(255, 0x5B, 0x3D, 0xF5)
  )
  $g.FillPath($brush, $bgPath)

  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $barW = [float]($Size * 0.1195)
  $gap = [float]($Size * 0.0506)
  $startX = [float]($Size * 0.270)
  $containerTop = [float]($Size * 0.250)
  $containerH = [float]($Size * 0.540)
  $rx = [float]($barW / 2)

  $heights = @(0.46, 1.0, 0.70)
  for ($i = 0; $i -lt 3; $i++) {
    $bh = [float]($containerH * $heights[$i])
    $bx = $startX + $i * ($barW + $gap)
    $by = $containerTop + $containerH - $bh
    $barPath = New-RoundedRectPath -x $bx -y $by -w $barW -h $bh -r $rx
    $g.FillPath($white, $barPath)
    $barPath.Dispose()
  }

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $white.Dispose()
  $brush.Dispose()
  $bgPath.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

$iconDir = $PSScriptRoot
$sizes = @(72, 96, 128, 144, 152, 192, 384, 512)
foreach ($s in $sizes) {
  $path = Join-Path $iconDir "icon-$s.png"
  Draw-Icon -Size $s -OutPath $path
  Write-Host "OK $path"
}

Draw-Icon -Size 180 -OutPath (Join-Path $iconDir "apple-touch-icon.png")
Write-Host "OK apple-touch-icon.png"
Draw-Icon -Size 1024 -OutPath (Join-Path $iconDir "icon-source.png")
Write-Host "OK icon-source.png"
