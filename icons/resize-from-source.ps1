Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\User\.cursor\projects\c-Users-User-Desktop-Cursor-new-webb\assets\c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_c69487962b3f3166567a660130e4f434_images_image-68ef2e1e-e557-413f-b717-2234811a027e.png"
$iconDir = $PSScriptRoot

function Save-ResizedIcon {
  param([System.Drawing.Image]$Source, [int]$Size, [string]$OutPath)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $srcW = $Source.Width
  $srcH = $Source.Height
  $side = [Math]::Min($srcW, $srcH)
  $cropX = [int](($srcW - $side) / 2)
  $cropY = [int](($srcH - $side) / 2)

  $dest = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
  $srcRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side
  $g.DrawImage($Source, $dest, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

$source = [System.Drawing.Image]::FromFile($srcPath)
try {
  $sizes = @(72, 96, 128, 144, 152, 192, 384, 512)
  foreach ($s in $sizes) {
    $out = Join-Path $iconDir "icon-$s.png"
    Save-ResizedIcon -Source $source -Size $s -OutPath $out
    Write-Host "OK $out"
  }
  Save-ResizedIcon -Source $source -Size 180 -OutPath (Join-Path $iconDir "apple-touch-icon.png")
  Write-Host "OK apple-touch-icon.png"
}
finally {
  $source.Dispose()
}
