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

  $purple = [System.Drawing.Color]::FromArgb(255, 0x7C, 0x3A, 0xED)
  $white = [System.Drawing.Color]::White
  $radius = [float]($Size * 0.2)

  $bgPath = New-RoundedRectPath -x 0 -y 0 -w $Size -h $Size -r $radius
  $g.FillPath((New-Object System.Drawing.SolidBrush $purple), $bgPath)

  $pad = [float]($Size * 0.22)
  $chartW = [float]($Size - 2 * $pad)
  $chartH = [float]($Size - 2 * $pad)
  $baseY = $pad + $chartH

  $barW = [float]($chartW * 0.14)
  $gap = [float]($chartW * 0.06)
  $startX = [float]($pad + $chartW * 0.08)
  $heights = @(0.32, 0.48, 0.58, 0.72)

  $whiteBrush = New-Object System.Drawing.SolidBrush $white
  $barIndex = 0
  foreach ($hRatio in $heights) {
    $bx = $startX + $barIndex * ($barW + $gap)
    $bh = $chartH * $hRatio
    $by = $baseY - $bh
    $g.FillRectangle($whiteBrush, $bx, $by, $barW, $bh)
    $barIndex++
  }

  $penWidth = [float][math]::Max(2, $Size * 0.045)
  $linePen = New-Object System.Drawing.Pen($white, $penWidth)
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $points = @(
    [System.Drawing.PointF]::new($pad + $chartW * 0.06, $baseY - $chartH * 0.38),
    [System.Drawing.PointF]::new($pad + $chartW * 0.32, $baseY - $chartH * 0.52),
    [System.Drawing.PointF]::new($pad + $chartW * 0.52, $baseY - $chartH * 0.62),
    [System.Drawing.PointF]::new($pad + $chartW * 0.78, $baseY - $chartH * 0.82)
  )
  $g.DrawLines($linePen, $points)

  $dotR = [float][math]::Max(2, $Size * 0.028)
  foreach ($pt in $points) {
    $g.FillEllipse($whiteBrush, $pt.X - $dotR, $pt.Y - $dotR, $dotR * 2, $dotR * 2)
  }

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $linePen.Dispose()
  $whiteBrush.Dispose()
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
