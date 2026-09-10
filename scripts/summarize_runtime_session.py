"""Create compact, publishable evidence from a persisted browser session."""

import argparse
import base64
import json
from pathlib import Path


def frame_metadata(frame):
    return {key: value for key, value in frame.items() if key != 'jpegBase64'}


parser = argparse.ArgumentParser()
parser.add_argument('session', type=Path)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--frame-output', type=Path)
parser.add_argument('--frame-present', type=int, default=30)
args = parser.parse_args()

report = json.loads(args.session.read_text())['report']
metrics = report['presentationMetrics']
build = report['build']
runtime_build = build.get('runtimeBuild') or {}
captures = report.get('frameCaptures') or []

summary = {
    'status': report['status'],
    'runtime': report['runtime'],
    'revision': build['revision'],
    'runtimeBuildRevision': runtime_build.get('revision'),
    'runtimeBuildWasClean': runtime_build.get('workingTreeDirty') is False,
    'executableSha256': report['executableSha256'],
    'browser': {
        'userAgent': report['browser']['userAgent'],
        'secureContext': report['browser']['secureContext'],
        'crossOriginIsolated': report['browser']['crossOriginIsolated'],
        'adapter': report['browser']['adapter'],
    },
    'firstPresentObservedMs': report['firstPresentObservedMs'],
    'requestedDurationMs': report['requestedDurationMs'],
    'applicationPresents': report['applicationPresents'],
    'submittedFrames': report['submittedFrames'],
    'gpuSubmissions': report['gpuSubmissions'],
    'presentationMetrics': {
        'warmupMs': metrics['warmupMs'],
        'totalSteadyIntervals': metrics['totalSteadyIntervals'],
        'steadyDurationMs': metrics['steadyDurationMs'],
        'submissionFPS': metrics['submissionFPS'],
        'frameTimeMs': metrics['frameTimeMs'],
        'drawBridge': metrics['drawBridge'],
        'pipelineCacheEntries': metrics['pipelineCacheEntries'],
        'shaderObjects': metrics['shaderObjects'],
        'captureEnabled': metrics['captureEnabled'],
        'limitations': metrics['limitations'],
    },
    'assetCacheMetrics': report['assetCacheMetrics'],
    'frameCaptures': [frame_metadata(frame) for frame in captures],
    'droppedEvents': report['droppedEvents'],
}

args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(summary, indent=2) + '\n')

if args.frame_output:
    frame = min(captures, key=lambda item: abs(item['present'] - args.frame_present))
    args.frame_output.parent.mkdir(parents=True, exist_ok=True)
    args.frame_output.write_bytes(base64.b64decode(frame['jpegBase64']))

print(json.dumps({
    'summary': str(args.output),
    'frame': str(args.frame_output) if args.frame_output else None,
    'revision': summary['revision'],
    'applicationPresents': summary['applicationPresents'],
    'submissionFPS': summary['presentationMetrics']['submissionFPS'],
}, indent=2))
