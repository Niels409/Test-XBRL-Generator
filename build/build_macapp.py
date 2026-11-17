"""Builds a macOS app bundle (Test XBRL Generator.app) around the offline HTML app.

python3 build/build_macapp.py <app.html> <template.xlsx> <out dir>
"""
import io, os, re, shutil, struct, sys
from PIL import Image, ImageDraw, ImageFont

HTML, XLSX, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
NAME = 'Test XBRL Generator'
VERSION = re.search(r"VERSION = '([^']+)'", open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app', 'core.js')).read()).group(1)
APP = os.path.join(OUT, NAME + '.app')
shutil.rmtree(APP, ignore_errors=True)
for d in ('Contents/MacOS', 'Contents/Resources'):
    os.makedirs(os.path.join(APP, d))

# ---------------------------------------------------------------- icon
def icon(size):
    S = 1024
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = 92
    d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=190, fill=(23, 50, 77, 255))
    # parcel lines
    line = (111, 183, 186, 255)
    pts = [[(180, 300), (420, 250), (500, 430), (300, 560), (175, 520)],
           [(420, 250), (760, 220), (800, 390), (500, 430)],
           [(500, 430), (800, 390), (850, 520), (620, 590), (300, 560)]]
    for poly in pts:
        d.line(poly + [poly[0]], fill=line, width=14, joint='curve')
    d.rectangle([580, 280, 670, 360], outline=(234, 241, 245, 255), width=12)
    f = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Bold.otf', 190) if os.path.exists('/usr/share/fonts/opentype/inter/Inter-Bold.otf') else ImageFont.load_default()
    txt = 'XBRL'
    w = d.textlength(txt, font=f)
    d.text(((S - w) / 2, 640), txt, font=f, fill=(234, 241, 245, 255))
    return im.resize((size, size), Image.LANCZOS)

entries = []
for code, size in ((b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024)):
    b = io.BytesIO(); icon(size).save(b, 'PNG'); data = b.getvalue()
    entries.append(code + struct.pack('>I', len(data) + 8) + data)
body = b''.join(entries)
open(os.path.join(APP, 'Contents/Resources/AppIcon.icns'), 'wb').write(b'icns' + struct.pack('>I', len(body) + 8) + body)
icon(512).save(os.path.join(OUT, 'icon_preview.png'))

# ---------------------------------------------------------------- contents
shutil.copy(HTML, os.path.join(APP, 'Contents/Resources', NAME + '.html'))
shutil.copy(XLSX, os.path.join(APP, 'Contents/Resources', NAME + ' - template.xlsx'))

open(os.path.join(APP, 'Contents/Info.plist'), 'w').write(f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>{NAME}</string>
  <key>CFBundleDisplayName</key><string>{NAME}</string>
  <key>CFBundleIdentifier</key><string>nl.local.test-xbrl-generator</string>
  <key>CFBundleVersion</key><string>{VERSION}</string>
  <key>CFBundleShortVersionString</key><string>{VERSION}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>TestXBRLGenerator</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>LSUIElement</key><false/>
</dict>
</plist>
''')

launcher = r'''#!/bin/bash
# Opens the Test XBRL Generator in its own window (Chrome/Edge/Brave app mode), otherwise in the default browser.
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
HTML="$RES/Test XBRL Generator.html"
URL="file://$(printf '%s' "$HTML" | sed -e 's/%/%25/g' -e 's/ /%20/g' -e "s/'/%27/g")"
PROFILE="$HOME/Library/Application Support/Test XBRL Generator"
mkdir -p "$PROFILE"
for B in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  if open -Ra "$B" >/dev/null 2>&1; then
    open -na "$B" --args --app="$URL" --user-data-dir="$PROFILE/$B" --window-size=1320,920 --no-first-run --no-default-browser-check
    exit 0
  fi
done
open "$HTML"
'''
p = os.path.join(APP, 'Contents/MacOS/TestXBRLGenerator')
open(p, 'w', newline='\n').write(launcher)
os.chmod(p, 0o755)
print('app built:', APP, VERSION)
