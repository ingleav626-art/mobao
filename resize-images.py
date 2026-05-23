"""
藏品图片尺寸调整工具

使用方法:
  python resize-images.py                    # 处理所有图片
  python resize-images.py --force            # 强制重新生成所有缩略图
  python resize-images.py --size 256         # 使用 256px 作为基础尺寸
  python resize-images.py --key gem-ruby     # 只处理指定 key 的图片

当修改了 artifacts.js 中的藏品尺寸 (w, h) 后，重新运行此脚本即可更新缩略图。
"""

import re
import os
import argparse
from PIL import Image

INPUT_DIR = r"assets\images\artifacts"
OUTPUT_DIR = r"assets\images\artifacts\thumbs"
ARTIFACTS_JS_PATH = r"scripts\game\data\artifacts.js"
DEFAULT_TARGET_SIZE = 128


def parse_artifacts_js(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = r'\{\s*key:\s*"([^"]+)",\s*majorCategory:\s*"[^"]*",\s*category:\s*"[^"]+",\s*name:\s*"[^"]+",\s*basePrice:\s*\d+,\s*qualityKey:\s*"[^"]+",\s*w:\s*(\d+),\s*h:\s*(\d+)\s*\}'
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
    parser = argparse.ArgumentParser(
        description='藏品图片尺寸调整工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python resize-images.py              处理所有图片
  python resize-images.py --force      强制重新生成所有缩略图
  python resize-images.py --size 256   使用 256px 基础尺寸
  python resize-images.py --key gem-*  只处理 gem- 开头的图片
        """
    )
    parser.add_argument('--force', '-f', action='store_true', 
                        help='强制重新生成所有缩略图（即使已存在）')
    parser.add_argument('--size', '-s', type=int, default=DEFAULT_TARGET_SIZE,
                        help=f'基础尺寸（默认 {DEFAULT_TARGET_SIZE}px）')
    parser.add_argument('--key', '-k', type=str, default=None,
                        help='只处理指定 key 的图片（支持通配符，如 gem-*）')
    args = parser.parse_args()
    
    artifacts = parse_artifacts_js(ARTIFACTS_JS_PATH)
    print(f"从 artifacts.js 读取到 {len(artifacts)} 个藏品配置")
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    
    files = [f for f in os.listdir(INPUT_DIR) 
             if f.endswith('.png') and os.path.isfile(os.path.join(INPUT_DIR, f))]
    
    if args.key:
        import fnmatch
        key_pattern = args.key.replace('.png', '')
        files = [f for f in files if fnmatch.fnmatch(f.replace('.png', ''), key_pattern)]
        print(f"筛选后找到 {len(files)} 张匹配 '{args.key}' 的图片\n")
    else:
        print(f"找到 {len(files)} 张图片\n")
    
    new_count = 0
    overwrite_count = 0
    skipped_count = 0
    
    for file in files:
        key = file.replace('.png', '')
        
        if key not in artifacts:
            print(f"警告: {file} 未在 artifacts.js 中找到配置，使用默认 1x1")
            w, h = 1, 1
        else:
            w, h = artifacts[key]
        
        target_size = (w * args.size, h * args.size)
        
        input_path = os.path.join(INPUT_DIR, file)
        output_path = os.path.join(OUTPUT_DIR, file)
        
        exists = os.path.exists(output_path)
        
        if exists and not args.force:
            with Image.open(output_path) as existing:
                existing_size = existing.size
            if existing_size == target_size:
                skipped_count += 1
                continue
        
        resize_image(input_path, output_path, target_size)
        
        if exists:
            status = "覆盖"
            overwrite_count += 1
        else:
            status = "新建"
            new_count += 1
        
        print(f"[{status}] {file} -> {target_size[0]}x{target_size[1]}")
    
    print(f"\n完成！新建: {new_count} 张，覆盖: {overwrite_count} 张，跳过: {skipped_count} 张")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"源文件保留在: {INPUT_DIR}")


if __name__ == "__main__":
    main()
