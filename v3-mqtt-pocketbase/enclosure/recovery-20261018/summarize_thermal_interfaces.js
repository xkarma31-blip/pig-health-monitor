// Preserve a compact, attributable digest without replacing independent reports.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const out=path.join(__dirname,'research-adapters');
const files=fs.readdirSync(out).filter(n=>/^thermal-installed-hardware-checks-.*\.json$/.test(n)).sort();
if(!files.length)throw Error('No independent thermal interface report');
const name=files.at(-1),bytes=fs.readFileSync(path.join(out,name));
const report=JSON.parse(bytes);
const digest={source_report:name,source_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  acceptance:report.acceptance,variants:report.variants.map(v=>({
    scene:path.basename(v.scene),gates:v.gates,error:v.error,
    collisions:v.collisions?.length,
    mount_contact_samples:v.mounts?.map(m=>({pass:m.ok,
      successful:m.underside_bearing?.filter(c=>c.ok).length,
      total:m.underside_bearing?.length}))}))};
fs.writeFileSync(path.join(out,'thermal-interface-latest-summary.json'),JSON.stringify(digest,null,2));
console.log(JSON.stringify(digest,null,2));
if(!report.acceptance)process.exitCode=1;
