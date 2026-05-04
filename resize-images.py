import re
import os
from PIL import Image

INPUT_DIR = r"assets\images\artifacts"
OUTPUT_DIR = r"assets\images\artifacts\thumbs"
ARTIFACTS_JS_PATH = r"scripts\game\data\artifacts.js"
TARGET_SIZE = 128

def parse_artifacts_js(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = r'\{\s*key:\s*"([^"]+)",\s*category:\s*"[^"]+",\s*name:\s*"[^"]+",\s*basePrice:\s*\d+,\s*qualityKey:\s*"[^"]+",\s*w:\s*(\d+),\s*h:\s*(\d+)\s*\}'
    matches = re.findall(pattern, content)
    
    artifacts = {}
    for match in matches:
        key = match[0]
        w = int(match[1])
        h = int(match[2])
        artifacts[key] = (w, h)
    
    return artifacts

def resize_image(input_path, output_path, target_size):
    with Image.open(input_path) as img:
        if img.mode == 'RGBA':
            background = Image.new('RGBA', img.size, (0, 0, 0, 0))
            img = Image.alpha_composite(background, img)
        
        img_resized = img.resize(target_size, Image.Resampling.LANCZOS)
        img_resized.save(output_path, 'PNG')

def main():
    artifacts = parse_artifacts_js(ARTIFACTS_JS_PATH)
    print(f"从 artifacts.js 读取到 {len(artifacts)} 个藏品配置")
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    
    files = [f for f in os.listdir(INPUT_DIR) 
             if f.endswith('.png') and os.path.isfile(os.path.join(INPUT_DIR, f))]
    print(f"找到 {len(files)} 张图片\n")
    
    new_count = 0
    overwrite_count = 0
    
    for file in files:
        key = file.replace('.png', '')
        
        if key not in artifacts:
            print(f"警告: {file} 未在 artifacts.js 中找到配置，使用默认 1x1")
            w, h = 1, 1
        else:
            w, h = artifacts[key]
        
        target_size = (w * TARGET_SIZE, h * TARGET_SIZE)
        
        input_path = os.path.join(INPUT_DIR, file)
        output_path = os.path.join(OUTPUT_DIR, file)
        
        is_new = not os.path.exists(output_path)
        resize_image(input_path, output_path, target_size)
        
        status = "新建" if is_new else "覆盖"
        print(f"[{status}] {file} -> {target_size[0]}x{target_size[1]}")
        
        if is_new:
            new_count += 1
        else:
            overwrite_count += 1
    
    print(f"\n完成！新建: {new_count} 张，覆盖: {overwrite_count} 张")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"源文件保留在: {INPUT_DIR}")

if __name__ == "__main__":
    main()
