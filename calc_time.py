# -*- coding: utf-8 -*-
import datetime
import json
import os
import re

TRANSCRIPT_PATH = r'C:\Users\wangw\.gemini\antigravity\brain\c32053e9-0d69-4326-bb73-cc3f73cc9237\.system_generated\logs\transcript.jsonl'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHANGELOG_PATH = os.path.join(BASE_DIR, "CHANGELOG.md")

MILESTONES = {
    "2026-09-29": "项目脚手架初始化、Three.js 单文件离线引擎搭建 / Project scaffold & Three.js engine setup",
    "2026-09-30": "3D 罗盘、标高指示、图钉系统与演示模型初始构建 / 3D compass, elevation readouts, pin labels & demo model",
    "2026-10-01": "剖切手柄（Gizmo）、着色与材质系统初版 / Section gizmo controls, shader & material styling",
    "2026-10-02": "FBX 格式扩展、中大型 IFC 流式解析器研发 / FBX format integration, streaming IFC parsing",
    "2026-10-03": "墙体门窗洞口 CSG 布尔减运算、栏杆几何修正、检查器手风琴与层级树重构 / Wall CSG void cutouts, railing fixes, inspector accordions & tree refactor",
    "2026-10-04": "正交/透视切换、NSEW立面图、50步视图撤销重做、右键菜单保留选择、10%微光悬停 / Ortho/Persp toggle, NSEW views, 50-step view history, context menu fix, 10% hover",
    "2026-10-05": "左右面板原地折叠、纯度高亮、CAD标准双向框选、光标轴心环视、底部栏内阴影 / Stationary panels, pure highlight, CAD box selection, pivot orbit, bottom shadow",
    "2026-10-06": "多格式模型副标题与元数据档案全局联动、FBX加载与双语切换加固 / Multi-format subtitle & metadata sync, FBX robust loader, bilingual toggle sync"
}

def calculate_time_metrics():
    if not os.path.exists(TRANSCRIPT_PATH):
        return None

    times = []
    with open(TRANSCRIPT_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                obj = json.loads(line)
                ca = obj.get('created_at')
                if ca:
                    dt = datetime.datetime.fromisoformat(ca.replace('Z', '+00:00'))
                    times.append(dt + datetime.timedelta(hours=8)) # Local time UTC+8
            except:
                pass

    if not times:
        return None

    times.sort()
    total_steps = len(times)
    start_t = times[0]
    end_t = times[-1]
    cal_span = end_t - start_t
    cal_days = cal_span.days
    cal_hours = int(cal_span.seconds // 3600)
    cal_mins = int((cal_span.seconds % 3600) // 60)

    # Group into active sessions (threshold: 45 min)
    sessions = []
    curr_start = times[0]
    last_t = times[0]
    threshold_sec = 45 * 60

    for t in times[1:]:
        gap = (t - last_t).total_seconds()
        if gap > threshold_sec:
            sessions.append((curr_start, last_t, last_t - curr_start))
            curr_start = t
        last_t = t
    sessions.append((curr_start, last_t, last_t - curr_start))

    total_active_sec = sum(dur.total_seconds() for _, _, dur in sessions)
    active_hrs = int(total_active_sec // 3600)
    active_mins = int((total_active_sec % 3600) // 60)
    active_hrs_dec = total_active_sec / 3600

    # Daily breakdown
    daily_sessions = {}
    for st, en, dur in sessions:
        d = st.strftime("%Y-%m-%d")
        if d not in daily_sessions:
            daily_sessions[d] = {"sec": 0, "intervals": []}
        daily_sessions[d]["sec"] += dur.total_seconds()
        daily_sessions[d]["intervals"].append(f"{st.strftime('%H:%M')}~{en.strftime('%H:%M')}")

    breakdown = []
    for d in sorted(daily_sessions.keys()):
        sec = daily_sessions[d]["sec"]
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        ints = daily_sessions[d]["intervals"]
        if len(ints) <= 2:
            intervals_str = ", ".join(ints)
        else:
            intervals_str = f"{ints[0]}, {ints[-1]} (共 {len(ints)} 个时段)"
        breakdown.append({
            "date": d,
            "intervals": intervals_str,
            "time_str": f"{h}h {m:02d}m ({sec/3600:.2f}h)",
            "milestone": MILESTONES.get(d, "功能迭代与持续优化 / Feature development")
        })

    return {
        "total_steps": total_steps,
        "start_str": start_t.strftime("%Y-%m-%d %H:%M"),
        "end_str": end_t.strftime("%Y-%m-%d %H:%M"),
        "cal_days": cal_days,
        "cal_hours": cal_hours,
        "cal_mins": cal_mins,
        "active_hrs": active_hrs,
        "active_mins": active_mins,
        "active_hrs_dec": active_hrs_dec,
        "total_sessions": len(sessions),
        "breakdown": breakdown
    }

def format_metrics_markdown(metrics):
    rows = []
    for b in metrics["breakdown"]:
        rows.append(f"| **{b['date']}** | {b['intervals']} | {b['time_str']} | {b['milestone']} |")
    breakdown_table = "\n".join(rows)

    return f"""## 项目开发耗时统计 / Development Time Metrics

> ⏱️ **项目累计总工时 / Total Active Development Time**: **{metrics['active_hrs']} 小时 {metrics['active_mins']:02d} 分钟 ({metrics['active_hrs_dec']:.2f} Hours)**  
> 📅 **自然时间跨度 / Total Calendar Span**: **{metrics['cal_days']} 天 {metrics['cal_hours']} 小时 {metrics['cal_mins']:02d} 分钟** ({metrics['start_str']} 至 {metrics['end_str']})  
> 🔢 **累计交互与执行步骤 / Total Engineering Steps**: **{metrics['total_steps']:,} Steps** (跨 {metrics['total_sessions']} 个活跃开发会话 Sprint)  
> 🔄 **更新机制 / Update Policy**: 每次版本构建打包发布时基于真实日志自动重新精算累计工时。

### 阶段与每日工时分解 / Daily Breakdown
| 日期 / Date | 活跃开发时段 / Active Sprints | 有效工时 / Active Hours | 核心迭代内容 / Milestones |
| :--- | :--- | :---: | :--- |
{breakdown_table}
"""

def update_changelog():
    metrics = calculate_time_metrics()
    if not metrics:
        print("No metrics calculated (transcript not found).")
        return False

    with open(CHANGELOG_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    new_section = format_metrics_markdown(metrics)

    # Check if section already exists in CHANGELOG.md
    pattern = r"## 项目开发耗时统计 / Development Time Metrics.*?(?=\n---\n\n## \[v1\.|\Z)"
    if re.search(pattern, content, flags=re.DOTALL):
        updated_content = re.sub(pattern, new_section.rstrip(), content, flags=re.DOTALL)
    else:
        # Insert before the first version header "## [v1."
        first_version_pos = content.find("## [v1.")
        if first_version_pos != -1:
            updated_content = (
                content[:first_version_pos]
                + new_section
                + "\n---\n\n"
                + content[first_version_pos:]
            )
        else:
            updated_content = content + "\n\n" + new_section

    with open(CHANGELOG_PATH, "w", encoding="utf-8") as f:
        f.write(updated_content)

    print(f"Successfully updated CHANGELOG.md with total development time: {metrics['active_hrs']}h {metrics['active_mins']:02d}m ({metrics['active_hrs_dec']:.2f}h)")
    return True

if __name__ == '__main__':
    update_changelog()
