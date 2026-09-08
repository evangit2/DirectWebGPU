"""Summarize an explicit, homogeneous original-executable startup series."""
import argparse, json, pathlib, statistics
p = argparse.ArgumentParser()
p.add_argument('--directory', type=pathlib.Path, required=True)
p.add_argument('--output', type=pathlib.Path, required=True)
a = p.parse_args()
trials, identities = [], []
for path in sorted(a.directory.glob('*.json')):
    d = json.loads(path.read_text())
    assert d['status'] == 'startup trial completed after first Present'
    assert d['originalExecutionAttempted'] and d['applicationPresents'] > 0
    b = d['build']['runtimeBuild']; c = d['assetCacheMetrics']; frames = d.get('frameCaptures', [])
    identity = {k: b[k] for k in ['revision', 'sourceSha256', 'artifacts', 'executableSha256']}
    identity.update(browser=d['browser'], window=d['window'])
    identities.append(identity)
    assert identity == identities[0], 'Mixed runtime/browser/resolution series'
    assert c['mode'] in ['cold', 'warm']
    assert (c['hits'], c['misses']) == ((0, 19) if c['mode'] == 'cold' else (19, 0))
    assert not frames or frames[0]['present'] == 1
    trials.append(dict(runId=d['runId'], source=str(path), mode=c['mode'], captureEnabled=bool(frames), firstPresentMs=d['presentationMetrics']['firstPresentMs'], sceneReadbackCompletedMs=frames[0]['readbackCompletedMs'] if frames else None, assetCacheHits=c['hits'], assetCacheMisses=c['misses'], assetNetworkBodyBytes=c['networkBodyBytes']))
assert len({t['runId'] for t in trials}) == len(trials)
groups = {}
for capture in [False, True]:
    for mode in ['cold', 'warm']:
        subset = [t for t in trials if t['mode'] == mode and t['captureEnabled'] == capture]
        assert len(subset) >= 3
        field = 'sceneReadbackCompletedMs' if capture else 'firstPresentMs'
        values = [t[field] for t in subset]
        groups[f"{mode}-{'scene-readback' if capture else 'timing-only'}"] = dict(count=len(values), medianMs=statistics.median(values), minMs=min(values), maxMs=max(values))
result = dict(identity=identities[0], trials=trials, groups=groups, limitations=['Cold clears only app-owned asset/WASM CacheStorage; browser compiler and OS caches uncontrolled.', 'Timing-only is first Present submission; separately reviewed capture readback completion is an upper bound on first scene availability including capture overhead.', 'Asset bytes exclude page, JavaScript and shader-runtime fetches; per-realm ResourceTiming is retained in raw reports.', 'No display scan-out timing; visible Chromium 152 / Apple Metal 3 at 1280x720.'])
a.output.write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(groups, indent=2))
