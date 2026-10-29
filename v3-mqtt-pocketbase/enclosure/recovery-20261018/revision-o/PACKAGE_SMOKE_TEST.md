# Archive smoke test

Freshly unpacked release into /tmp/opencode/pigpulse-o-unpack-iPG9ET9Z.
Ran from unpacked root,not canonical working directory:

- node check_exports.js revision-o:17 export audits pass.
- blender -b --python-exit-code1 --python check_strap_relief.py:preserved N fails
  relief condition as intended,O passes.
- blender -b --python-exit-code1 --python check_strap_corridor.py:all10 checks pass.

Archive SHA256 check passes. Mandatory workflow scripts,N negative-control STL,
original poster and artwork derivative present. No G-code included. This is a
source/data packaging smoke test,not a fresh full-build or physical test.
