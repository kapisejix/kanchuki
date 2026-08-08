#!/usr/bin/env python3
"""
Generate two flat-color starter backdrops for the F-028 auto-contrast picker.

The admin library computes a backdrop's tone at upload via isDarkImage()
(average WCAG luminance of a 32x32 downsample):
  - luminance < 0.35  -> DARK   (picked for LIGHT garments)
  - luminance > 0.6   -> LIGHT  (picked for DARK garments)
  - mid-tone          -> never auto-picked

The two colors below are chosen to land deep inside their bands with huge
margin, so the auto-classifier can never misread them:

  LIGHT  #F2F0EC  warm off-white studio grey  (~0.87 luminance)
  DARK   #2A2A2E  deep charcoal               (~0.02 luminance)

Sized 1600x2000 (4:5 portrait, matching typical product-shot aspect) so the
compositor's cover-crop has room. Flat color = tiny JPEG (~10 KB) and zero
classification ambiguity. Replace with real studio photos later.

Output: scripts/demo/2026-08-08-starter-backdrops/
"""
import os
from PIL import Image

OUT_DIR = os.path.join('scripts', 'demo', '2026-08-08-starter-backdrops')
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = (1600, 2000)

BACKDROPS = [
    # (filename, hex color, expected tone)
    ('backdrop-light-1600x2000.jpg', '#F2F0EC', 'LIGHT'),
    ('backdrop-dark-1600x2000.jpg', '#2A2A2E', 'DARK'),
]

for filename, hex_color, expected in BACKDROPS:
    rgb = tuple(int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    img = Image.new('RGB', SIZE, rgb)
    path = os.path.join(OUT_DIR, filename)
    img.save(path, 'JPEG', quality=92)
    size_kb = os.path.getsize(path) / 1024
    print(f'  {filename:32s} {hex_color}  -> {expected:5s}  {size_kb:.1f} KB')

print(f'\nDone. Files in {OUT_DIR}/')
