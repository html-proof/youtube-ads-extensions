Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'

    # Background - red gradient rounded rect
    $pt1 = New-Object System.Drawing.Point(0, 0)
    $pt2 = New-Object System.Drawing.Point($size, $size)
    $color1 = [System.Drawing.Color]::FromArgb(255, 255, 78, 80)
    $color2 = [System.Drawing.Color]::FromArgb(255, 198, 40, 40)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($pt1, $pt2, $color1, $color2)

    $r = [Math]::Max(2, [int]($size * 0.2))
    $d = $r * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc(($size - $d), 0, $d, $d, 270, 90)
    $path.AddArc(($size - $d), ($size - $d), $d, $d, 0, 90)
    $path.AddArc(0, ($size - $d), $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)

    # Draw arrows
    $penWidth = [Math]::Max(1.5, $size * 0.08)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $penWidth)
    $pen.StartCap = 'Round'
    $pen.EndCap = 'Round'

    $cx = $size / 2.0
    $cy = $size / 2.0
    $arm = $size * 0.25
    $ah = $size * 0.1

    # Top arrow (pointing right)
    $topY = $cy - $size * 0.12
    $g.DrawLine($pen, [float]($cx - $arm), [float]$topY, [float]($cx + $arm), [float]$topY)
    $g.DrawLine($pen, [float]($cx + $arm - $ah), [float]($topY - $ah), [float]($cx + $arm), [float]$topY)
    $g.DrawLine($pen, [float]($cx + $arm - $ah), [float]($topY + $ah), [float]($cx + $arm), [float]$topY)

    # Bottom arrow (pointing left)
    $botY = $cy + $size * 0.12
    $g.DrawLine($pen, [float]($cx + $arm), [float]$botY, [float]($cx - $arm), [float]$botY)
    $g.DrawLine($pen, [float]($cx - $arm + $ah), [float]($botY - $ah), [float]($cx - $arm), [float]$botY)
    $g.DrawLine($pen, [float]($cx - $arm + $ah), [float]($botY + $ah), [float]($cx - $arm), [float]$botY)

    # Green dot
    $dotR = [Math]::Max(1.0, $size * 0.06)
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 211, 153))
    $dotX = $cx + $arm + $size * 0.06 - $dotR
    $dotY = $cy - $dotR
    $g.FillEllipse($dotBrush, [float]$dotX, [float]$dotY, [float]($dotR * 2), [float]($dotR * 2))

    $pen.Dispose()
    $brush.Dispose()
    $dotBrush.Dispose()
    $path.Dispose()
    $g.Dispose()

    $outPath = "d:\ads exten\icons\icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created icon$size.png"
}

Write-Host "All icons generated successfully!"
