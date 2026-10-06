from PIL import Image
import numpy as np
import sys


def load(n):
    return np.asarray(Image.open(f"tools/dumps/{n}.png").convert("RGB")).astype(int)


obj_name, bg_name = sys.argv[1], sys.argv[2]
obj = load(obj_name)
bg = load(bg_name)
h = min(obj.shape[0], bg.shape[0])
w = min(obj.shape[1], bg.shape[1])
obj = obj[:h, :w]
bg = bg[:h, :w]
diff = np.abs(obj - bg).max(axis=2)
mask = diff > 14
n = int(mask.sum())
if n == 0:
    print("no object pixels")
    sys.exit(0)
mean = tuple(int(v) for v in obj[mask].mean(axis=0))
print(f"{obj_name}: object px={n} mean rgb={mean}")
