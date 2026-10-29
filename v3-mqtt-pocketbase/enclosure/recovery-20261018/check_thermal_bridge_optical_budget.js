// Conditional geometric budget only. FOV is sensitivity-defined, not hard cutoff.
const fs=require('fs');
const half=[21,6],margin=1;
const rows=[];
for(const [name,h,v] of [['narrow',55,35],['wide',110,75]]){
 for(const setback of [0,2,4,6,8,12,16]){
  const extent=[setback*Math.tan(h*Math.PI/360),setback*Math.tan(v*Math.PI/360)];
  rows.push({variant:name,nominal_fov_deg:[h,v],pupil_setback_mm:setback,
   nominal_ray_half_extent_mm:extent,
   remaining_margin_mm:extent.map((x,i)=>half[i]-margin-x),
   sampled_centered_budget_clear:extent.every((x,i)=>x<=half[i]-margin)});
 }
}
const report={opening_mm:[42,12],chosen_edge_margin_mm:margin,rows,
 limits:['Analytical centered planar aperture only; no whole assembly ray test',
 'No real pupil placement inferred from overall product height',
 'Nominal FOV is not a hard optical cutoff; source sensitivity and angle tolerances matter',
 'Bridge tilt,finite thickness,alignment offsets and actual lens shape excluded'],
 conclusion:'Bridge cannot be treated as generic wide-angle adapter across unknown pupil setbacks'};
fs.writeFileSync(__dirname+'/research-adapters/thermal-bridge-optical-budget.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
