#!/bin/sh
# Builds the Wine prefix for DSM viewers at image build time: a cold `wineboot -i` takes ~30 s,
# which every first DSM connection after a container start used to wait for. Files identical to
# Wine's own PE files become symlinks (~690 MB -> ~13 MB). server.js copies this template to a
# prefix owned by the runtime user, since Wine refuses a prefix owned by anyone else.
set -e
P=$1
export WINEPREFIX="$P" WINEDEBUG=-all DISPLAY= WINEDLLOVERRIDES='mono=d;gecko=d'
timeout 300 wineboot -i
# wined3d GDI renderer: the viewer's Direct3D frames skip OpenGL (Mesa llvmpipe)
timeout 60 wine reg add 'HKCU\Software\Wine\Direct3D' /v renderer /t REG_SZ /d gdi /f
timeout 60 wineserver -w
find "$P/drive_c" -type f | while IFS= read -r f; do
  b=$(basename "$f")
  for d in /usr/lib/*-linux-gnu/wine/*-windows; do
    if [ -f "$d/$b" ] && cmp -s "$d/$b" "$f"; then ln -sf "$d/$b" "$f"; break; fi
  done
done
chmod -R a+rX "$P"
