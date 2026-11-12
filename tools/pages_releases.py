#!/usr/bin/env python3
"""Collect the .xgf files of all GitHub releases of the firmware repos for the web flasher.

usage: python3 -I tools/pages_releases.py SITE_DIR [sources.json]

Release assets on github.com are not downloadable from a web page (no CORS), so every release's
.xgf (from its zip, or a bare .xgf asset) is copied to SITE_DIR/fw/<repo>/<tag>/ and listed in
SITE_DIR/fw/releases.json (newest first). Repos come from sources.json; GH_TOKEN is optional (rate
limits only).
"""
import hashlib
import io
import json
import os
import re
import sys
import urllib.request
import zipfile


def get(url, accept="application/vnd.github+json"):
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "g106-open-pages"})
    tok = os.environ.get("GH_TOKEN")
    if tok and url.startswith("https://api.github.com/"):
        req.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def safe(name):
    return re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(name))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    site = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sources.json")
    out = []
    for source in json.load(open(src))["sources"]:
        collect(site, source["repo"], out)
    out.sort(key=lambda r: r["date"] or "", reverse=True)
    os.makedirs(os.path.join(site, "fw"), exist_ok=True)
    with open(os.path.join(site, "fw", "releases.json"), "w") as f:
        json.dump({"releases": out}, f, indent=1)
    print("%d releases -> %s/fw/releases.json" % (len(out), site))
    return 0


def collect(site, repo, out):
    rels = json.loads(get("https://api.github.com/repos/%s/releases?per_page=100" % repo))
    rdir = safe(repo.split("/")[-1])
    for rel in rels:
        if rel.get("draft"):
            continue
        tag = safe(rel["tag_name"])
        files = []
        for asset in rel["assets"]:
            name = asset["name"]
            if not re.search(r"\.(zip|xgf)$", name, re.I):
                continue
            data = get(asset["browser_download_url"], "application/octet-stream")
            found = []
            if name.lower().endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    for info in z.infolist():
                        if info.filename.lower().endswith(".xgf") and "__MACOSX" not in info.filename:
                            found.append((safe(info.filename), z.read(info)))
            else:
                found.append((safe(name), data))
            for fname, blob in found:
                os.makedirs(os.path.join(site, "fw", rdir, tag), exist_ok=True)
                with open(os.path.join(site, "fw", rdir, tag, fname), "wb") as f:
                    f.write(blob)
                files.append({"name": fname, "path": "fw/%s/%s/%s" % (rdir, tag, fname), "size": len(blob),
                              "sha256": hashlib.sha256(blob).hexdigest()})
        if not files:
            continue
        out.append({"repo": repo, "tag": rel["tag_name"], "name": rel.get("name") or rel["tag_name"],
                    "date": rel.get("published_at") or rel.get("created_at"),
                    "prerelease": bool(rel.get("prerelease")), "url": rel["html_url"],
                    "files": files})
        print("%s %s: %s" % (repo, rel["tag_name"], ", ".join(f["name"] for f in files)))


if __name__ == "__main__":
    sys.exit(main())
