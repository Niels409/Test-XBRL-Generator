"""Makes sure a downloaded SBR Nexus file is a loadable taxonomy package.

python3 tools/prepare_package.py <downloaded.zip> <out.zip>

Some SBR Nexus downloads are release bundles (PDFs, versioning reports, example messages and the package itself, each as a
separate file). This copies the zip that contains META-INF/taxonomyPackage.xml to <out.zip>, and the example messages (if any)
next to it as <out>-examples/.
"""
import io, os, sys, zipfile

src, out = sys.argv[1], sys.argv[2]


def is_package(z):
    return any(n.count('/') <= 2 and n.endswith('META-INF/taxonomyPackage.xml') for n in z.namelist())


data = open(src, 'rb').read()
z = zipfile.ZipFile(io.BytesIO(data))
if is_package(z):
    open(out, 'wb').write(data)
    print(f'{src}: taxonomy package ({len(z.namelist())} files)')
    sys.exit(0)
print(f'{src}: release bundle with {len(z.namelist())} files:', ', '.join(z.namelist()))
found = False
for n in z.namelist():
    if not n.lower().endswith('.zip'):
        continue
    inner = z.read(n)
    try:
        iz = zipfile.ZipFile(io.BytesIO(inner))
    except zipfile.BadZipFile:
        continue
    if is_package(iz) and not found:
        open(out, 'wb').write(inner)
        print(f'  -> taxonomy package: {n} ({len(iz.namelist())} files)')
        found = True
    elif any(x.lower().endswith('.xbrl') for x in iz.namelist()) and 'voorbeeld' in n.lower():
        d = os.path.splitext(out)[0] + '-examples'
        os.makedirs(d, exist_ok=True)
        for x in iz.namelist():
            if x.lower().endswith('.xbrl'):
                open(os.path.join(d, os.path.basename(x)), 'wb').write(iz.read(x))
        print(f'  -> example messages: {n} -> {d}')
if not found:
    sys.exit(f'No taxonomy package found in {src}')
