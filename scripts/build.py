"""Build a deterministic XPI using Python's standard library. No npm dependencies."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'addon/manifest.json').read_text(encoding='utf-8'))
out = root / 'dist'
out.mkdir(exist_ok=True)
target = out / f'zotero-codex-reader-{manifest["version"]}.xpi'
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted((root / 'addon').rglob('*')):
        if path.is_file():
            info = zipfile.ZipInfo(path.relative_to(root / 'addon').as_posix(), (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, path.read_bytes())
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(out / (target.name + '.sha256')).write_text(f'{digest}  {target.name}\n', encoding='utf-8')
print(target)
print('SHA256:', digest)
source = out / f'zotero-codex-reader-{manifest["version"]}-source.zip'
with zipfile.ZipFile(source, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    candidates = [root / name for name in ('README.md', 'TESTING.md', 'LICENSE', 'package.json', '.gitignore')]
    for folder in ('addon', 'scripts', 'tests'):
        candidates.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    for path in sorted(candidates):
        info = zipfile.ZipInfo(path.relative_to(root).as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, path.read_bytes())
print(source)
