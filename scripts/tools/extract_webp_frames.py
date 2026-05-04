from PIL import Image
import os
import sys

input_file = sys.argv[1]
output_dir = sys.argv[2]

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

img = Image.open(input_file)
print(f"Extracting {img.n_frames} frames from {input_file} to {output_dir}")

for i in range(img.n_frames):
    img.seek(i)
    # Convert to RGB to ensure compatibility when saving as PNG
    frame = img.convert('RGB')
    frame.save(os.path.join(output_dir, f"frame_{i:04d}.png"))
    if i % 100 == 0:
        print(f"Extracted {i} frames...")

print("Done extracting frames.")
