#!/usr/bin/env python3
"""
PBR Texture Atlas Extractor & Map Synthesizer for JANKEN KIWAMI 3D.
Cleanly slices individual tiles from the user's 3x3 1024x1024 material sheets,
trims divider borders with precision margin detection, upscales cleanly to 512x512
(with edge-preserving detail sharpening), and generates physically calibrated
Tangent-Space Normal Maps and Roughness Maps.
"""

import os
import json
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

SRC_DIR = "/home/antigravity"
OUT_DIR = "/home/antigravity/sc8z35a-collab/GIT-Y3/public/textures"

# Catalog of curated texture tiles to extract from the 22 user-provided atlases:
# (output_name, source_file, row, col, inset_px, normal_strength, rough_min, rough_max, invert_rough, make_seamless)
TILES = [
    # --- Stage 1: Sunlit Tatami Zashiki (和室・陽だまりの座敷) ---
    ("tatami", "ChatGPT_画像_2026年11月17日_08_48_42-4.png", 0, 1, 7, 2.2, 0.68, 0.94, False, False),
    ("oak_floor", "ChatGPT_画像_2026年11月17日_08_48_42-4.png", 0, 0, 7, 2.4, 0.30, 0.58, True, True),
    ("shikkui_cream", "ChatGPT_画像_2026年11月17日_08_48_42-4.png", 0, 2, 7, 1.5, 0.72, 0.92, False, True),
    ("cedar_panel", "ChatGPT_画像_2026年11月17日_08_48_42-4.png", 2, 1, 7, 2.5, 0.36, 0.64, True, False),
    ("sakura_cloth", "ChatGPT_画像_2026年11月17日_08_48_44-6.png", 1, 0, 7, 2.0, 0.68, 0.90, False, True),
    ("zabuton_red", "ChatGPT_画像_2026年11月17日_08_48_44-6.png", 1, 1, 7, 3.2, 0.72, 0.95, False, False),
    ("shoji_doors", "ChatGPT_画像_2026年11月17日_10_48_36-3.png", 0, 2, 8, 2.8, 0.40, 0.78, False, False),
    ("tansu_chest", "ChatGPT_画像_2026年11月17日_10_48_36-3.png", 2, 1, 8, 3.0, 0.24, 0.54, True, False),
    ("noren_indigo", "ChatGPT_画像_2026年11月17日_08_48_46-10.png", 0, 0, 8, 2.6, 0.75, 0.95, False, False),
    ("wood_plaques", "ChatGPT_画像_2026年11月17日_08_48_46-10.png", 0, 1, 8, 3.0, 0.36, 0.68, True, False),
    ("window_city_sky", "ChatGPT_画像_2026年11月17日_08_48_44-7.png", 2, 0, 8, 1.4, 0.14, 0.42, True, False),
    ("namako_kabe", "ChatGPT_画像_2026年11月16日_16_18_47-3.png", 0, 0, 6, 3.6, 0.62, 0.90, False, True),
    ("yakisugi_wood", "ChatGPT_画像_2026年11月16日_16_18_47-3.png", 0, 2, 6, 3.2, 0.56, 0.88, False, True),
    ("kumiko_lattice", "ChatGPT_画像_2026年11月16日_16_18_47-3.png", 1, 1, 6, 3.6, 0.42, 0.74, True, True),
    ("bamboo_sudare", "ChatGPT_画像_2026年11月16日_16_18_47-3.png", 1, 0, 6, 3.2, 0.48, 0.78, False, True),

    # --- Stage 2: Grand Heritage Marble & Brass Salon (貴賓室・大理石と真鍮の間) ---
    ("marble_brass_floor", "ChatGPT_画像_2026年11月17日_10_48_38-4.png", 0, 0, 7, 2.4, 0.14, 0.36, True, True),
    ("walnut_herringbone", "ChatGPT_画像_2026年11月17日_10_48_38-4.png", 1, 1, 7, 2.8, 0.24, 0.52, True, True),
    ("emerald_velvet_wall", "ChatGPT_画像_2026年11月17日_10_48_38-4.png", 1, 2, 7, 2.6, 0.64, 0.92, False, True),
    ("champagne_steel", "ChatGPT_画像_2026年11月17日_10_48_38-4.png", 0, 1, 7, 2.2, 0.22, 0.45, True, True),
    ("travertine_stone", "ChatGPT_画像_2026年11月16日_16_18_44-1.png", 0, 0, 6, 3.4, 0.50, 0.84, False, True),
    ("brushed_bronze", "ChatGPT_画像_2026年11月16日_16_18_46-2.png", 1, 0, 6, 1.9, 0.20, 0.40, True, True),
    ("library_books", "ChatGPT_画像_2026年11月17日_10_48_36-3.png", 1, 1, 8, 3.2, 0.52, 0.84, False, False),
    ("grey_marble_slab", "ChatGPT_画像_2026年11月17日_08_48_40-1.png", 1, 1, 7, 1.6, 0.14, 0.34, True, True),

    # --- Stage 3: Sacred Shrine & Moss Garden (社殿・苔庭の拝殿) ---
    ("shrine_facade", "ChatGPT_画像_2026年11月17日_08_48_47-11.png", 2, 2, 8, 3.0, 0.48, 0.80, False, False),
    ("pebble_aggregate", "ChatGPT_画像_2026年11月17日_10_41_56-1.png", 2, 0, 7, 4.0, 0.52, 0.88, False, True),
    ("pale_granite", "ChatGPT_画像_2026年11月16日_16_18_44-1.png", 2, 2, 6, 2.8, 0.55, 0.84, False, True),
    ("dark_slate_tile", "ChatGPT_画像_2026年11月16日_16_18_44-1.png", 0, 2, 6, 3.6, 0.48, 0.80, False, True),
    ("verdigris_copper", "ChatGPT_画像_2026年11月16日_16_18_46-2.png", 0, 1, 6, 2.8, 0.36, 0.72, False, True),
    ("stepping_stones", "ChatGPT_画像_2026年11月17日_13_00_27-3.png", 2, 1, 7, 4.2, 0.54, 0.88, False, True),
    ("velvet_moss", "ChatGPT_画像_2026年11月17日_13_00_27-3.png", 1, 2, 7, 4.0, 0.76, 0.96, False, True),
    ("vermilion_wood", "ChatGPT_画像_2026年11月17日_13_00_27-3.png", 2, 0, 7, 3.0, 0.30, 0.62, True, True),
    ("koi_pond", "ChatGPT_画像_2026年11月17日_08_48_46-9.png", 2, 1, 7, 1.4, 0.05, 0.20, True, True),
    ("blue_sky", "ChatGPT_画像_2026年11月17日_08_48_46-9.png", 2, 0, 7, 0.4, 0.90, 0.95, False, True),
    ("bamboo_fence", "ChatGPT_画像_2026年11月16日_16_18_47-3.png", 2, 2, 6, 3.6, 0.42, 0.72, True, True),

    # --- Stage 4: Onsen Limestone Terrace & Bamboo Sanctuary (湯けむり・石庭の離れ) ---
    ("onsen_water", "ChatGPT_画像_2026年11月17日_16_24_43-5.png", 1, 1, 6, 1.8, 0.04, 0.16, True, True),
    ("onsen_waterfall", "ChatGPT_画像_2026年11月17日_16_24_43-5.png", 2, 1, 6, 3.2, 0.12, 0.42, True, False),
    ("travertine_pools", "ChatGPT_画像_2026年11月17日_16_24_43-5.png", 1, 0, 6, 3.6, 0.20, 0.56, True, True),
    ("lily_pond", "ChatGPT_画像_2026年11月17日_13_00_27-3.png", 0, 0, 7, 1.8, 0.06, 0.24, True, True),
    ("green_bamboo", "ChatGPT_画像_2026年11月17日_13_00_27-3.png", 2, 2, 7, 3.4, 0.28, 0.58, True, True),
    ("mossy_boulder_wall", "ChatGPT_画像_2026年11月17日_13_00_27-3.png", 0, 2, 7, 4.4, 0.56, 0.90, False, True),
    ("botanical_wall", "ChatGPT_画像_2026年11月16日_16_18_48-4.png", 0, 0, 6, 4.2, 0.62, 0.92, False, True),
    ("stacked_logs", "ChatGPT_画像_2026年11月16日_15_43_15-5.png", 2, 2, 6, 4.2, 0.68, 0.94, False, True),
    ("stone_basin", "ChatGPT_画像_2026年11月16日_15_43_15-5.png", 2, 0, 6, 3.8, 0.44, 0.82, False, False),

    # --- Stage 5: Artisan Brick & Forged Iron Atelier (工房・赤煉瓦と鉄のアトリエ) ---
    ("glazed_amber_brick", "ChatGPT_画像_2026年11月16日_16_18_44-1.png", 1, 1, 6, 3.2, 0.12, 0.36, True, True),
    ("terracotta_louvers", "ChatGPT_画像_2026年11月16日_16_18_44-1.png", 1, 2, 6, 3.8, 0.58, 0.84, False, True),
    ("sandstone_ashlar", "ChatGPT_画像_2026年11月16日_16_18_44-1.png", 0, 1, 6, 2.8, 0.58, 0.84, False, True),
    ("corten_iron", "ChatGPT_画像_2026年11月17日_10_48_38-4.png", 2, 0, 7, 3.2, 0.42, 0.78, False, True),
    ("hex_forged_mesh", "ChatGPT_画像_2026年11月17日_10_48_38-4.png", 2, 1, 7, 3.8, 0.28, 0.56, True, True),
    ("bolted_timber", "ChatGPT_画像_2026年11月17日_10_41_56-1.png", 1, 0, 8, 3.0, 0.38, 0.68, True, False),
    ("brushed_steel_plate", "ChatGPT_画像_2026年11月17日_10_41_56-1.png", 1, 1, 8, 2.0, 0.18, 0.38, True, False),
    ("industrial_pipes", "ChatGPT_画像_2026年11月17日_08_48_46-9.png", 0, 0, 8, 3.6, 0.32, 0.66, True, False),
    ("chalkboard", "ChatGPT_画像_2026年11月17日_08_48_47-11.png", 0, 0, 8, 1.8, 0.72, 0.92, False, False),
    ("cedar_siding", "ChatGPT_画像_2026年11月16日_16_18_48-4.png", 1, 2, 6, 2.8, 0.44, 0.72, True, True),
    ("weathered_concrete", "ChatGPT_画像_2026年11月16日_16_20_06-1.png", 0, 1, 6, 3.2, 0.64, 0.90, False, True),
    ("sky_glass_facade", "ChatGPT_画像_2026年11月16日_16_20_09-3.png", 2, 0, 7, 1.6, 0.08, 0.24, True, True),
]


def detect_grid_lines(img_arr: np.ndarray):
    """Detect exact 3x3 separator lines near 341 and 682."""
    gray = img_arr.mean(axis=2)
    rm = gray.mean(axis=1)
    cm = gray.mean(axis=0)
    r1 = 335 + int(np.argmin(rm[335:348]))
    r2 = 676 + int(np.argmin(rm[676:689]))
    c1 = 335 + int(np.argmin(cm[335:348]))
    c2 = 676 + int(np.argmin(cm[676:689]))
    # Guard against images without dark lines (use ideal thirds)
    if abs(r1 - 341) > 4:
        r1 = 341
    if abs(r2 - 682) > 4:
        r2 = 682
    if abs(c1 - 341) > 4:
        c1 = 341
    if abs(c2 - 682) > 4:
        c2 = 682
    return (0, r1, r2, img_arr.shape[0]), (0, c1, c2, img_arr.shape[1])


def make_mirrored_seamless(img: Image.Image, blend_band: int = 28) -> Image.Image:
    """
    Softly blend opposite border strips using cosine cross-fade in-place on a rolled copy
    so repeating textures never display a harsh seam line.
    """
    arr = np.asarray(img, dtype=np.float32)
    h, w, _ = arr.shape
    b = min(blend_band, w // 6, h // 6)

    # Horizontal seam smoothing via edge mirroring blend at outer band
    alpha = 0.5 * (1.0 - np.cos(np.linspace(0.0, np.pi, b, dtype=np.float32)))  # 0 -> 1
    left = arr[:, :b, :]
    right = arr[:, -b:, :]
    avg_edge_h = 0.5 * (left[:, 0:1, :] + right[:, -1:, :])
    # Gently pull extreme left and right edges toward their shared average over band b
    t_left = (1.0 - alpha)[None, :, None]
    t_right = alpha[None, :, None]
    arr[:, :b, :] = arr[:, :b, :] * (1.0 - 0.55 * t_left) + (0.5 * (arr[:, :b, :] + arr[:, -b:, :][:, ::-1, :])) * (0.55 * t_left)
    arr[:, -b:, :] = arr[:, -b:, :] * (1.0 - 0.55 * t_right) + (0.5 * (arr[:, -b:, :] + arr[:, :b, :][:, ::-1, :])) * (0.55 * t_right)

    # Vertical seam smoothing
    t_top = (1.0 - alpha)[:, None, None]
    t_bot = alpha[:, None, None]
    arr[:b, :, :] = arr[:b, :, :] * (1.0 - 0.55 * t_top) + (0.5 * (arr[:b, :, :] + arr[-b:, :, :][::-1, :, :])) * (0.55 * t_top)
    arr[-b:, :, :] = arr[-b:, :, :] * (1.0 - 0.55 * t_bot) + (0.5 * (arr[-b:, :, :] + arr[:b, :, :][::-1, :, :])) * (0.55 * t_bot)

    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def synthesize_normal_map(img: Image.Image, strength: float = 2.5) -> Image.Image:
    """
    Generate a clean multi-scale Sobel tangent-space Normal Map from luminance.
    Combines crisp high-frequency micro-relief with subtle broad-scale depth.
    """
    gray = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    blur_mid = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(radius=2.2)), dtype=np.float32) / 255.0
    h = 0.65 * gray + 0.35 * blur_mid

    # Wrap-padded Sobel gradients
    hp = np.pad(h, 1, mode="edge")
    gx = (
        (hp[:-2, 2:] + 2.0 * hp[1:-1, 2:] + hp[2:, 2:])
        - (hp[:-2, :-2] + 2.0 * hp[1:-1, :-2] + hp[2:, :-2])
    )
    gy = (
        (hp[2:, :-2] + 2.0 * hp[2:, 1:-1] + hp[2:, 2:])
        - (hp[:-2, :-2] + 2.0 * hp[:-2, 1:-1] + hp[:-2, 2:])
    )

    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(nx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    nx = (nx / norm) * 0.5 + 0.5
    ny = (ny / norm) * 0.5 + 0.5
    nz = (nz / norm) * 0.5 + 0.5

    rgb = np.stack([nx, ny, nz], axis=-1)
    return Image.fromarray(np.clip(rgb * 255.0, 0, 255).astype(np.uint8), mode="RGB")


def synthesize_roughness_map(
    img: Image.Image, r_min: float, r_max: float, invert: bool = False
) -> Image.Image:
    """
    Generate a physically calibrated grayscale Roughness Map from local luminance & detail variance.
    """
    gray = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    # Normalize contrast gently
    p5, p95 = np.percentile(gray, [5, 95])
    span = max(p95 - p5, 0.05)
    norm = np.clip((gray - p5) / span, 0.0, 1.0)
    if invert:
        norm = 1.0 - norm
    rough = r_min + norm * (r_max - r_min)
    return Image.fromarray(np.clip(rough * 255.0, 0, 255).astype(np.uint8), mode="L")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    cache = {}
    manifest = {}

    for (
        name,
        src_file,
        row,
        col,
        inset,
        n_strength,
        r_min,
        r_max,
        inv_r,
        seamless,
    ) in TILES:
        src_path = os.path.join(SRC_DIR, src_file)
        if not os.path.exists(src_path):
            print(f"[WARN] Missing source: {src_path}")
            continue

        if src_file not in cache:
            im = Image.open(src_path).convert("RGB")
            arr = np.asarray(im)
            rows, cols = detect_grid_lines(arr)
            cache[src_file] = (im, rows, cols)

        im, rows, cols = cache[src_file]
        y0 = rows[row] + inset
        y1 = rows[row + 1] - inset
        x0 = cols[col] + inset
        x1 = cols[col + 1] - inset

        tile = im.crop((x0, y0, x1, y1))
        # High-quality Lanczos upscale to crisp 512x512 + subtle detail clarity
        tile = tile.resize((512, 512), Image.Resampling.LANCZOS)
        tile = tile.filter(ImageFilter.UnsharpMask(radius=1.1, percent=65, threshold=2))

        if seamless:
            tile = make_mirrored_seamless(tile, blend_band=24)

        albedo_path = os.path.join(OUT_DIR, f"{name}_albedo.jpg")
        normal_path = os.path.join(OUT_DIR, f"{name}_normal.jpg")
        rough_path = os.path.join(OUT_DIR, f"{name}_rough.jpg")

        tile.save(albedo_path, quality=94, optimize=True)

        normal_img = synthesize_normal_map(tile, strength=n_strength)
        normal_img.save(normal_path, quality=92, optimize=True)

        rough_img = synthesize_roughness_map(tile, r_min, r_max, invert=inv_r)
        rough_img.save(rough_path, quality=90, optimize=True)

        manifest[name] = {
            "albedo": f"textures/{name}_albedo.jpg",
            "normal": f"textures/{name}_normal.jpg",
            "roughness": f"textures/{name}_rough.jpg",
            "source": src_file,
            "cell": [row, col],
        }

    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Successfully extracted & PBR-synthesized {len(manifest)} high-res textures into {OUT_DIR}")


if __name__ == "__main__":
    main()
