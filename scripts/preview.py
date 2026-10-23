"""Stage a fixture-only UI preview; serve this directory, not the project root."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
target = root / 'test-results' / 'ui'
(target / 'content').mkdir(parents=True, exist_ok=True)
shutil.copyfile(root / 'tests/sidebar-preview.html', target / 'index.html')
for name in ('core.js', 'projects.js', 'markdown.js', 'sidebar.js'):
    shutil.copyfile(root / 'addon/content' / name, target / name)
shutil.copyfile(root / 'addon/content/sidebar.css', target / 'content/sidebar.css')
shutil.copytree(root / 'addon/content/vendor', target / 'content/vendor', dirs_exist_ok=True)
print(target)
