"""Build a standalone preview without copying any personal material."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
read = lambda name: (root / "dist" / name).read_text(encoding="utf-8-sig")
course = re.sub(r"^export ", "", read("course.js"), flags=re.M)
core = re.sub(r"^export ", "", read("core.js"), flags=re.M)
app = re.sub(r"^import .*\n", "", read("app.js"), flags=re.M)
app = re.sub(r"^try\{const r=await fetch\('\./api/status'.*\n", "", app, flags=re.M)
script = course + "\n" + core + "\nconst e=escapeHTML;\n" + app
script = script.replace("</script", "<\\/script")
html = read("index.html").replace('<link rel="stylesheet" href="./styles.css">', '<style>' + read("styles.css") + '</style>')
html = html.replace('<script type="module" src="./app.js"></script>', '<script type="module">' + script + '</script>')
for name in ("preview.html", "index.html"):
    (root / name).write_text(html, encoding="utf-8")
print("Built preview.html")
