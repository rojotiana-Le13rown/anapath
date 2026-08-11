#!/usr/bin/env python3
"""Equivalent Python de scripts/export-code-html.js : genere anapath-code-export.html."""
import os
import sys
import datetime
import html as html_mod

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'anapath-code-export.html')

EXCLUDE_DIRS = {'node_modules', '.next', 'dist', '.git', 'coverage', '.cursor', 'scripts'}
EXCLUDE_FILES = {'package-lock.json', 'anapath-code-export.html'}
INCLUDE_EXT = {'.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.yaml', '.yml', '.md'}


def escape_html(s):
    return html_mod.escape(s, quote=True)


def walk(dirpath, files=None):
    if files is None:
        files = []
    try:
        entries = sorted(os.scandir(dirpath), key=lambda e: e.name)
    except OSError:
        return files
    for entry in entries:
        full = os.path.join(dirpath, entry.name)
        if entry.is_dir():
            if entry.name not in EXCLUDE_DIRS:
                walk(full, files)
        else:
            ext = os.path.splitext(entry.name)[1].lower()
            if ext in INCLUDE_EXT and entry.name not in EXCLUDE_FILES:
                files.append(os.path.relpath(full, ROOT).replace(os.sep, '/'))
    return files


files = walk(ROOT)
files.sort()
toc = []
sections = []

for rel in files:
    full_path = os.path.join(ROOT, *rel.split('/'))
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except (OSError, UnicodeDecodeError):
        continue

    fid = ''.join(c if (c.isalnum() or c == '-') else '-' for c in rel)
    lines = content.split('\n').__len__()
    toc.append(
        '<li><a href="#{}">{}</a> <span class="meta">({} lignes)</span></li>'.format(
            fid, escape_html(rel), lines
        )
    )
    sections.append(
        '<section id="{}" class="file">\n<h2><code>{}</code></h2>\n<pre><code>{}</code></pre>\n</section>'.format(
            fid, escape_html(rel), escape_html(content)
        )
    )

css = """:root{--bg:#0f172a;--panel:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--accent:#38bdf8;--border:#334155}
*{box-sizing:border-box}
body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
header{padding:1.5rem 2rem;background:var(--panel);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10}
header h1{margin:0 0 .25rem;font-size:1.5rem}
header p{margin:0;color:var(--muted)}
.layout{display:grid;grid-template-columns:320px 1fr;min-height:calc(100vh - 90px)}
nav{background:var(--panel);border-right:1px solid var(--border);padding:1rem;overflow:auto;max-height:calc(100vh - 90px);position:sticky;top:90px}
nav h2{font-size:.9rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 .75rem}
nav ul{list-style:none;padding:0;margin:0}
nav li{margin:.35rem 0;font-size:.85rem}
nav a{color:var(--accent);text-decoration:none}
nav a:hover{text-decoration:underline}
.meta{color:var(--muted);font-size:.75rem}
main{padding:1.5rem 2rem;overflow:auto}
.file{margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border)}
.file h2{font-size:1rem;margin:0 0 .75rem;color:var(--accent)}
pre{margin:0;padding:1rem;background:#020617;border:1px solid var(--border);border-radius:8px;overflow:auto;font-size:.78rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}
code{font-family:Consolas,Monaco,monospace}
@media(max-width:900px){.layout{grid-template-columns:1fr}nav{position:static;max-height:none}}
"""

html = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anapath - Export du code source</title>
<style>
{css}
</style>
</head>
<body>
<header>
<h1>Projet Anapath - Export du code</h1>
<p>{n} fichiers | Généré le {now}</p>
</header>
<div class="layout">
<nav><h2>Table des matières</h2><ul>
{toc}
</ul></nav>
<main>
{sections}
</main>
</div>
</body>
</html>""".format(
    css=css,
    n=len(files),
    now=datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
    toc='\n'.join(toc),
    sections='\n'.join(sections),
)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print('Created:', OUT)
print('Files:', len(files))
