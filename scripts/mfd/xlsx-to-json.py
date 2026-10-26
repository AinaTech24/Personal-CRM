"""AINA MFD Command Centre — workbook → JSON.

Usage: python scripts/mfd/xlsx-to-json.py <Field_Dictionary.xlsx> docs/mfd-command-centre/field-dictionary.json
then:  node scripts/mfd/generate.mjs

Convert each sheet of the field-dictionary workbook to a list of row dicts keyed by its header row.

Sheets have a title row, a subtitle row, then the header row. Writes one JSON file with {sheet: [rows]}.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def col_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read(path):
    out = {}
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(S + "si"):
                shared.append("".join(t.text or "" for t in si.iter(S + "t")))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        for sh in wb.iter(S + "sheet"):
            target = rels[sh.get(R + "id")].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            rows = []
            for row in ET.fromstring(z.read(target)).iter(S + "row"):
                vals = {}
                for c in row.iter(S + "c"):
                    v = c.find(S + "v")
                    t = c.get("t")
                    if t == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter(S + "t"))
                    elif v is None:
                        continue
                    elif t == "s":
                        val = shared[int(v.text)]
                    else:
                        val = v.text or ""
                    vals[col_index(c.get("r"))] = val
                if vals:
                    rows.append([vals.get(i, "") for i in range(max(vals) + 1)])
            out[sh.get("name")] = rows
    return out


def main(src, dst):
    sheets = read(src)
    result = {}
    for name, rows in sheets.items():
        # header row = first row with >= 3 non-empty cells
        hi = next((i for i, r in enumerate(rows) if sum(1 for c in r if c.strip()) >= 3), None)
        if hi is None:
            result[name] = rows
            continue
        header = [h.strip() for h in rows[hi]]
        recs = []
        for r in rows[hi + 1 :]:
            if not any(c.strip() for c in r):
                continue
            recs.append({header[i]: (r[i].strip() if i < len(r) else "") for i in range(len(header)) if header[i]})
        result[name] = recs
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1, ensure_ascii=False)
    for k, v in result.items():
        print(f"{len(v):>5}  {k}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
