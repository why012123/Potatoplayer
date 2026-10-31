#!/usr/bin/env python3
"""Drive potatohq rpc through a gapless chain and report timing/underruns.

Usage: gapless_chain.py <potatohq-binary> <track1> <track2> [...]
"""
import json, subprocess, sys, threading, time

def main():
    binary, tracks = sys.argv[1], sys.argv[2:]
    if len(tracks) < 2:
        print("need at least two tracks"); return 2
    proc = subprocess.Popen([binary, "rpc"], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
    lock = threading.Lock()
    state = {"next": 1, "tracks": [], "underruns": 0, "finished": False, "last": {}}

    def send(obj):
        with lock:
            proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()

    def reader():
        for line in proc.stdout:
            try: msg = json.loads(line)
            except Exception: continue
            if msg.get("event") == "playback.track":
                d = msg["data"]; t = time.time()
                state["tracks"].append((d.get("trackId"), d.get("path"), d.get("gapless", False), t))
                print(f"[{t - state['t0']:6.2f}s] track {d.get('trackId')} gapless={d.get('gapless', False)}")
                # Queue the following track as soon as this one starts.
                if d.get("gapless") and state["next"] < len(tracks):
                    send({"id": 100 + state["next"], "method": "playback.setNext",
                          "params": {"path": tracks[state["next"]], "trackId": f"T{state['next']}"}})
                    state["next"] += 1
            elif msg.get("event") == "playback.finished":
                state["finished"] = True
                print("finished")
            elif msg.get("id") == 999 and "result" in msg:
                state["last"] = msg["result"]

    threading.Thread(target=reader, daemon=True).start()
    state["t0"] = time.time()
    send({"id": 1, "method": "playback.play",
          "params": {"path": tracks[0], "trackId": "T0",
                     "nextPath": tracks[1], "nextTrackId": "T1"}})
    state["next"] = 2
    deadline = state["t0"] + 120
    while time.time() < deadline and not state["finished"]:
        time.sleep(0.25)
    send({"id": 999, "method": "playback.state"}); time.sleep(0.4)
    send({"id": 998, "method": "engine.shutdown"}); time.sleep(0.2)
    proc.wait(timeout=5)
    last = state["last"]
    print(f"tracks played : {len(state['tracks'])}")
    print(f"wall clock    : {time.time() - state['t0']:.2f}s")
    print(f"underruns     : {last.get('underruns')}")
    print(f"trackId       : {last.get('trackId')}")
    ok = len(state["tracks"]) >= len(tracks) and last.get("underruns") == 0
    print("RESULT        :", "PASS" if ok else "FAIL")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
