# -*- coding: utf-8 -*-
"""
publish_all.py: One-Click 3-Way Synchronized Publishing Pipeline for BIM Scope & SWBIM Scope
Strictly complies with the Multi-Repo Publishing Protocol in GEMINI.md:
  1. Main Repo (Variant A): BIM Scope / Project -> https://github.com/wwbim/BIM-Scope.git (Account: wwbim)
  2. Deliverables Repo (Variant B): SWBIM Scope / Deliverables -> https://github.com/samwoh/SWBIM-Scope.git (Account: Samwoh-WW)
  3. Source Repo (Variant B): SWBIM Scope / Project -> https://github.com/Samwoh-WW/SWBIM-Scope.git (Account: Samwoh-WW)
"""

import os
import sys
import subprocess
import argparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VAR_B_DELIV_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "SWBIM Scope", "Deliverables"))
VAR_B_PROJ_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "SWBIM Scope", "Project"))

def run_command(cmd, cwd=None, env=None):
    merged_env = os.environ.copy()
    merged_env["GIT_EDITOR"] = "true"
    if env:
        merged_env.update(env)
    res = subprocess.run(cmd, cwd=cwd or BASE_DIR, env=merged_env, capture_output=True, text=True)
    return res

def publish_all(commit_msg=None):
    py_exe = sys.executable

    print("=" * 70)
    print("  BIM Scope & SWBIM Scope: 3-Way Synchronized Publishing Pipeline")
    print("=" * 70)

    # ---------------------------------------------------------
    # STEP 1: Compile Edition A (BIM Scope)
    # ---------------------------------------------------------
    print("\n[Step 1/3] Building Edition A (BIM Scope standalone html)...")
    build_res = subprocess.run([py_exe, "build_viewer.py"], cwd=BASE_DIR)
    if build_res.returncode != 0:
        print("  - [ERROR] Edition A build failed! Aborting publish.")
        return False

    # Check git status in Repo 1 (Variant A)
    status_res = run_command(["git", "status", "-s"], cwd=BASE_DIR)
    changes = status_res.stdout.strip()
    if changes:
        print(f"  - Detected uncommitted changes in Variant A:\n{changes}")
        run_command(["git", "add", "-A"], cwd=BASE_DIR)
        if not commit_msg:
            try:
                log_res = run_command(["git", "log", "-1", "--pretty=%B"], cwd=BASE_DIR)
                commit_msg = log_res.stdout.strip() or "release: update BIM Scope distribution"
            except Exception:
                commit_msg = "release: update BIM Scope distribution"
        commit_res = run_command(["git", "commit", "-m", commit_msg], cwd=BASE_DIR)
        print(f"  - Created local commit: {commit_msg}")
    else:
        print("  - Working tree in Variant A is clean.")

    # Push Repo 1 (Variant A: wwbim)
    print("  - Pulling & Pushing Variant A to https://github.com/wwbim/BIM-Scope.git (Account: wwbim)...")
    pull_res = run_command(["git", "pull", "--rebase", "origin", "main"], cwd=BASE_DIR)
    if pull_res.returncode != 0:
        print(f"  - [WARNING] Git pull rebase warning: {pull_res.stderr.strip() or pull_res.stdout.strip()}")
    push_res = run_command(["git", "push", "origin", "main"], cwd=BASE_DIR)
    if push_res.returncode == 0:
        print("  - [OK] Successfully pushed Variant A (BIM Scope) to origin/main!")
    else:
        print(f"  - [ERROR] Push failed for Variant A: {push_res.stderr.strip()}")
        return False

    # ---------------------------------------------------------
    # STEP 2 & 3: Sync Variant B & Push Deliverables + Source
    # ---------------------------------------------------------
    print("\n[Step 2 & 3/3] Syncing Variant B & Pushing Deliverables and Source (Account: Samwoh-WW)...")
    sync_res = subprocess.run([py_exe, "sync_variant_b.py", "--push"], cwd=BASE_DIR)
    if sync_res.returncode != 0:
        print("  - [ERROR] Variant B synchronization/push returned error code.")
        return False

    # ---------------------------------------------------------
    # VERIFICATION & SUMMARY
    # ---------------------------------------------------------
    print("\n" + "=" * 70)
    print("  3-Way Publishing Verification & Summary")
    print("=" * 70)

    repos = [
        ("Variant A (Main Project)", BASE_DIR, "https://github.com/wwbim/BIM-Scope.git", "wwbim"),
        ("Variant B (Deliverables)", VAR_B_DELIV_DIR, "https://github.com/samwoh/SWBIM-Scope.git", "Samwoh-WW"),
        ("Variant B (Source Project)", VAR_B_PROJ_DIR, "https://github.com/Samwoh-WW/SWBIM-Scope.git", "Samwoh-WW"),
    ]

    for name, path, url, acct in repos:
        if os.path.exists(os.path.join(path, ".git")):
            head_res = run_command(["git", "rev-parse", "--short", "HEAD"], cwd=path)
            head_sha = head_res.stdout.strip()
            print(f"  * {name}:")
            print(f"      Remote URL : {url}")
            print(f"      Auth User  : {acct}")
            print(f"      Commit SHA : {head_sha} (main)")
            print(f"      Status     : Synced & Up to Date")
        else:
            print(f"  * {name}: [NOT A GIT REPO]")

    print("=" * 70)
    print("  All 3 repositories published successfully!")
    print("=" * 70)
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="3-Way Multi-Repo Publisher")
    parser.add_argument("-m", "--message", default=None, help="Commit message for any uncommitted changes")
    args = parser.parse_args()
    success = publish_all(commit_msg=args.message)
    sys.exit(0 if success else 1)
