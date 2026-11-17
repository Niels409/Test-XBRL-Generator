"""Replaces the compiled formula assertions in an existing app data file, without rebuilding the rest.

Usage: python3 build/inject_rules.py <rules.json from build_rules.py> <appdata.json> [<appdata.json> ...]
Use it after a change in build_rules.py; a full rebuild (build_model / build_appdata / build_uses) is only needed for a new
taxonomy version.
"""
import json, sys

rules = json.load(open(sys.argv[1]))
for path in sys.argv[2:]:
    app = json.load(open(path))
    for ep, e in app['eps'].items():
        if ep not in rules['cond'] or ep not in rules['req']:
            sys.exit(f'{path}: no rules for {ep} in {sys.argv[1]} (wrong taxonomy?)')
        e['cond'], e['req'] = rules['cond'][ep], rules['req'][ep]
    json.dump(app, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(path, {ep: (len(e['cond']), len(e['req'])) for ep, e in app['eps'].items()})
