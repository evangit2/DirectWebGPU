"""Sum browser-exposed entries completed by first Present, with explicit scope limits."""
import argparse,json,pathlib
p=argparse.ArgumentParser();p.add_argument('--run',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
d=json.loads(a.run.read_text());d=d.get('report',d);scopes=d['realmResources'];assert set(scopes)=={'page','cpuWorker','gpuWorker'}
first=scopes['page']['timeOrigin']+d['startTimeMs']+d['presentationMetrics']['firstPresentMs']
rows=[];summary={}
for realm,s in scopes.items():
 assert s['retainedEntries']==s['resourceCount'],'truncated resource entries'
 selected=[];later=[]
 for kind,entries in [('resource',s['entries']),('navigation',s['navigation'])]:
  for entry in entries:
   row=dict(entry,realm=realm,kind=kind,startEpoch=s['timeOrigin']+entry['startTime'],endEpoch=s['timeOrigin']+entry['responseEnd'])
   (selected if row['endEpoch']<=first else later).append(row)
 rows+=selected
 summary[realm]=dict(snapshotEpoch=s['snapshotEpoch'],entriesCompletedByFirstPresent=len(selected),entriesCompletedAfterFirstPresent=len(later),transferSize=sum(e['transferSize'] for e in selected),encodedBodySize=sum(e['encodedBodySize'] for e in selected),navigation=[e for e in selected if e['kind']=='navigation'])
result=dict(runId=d['runId'],runtimeRevision=d['build']['runtimeBuild']['revision'],executableSha256=d['executableSha256'],source=str(a.run),firstPresentEpoch=first,assetCache=d['assetCacheMetrics'],scopes=summary,exposedEntrySums=dict(transferSize=sum(e['transferSize'] for e in rows),encodedBodySize=sum(e['encodedBodySize'] for e in rows)),entries=rows,limitations=['Sums cover browser-exposed completed entries, not exact wire traffic or all required downloads. Missing module timing entries and browser caching may undercount.','Navigation included separately; page setup before Start included. First Present is submission, not correct-scene display timing.','No URL-based deduplication: repeat requests are separate resource entries. Cross-realm browser accounting is not an independent network capture.','Browser transferSize includes reported overhead; it is not packet-level bytes. Asset-cache metrics overlap CPU resource entries and must not be added.','Resources unfinished at first Present have no partial byte measurement.'])
a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['runId','scopes','exposedEntrySums']},indent=2))
