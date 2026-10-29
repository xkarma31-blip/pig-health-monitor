// Fail closed if fresh sliced outputs are absent or the current STL changed.
const fs=require('fs');
const crypto=require('crypto');
const path=require('path');
const root=path.join(__dirname,'research-adapters');
const names=['sht-12x12','sht-18x12.7','sht-25.5x17.7','mic_14x12_corner_support','research_spine_tray_access'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rows=names.map(name=>{
  const stl=path.join(root,name+'.stl');
  const log=path.join(root,'slicer',name+'.log');
  const gcode=path.join(root,'slicer',name+'.gcode');
  const text=fs.readFileSync(log,'utf8');
  const pass=/Slicing result exported to/.test(text)&&!/(?:warning|error)\s*:/i.test(text)
    &&fs.statSync(gcode).size>1000&&fs.statSync(gcode).mtimeMs>=fs.statSync(stl).mtimeMs;
  return {name,pass,stl_sha256:hash(stl),log_sha256:hash(log),gcode_sha256:hash(gcode)};
});
fs.writeFileSync(path.join(root,'slicer','verified-manifest.json'),JSON.stringify({pass:rows.every(r=>r.pass),parts:rows},null,2));
console.log(JSON.stringify(rows,null,2));
if(rows.some(r=>!r.pass))process.exitCode=1;
