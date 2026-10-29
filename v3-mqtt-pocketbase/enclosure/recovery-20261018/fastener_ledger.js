// Nominal CAD stacks only: no measured hardware, tolerances or nut access proof.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const out=process.argv[2]||'revision-o';
const slope=Math.tan(Math.PI/12);
const rows=[];
function add(joint,count,grip,length){
  // Provisional 2x0.5mm washers, 2.4mm nut and 1mm exposed thread allowance.
  const required=grip+1+2.4+1;
  rows.push({joint,count,nominal_grip_mm:grip,assumed_bolt_length_mm:length,
    minimum_length_under_assumptions_mm:required,margin_mm:length-required,
    length_gate:length>=required});
}
add('Main and acoustic covers',8,33,40);
for(const y of [-13,13]) add('Thermal hood stack y='+y,2,17+16+(y-3.6)*slope-0.3,y<0?35:40);
for(const y of [-9,9]) add('Raised cradle to separator y='+y,2,3+9.2+y*slope,y<0?16:20);
add('Spine to three tub floors',6,8,14);
add('SHT arm to spine',2,10,16);
add('SHT carrier to arm',2,16,22);
add('Electronics tray, spacers and floor',4,12,18);
add('Two microphone carriers to face',8,6,12);
if(path.basename(out)==='revision-p')add('Supplementary main split-boss closure',2,7,12);
const report={basis:'CAD dimensions only; bolt length excludes head. Assumed washers total1mm, nut2.4mm, exposed thread1mm. Head envelopes separately constrained. No measured fit or nut-access proof.',
 rows,pass:rows.every(r=>r.length_gate),limitations:['Longer bolts can collide with electronics; no universal safe bolt length.', 'Check available stock lengths and real washer/nut sizes; use only hardware within head-envelope checks.', 'Cut threads must be deburred; never infer physical engagement from CAD arithmetic.']};
report.input_stl_sha256=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(out,'mesh-checks.json'))).parts.map(p=>[p.name,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,p.name+'.stl'))).digest('hex')]));
fs.writeFileSync(path.join(out,'fastener-ledger.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
