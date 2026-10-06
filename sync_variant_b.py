# -*- coding: utf-8 -*-
r"""
Synchronization and Deployment Script for Variant B (SWBIM Scope)
Maintains Single Source of Truth in BIM Scope (Project A) and propagates
code, assets, and builds to SWBIM Scope (Project B).

Author: WWBIM
"""
import os
import sys
import shutil
import json
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
            # Only copy if dst doesn't exist or src is modified
            if not os.path.exists(dst_file) or os.path.getmtime(src_file) != os.path.getmtime(dst_file):
                shutil.copy2(src_file, dst_file)
                count += 1
    return count

def generate_swbim_readme(src_readme_path, dst_readme_path):
    """Adapts project README for SWBIM Scope."""
    if not os.path.exists(src_readme_path):
        return
    with open(src_readme_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace branding titles & filenames
    swbim_content = content.replace("# BIMScope", "# SWBIM Scope")
    swbim_content = swbim_content.replace("BIMScope.html", "SWBIMScope.html")
    swbim_content = swbim_content.replace("BIM Scope", "SWBIM Scope")

    with open(dst_readme_path, "w", encoding="utf-8") as f:
        f.write(swbim_content)

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
        ".gitignore",
        "CHANGELOG.md",
        "FEATURES.md"
    ]
    for rf in root_files:
        src_f = os.path.join(BASE_DIR, rf)
        if os.path.exists(src_f):
            shutil.copy2(src_f, os.path.join(target_proj_dir, rf))
            print(f"  - Copied {rf}")

    # Tailor README for SWBIM Scope
    src_readme = os.path.join(BASE_DIR, "README.md")
    dst_readme = os.path.join(target_proj_dir, "README.md")
    generate_swbim_readme(src_readme, dst_readme)
    print("  - Generated tailored README.md for SWBIM Scope")

    # 3. Compile Variant B in target project
    print("\n[3/4] Compiling Variant B (SWBIM Scope) standalone distributions...")
    try:
        # Import and run build_variant directly
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
