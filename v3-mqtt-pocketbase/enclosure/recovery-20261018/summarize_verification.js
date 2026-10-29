const fs=require('fs'),path=require('path');
const crypto=require('crypto');
const p=path.join(__dirname,process.argv[2]||'revision-o');
const e=JSON.parse(fs.readFileSync(path.join(p,'export-checks.json')));
const ledgerPath=path.join(p,'fastener-ledger.json');
const ledger=fs.existsSync(ledgerPath)?JSON.parse(fs.readFileSync(ledgerPath)):null;
const gripPath=path.join(p,'grip-surface-checks.json');
const grip=fs.existsSync(gripPath)?JSON.parse(fs.readFileSync(gripPath)):null;
const corridorPath=path.join(p,'strap-corridor-checks.json');
const corridor=fs.existsSync(corridorPath)?JSON.parse(fs.readFileSync(corridorPath)):null;
const corridorGate=!['revision-o','revision-p'].includes(path.basename(p))||(corridor?.pass===true&&corridor.checks?.length===10&&corridor.checks.every(c=>c.pass===true)&&corridor.input_stl_sha256===e.results.find(x=>x.part==='microphone_strap_carrier')?.sha256);
const reliefPath=path.join(p,'strap-relief-comparison.json');
const relief=fs.existsSync(reliefPath)?JSON.parse(fs.readFileSync(reliefPath)):null;
const expectedReliefXY=[-1,1].flatMap(sign=>[11.2,11.8,12.4].flatMap(x=>[-2,0,2].map(y=>[sign*x,y])));
function validReliefResult(result,revision){
  if(result?.revision!==revision||result.valid!==true||result.samples?.length!==18)return false;
  const repaired=revision!=='revision-n';
  return result.pass===repaired&&result.samples.every((s,i)=>{
    const z=s.floor_z_mm;
    return Array.isArray(s.xy)&&s.xy.length===2&&s.xy.every((v,k)=>Math.abs(v-expectedReliefXY[i][k])<1e-6)&&
      Number.isFinite(z)&&Number.isFinite(s.clearance_mm)&&Math.abs(s.clearance_mm-(3-z))<1e-6&&
      s.valid===true&&(repaired?z>=1.7&&z<=1.85:z>=2.9&&z<=3.1)&&s.pass===repaired;
  });
}
const reliefTarget=path.basename(p);
const reliefGate=!['revision-o','revision-p'].includes(reliefTarget)||(relief?.results?.length===2&&validReliefResult(relief.results[0],'revision-n')&&validReliefResult(relief.results[1],reliefTarget)&&['revision-n',reliefTarget].every(r=>relief.input_sha256?.[r]===crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,r,'microphone_strap_carrier.stl'))).digest('hex')));
const gripGate=grip?.pass===true&&grip.checks?.length===11&&grip.checks.every(c=>c.pass===true)&&['thermal_angled_hood','thermal_raised_cradle','sht_mount_arm','tray_spacer_6mm'].every(n=>grip.input_stl_sha256?.[n]===e.results.find(x=>x.part===n)?.sha256);
const ledgerGate=ledger?.pass===true&&ledger.rows?.length===(path.basename(p)==='revision-p'?11:10)&&ledger.rows.every(r=>r.length_gate===true&&r.assumed_bolt_length_mm>=r.nominal_grip_mm+4.4)&&e.results.every(x=>ledger.input_stl_sha256?.[x.part]===x.sha256);
const closurePath=path.join(p,'split-boss-experiment','concept-checks.json');
const closure=fs.existsSync(closurePath)?JSON.parse(fs.readFileSync(closurePath)):null;
const closureMapsOK=records=>Array.isArray(records)&&records.every(r=>r.intersection_mm3&&Object.keys(r.intersection_mm3).sort().join(',')==='main_lid,main_tub'&&Object.values(r.intersection_mm3).every(v=>Number.isFinite(v)&&v>=0&&v<0.01));
const closureCoverageGate=path.basename(p)!=='revision-p'||(closureMapsOK(closure?.aligned_shaft_probes)&&closureMapsOK(closure?.assumed_hardware_envelopes)&&closure.aligned_shaft_probes.map(r=>r.station_y_mm).sort((a,b)=>a-b).join(',')==='-32,32'&&closure.bearing_seats.map(r=>r.part+':'+r.station_y_mm).sort().join(',')===['main_lid:-32','main_lid:32','main_tub:-32','main_tub:32'].sort().join(',')&&closure.assumed_hardware_envelopes.map(r=>r.role+':'+r.station_y_mm).sort().join(',')===['head','nut','driver'].flatMap(role=>[-32,32].map(y=>role+':'+y)).sort().join(',')&&closure.sampled_lid_lift.map(r=>r.lift_mm).join(',')==='0,0.05,0.5,2,5,15,35'&&closure.sampled_lid_lift.every(r=>Number.isFinite(r.intersection_mm3)&&r.intersection_mm3>=0));
const closureControlsGate=path.basename(p)!=='revision-p'||(closure?.boolean_controls?.length===2&&closure.boolean_controls[0].expected_mm3===4&&closure.boolean_controls[1].expected_mm3===0&&closure.boolean_controls.every(c=>c.pass===true&&Number.isFinite(c.measured_mm3)&&Math.abs(c.measured_mm3-c.expected_mm3)<0.001));
const closureGate=path.basename(p)!=='revision-p'||(closure?.bearing_seats?.length===4&&closure.bearing_seats.every(s=>s.pass===true&&s.samples===96)&&closure.checks?.length===2&&closure.checks.every(s=>s.connected_components===1&&s.nonmanifold_edges===0)&&closure.aligned_shaft_probes?.length===2&&closure.aligned_shaft_probes.every(s=>Object.values(s.intersection_mm3).every(v=>v<0.01))&&closure.sampled_lid_lift?.length===7&&closure.sampled_lid_lift.every(s=>s.intersection_mm3<0.01)&&closure.assumed_hardware_envelopes?.length===6&&closure.assumed_hardware_envelopes.every(s=>Object.values(s.intersection_mm3).every(v=>v<0.01))&&['main_tub','main_lid'].every(n=>closure.input_sha256?.[n]===e.results.find(x=>x.part===n)?.sha256&&closure.output_sha256?.[n]===closure.input_sha256[n]));
const a=JSON.parse(fs.readFileSync(path.join(p,'assembly-checks.json')));
const servicePath=path.join(p,'closure-installed-service-checks.json');
const service=fs.existsSync(servicePath)?JSON.parse(fs.readFileSync(servicePath)):null;
const serviceGate=path.basename(p)!=='revision-p'||(service?.pass===true&&service.scene_sha256===crypto.createHash('sha256').update(fs.readFileSync(path.join(p,'assembled-review.blend'))).digest('hex')&&service.hardware_checks?.length===8&&service.sampled_installed_lid_lifts?.length===6&&service.hardware_checks.map(c=>c.role+':'+c.station_mm).sort().join(',')===['head_washer','front_driver','rear_nut_tool','nut'].flatMap(r=>[-32,32].map(y=>r+':'+y)).sort().join(',')&&service.sampled_installed_lid_lifts.map(c=>c.lift_mm).join(',')==='0.05,0.5,2,5,15,35'&&[...service.hardware_checks,...service.sampled_installed_lid_lifts].every(c=>c.pass===true&&Object.keys(c.intersections_mm3).sort().join(',')===a.installed_inventory.expected.filter(n=>!('lift_mm' in c)||n!=='main_lid').sort().join(',')&&Object.values(c.intersections_mm3).every(v=>Number.isFinite(v)&&v>=0&&v<0.01)));
const bearingPath=path.join(p,'bearing-seat-checks.json');
const bearing=fs.existsSync(bearingPath)?JSON.parse(fs.readFileSync(bearingPath)):null;
const exportFresh=e.results.every(x=>x.sha256===crypto.createHash('sha256').update(fs.readFileSync(path.join(p,x.part+'.stl'))).digest('hex'));
const bearingFresh=['thermal_raised_cradle','thermal_angled_hood'].every(n=>bearing?.input_sha256?.[n]===crypto.createHash('sha256').update(fs.readFileSync(path.join(p,n+'.stl'))).digest('hex'));
const manifestPath=path.join(p,'assembly-import-manifest.json');
const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath)):{};
const assemblyFresh=a.scene_sha256===crypto.createHash('sha256').update(fs.readFileSync(path.join(p,'assembled-review.blend'))).digest('hex')&&e.results.every(x=>a.stl_sha256?.[x.part]===x.sha256&&manifest[x.part]===x.sha256&&a.scene_imported_stl_sha256?.[x.part]===x.sha256);
const sliceManifestPath=path.join(p,'slicer','input-manifest.json');
const sliceManifest=fs.existsSync(sliceManifestPath)?JSON.parse(fs.readFileSync(sliceManifestPath)):{};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const slicerFresh=e.results.every(x=>sliceManifest[x.part]?.stl_sha256===x.sha256&&sliceManifest[x.part]?.gcode_sha256===hash(path.join(p,'slicer',x.part+'.gcode'))&&sliceManifest[x.part]?.log_sha256===hash(path.join(p,'slicer',x.part+'.log')));
const parts=e.results.map(x=>{
 const log=fs.readFileSync(path.join(p,'slicer',x.part+'.log'),'utf8');
 const g=fs.readFileSync(path.join(p,'slicer',x.part+'.gcode'),'utf8');
 const match=k=>(g.match(new RegExp('^; '+k+' = (.+)$','m'))||[])[1];
 return {part:x.part,triangles:x.triangles,export_pass:x.pass,
   slicing_success:log.includes('Slicing result exported'),
   warning:/print warning|error:/i.test(log),layers:(g.match(/;LAYER_CHANGE/g)||[]).length,
   toolpath_moves:(g.match(/^G1 /gm)||[]).length,
   support_enabled:match('support_material'),
   support_sections:(g.match(/;TYPE:Support material/g)||[]).length,
   bed_temperature:match('bed_temperature'),temperature:match('temperature'),
   nozzle_diameter:match('nozzle_diameter'),filament_type:match('filament_type')};
});
const report={export_gate:e.pass,export_hash_freshness_gate:exportFresh,assembly_pair_gate:a.pair_intersection_gate,
  all_installed_intersection_gate:a.all_installed_intersection_gate,
  cradle_head_clearance_gate:a.cradle_head_clearance_gate,
  cradle_driver_gate:a.cradle_driver_gate===true,
  sht_joint_hardware_gate:a.sht_joint_hardware_gate===true,
  provisional_fastener_ledger_gate:ledgerGate,
  selected_grip_surface_gate:gripGate,
  strap_corridor_gate:corridorGate,
  strap_relief_negative_control_gate:reliefGate,
  installed_inventory_gate:a.installed_inventory_gate===true&&a.installed_part_count===20,
  annular_bearing_seat_gate:bearing?.pass??false,
  bearing_hash_freshness_gate:bearingFresh,
  assembly_hash_freshness_gate:assemblyFresh,
  slicer_hash_freshness_gate:slicerFresh,
  installed_part_count:a.installed_part_count,
  assembly_pair_count:a.pairs.length,slicer:'PrusaSlicer 2.7.2',
  supplementary_closure_gate:closureGate&&closureControlsGate&&closureCoverageGate,
  installed_closure_service_gate:serviceGate,
  parts,pass:serviceGate&&closureCoverageGate&&closureControlsGate&&(path.basename(p)!=='revision-p'||parts.some(x=>x.part==='main_tub'&&x.support_enabled==='1'&&x.support_sections>0))&&closureGate&&reliefGate&&corridorGate&&gripGate&&a.installed_inventory_gate===true&&a.installed_part_count===20&&ledgerGate&&a.sht_joint_hardware_gate===true&&slicerFresh&&assemblyFresh&&bearingFresh&&exportFresh&&e.pass&&a.pair_intersection_gate&&a.all_installed_intersection_gate&&a.cradle_head_clearance_gate&&a.cradle_driver_gate===true&&bearing?.pass===true&&parts.every(x=>x.export_pass&&x.slicing_success&&!x.warning&&x.layers>0&&x.toolpath_moves>0),
  limitations:['No physical fit or print test','No electronic hardware measurements',
    'No self-intersection proof or structural analysis','G-code for assumed profile, not user printer approval',
    'No IP rating or sensor performance certification']};
fs.writeFileSync(path.join(p,'verification-summary.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,parts:parts.length,assemblyPairs:a.pairs.length}));
process.exitCode=report.pass?0:1;
