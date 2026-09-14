"""Builds grid-sized copies of every wallpaper.

    python scripts/wallpaper-thumbs.py

The library grid shows nineteen images at once. At full size that is three
megabytes on open, which is a slow panel on a phone for no reason: the tiles are
never wider than a few hundred pixels on screen. These copies come to about
fifteen kilobytes each, and the full image is still what a click opens and what
a save writes.

Only missing thumbnails are built, so running it again after dropping a new
wallpaper in costs nothing. Nothing here is required for the library to work —
the manifest falls back to the full image when a thumbnail is absent — so a
wallpaper added by somebody without Python still appears, just heavier.

Needs Pillow: python -m pip install pillow
"""
import os
import sys

from PIL import Image

WIDTH = 460
QUALITY = 78

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
full = os.path.join(root, 'public', 'wallpapers', 'full')
thumb = os.path.join(root, 'public', 'wallpapers', 'thumb')

if not os.path.isdir(full):
    sys.exit('no public/wallpapers/full to read')
os.makedirs(thumb, exist_ok=True)

made = 0
for name in sorted(os.listdir(full)):
    if not name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
        continue
    # Thumbnails are always jpeg: the grid has no need for alpha and jpeg is
    # half the bytes of the same picture as png.
    out_name = os.path.splitext(name)[0] + '.jpg'
    out = os.path.join(thumb, out_name)
    if os.path.exists(out):
        continue
    with Image.open(os.path.join(full, name)) as im:
        im = im.convert('RGB')
        height = round(im.height * WIDTH / im.width)
        im.resize((WIDTH, height), Image.LANCZOS).save(out, 'JPEG', quality=QUALITY, optimize=True)
    made += 1
    print('%s -> %d wide' % (out_name, WIDTH))

print('wallpaper-thumbs: %d built' % made)
