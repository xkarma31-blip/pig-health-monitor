// Independently audit current thermal binary STL exports and fresh slicer evidence.
const fs=require('fs'),crypto=require('crypto');
const path=require('path');
const out=__dirname;
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const parts=[];
for(const board of ['pcb25_4x17_78','pcb25_4square','pcb28x16']){
  for(const suffix of ['rear_insert','retainer_1','retainer_2']){
    const name=`${board}_${suffix}`,stl=path.join(out,name+'.stl'),b=fs.readFileSync(stl);
    const count=b.readUInt32LE(80),edges=new Map(),parent=new Map();let volume=0;
    const root=k=>{if(!parent.has(k))parent.set(k,k);let r=k;while(parent.get(r)!==r)r=parent.get(r);return r;};
    for(let i=0;i<count;i++){
      const v=[0,1,2].map(j=>[0,1,2].map(k=>b.readFloatLE(84+i*50+12+j*12+k*4)));
      const keys=v.map(p=>p.join(','));
      for(let j=0;j<3;j++){
        const a=keys[j],c=keys[(j+1)%3],key=[a,c].sort().join('|');
        edges.set(key,(edges.get(key)||0)+1);parent.set(root(a),root(c));
      }
      const [a,c,d]=v;
      volume+=(a[0]*(c[1]*d[2]-c[2]*d[1])+a[1]*(c[2]*d[0]-c[0]*d[2])+a[2]*(c[0]*d[1]-c[1]*d[0]))/6;
    }
    const components=new Set([...parent.keys()].map(root)).size;
    const nonmanifold=[...edges.values()].filter(n=>n!==2).length;
    const log=path.join(out,'slicer',name+'.log'),gcode=path.join(out,'slicer',name+'.gcode');
    const text=fs.existsSync(log)?fs.readFileSync(log,'utf8'):'';
    const sliced=fs.existsSync(gcode)&&fs.statSync(gcode).mtimeMs>=fs.statSync(stl).mtimeMs&&fs.statSync(gcode).size>1000&&/Slicing result exported to/.test(text)&&!/(?:warning|error)\s*:/i.test(text);
    parts.push({name,components,nonmanifold,volume_mm3:volume,stl_sha256:hash(stl),sliced,
      gcode_sha256:sliced?hash(gcode):null,pass:b.length===84+50*count&&components===1&&!nonmanifold&&volume>0&&sliced});
  }
}
const report={pass:parts.every(p=>p.pass),parts};
const stamp=new Date().toISOString().replace(/[:.]/g,'');
fs.writeFileSync(path.join(out,`thermal-export-slicer-evidence-${stamp}.json`),JSON.stringify(report,null,2),{flag:'wx'});
fs.writeFileSync(path.join(out,'thermal-export-slicer-evidence.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
