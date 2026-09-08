"""Summarize explicit original-run guest allocation snapshots without summing overlaps."""
import argparse, json, pathlib
p=argparse.ArgumentParser();p.add_argument('--run',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
d=json.loads(a.run.read_text());d=d.get('report',d)
assert d['originalExecutionAttempted'] and d['applicationPresents']>0
samples=d['guestMemory'];assert samples and samples[0]['present']==1
for sample in samples:
 assert sample['highestMappedEnd']<=sample['guestCapacityBytes']
 assert sample['heapOccupiedWithHeadersBytes']<=sample['heapCapacityBytes']<=sample['mappedBytes']
 assert all(0<=row[2]<=row[1] and 0<=row[3]<=row[1] for row in sample['heapRows'])
r=dict(runId=d['runId'],executableSha256=d['executableSha256'],runtimeBuild=d['build']['runtimeBuild'],source=str(a.run),status=d['status'],applicationPresents=d['applicationPresents'],samples=samples,wasmLinearMemoryBytes=d['presentationMetrics']['wasmLinearMemoryBytes'],heapRowColumns=['guestBaseAddress','reservedCapacityBytes','occupiedIncludingHeadersBytes','largestFreeBlockBytes','freeBlockCount'],limitations=['Guest address-space capacity is contained within WASM linear memory; mapped ranges and heap reservations are subsets of that capacity. Do not add these overlapping counters.','Heap occupancy measures compatibility heap allocations including 4-byte headers. Guest CRT allocators can suballocate inside VirtualAlloc ranges, which are only measured as mapped ranges.','Samples at first Present and each 1800th Present through 18000; transient allocation peaks between samples are not measured.','Up to 64 heap rows; aggregate counts cover all heaps.','These are allocator counters, not physical resident pages or total browser memory.','Capture and memory sampling make this a diagnostic run, not an ordinary throughput measurement.'])
a.output.write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(samples,indent=2))
