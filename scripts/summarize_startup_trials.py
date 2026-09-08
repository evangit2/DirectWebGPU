"""Recompute statistics from saved original-executable trial reports."""
import json,pathlib,statistics
root=pathlib.Path(__file__).resolve().parents[1]
trials=[]
for path in sorted((root/'evidence/startup-trials').glob('*.json')):
    d=json.loads(path.read_text());cache=d['assetCacheMetrics'];captures=d.get('frameCaptures',[])
    trials.append({'runId':d['runId'],'revision':d['build']['runtimeBuild']['revision'],'mode':cache['mode'],'captureEnabled':bool(captures),'firstPresentMs':d['presentationMetrics']['firstPresentMs'],'sceneReadbackCompletedMs':captures[0]['readbackCompletedMs'] if captures else None,'assetCacheHits':cache['hits'],'assetCacheMisses':cache['misses'],'assetNetworkBodyBytes':cache['networkBodyBytes'],'source':str(path.relative_to(root))})
groups={}
for capture in [False,True]:
    for mode in ['cold','warm']:
        subset=[t for t in trials if t['mode']==mode and t['captureEnabled']==capture]
        field='sceneReadbackCompletedMs' if capture else 'firstPresentMs';values=[t[field] for t in subset]
        if values:groups[f"{mode}-{'scene-readback' if capture else 'timing-only'}"]={'count':len(values),'medianMs':statistics.median(values),'minMs':min(values),'maxMs':max(values)}
result={'trials':trials,'groups':groups,'definitions':{'cold':'App-owned immutable asset/WASM cache cleared before launch','warm':'Same cache populated and each body hash verified','scene-readback':'Upper bound from GPU readback completion; capture overhead included; visual review stored separately','timing-only':'No framebuffer capture; timestamp is first Present submission'},'limitations':['Browser compiler and OS cache state uncontrolled','JS modules, shader-runtime and page downloads outside asset-cache byte count','No display scan-out timing','Same release WASM, 800x600, visible Chromium152/Apple Metal3']}
(root/'evidence/startup-metrics.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(groups,indent=2))
