# Shrinks new card art for the homepage.
#
#   powershell -ExecutionPolicy Bypass -File tools/optimize-card-art.ps1
#
# For every PNG/JPG over ~400 KB (or any PNG) in assets/images/cards/:
#   - resizes to 2x the card's display size (*_full -> 720x1008, others -> 800 max)
#   - flattens transparency onto the art window colour (#0d0d0d)
#   - saves a <name>.jpg next to it at quality 82
#   - moves the original to ../card-art-originals/ (outside the site)
# Then point index.html at the .jpg.

param([int]$Quality = 82)
Add-Type -AssemblyName System.Drawing

$repo  = Split-Path $PSScriptRoot -Parent
$cards = Join-Path $repo 'assets/images/cards'
$keep  = Join-Path (Split-Path $repo -Parent) 'card-art-originals'
New-Item -ItemType Directory -Force $keep | Out-Null

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
$bg = [System.Drawing.Color]::FromArgb(13, 13, 13)

$todo = Get-ChildItem $cards -File | Where-Object {
    $_.Extension -eq '.png' -or ($_.Extension -in '.jpg', '.jpeg' -and $_.Length -gt 400KB)
}
if (-not $todo) { 'Nothing to optimize.'; return }

foreach ($f in $todo) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    if ($f.BaseName -like '*_full') { $maxW = 720; $maxH = 1008 } else { $maxW = 800; $maxH = 800 }
    # [double] matters: [Math]::Min(1, x) would pick the int overload and return 0.
    $scale = [Math]::Min([double]1, [Math]::Min([double]$maxW / $img.Width, [double]$maxH / $img.Height))
    $w = [int][Math]::Round($img.Width * $scale); $h = [int][Math]::Round($img.Height * $scale)

    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($bg)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'
    $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
    $attr = New-Object System.Drawing.Imaging.ImageAttributes
    $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), 0, 0, $img.Width, $img.Height, 'Pixel', $attr)
    $g.Dispose(); $img.Dispose()

    $tmp = Join-Path $cards ($f.BaseName + '.tmp.jpg')
    $bmp.Save($tmp, $codec, $params); $bmp.Dispose()
    Move-Item $f.FullName (Join-Path $keep $f.Name) -Force
    $out = Join-Path $cards ($f.BaseName + '.jpg')
    Move-Item $tmp $out -Force
    "{0,-28} {1,6:N0} KB -> {2}x{3} {4,4:N0} KB" -f $f.Name, ($f.Length / 1KB), $w, $h, ((Get-Item $out).Length / 1KB)
}
