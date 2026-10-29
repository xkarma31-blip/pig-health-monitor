// Digital acceptance only. All source evidence remains separately inspectable.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const out=path.join(__dirname,'research-adapters');
const read=name=>JSON.parse(fs.readFileSync(path.join(out,name)));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const thermal=read('thermal-digital-acceptance.json');
const combined=read('combined-thermal-checks.json');
const contract=read('export-contract-42/summary.json');
const cord=read('mic-retention-thread-checks.json');
const routes=read('integrated-routes.json');
const baseline=read('export-contract-42/baseline.json');
const sceneHash=hash(path.join(out,'combined-thermal-candidate.blend'));
const gates={thermal:thermal.acceptance,combined:combined.pass,
  current_run_bindings:Object.entries(read('integrated-run-inputs.json')).every(([p,h])=>hash(path.join(__dirname,p))===h),
  printed_quantity:combined.installed_printed_instances===23&&combined.pair_count===253,
  manufacturing_contract:contract.pass&&contract.baseline_pass&&contract.blender_version.startsWith('4.2.'),
  regression_controls:contract.negative_tests.length===20&&contract.negative_tests.every(t=>t.detected),
  current_contract_inputs:baseline.pass===true&&baseline.scene_sha256===sceneHash
    &&baseline.accepted_source_sha256===hash(path.join(out,'pcb25_4square_installed.blend'))
    &&baseline.acceptance_report_sha256===hash(path.join(out,'thermal-digital-acceptance.json'))
    &&baseline.transform_metadata_sha256===hash(path.join(out,'pcb25_4square_installed_transform.json'))
    &&baseline.manufacturing.every(r=>r.file_sha256===hash(path.join(__dirname,r.file))),
  cord_scenario:cord.pass&&cord.original_scene_geometry_unchanged,
  selected_wire_routes:routes.all_selected_reservations_clear,
  current_route_scene:routes.source_sha256===sceneHash,
  left_mic:read('mic-corner-combined-checks.json').pass,
  right_mic:read('mic-corner-right-combined-checks.json').pass};
for(const file of ['mic-corner-combined-checks.json','mic-corner-right-combined-checks.json']){
  const report=read(file);
  gates[file+'_current']=report.pass===true&&report.scene_sha256===sceneHash&&report.checker_sha256===hash(path.join(__dirname,'check_mic_corner_installed.py'));
}
const report={pass:Object.values(gates).every(v=>v===true),gates,
  scope:'Research-dimensioned digital prototype; no physical fit, IP, load or sensor-performance certification',
  original_poster_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'original-poster.png'))).digest('hex')};
fs.writeFileSync(path.join(out,'integrated-digital-acceptance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
