from pathlib import Path
import hashlib


EXCLUDED_PARTS = {".git", "target", "out", "__pycache__"}


def patch_series(root: Path) -> list[Path]:
    """Return the one authoritative, deterministic Theseus patch order."""
    return [root / "patches/theseus.patch", *sorted((root / "patches").glob("theseus-*.patch"))]


def source_hashes(root: Path) -> dict[str, str]:
    result = {}
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if not path.is_file() or any(part in EXCLUDED_PARTS for part in relative.parts):
            continue
        result[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def read_source_manifest(root: Path) -> dict[str, str]:
    result = {}
    for line in (root / "patches/theseus-source.sha256").read_text().splitlines():
        digest, path = line.split("  ", 1)
        result[path] = digest
    return result
