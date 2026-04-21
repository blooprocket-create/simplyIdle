Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Add-CoverImage {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$ImagePath,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $image = [System.Drawing.Image]::FromFile((Resolve-Path $ImagePath))
  try {
    $destRect = New-Object System.Drawing.RectangleF($X, $Y, $Width, $Height)
    $destRatio = $Width / $Height
    $srcRatio = $image.Width / $image.Height

    if ($srcRatio -gt $destRatio) {
      $srcHeight = $image.Height
      $srcWidth = [int]([math]::Round($image.Height * $destRatio))
      $srcX = [int]([math]::Round(($image.Width - $srcWidth) / 2))
      $srcY = 0
    }
    else {
      $srcWidth = $image.Width
      $srcHeight = [int]([math]::Round($image.Width / $destRatio))
      $srcX = 0
      $srcY = [int]([math]::Round(($image.Height - $srcHeight) / 2))
    }

    $srcRect = New-Object System.Drawing.Rectangle($srcX, $srcY, $srcWidth, $srcHeight)
    $clipPath = New-RoundedRectPath -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
    $Graphics.SetClip($clipPath)
    $Graphics.DrawImage($image, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $Graphics.ResetClip()

    $overlayBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      ([System.Drawing.PointF]::new($X, $Y)),
      ([System.Drawing.PointF]::new($X, ($Y + $Height))),
      ([System.Drawing.Color]::FromArgb(14, 255, 255, 255)),
      ([System.Drawing.Color]::FromArgb(120, 4, 8, 15))
    )
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(115, 255, 214, 143), 2)

    $Graphics.FillPath($overlayBrush, $clipPath)
    $Graphics.DrawPath($borderPen, $clipPath)

    $overlayBrush.Dispose()
    $borderPen.Dispose()
    $clipPath.Dispose()
  }
  finally {
    $image.Dispose()
  }
}

$width = 1200
$height = 630
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$pngOutputPath = Join-Path $repoRoot 'assets\social-preview.png'
$jpgOutputPath = Join-Path $repoRoot 'assets\social-preview.jpg'

function Get-Encoder {
  param([string]$MimeType)

  return [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq $MimeType } | Select-Object -First 1
}

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

try {
  $backgroundRect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
  $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $backgroundRect,
    ([System.Drawing.Color]::FromArgb(255, 5, 9, 15)),
    ([System.Drawing.Color]::FromArgb(255, 18, 30, 48)),
    20
  )
  $graphics.FillRectangle($backgroundBrush, $backgroundRect)

  $glowBrushA = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 255, 130, 70))
  $glowBrushB = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 89, 181, 255))
  $glowBrushC = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(58, 255, 214, 143))
  $graphics.FillEllipse($glowBrushA, 680, -90, 360, 360)
  $graphics.FillEllipse($glowBrushB, 870, 40, 280, 280)
  $graphics.FillEllipse($glowBrushC, 645, 360, 420, 250)

  $gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(26, 255, 255, 255), 1)
  foreach ($x in 640, 760, 880, 1000, 1120) {
    $graphics.DrawLine($gridPen, $x, 0, $x, $height)
  }
  foreach ($y in 70, 190, 310, 430, 550) {
    $graphics.DrawLine($gridPen, 610, $y, $width, $y)
  }

  $panelPath = New-RoundedRectPath -X 44 -Y 42 -Width 520 -Height 546 -Radius 32
  $panelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(178, 7, 13, 22))
  $panelBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(72, 255, 214, 143), 2)
  $graphics.FillPath($panelBrush, $panelPath)
  $graphics.DrawPath($panelBorder, $panelPath)

  $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 214, 143))
  $graphics.FillRectangle($accentBrush, 74, 86, 92, 6)

  $badgePath = New-RoundedRectPath -X 74 -Y 106 -Width 208 -Height 38 -Radius 18
  $badgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(58, 255, 214, 143))
  $badgeBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 214, 143), 1.5)
  $graphics.FillPath($badgeBrush, $badgePath)
  $graphics.DrawPath($badgeBorder, $badgePath)

  $titleFont = New-Object System.Drawing.Font('Georgia', 56, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subtitleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $bodyFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $badgeFont = New-Object System.Drawing.Font('Segoe UI Semibold', 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $footerFont = New-Object System.Drawing.Font('Segoe UI Semibold', 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 247, 250))
  $softBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(228, 196, 205, 216))
  $footerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 255, 214, 143))
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(92, 0, 0, 0))

  $graphics.DrawString('IDLE RPG  AUTO-BATTLER', $badgeFont, $whiteBrush, 88, 114)
  $graphics.DrawString('SIMPLY', $titleFont, $shadowBrush, 78, 169)
  $graphics.DrawString('SIMPLY', $titleFont, $whiteBrush, 74, 164)
  $graphics.DrawString('IDLE', $titleFont, $shadowBrush, 78, 238)
  $graphics.DrawString('IDLE', $titleFont, $whiteBrush, 74, 233)

  $subtitleRect = New-Object System.Drawing.RectangleF(74, 327, 430, 88)
  $bodyRect = New-Object System.Drawing.RectangleF(74, 405, 430, 96)
  $graphics.DrawString('Build your roster. Push deeper waves. Rebirth stronger.', $subtitleFont, $softBrush, $subtitleRect)
  $graphics.DrawString('Command a growing lineup of heroes across an idle progression warfront built for long-term power climbs.', $bodyFont, $softBrush, $bodyRect)
  $graphics.DrawString('simply-idle.vercel.app', $footerFont, $footerBrush, 74, 535)

  foreach ($shadow in @(
    @{ X = 646; Y = 94; W = 176; H = 404; R = 28 },
    @{ X = 804; Y = 56; W = 208; H = 456; R = 30 },
    @{ X = 988; Y = 112; W = 164; H = 388; R = 28 }
  )) {
    $shadowPath = New-RoundedRectPath -X ($shadow.X + 10) -Y ($shadow.Y + 12) -Width $shadow.W -Height $shadow.H -Radius $shadow.R
    $graphics.FillPath($shadowBrush, $shadowPath)
    $shadowPath.Dispose()
  }

  Add-CoverImage -Graphics $graphics -ImagePath (Join-Path $repoRoot 'IMG\HeroIcon\LeviathanDepths.png') -X 646 -Y 94 -Width 176 -Height 404 -Radius 28
  Add-CoverImage -Graphics $graphics -ImagePath (Join-Path $repoRoot 'IMG\HeroIcon\PhoenixEternal.png') -X 804 -Y 56 -Width 208 -Height 456 -Radius 30
  Add-CoverImage -Graphics $graphics -ImagePath (Join-Path $repoRoot 'IMG\HeroIcon\CelestialArchitect.png') -X 988 -Y 112 -Width 164 -Height 388 -Radius 28

  $highlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), 2)
  $graphics.DrawArc($highlightPen, 742, 22, 350, 350, 208, 92)

  $bitmap.Save($pngOutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $jpegCodec = Get-Encoder 'image/jpeg'
  if ($null -eq $jpegCodec) {
    throw 'JPEG encoder not available.'
  }

  $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 92L)
  $bitmap.Save($jpgOutputPath, $jpegCodec, $encoderParameters)

  $encoderParameters.Dispose()
  Write-Output "Created $pngOutputPath"
  Write-Output "Created $jpgOutputPath"
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}