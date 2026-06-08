import sys
import os
from PIL import Image

def convert_to_transparent_png(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        return False
    
    print(f"Processing {input_path} -> {output_path}...")
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()
    
    newData = []
    # threshold for white background
    threshold = 245
    for item in datas:
        if item[0] >= threshold and item[1] >= threshold and item[2] >= threshold:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    
    # Pad to square to preserve aspect ratio (prevent squishing in Trellis2)
    width, height = img.size
    max_dim = max(width, height)
    
    # Create a new transparent square canvas
    square_img = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))
    # Calculate offset to center the original image
    offset_x = (max_dim - width) // 2
    offset_y = (max_dim - height) // 2
    
    square_img.paste(img, (offset_x, offset_y))
    
    # Resize the square image to 1024x1024 (standard clean resolution for Trellis)
    # using high-quality LANCZOS interpolation to prevent aliasing and JPEG noise.
    target_size = 1024
    print(f"Resizing padded image to {target_size}x{target_size} using Lanczos resampling...")
    try:
        resample_filter = Image.Resampling.LANCZOS
    except AttributeError:
        try:
            resample_filter = Image.LANCZOS
        except AttributeError:
            resample_filter = Image.ANTIALIAS
            
    resized_img = square_img.resize((target_size, target_size), resample_filter)
    resized_img.save(output_path, "PNG")
    print(f"Successfully processed, padded, and resized to {target_size}x{target_size} -> {output_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python preprocess_images.py <input_path> <output_path>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    success = convert_to_transparent_png(input_path, output_path)
    if not success:
        sys.exit(1)
