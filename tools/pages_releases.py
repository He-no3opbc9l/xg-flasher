#!/usr/bin/env python3
"""Collect firmware (.xgf) of the repos in sources.json for the web flasher.

usage: python3 -I tools/pages_releases.py SITE_DIR [sources.json]

- releases: every release's .xgf (from its zip, or a bare .xgf asset) -> fw/<repo>/<tag>/
- nightly: the .xgf from the artifacts of the last successful CI runs on the branch (source keys
  "nightly": workflow file, "branch", "count") -> fw/<repo>/nightly/<sha7>/; needs GH_TOKEN
  (artifact downloads always need a token, even for public repos)

GitHub release assets and artifacts are not downloadable from a web page (no CORS), hence the copy.
The list goes to fw/releases.json: {"releases": [...], "nightly": [...]}, newest first.
"""
import hashlib
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
import zipfile

API = "https://api.github.com/"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def get(url, accept="application/vnd.github+json"):
    """GET with the token for api.github.com only; redirects are followed without it (blob storage
    rejects foreign Authorization headers)."""
    for _ in range(5):
        req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "xg-flasher-pages"})
        tok = os.environ.get("GH_TOKEN")
        if tok and url.startswith(API):
            req.add_header("Authorization", "Bearer " + tok)
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                url = e.headers["Location"]
                continue
            raise
    raise RuntimeError("too many redirects: " + url)


def api(path):
    return json.loads(get(API + path))


def safe(name):
    return re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(name))


def xgf_files(name, data):
    if name.lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return [(safe(i.filename), z.read(i)) for i in z.infolist()
                    if i.filename.lower().endswith(".xgf") and "__MACOSX" not in i.filename]
    return [(safe(name), data)]


def store(site, sub, found):
    files = []
    for fname, blob in found:
        os.makedirs(os.path.join(site, "fw", sub), exist_ok=True)
        with open(os.path.join(site, "fw", sub, fname), "wb") as f:
            f.write(blob)
        files.append({"name": fname, "path": "fw/%s/%s" % (sub, fname), "size": len(blob),
                      "sha256": hashlib.sha256(blob).hexdigest()})
    return files


def releases(site, repo, out):
    rdir = safe(repo.split("/")[-1])
    for rel in api("repos/%s/releases?per_page=100" % repo):
        if rel.get("draft"):
            continue
        files = []
        for asset in rel["assets"]:
            if re.search(r"\.(zip|xgf)$", asset["name"], re.I):
                data = get(asset["browser_download_url"], "application/octet-stream")
                files += store(site, "%s/%s" % (rdir, safe(rel["tag_name"])), xgf_files(asset["name"], data))
        if not files:
            continue
        out.append({"repo": repo, "tag": rel["tag_name"], "name": rel.get("name") or rel["tag_name"],
                    "date": rel.get("published_at") or rel.get("created_at"),
                    "prerelease": bool(rel.get("prerelease")), "url": rel["html_url"], "files": files})
        print("%s %s: %s" % (repo, rel["tag_name"], ", ".join(f["name"] for f in files)))


def nightly(site, repo, workflow, branch, count, out):
    if not os.environ.get("GH_TOKEN"):
        print("%s nightly: skipped, no GH_TOKEN" % repo)
        return
    rdir = safe(repo.split("/")[-1])
    on_branch = {c["sha"] for c in api("repos/%s/commits?sha=%s&per_page=100" % (repo, branch))}
    runs = api("repos/%s/actions/workflows/%s/runs?branch=%s&event=push&status=success&per_page=30"
               % (repo, workflow, branch))["workflow_runs"]
    seen = set()
    for run in runs:
        sha = run["head_sha"]
        if len(out) >= count or sha in seen or sha not in on_branch:   # skip force-pushed-away commits
            continue
        seen.add(sha)
        files = []
        for art in api("repos/%s/actions/runs/%d/artifacts" % (repo, run["id"]))["artifacts"]:
            if not art["expired"]:
                data = get(art["archive_download_url"])
                files += store(site, "%s/nightly/%s" % (rdir, sha[:7]), xgf_files("a.zip", data))
        if not files:
            continue
        msg = (run.get("head_commit") or {}).get("message", "").split("\n")[0]
        out.append({"repo": repo, "tag": sha[:7], "name": msg, "date": run["created_at"], "nightly": True,
                    "url": "https://github.com/%s/commit/%s" % (repo, sha), "files": files})
        print("%s nightly %s: %s" % (repo, sha[:7], ", ".join(f["name"] for f in files)))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    site = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sources.json")
    rel, night = [], []
    for s in json.load(open(src))["sources"]:
        releases(site, s["repo"], rel)
        if s.get("nightly"):
            n = []
            nightly(site, s["repo"], s["nightly"], s.get("branch", "main"), s.get("count", 5), n)
            night += n
    for lst in (rel, night):
        lst.sort(key=lambda r: r["date"] or "", reverse=True)
    os.makedirs(os.path.join(site, "fw"), exist_ok=True)
    with open(os.path.join(site, "fw", "releases.json"), "w") as f:
        json.dump({"releases": rel, "nightly": night}, f, indent=1)
    print("%d releases, %d nightly -> %s/fw/releases.json" % (len(rel), len(night), site))
    return 0


if __name__ == "__main__":
    sys.exit(main())
