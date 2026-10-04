# -*- coding: utf-8 -*-
import os
import shutil

src = r"H:\我的云端硬盘\Software Develop\Project"
dst = r"H:\我的云端硬盘\Software Develop\BIM Scope\Project"

if os.path.exists(dst):
    for f in os.listdir(src):
        src_path = os.path.join(src, f)
        dst_path = os.path.join(dst, f)
        if os.path.isfile(src_path):
            shutil.copy2(src_path, dst_path)
    for d in ['src', 'libs']:
        s_dir = os.path.join(src, d)
        d_dir = os.path.join(dst, d)
        if os.path.exists(s_dir):
            shutil.copytree(s_dir, d_dir, dirs_exist_ok=True)
    print("Mirror successfully synced to:", dst)
else:
    print("Mirror directory not found:", dst)
