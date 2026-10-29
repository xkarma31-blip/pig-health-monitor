// Independent binary STL audit: exported scale, volume, topology and components.
// Usage: node check_exports.js revision-o
const fs=require('fs'),path=require('path');
const crypto=require('crypto');
const dir=path.join(__dirname,process.argv[2]||'revision-o');
const checks=JSON.parse(fs.readFileSync(path.join(dir,'mesh-checks.json')));
const results=[];
for(const part of checks.parts){
 const b=fs.readFileSync(path.join(dir,part.name+'.stl'));
 const n=b.readUInt32LE(80);
 if(b.length!==84+50*n)throw Error('STL byte count '+part.name);
 const verts=[],ids=new Map(),edges=new Map(),parent=[];
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 let volume=0;
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 function vertex(v){const key=v.join(',');if(!ids.has(key)){ids.set(key,verts.length);parent.push(verts.length);verts.push(v);}return ids.get(key);}
 for(let i=0;i<n;i++){
  const vv=[];
  for(let j=0;j<3;j++){
   const p=84+50*i+12+j*12,v=[0,1,2].map(k=>b.readFloatLE(p+4*k));
   vv.push(v);for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[k]);hi[k]=Math.max(hi[k],v[k]);}
  }
  const [a,c,d]=vv;
  volume+=(a[0]*(c[1]*d[2]-c[2]*d[1])+a[1]*(c[2]*d[0]-c[0]*d[2])+a[2]*(c[0]*d[1]-c[1]*d[0]))/6;
  const ix=vv.map(vertex);
  for(let j=0;j<3;j++){
   const x=ix[j],y=ix[(j+1)%3],key=[Math.min(x,y),Math.max(x,y)].join(',');
   edges.set(key,(edges.get(key)||0)+1);parent[root(x)]=root(y);
  }
 }
 const components=new Set(verts.map((_,i)=>root(i))).size;
 const badEdges=[...edges.values()].filter(n=>n!==2).length;
 const dims=hi.map((v,i)=>v-lo[i]);
 const scaleOK=dims.every((v,i)=>Math.abs(v-part.bounds_mm[i])<0.01);
 results.push({part:part.name,triangles:n,components,nonmanifold_edges:badEdges,
    sha256:crypto.createHash('sha256').update(b).digest('hex'),
    exported_bounds_mm:dims,scale_matches_blender:scaleOK,signed_volume_mm3:volume,
   pass:components===1&&badEdges===0&&scaleOK&&volume>0});
}
const report={description:'Independent exported-STL topology and scale audit; not self-intersection/fit/strength certification',pass:results.every(r=>r.pass),results};
fs.writeFileSync(path.join(dir,'export-checks.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exitCode=report.pass?0:1;
