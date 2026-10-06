# -*- coding: utf-8 -*-
r"""
Synchronization and Deployment Script for Variant B (SWBIM Scope)
Maintains Single Source of Truth in BIM Scope (Project A) and propagates
code, assets, and tailored builds to SWBIM Scope (Project B).

Author: WWBIM
"""
import os
import sys
import shutil
import json
import re
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "variant_config.json")

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    raise FileNotFoundError(f"Configuration file not found: {CONFIG_PATH}")

def sync_directories(src_dir, dst_dir):
    """Recursively copies files from src_dir to dst_dir, updating newer/modified files."""
    os.makedirs(dst_dir, exist_ok=True)
    count = 0
    for root, dirs, files in os.walk(src_dir):
        rel_path = os.path.relpath(root, src_dir)
        target_root = os.path.join(dst_dir, rel_path) if rel_path != "." else dst_dir
        os.makedirs(target_root, exist_ok=True)
        for f in files:
            src_file = os.path.join(root, f)
            dst_file = os.path.join(target_root, f)
            if not os.path.exists(dst_file) or os.path.getmtime(src_file) != os.path.getmtime(dst_file):
                shutil.copy2(src_file, dst_file)
                count += 1
    return count

def replace_branding_to_swbim(content):
    """Accurately substitutes BIM Scope branding to SWBIM Scope without double prefixing."""
    content = re.sub(r'(?<!SW)BIMScope\.html', 'SWBIMScope.html', content)
    content = re.sub(r'(?<!SW)BIMScope', 'SWBIMScope', content)
    content = re.sub(r'(?<!SW)BIM Scope', 'SWBIM Scope', content)
    content = re.sub(r'(?<!SW)BIM_Scope', 'SWBIM_Scope', content)
    content = re.sub(r'(?<!SW)BIM_SCOPE', 'SWBIM_SCOPE', content)
    content = re.sub(r'^#\s*SWBIMScope', '# SWBIM Scope', content, flags=re.MULTILINE)
    return content

def generate_swbim_readme(src_readme_path, dst_readme_path):
    """Adapts project README for SWBIM Scope."""
    if not os.path.exists(src_readme_path):
        return
    with open(src_readme_path, "r", encoding="utf-8") as f:
        content = f.read()

    swbim_content = replace_branding_to_swbim(content)

    with open(dst_readme_path, "w", encoding="utf-8") as f:
        f.write(swbim_content)

def generate_swbim_features(src_features_path, dst_features_path):
    """Adapts FEATURES.md for SWBIM Scope:
    1. Removes any rows referring to multi-variant release pipelines.
    2. Substitutes BIM Scope / BIMScope branding to SWBIM Scope / SWBIMScope.
    """
    if not os.path.exists(src_features_path):
        return
    with open(src_features_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Filter out multi-variant pipeline rows
    lines = []
    for line in content.splitlines():
        if "双版本参数化发布管线" in line or "Dual-Variant Parametric Release Pipeline" in line or "多版本发布" in line:
            continue
        lines.append(line)
    content = "\n".join(lines)

    content = replace_branding_to_swbim(content)

    with open(dst_features_path, "w", encoding="utf-8") as f:
        f.write(content)

def generate_swbim_changelog(src_changelog_path, dst_changelog_path):
    """Adapts CHANGELOG.md for SWBIM Scope:
    1. Removes dual-variant branching version entries (e.g. [v1.2610062100]).
    2. Rewrites 2026-10-06 milestone in the time metrics table to the clean feature milestone.
    3. Substitutes all BIM Scope / BIMScope branding to SWBIM Scope / SWBIMScope.
    """
    if not os.path.exists(src_changelog_path):
        return
    with open(src_changelog_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Remove v1.2610062100 dual-variant release note block completely
    pattern = r"\n## \[v1\.2610062100\].*?\n---\n(?=\n## \[v1\.)"
    content = re.sub(pattern, "", content, flags=re.DOTALL)

    # 2. Ensure milestone in development time metrics table is the clean feature milestone
    old_ms = "双版本参数化构建系统（BIM Scope / SWBIM Scope）、品牌所有权隔离、多格式元数据档案联动 / Dual-variant parametric build, branding isolation, multi-format metadata sync"
    new_ms = "多格式模型副标题与元数据档案全局联动、FBX加载与双语切换加固 / Multi-format subtitle & metadata sync, FBX robust loader, bilingual toggle sync"
    content = content.replace(old_ms, new_ms)

    # 3. Replace all software name occurrences
    content = replace_branding_to_swbim(content)

    with open(dst_changelog_path, "w", encoding="utf-8") as f:
        f.write(content)

def run_sync():
    print("=" * 60)
    print("  SWBIM Scope (Variant B) Synchronizer")
    print("=" * 60)

    cfg = load_config()
    v_b = cfg.get("variants", {}).get("B")
    if not v_b:
        raise ValueError("Variant B config not found in variant_config.json")

    target_proj_dir = os.path.abspath(v_b.get("projectDir", r"..\SWBIM Scope\Project"))
    target_deliv_dir = os.path.abspath(v_b.get("deliverablesDir", r"..\SWBIM Scope\Deliverables"))

    print(f"Source Directory (Project A): {BASE_DIR}")
    print(f"Target Directory (Project B): {target_proj_dir}")
    print(f"Deliverables B:               {target_deliv_dir}\n")

    os.makedirs(target_proj_dir, exist_ok=True)
    os.makedirs(target_deliv_dir, exist_ok=True)

    # 1. Sync src/ and libs/ directories
    print("[1/4] Syncing source code & library directories...")
    synced_src = sync_directories(os.path.join(BASE_DIR, "src"), os.path.join(target_proj_dir, "src"))
    synced_libs = sync_directories(os.path.join(BASE_DIR, "libs"), os.path.join(target_proj_dir, "libs"))
    print(f"  - src/ synced ({synced_src} files updated)")
    print(f"  - libs/ synced ({synced_libs} files updated)")

    # 2. Sync root utility scripts & configs
    print("\n[2/4] Syncing build scripts, configuration, and documentation...")
    root_files = [
        "build_viewer.py",
        "calc_time.py",
        "variant_config.json",
        ".gitignore"
    ]
    for rf in root_files:
        src_f = os.path.join(BASE_DIR, rf)
        if os.path.exists(src_f):
            shutil.copy2(src_f, os.path.join(target_proj_dir, rf))
            print(f"  - Copied {rf}")

    # Generate tailored documentation for SWBIM Scope
    src_readme = os.path.join(BASE_DIR, "README.md")
    dst_readme = os.path.join(target_proj_dir, "README.md")
    generate_swbim_readme(src_readme, dst_readme)
    print("  - Generated tailored README.md for SWBIM Scope")

    src_features = os.path.join(BASE_DIR, "FEATURES.md")
    dst_features = os.path.join(target_proj_dir, "FEATURES.md")
    generate_swbim_features(src_features, dst_features)
    print("  - Generated tailored FEATURES.md for SWBIM Scope")

    src_changelog = os.path.join(BASE_DIR, "CHANGELOG.md")
    dst_changelog = os.path.join(target_proj_dir, "CHANGELOG.md")
    generate_swbim_changelog(src_changelog, dst_changelog)
    print("  - Generated tailored CHANGELOG.md for SWBIM Scope (branch history hidden)")

    # 3. Compile Variant B in target project
    print("\n[3/4] Compiling Variant B (SWBIM Scope) standalone distributions...")
    try:
        import build_viewer
        result = build_viewer.build_variant(
            variant_key="B",
            cfg=cfg,
            custom_project_dir=target_proj_dir,
            custom_deliverables_dir=target_deliv_dir
        )
        print(f"  - Compilation successful: {result['outputFile']} ({result['sizeMb']:.2f} MB)")
    except Exception as e:
        print(f"  - Direct build error: {e}, falling back to CLI execution...")
        py_exe = sys.executable
        subprocess.run([py_exe, "build_viewer.py", "--variant=B"], cwd=target_proj_dir, check=True)

    # 4. Git status & instructions for Account B
    print("\n[4/4] Checking Git repository status for Account B...")
    git_dir = os.path.join(target_proj_dir, ".git")
    if os.path.exists(git_dir):
        print("  - Git repository exists in target directory.")
        try:
            res = subprocess.run(["git", "status", "-s"], cwd=target_proj_dir, capture_output=True, text=True)
            print("  - Git status summary:\n" + (res.stdout.strip() if res.stdout.strip() else "    (working tree clean)"))
        except Exception:
            pass
    else:
        print("  - Notice: Target directory is not yet a Git repository.")
        print("  - When GitHub Account B is ready, execute the following commands:\n")
        print(f"      cd \"{target_proj_dir}\"")
        print("      git init")
        print("      git branch -M main")
        print("      git remote add origin https://github.com/<account-b-user>/SWBIM-Scope.git")
        print("      git add .")
        print("      git commit -m \"feat: initial release of SWBIM Scope\"")
        print("      git push -u origin main\n")

    print("=" * 60)
    print("  Sync and Build for Variant B Complete!")
    print("=" * 60)

if __name__ == "__main__":
    run_sync()
