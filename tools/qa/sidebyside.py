"""Before | after screenshots side by side, scaled to fit, with labels.
  python3 tools/qa/sidebyside.py out.png "label A" a.png "label B" b.png [...]"""
import sys
from PIL import Image, ImageDraw

out, rest = sys.argv[1], sys.argv[2:]
pairs = list(zip(rest[0::2], rest[1::2]))
ims = [Image.open(p).convert('RGB') for _, p in pairs]
W = 900
ims = [im.resize((W, int(im.height * W / im.width))) for im in ims]
H = max(im.height for im in ims)
S = Image.new('RGB', (W * len(ims) + 10 * (len(ims) - 1), H + 26), (20, 22, 26))
d = ImageDraw.Draw(S)
for i, ((label, _), im) in enumerate(zip(pairs, ims)):
    x = i * (W + 10)
    S.paste(im, (x, 26))
    d.text((x + 6, 6), label, fill=(255, 220, 120))
S.save(out)
print(out, S.size)
