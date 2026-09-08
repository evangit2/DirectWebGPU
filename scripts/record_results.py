"""Summarize explicit run evidence without inferring visual success or failure."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def summarize(run, review=None):
    if 'report' in run:
        run = run['report']
    if not run.get('runId'):
        raise ValueError('runId missing')
    frames = []
    if review is not None:
        if review.get('runId', review.get('cameraRun')) != run['runId']:
            raise ValueError('visual review belongs to a different run')
        if review.get('executableSha256') != run.get('executableSha256'):
            raise ValueError('visual review executable hash mismatch')
        reviewed = review.get('visuallyInspectedFrames') or review.get('framesVisuallyInspected')
        if not reviewed:
            raise ValueError('visual review does not identify inspected frames')
        captured = {f['present'] for f in run.get('frameCaptures', [])}
        if not set(reviewed).issubset(captured):
            raise ValueError('reviewed frames are absent from run captures')
        for item in review.get('images', []):
            path = (ROOT / item['path']).resolve()
            if not path.is_relative_to(ROOT / 'evidence'):
                raise ValueError('review image outside evidence directory')
            if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
                raise ValueError('review image hash mismatch')
            frames.append(item)
        if len(frames) != len(reviewed):
            raise ValueError('review image count does not match inspected frames')
    errors = [e for e in run.get('events', []) if e.get('type') in
              ('failed', 'gpu-error', 'gpu-lost', 'draw-rejected', 'worker-error')]
    return {
        'runId': run['runId'],
        'revision': run.get('build', {}).get('revision'),
        'executableSha256': run.get('executableSha256'),
        'originalExecutionAttempted': run.get('originalExecutionAttempted', False),
        'visualStatus': 'reviewed' if review else 'not reviewed',
        'visualFinding': review.get('finding') if review else None,
        'reviewedImages': frames,
        'cameraChangedWhileHeld': review.get('cameraChangedWhileHeld') if review else None,
        'cameraStableAfterRelease': review.get('cameraStableAfterRelease') if review else None,
        'browserEvidence': run.get('browser'),
        'device': run.get('d3d9Device'),
        'applicationPresents': run.get('applicationPresents', 0),
        'submittedFrames': run.get('submittedFrames', 0),
        'presentationMetrics': run.get('presentationMetrics'),
        'assetCacheMetrics': run.get('assetCacheMetrics'),
        'stabilitySamples': run.get('stabilitySamples'),
        'sceneEquivalence': run.get('sceneEquivalence'),
        'terminalStatus': run.get('status'),
        'terminalDiagnostic': run.get('blocker'),
        'recordedErrors': errors,
        'limitations': 'Presents are not verified scene frames or display FPS. Missing visual review is not a black-scene finding. Bounded logs cannot prove absence of all errors. No overall acceptance claim is inferred.'
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--review', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'evidence/latest-run-summary.json')
    args = parser.parse_args()
    result = summarize(json.loads(args.run.read_text()), json.loads(args.review.read_text()) if args.review else None)
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k: result[k] for k in ('runId', 'visualStatus', 'terminalStatus')}))


if __name__ == '__main__':
    main()
