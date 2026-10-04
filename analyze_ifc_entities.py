# -*- coding: utf-8 -*-
import os
import re
from collections import Counter

ifc_path = r"C:\Users\wangw\Downloads\3. Medium IFC File.ifc"

geom_types = Counter()
product_types = Counter()
placement_count = 0
sample_entities = {}

with open(ifc_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        line = line.strip()
        if line.startswith("#"):
            m = re.match(r"#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\);", line)
            if m:
                eid, etype, args = m.groups()
                if etype.startswith("IFC") and ("BREP" in etype or "SOLID" in etype or "FACE" in etype or "SHELL" in etype or "CSG" in etype or "MAPPED" in etype):
                    geom_types[etype] += 1
                if etype.startswith("IFC") and ("COLUMN" in etype or "BEAM" in etype or "SLAB" in etype or "WALL" in etype or "MEMBER" in etype or "PLATE" in etype or "FOOTING" in etype or "PILE" in etype or "BUILDINGELEMENTPROXY" in etype):
                    product_types[etype] += 1
                if etype == "IFCLOCALPLACEMENT":
                    placement_count += 1
                if etype not in sample_entities and len(sample_entities) < 30:
                    sample_entities[etype] = line[:100]

print("--- Top Product Types ---")
for k, v in product_types.most_common(15):
    print(f"  {k}: {v}")

print("\n--- Top Geometry Types ---")
for k, v in geom_types.most_common(15):
    print(f"  {k}: {v}")

print(f"\nTotal IFCLOCALPLACEMENT count: {placement_count}")
