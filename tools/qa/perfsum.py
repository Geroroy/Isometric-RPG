# One line per scenario from a tools/qa/perf.mjs result file.
#   python3 tools/qa/perfsum.py tools/qa/out/perf/pace_s4.json [more.json ...]
import json, sys

for f in sys.argv[1:]:
    print('==', f)
    for k, r in json.load(open(f))['scenarios'].items():
        if not isinstance(r, dict) or 'fps' not in r:
            continue
        p = r['procCpuPct']
        print(f"{k} fps {r['fps']:5} gpuMs/f {r.get('gpuMsPerFrame', '-'):>6} gpu% {p.get('gpu-process', 0):6} renderer% {p.get('renderer', 0):5} "
              f"cb {r['callbackMs']['avg']:5}/{r['callbackMs']['p95']:5}/{r['callbackMs']['max']:6} heap {r['heapMB']['avg']:5} gc/s {r['gc']['perSec']}")
