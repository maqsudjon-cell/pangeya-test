#!/usr/bin/env python3
import json, os, urllib.request
from pathlib import Path

LIVE = os.environ["MPSF_LIVE"]
ROOT = Path(os.environ.get("BOARD_PATH", "board.json"))

def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "mpsf-board"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def valid(run):
    if not isinstance(run, dict) or run.get("tag") != "mpsf-hop":
        return False
    if run.get("side") not in ("mp", "sf"):
        return False
    try:
        score = int(run.get("score"))
        ms = int(run.get("ms"))
    except (TypeError, ValueError):
        return False
    if score < 1 or score > 5000:
        return False
    if ms < 400 or ms > 30 * 60 * 1000:
        return False
    if score > ms / 1000 * 15 + 30:
        return False
    return True

def empty():
    return {
        "mp": {"name": "Maqsudjon", "best": 0, "at": None},
        "sf": {"name": "Sohiba", "best": 0, "at": None},
        "runs": [],
    }

def apply(board, side, score, at):
    score = int(score or 0)
    if score < 1 or score > 5000:
        return
    row = board[side]
    if score > row["best"]:
        row["best"] = score
        row["at"] = at

def main():
    board = empty()
    if ROOT.exists():
        try:
            old = json.loads(ROOT.read_text())
            for side in ("mp", "sf"):
                row = old.get(side) or {}
                apply(board, side, row.get("best") or 0, row.get("at"))
        except Exception:
            pass
    try:
        remote = get(LIVE)
    except Exception as exc:
        print("live unread, keep archive", exc)
        return
    if not isinstance(remote, list):
        print("live unreadable, keep archive")
        return
    kept = []
    have = {"mp": 0, "sf": 0}
    for run in remote:
        if not valid(run):
            continue
        side = run["side"]
        score = int(run["score"])
        have[side] = max(have[side], score)
        apply(board, side, score, run.get("at"))
        kept.append({"side": side, "score": score, "at": run.get("at"), "id": run.get("id")})
    kept.sort(key=lambda item: item.get("at") or "", reverse=True)
    board["runs"] = kept[:12]
    text = json.dumps(board, ensure_ascii=False, indent=2) + "\n"
    prev = ROOT.read_text() if ROOT.exists() else ""
    if text != prev:
        ROOT.write_text(text)
        print("updated")
    else:
        print("unchanged")
    for side in ("mp", "sf"):
        best = board[side]["best"]
        if best <= have[side] or best <= 0:
            continue
        payload = json.dumps({
            "tag": "mpsf-hop",
            "id": "archive-%s-%s" % (side, best),
            "side": side,
            "score": best,
            "ms": 400000,
            "at": board[side]["at"] or "2026-11-16T00:00:00.000Z",
        }).encode()
        req = urllib.request.Request(
            LIVE,
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "mpsf-board"},
        )
        try:
            urllib.request.urlopen(req, timeout=30).read()
            print("healed", side)
        except Exception as exc:
            print("heal failed", side, exc)

if __name__ == "__main__":
    main()
