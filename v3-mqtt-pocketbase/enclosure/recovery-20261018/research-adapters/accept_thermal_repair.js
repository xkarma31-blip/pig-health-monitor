// Aggregate digital acceptance. Never promotes the builder's legacy flags.
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const out=__dirname,root=path.dirname(out);
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const reports=fs.readdirSync(out).filter(n=>/^thermal-installed-hardware-checks-.*\.json$/.test(n)).sort();
const source=reports.at(-1),hardware=read(path.join(out,source));
const exportsReport=read(path.join(out,'thermal-export-slicer-evidence.json'));
const scenes=read(path.join(out,'thermal-installed-scene-checks.json'));
const baseline=read(path.join(out,'thermal-repair-source-2026-10-19T023004335Z/P-sha256.json'));
const gates={
  blender42:hardware.blender_version?.startsWith('4.2.'),
  independent_hardware:hardware.acceptance&&hardware.variants.length===3,
  current_checker:hardware.checker_sha256===hash(path.join(root,'check_thermal_installed_hardware.py')),
  current_scenes:hardware.variants.every(v=>hash(v.scene)===v.sha256),
  all_sampled_optics:hardware.variants.every(v=>v.optical.length===72&&v.optical.every(s=>s.accepted&&!s.hits.length)),
  nine_exports_and_slices:exportsReport.pass&&exportsReport.parts.length===9&&exportsReport.parts.every(p=>p.stl_sha256===hash(path.join(out,p.name+'.stl'))&&p.gcode_sha256===hash(path.join(out,'slicer',p.name+'.gcode'))),
  scene_reopen:Object.keys(scenes).length===3&&Object.values(scenes).every(v=>v.reopened&&v.metadata_matches&&v.baked_identity_transforms),
  revision_P_unchanged:Object.entries(baseline).every(([f,h])=>hash(path.join(root,'revision-p',f))===h)
};
const report={acceptance:Object.values(gates).every(Boolean),scope:'Nominal digital thermal assembly; sampled optics; manufacturing mesh and slicer evidence. No physical certification.',gates,hardware_report:source,hardware_sha256:hash(path.join(out,source)),sampled_optical_scenarios:hardware.variants.reduce((n,v)=>n+v.optical.length,0)};
const stamp=new Date().toISOString().replace(/[:.]/g,'');
fs.writeFileSync(path.join(out,`thermal-digital-acceptance-${stamp}.json`),JSON.stringify(report,null,2),{flag:'wx'});
fs.writeFileSync(path.join(out,'thermal-digital-acceptance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.acceptance)process.exitCode=1;
