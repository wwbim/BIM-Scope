# -*- coding: utf-8 -*-
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(BASE_DIR, "BIMScope.html")
size = os.path.getsize(p)
print(f"File Path: {p}")
print(f"Total File Size: {size:,} bytes ({size / (1024 * 1024):.2f} MB)")

with open(p, "r", encoding="utf-8") as f:
    html = f.read()

# 1. Check for external resource tags
ext_tags = re.findall(r'<(?:script|link|img)[^>]*(?:src|href)=["\'](?!data:)[^"\']*["\']', html, re.IGNORECASE)
print(f"\n1. External <script>/<link>/<img> tags count: {len(ext_tags)}")
if ext_tags:
    for t in ext_tags:
        print("   External tag found:", t)
else:
    print("   -> 0 external tags! 100% self-contained.")

# 2. Check Red Icon (buildingSMART)
red_matches = re.findall(r'<img[^>]*class=["\']brand-logo-red["\'][^>]*>', html)
print(f"\n2. Red Icon tag in HTML:")
for m in red_matches:
    print(f"   Tag: {m[:60]}...{m[-30:]}")
    print(f"   Embedded as base64 data URI: {'data:image/png;base64,' in m}")

# 3. Check Blue Lens Icon
lens_matches = re.findall(r'<svg[^>]*class=["\']brand-lens-icon["\'][^>]*>.*?</svg>', html, re.DOTALL)
print(f"\n3. Blue Lens Icon in HTML:")
print(f"   Inline SVG element found: {len(lens_matches) > 0}")
if lens_matches:
    print(f"   SVG length: {len(lens_matches[0])} chars")

# 4. Check Libraries & Styles inlined
print(f"\n4. Inlined Libraries and Assets:")
print(f"   - <style> tag size: {len(re.findall(r'<style>(.*?)</style>', html, re.DOTALL)[0]):,} chars")
print(f"   - Three.js library inlined: {'THREE.WebGLRenderer' in html}")
print(f"   - GLTF Loader inlined: {'THREE.GLTFLoader' in html}")
print(f"   - Villa 3D Procedural Model inlined: {'Modern_Hillside_Villa' in html}")
print(f"   - Singapore Solar Engine inlined: {'SolarEngine' in html}")
print(f"   - Section Clipping Engine inlined: {'ClippingEngine' in html}")
print(f"   - IFC 4.3 Parser Engine inlined: {'IFCParser' in html}")
print(f"   - Bilingual i18n Engine inlined: {'I18N' in html}")
