# Makes web-size copies of the project gallery images.
#
#   powershell -ExecutionPolicy Bypass -File tools/build-web-images.ps1
#
# For every image in projects/<name>/images/ it writes smaller copies to
# projects/<name>/images/web/ at 800 and 1600 px wide. Originals are never
# moved, renamed, or overwritten - the project pages link to them as the
# "full size" version.
#
#   - Photographs and renders are saved as JPG.
#   - Line drawings, plans and diagrams stay PNG so linework is not smeared
#     by JPG compression. A PNG is treated as a drawing unless it is listed
#     under "photo" in tools/web-images.json.
#   - Phone-camera rotation (EXIF) is applied, and transparency is kept.
#   - Existing web copies are skipped unless you pass -Force.
#
# It also writes one 1200x630 social-sharing image per project to
# assets/images/social/ (cropped from the image named in web-images.json),
# and prints the width/height of each original so you can paste them into
# the <img> tags on the project page. See PERSONALIZE.md for the markup.

param([switch]$Force, [int]$Quality = 86)
Add-Type -AssemblyName System.Drawing

$repo   = Split-Path $PSScriptRoot -Parent
$config = Get-Content (Join-Path $PSScriptRoot 'web-images.json') -Raw | ConvertFrom-Json
$widths = @(800, 1600)

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$jpegParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$jpegParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

function Open-Upright([string]$path) {
    $img = [System.Drawing.Image]::FromFile($path)
    if ($img.PropertyIdList -contains 274) {
        switch ($img.GetPropertyItem(274).Value[0]) {
            3 { $img.RotateFlip('Rotate180FlipNone') }
            6 { $img.RotateFlip('Rotate90FlipNone') }
            8 { $img.RotateFlip('Rotate270FlipNone') }
        }
    }
    $img
}

function Resize([System.Drawing.Image]$img, [int]$w, [int]$h, [bool]$keepAlpha, [System.Drawing.Rectangle]$src) {
    $fmt = [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    if ($keepAlpha) { $fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
    $bmp = New-Object System.Drawing.Bitmap $w, $h, $fmt
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    if (-not $keepAlpha) { $g.Clear([System.Drawing.Color]::White) }
    $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'
    $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
    $attr = New-Object System.Drawing.Imaging.ImageAttributes
    $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $src.X, $src.Y, $src.Width, $src.Height, 'Pixel', $attr)
    $g.Dispose(); $attr.Dispose()
    $bmp
}

# True when the picture really uses transparency (many PNGs carry an alpha
# channel that is fully opaque).
function Test-Transparent([System.Drawing.Image]$img) {
    if (-not [System.Drawing.Image]::IsAlphaPixelFormat($img.PixelFormat)) { return $false }
    $probe = Resize $img 64 64 $true (New-Object System.Drawing.Rectangle 0, 0, $img.Width, $img.Height)
    $found = $false
    for ($y = 0; $y -lt 64 -and -not $found; $y++) {
        for ($x = 0; $x -lt 64; $x++) { if ($probe.GetPixel($x, $y).A -lt 250) { $found = $true; break } }
    }
    $probe.Dispose()
    $found
}

$photoList = @($config.photo | ForEach-Object { $_.ToLower() })
$projects = Get-ChildItem (Join-Path $repo 'projects') -Directory | Where-Object { $_.Name -ne 'template' }

foreach ($proj in $projects) {
    $dir = Join-Path $proj.FullName 'images'
    if (-not (Test-Path $dir)) { continue }
    $files = Get-ChildItem $dir -File | Where-Object { $_.Extension -match '^\.(png|jpe?g)$' } |
        Sort-Object { [int](($_.BaseName -replace '.*_', '') -replace '\D', '0') }
    if (-not $files) { continue }
    $web = Join-Path $dir 'web'
    New-Item -ItemType Directory -Force $web | Out-Null
    ''
    "== $($proj.Name)"

    foreach ($f in $files) {
        $rel = "projects/$($proj.Name)/images/$($f.Name)".ToLower()
        $isPhoto = ($f.Extension -match '^\.jpe?g$') -or ($photoList -contains $rel)
        $img = Open-Upright $f.FullName
        $ext = 'png'; if ($isPhoto) { $ext = 'jpg' }
        $keepAlpha = (-not $isPhoto) -and (Test-Transparent $img)
        $made = @()
        foreach ($w in $widths) {
            if ($w -gt $img.Width) { $w = $img.Width }
            $out = Join-Path $web ("{0}-{1}.{2}" -f $f.BaseName, $w, $ext)
            if ($made -contains $out) { continue }
            $made += $out
            if ((Test-Path $out) -and -not $Force) { continue }
            $h = [int][Math]::Round($img.Height * $w / $img.Width)
            $bmp = Resize $img $w $h $keepAlpha (New-Object System.Drawing.Rectangle 0, 0, $img.Width, $img.Height)
            if ($isPhoto) { $bmp.Save($out, $jpegCodec, $jpegParams) } else { $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png) }
            $bmp.Dispose()
        }
        # A resized PNG can come out as heavy as a small, flat original. When the
        # original is modest in pixel size (2600 px wide or less) and the large
        # copy saves less than 15%, drop it; the page uses the original instead.
        $origW = $img.Width
        $made = @($made | ForEach-Object {
            $isLarge = $_ -notmatch '-800\.\w+$'
            if ($isLarge -and $origW -le 2600 -and (Test-Path $_) -and (Get-Item $_).Length -ge 0.85 * $f.Length) { Remove-Item $_; $null } else { $_ }
        } | Where-Object { $_ -and (Test-Path $_) })
        $sizes = ($made | ForEach-Object { '{0} {1:N0} KB' -f (Split-Path $_ -Leaf), ((Get-Item $_).Length / 1KB) }) -join ' | '
        if ($made.Count -lt 2) { $sizes += ' | (use the original as the large size)' }
        '{0,-24} width="{1}" height="{2}"  original {3:N1} MB  ->  {4}' -f $f.Name, $img.Width, $img.Height, ($f.Length / 1MB), $sizes
        $img.Dispose()
    }
}

# Social-sharing previews: 1200x630, cropped from the centre of the chosen image.
$social = Join-Path $repo 'assets/images/social'
New-Item -ItemType Directory -Force $social | Out-Null
''
'== social previews'
foreach ($p in $config.social.PSObject.Properties) {
    $src = Join-Path $repo $p.Value
    $out = Join-Path $social ($p.Name + '.jpg')
    if ((Test-Path $out) -and -not $Force) { continue }
    $img = Open-Upright $src
    $ratio = 1200 / 630
    if ($img.Width / $img.Height -gt $ratio) {
        $ch = $img.Height; $cw = [int]($ch * $ratio)
    } else {
        $cw = $img.Width; $ch = [int]($cw / $ratio)
    }
    $crop = New-Object System.Drawing.Rectangle ([int](($img.Width - $cw) / 2)), ([int](($img.Height - $ch) / 2)), $cw, $ch
    $bmp = Resize $img 1200 630 $false $crop
    $bmp.Save($out, $jpegCodec, $jpegParams); $bmp.Dispose(); $img.Dispose()
    '{0,-22} {1:N0} KB  (from {2})' -f ($p.Name + '.jpg'), ((Get-Item $out).Length / 1KB), $p.Value
}
