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
    """Adapts project README for SWBIM Scope into pure English."""
    if not os.path.exists(src_readme_path):
        return
    with open(src_readme_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()
    out = []
    in_code = False
    for line in lines:
        if line.strip().startswith('```'):
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            if '#' in line:
                pre, comment = line.split('#', 1)
                if '/' in comment:
                    comment = comment.rsplit('/', 1)[1]
                elif re.search(r'[\u4e00-\u9fff]', comment):
                    comment = re.sub(r'[\u4e00-\u9fff\uff00-\uffef]+', '', comment).strip()
                line = f'{pre}# {comment.strip()}'
            out.append(line)
            continue
        
        # Headings
        if line.startswith('#'):
            if '/' in line:
                hashes = re.match(r'^(#+)\s*', line).group(1)
                title = line[len(hashes):].strip()
                eng_title = title.rsplit('/', 1)[1].strip()
                m = re.match(r'^([\d\.\s\U00010000-\U0010ffff\u2600-\u27ff]+)', title)
                if m and not re.match(r'^([\d\.\s\U00010000-\U0010ffff\u2600-\u27ff]+)', eng_title):
                    eng_title = m.group(1).strip() + ' ' + eng_title
                out.append(f'{hashes} {eng_title}')
            else:
                out.append(line)
            continue

        # Blockquote
        if line.startswith('>'):
            if not re.search(r'[\u4e00-\u9fff]', line):
                out.append(line)
            continue

        # Bullet lists: Chinese bullet starts with - **
        if line.strip().startswith('- **') and re.search(r'[\u4e00-\u9fff]', line):
            continue
        if line.startswith('  **') and not re.search(r'[\u4e00-\u9fff]', line):
            out.append('- ' + line.strip())
            continue

        # Plain text
        if re.search(r'[\u4e00-\u9fff]', line):
            continue

        out.append(line)

    res = '\n'.join(out)
    res = re.sub(r'\n{3,}', '\n\n', res)
    swbim_content = replace_branding_to_swbim(res)

    with open(dst_readme_path, "w", encoding="utf-8") as f:
        f.write(swbim_content)

def generate_swbim_features(src_features_path, dst_features_path):
    """Adapts FEATURES.md for SWBIM Scope into pure English."""
    if not os.path.exists(src_features_path):
        return
    with open(src_features_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()
    out = []
    
    out.append('# Features & Backlog Matrix\n')
    out.append('This document systematically organizes all features and UI elements of SWBIM Scope into a unified data table.\n')
    out.append('> **Status Legend**:  ')
    out.append('> - `✅ Released`: Feature is implemented and verified.  ')
    out.append('> - `🟡 In Progress`: Feature is active but undergoing active iteration.  ')
    out.append('> - `📋 Backlog`: Accepted feature requirement in queue.  ')
    out.append('> - `💡 Idea`: Exploratory proposal or early-stage idea.\n')
    out.append('---\n')
    out.append('## Unified Features & Backlog Matrix\n')
    out.append('| Module | Category & UI Element | Feature Name | Description | Status | Version |')
    out.append('| :--- | :--- | :--- | :--- | :---: | :---: |')

    for line in lines:
        if not line.strip().startswith('|'):
            continue
        if ':---' in line or '模块' in line or 'Module' in line:
            continue
        if "双版本参数化发布管线" in line or "Dual-Variant Parametric Release Pipeline" in line or "多版本发布" in line:
            continue
        
        cells = [c.strip() for c in line.split('|')[1:-1]]
        if len(cells) < 6:
            continue

        new_cells = []
        for c in cells:
            if '<br>' in c:
                parts = c.split('<br>')
                eng = parts[-1].strip()
                if parts[0].startswith('**') and not eng.startswith('**'):
                    eng = f'**{eng}**'
                eng = re.sub(r'\s*/\s*[\u4e00-\u9fff]+', '', eng)
                eng = re.sub(r'[\u4e00-\u9fff\uff00-\uffef]+', '', eng).strip()
                new_cells.append(eng)
            elif '/' in c:
                eng = c.rsplit('/', 1)[1].strip()
                eng = re.sub(r'[\u4e00-\u9fff\uff00-\uffef]+', '', eng).strip()
                new_cells.append(eng)
            else:
                clean_c = re.sub(r'[\u4e00-\u9fff\uff00-\uffef]+', '', c).strip()
                new_cells.append(clean_c)

        out.append('| ' + ' | '.join(new_cells) + ' |')

    out.append('\n---\n')
    out.append('## Backlog Workflow\n')
    out.append('When you suggest new feature ideas, UX refinements, or enhancements:')
    out.append('1. **Instant Addition**: Added to this matrix with `📋 Backlog` or `💡 Idea` status;')
    out.append('2. **Lifecycle Tracking**: Marked as `🟡 In Progress` during active development, and `✅ Released` upon full verification with version number (`v1.<YYMMDDHHMM>`);')
    out.append('3. **Release Notes Sync**: Formally documented in [`CHANGELOG.md`](./CHANGELOG.md).\n')

    res = '\n'.join(out)
    swbim_content = replace_branding_to_swbim(res)

    with open(dst_features_path, "w", encoding="utf-8") as f:
        f.write(swbim_content)

def generate_swbim_changelog(src_changelog_path, dst_changelog_path):
    """Adapts CHANGELOG.md for SWBIM Scope into pure English."""
    if not os.path.exists(src_changelog_path):
        return
    with open(src_changelog_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Remove v1.2610062100 dual-variant release note block completely
    pattern = r"\n## \[v1\.2610062100\].*?\n---\n(?=\n## \[v1\.)"
    content = re.sub(pattern, "", content, flags=re.DOTALL)

    lines = content.splitlines()
    out = []
    i = 0
    n = len(lines)

    out.append('# Changelog\n')
    out.append('This document records all formal version iterations and major changes of SWBIM Scope since project initiation.\n')
    out.append('> **Versioning Convention**:  ')
    out.append('> - Major version is fixed at `v1` (displayed as `v1` in everyday usage);  ')
    out.append('> - Full sub-version follows `v1.<YYMMDDHHMM>`, where the 10-digit timestamp represents Year, Month, Day, Hour, Minute.\n')
    out.append('---\n')

    # Find where the first version begins
    v_pos = -1
    for idx, l in enumerate(lines):
        if re.match(r'^## \[v1\.', l):
            v_pos = idx
            break

    i = v_pos
    while i < n:
        line = lines[i]

        if line.startswith('## ['):
            out.append(line)
            i += 1
            continue

        if line.strip() == '---':
            out.append(line)
            i += 1
            continue

        if line.startswith('### '):
            title = line[4:].strip()
            if '/' in title:
                title = title.rsplit('/', 1)[1].strip()
            out.append(f'### {title}')
            i += 1
            continue

        # Language section: - **中文**:
        if re.search(r'-\s*\*\*中文\*\*', line):
            i += 1
            while i < n:
                if re.search(r'-\s*\*\*English\*\*', lines[i]):
                    break
                if lines[i].startswith('##') or lines[i].strip() == '---':
                    break
                if lines[i].startswith('- **') and not re.search(r'-\s*\*\*English\*\*', lines[i]):
                    break
                i += 1
            continue

        # Language section: - **English**:
        if re.search(r'-\s*\*\*English\*\*', line):
            inline = re.sub(r'^\s*-\s*\*\*English\*\*:\s*', '', line).strip()
            if inline:
                inline = re.sub(r'\s*/\s*[\u4e00-\u9fff]+', '', inline)
                inline = re.sub(r'\(keeping\s*\"[^\"]+\"\s*in\s*Chinese\)', '(with Chinese localization)', inline)
                inline = re.sub(r'[\u4e00-\u9fff\uff00-\uffef]+', '', inline).strip()
                out.append(f'  - {inline}')
            i += 1
            while i < n:
                cur = lines[i]
                if cur.startswith('##') or cur.strip() == '---':
                    break
                if cur.startswith('- **'):
                    break
                cur_cleaned = cur
                if re.search(r'[\u4e00-\u9fff]', cur_cleaned):
                    cur_cleaned = re.sub(r'\s*/\s*[\u4e00-\u9fff]+', '', cur_cleaned)
                    cur_cleaned = re.sub(r'\(keeping\s*\"[^\"]+\"\s*in\s*Chinese\)', '(with Chinese localization)', cur_cleaned)
                    cur_cleaned = re.sub(r'[\u4e00-\u9fff\uff00-\uffef]+', '', cur_cleaned)
                if cur_cleaned.startswith('    '):
                    out.append('  ' + cur_cleaned.strip())
                elif cur_cleaned.strip() == '':
                    out.append('')
                else:
                    out.append(cur_cleaned)
                i += 1
            continue

        # Sub-bullet: - **...**
        if line.strip().startswith('- **'):
            raw = line.strip()
            m = re.match(r'^-\s*\*\*(.*?)\*\*(.*)$', raw)
            if m:
                inner = m.group(1)
                rest = m.group(2)
                if '/' in inner:
                    inner = inner.rsplit('/', 1)[1].strip()
                out.append(f'- **{inner}**{rest}')
            else:
                out.append(line)
            i += 1
            continue

        if not re.search(r'[\u4e00-\u9fff]', line):
            out.append(line)
        i += 1

    res = '\n'.join(out)
    res = re.sub(r'\n{3,}', '\n\n', res)
    swbim_content = replace_branding_to_swbim(res)

    with open(dst_changelog_path, "w", encoding="utf-8") as f:
        f.write(swbim_content)

def run_sync(do_push=False):
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
        "favicon.ico",
        "favicon.png",
        "favicon.svg",
        "icon-192.png"
    ]
    for rf in root_files:
        src_f = os.path.join(BASE_DIR, rf)
        if os.path.exists(src_f):
            shutil.copy2(src_f, os.path.join(target_proj_dir, rf))
            print(f"  - Copied {rf}")
            if rf.startswith("favicon") or rf.startswith("icon-"):
                shutil.copy2(src_f, os.path.join(target_deliv_dir, rf))

    # Generate tailored documentation for SWBIM Scope
    src_readme = os.path.join(BASE_DIR, "README.md")
    dst_readme = os.path.join(target_proj_dir, "README.md")
    generate_swbim_readme(src_readme, dst_readme)
    print("  - Generated tailored README.md for SWBIM Scope")

    src_features = os.path.join(BASE_DIR, "FEATURES.md")
    dst_features = os.path.join(target_proj_dir, "FEATURES.md")
    generate_swbim_features(src_features, dst_features)
    print("  - Generated tailored FEATURES.md for SWBIM Scope")
    shutil.copy2(dst_features, os.path.join(target_deliv_dir, "FEATURES.md"))

    src_changelog = os.path.join(BASE_DIR, "CHANGELOG.md")
    dst_changelog = os.path.join(target_proj_dir, "CHANGELOG.md")
    generate_swbim_changelog(src_changelog, dst_changelog)
    print("  - Generated tailored CHANGELOG.md for SWBIM Scope (branch history hidden)")
    shutil.copy2(dst_changelog, os.path.join(target_deliv_dir, "CHANGELOG.md"))

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

    # 4. Git status & auto-commit/push for Deliverables (Publish target: samwoh/SWBIM-Scope, deliverables only)
    print("\n[4/4] Checking Git repository status for Deliverables (Publish Target: samwoh/SWBIM-Scope)...")
    git_dir = os.path.join(target_deliv_dir, ".git")
    if os.path.exists(git_dir):
        try:
            status_res = subprocess.run(["git", "status", "-s"], cwd=target_deliv_dir, capture_output=True, text=True)
            changes = status_res.stdout.strip()
            if changes:
                print(f"  - Detected local changes in {target_deliv_dir}:\n{changes}")
                subprocess.run(["git", "add", "."], cwd=target_deliv_dir, check=True)
                try:
                    log_res = subprocess.run(["git", "log", "-1", "--pretty=%B"], cwd=BASE_DIR, capture_output=True, text=True)
                    commit_msg = log_res.stdout.strip()
                    commit_msg = commit_msg.replace("BIM Scope", "SWBIM Scope")
                    if not commit_msg or "variant" in commit_msg.lower():
                        commit_msg = "release: update standalone distribution and documentation"
                except Exception:
                    commit_msg = "release: update standalone distribution and documentation"

                subprocess.run(["git", "commit", "-m", commit_msg], cwd=target_deliv_dir, check=True)
                print(f"  - Created local commit: {commit_msg}")
            else:
                print("  - Working tree in Deliverables is clean.")

            if do_push:
                print("  - Pushing changes to https://github.com/samwoh/SWBIM-Scope.git...")
                push_res = subprocess.run(["git", "push", "origin", "main"], cwd=target_deliv_dir, capture_output=True, text=True)
                if push_res.returncode == 0:
                    print("  - Successfully pushed to remote repository! (origin/main)")
                else:
                    print(f"  - Notice: Push failed: {push_res.stderr.strip()}")
            else:
                print("  - [PAUSED] Remote publish is DISABLED by default. Changes remain local in Deliverables until user explicitly instructs push.")
        except Exception as e:
            print(f"  - Git operation notice: {e}")
    else:
        print(f"  - Notice: Deliverables directory {target_deliv_dir} is not yet a Git repository.")

    print("=" * 60)
    print("  Sync and Build for Variant B Complete!")
    print("=" * 60)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="SWBIM Scope Synchronizer")
    parser.add_argument("--push", action="store_true", default=False, help="Explicitly push to remote GitHub repository upon user command")
    args = parser.parse_args()
    run_sync(do_push=args.push)
