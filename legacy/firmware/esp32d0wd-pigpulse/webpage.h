/**
 * PigPulse v1.0 - Web Interface
 * Pig health dashboard: live thermal canvas (adapted from the generic
 * MLX90640 reference) + fever banner + audio/battery/system panels +
 * 24 h sparkline from /history.
 */

#ifndef WEBPAGE_H
#define WEBPAGE_H

#include <Arduino.h>

const char WEBPAGE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PigPulse - Pig Health Monitor</title>
<style>
:root{color-scheme:dark;--bg0:#05070d;--bg1:#0b1220;--card:rgba(255,255,255,.075);
--card2:rgba(0,0,0,.30);--line:rgba(255,255,255,.14);--text:#f5f7fb;
--muted:#aeb9ca;--good:#00d4aa;--warn:#ff9800;--bad:#ff4444;}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
color:var(--text);font-size:16px;min-height:100vh;
background:radial-gradient(circle at top left,rgba(0,150,120,.25),transparent 38%),
linear-gradient(135deg,var(--bg1),var(--bg0));}
.wrap{width:min(1180px,100%);margin:0 auto;padding:18px}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}
h1{font-size:clamp(24px,4vw,40px);margin:8px 0 5px;letter-spacing:-.04em}
.sub{color:var(--muted);font-size:14px}
.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);
background:rgba(255,255,255,.08);border-radius:999px;padding:9px 12px;font-size:14px;font-weight:700}
.dot{width:10px;height:10px;border-radius:999px;background:var(--warn);box-shadow:0 0 16px var(--warn)}
.dot.ok{background:var(--good);box-shadow:0 0 16px var(--good)}
#alertBanner{display:none;border-radius:16px;padding:14px;margin-bottom:14px;text-align:center;
font-weight:800;font-size:18px;border:2px solid}
#alertBanner.show{display:block}
#alertBanner.crit{background:rgba(255,68,68,.18);border-color:var(--bad);color:#ffb3b3;animation:pulse 1.6s infinite}
#alertBanner.warn{background:rgba(255,152,0,.14);border-color:var(--warn);color:#ffd9a0}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.65}}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;align-items:start}
.panel{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:14px;
box-shadow:0 24px 80px rgba(0,0,0,.38)}
.cameraShell{position:relative;width:100%;max-width:900px;margin:0 auto;border-radius:20px;
overflow:hidden;background:#000;border:1px solid rgba(255,255,255,.18)}
canvas#thermal{width:100%;aspect-ratio:4/3;display:block;background:#000}
.hud{position:absolute;left:12px;top:12px;display:flex;flex-wrap:wrap;gap:8px;pointer-events:none}
.hud span{background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.18);border-radius:999px;
padding:6px 9px;font-size:12px}
.legend{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;
margin:12px auto 0;max-width:900px;color:var(--muted);font-size:12px}
.bar{height:16px;border-radius:999px;border:1px solid rgba(255,255,255,.22)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
.box{background:var(--card2);border-radius:16px;padding:11px 10px;border:1px solid rgba(255,255,255,.10);min-height:76px}
.label{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}
.value{display:block;font-size:clamp(18px,3vw,25px);font-weight:800}
.small{color:#9eabba;font-size:12px;margin-top:4px}
.t-normal{color:var(--good)}.t-warn{color:var(--warn)}.t-bad{color:var(--bad)}
.side{display:grid;gap:12px}
.card{background:var(--card2);border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:12px}
.card h3{margin:0 0 8px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.card .big{font-size:26px;font-weight:800}
.meter{height:10px;background:#333;border-radius:5px;margin-top:8px;overflow:hidden}
.meter>div{height:100%;border-radius:5px;transition:width .15s}
#audioFill{background:#2196f3;width:0%}
#battFill{background:var(--good);width:0%}
canvas#spark{width:100%;height:90px;display:block;background:rgba(0,0,0,.35);border-radius:10px}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
button,select{background:rgba(255,255,255,.10);color:#fff;border:1px solid rgba(255,255,255,.16);
border-radius:12px;padding:10px 11px;font-weight:700;font-size:14px;cursor:pointer}
button:hover{background:rgba(255,255,255,.18)}
option{background:#101827}
.status{margin-top:12px;color:var(--muted);font-size:13px;min-height:20px;text-align:center}
.foot{text-align:center;color:#77809a;font-size:12px;margin:14px 0 4px}
@media(max-width:980px){.grid{grid-template-columns:1fr}}
@media(max-width:650px){.wrap{padding:10px}.panel{padding:10px}.stats{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div><h1>&#128055; PigPulse</h1>
      <div class="sub">ESP32-D0WD fever screening &bull; 32&times;24 thermal &bull; cough detection</div></div>
    <div class="pill"><span class="dot" id="liveDot"></span><span id="liveText">Connecting...</span></div>
  </div>

  <div id="alertBanner"></div>

  <div class="grid">
    <div class="panel">
      <div class="cameraShell">
        <canvas id="thermal" width="512" height="384"></canvas>
        <div class="hud"><span id="hudRange">Range --</span><span id="hudCursor">Move over image</span></div>
      </div>
      <div class="legend"><span id="legendMin">-- &deg;C</span><div class="bar" id="legendBar"></div><span id="legendMax">-- &deg;C</span></div>
      <div class="stats">
        <div class="box"><span class="label">Body (pig estimate)</span><span class="value" id="sBody">--</span><div class="small">Normal 38.5&ndash;39.5 &deg;C &bull; Fever &gt;40</div></div>
        <div class="box"><span class="label">Maximum</span><span class="value" id="sMax">--</span><div class="small" id="sMaxPos">--</div></div>
        <div class="box"><span class="label">Minimum</span><span class="value" id="sMin">--</span><div class="small">coldest pixel</div></div>
        <div class="box"><span class="label">Average</span><span class="value" id="sAvg">--</span><div class="small">all 768 pixels</div></div>
        <div class="box"><span class="label">Ambient</span><span class="value" id="sAmb">--</span><div class="small">sensor estimate</div></div>
        <div class="box"><span class="label">Palette</span>
          <select id="palette" onchange="setPalette(this.value)" style="width:100%;margin-top:6px">
            <option value="iron" selected>Iron</option><option value="rainbow">Rainbow</option><option value="gray">Gray</option>
          </select></div>
      </div>
      <div class="status" id="status">Starting...</div>
    </div>

    <div class="side">
      <div class="card"><h3>Fever Status</h3><div class="big" id="feverState">--</div>
        <div class="small" id="feverDetail">waiting for data</div></div>
      <div class="card"><h3>Audio &bull; cough detection</h3><div class="big" id="aLevel">--</div>
        <div class="meter"><div id="audioFill"></div></div>
        <canvas id="wave" width="300" height="70" style="width:100%;height:70px;display:block;background:rgba(0,0,0,.35);border-radius:10px;margin-top:8px"></canvas>
        <div class="small" id="lrDetail">L (pig) --% &bull; R (ref) --%</div>
        <div class="small" id="aDetail">-- coughs &bull; -- Hz</div>
        <div class="row"><button onclick="listen()">&#128266; Listen 3s (muted until tap)</button></div>
        <audio id="clip" controls style="width:100%;display:none;margin-top:8px"></audio></div>
      <div class="card"><h3>Battery</h3><div class="big" id="bVolt">--</div>
        <div class="meter"><div id="battFill"></div></div>
        <div class="small" id="bDetail">--</div></div>
      <div class="card"><h3>24 h trend (body &deg;C)</h3><canvas id="spark" width="300" height="90"></canvas>
        <div class="small" id="sparkDetail">loading history...</div></div>
      <div class="card"><h3>System</h3><div class="small" id="sysDetail">--</div>
        <div class="row"><button onclick="fetchStats()">Refresh stats</button>
        <button onclick="wifiSetup()">WiFi setup</button></div></div>
      <div class="card"><h3>Debug &bull; MLX link</h3><div class="big" id="dMlx">--</div>
        <div class="small" id="dErr">--</div>
        <div class="small" id="dFrames">frames: --</div></div>
    </div>
  </div>
  <div class="foot">PigPulse v1.0 &bull; <span id="footDev">--</span> &bull; config mode: device sleeps after timeout</div>
</div>

<script>
var SW=32,SH=24,OW=512,OH=384;
var canvas=document.getElementById('thermal'),ctx=canvas.getContext('2d',{alpha:false});
var imgData=ctx.createImageData(OW,OH);
var palette='iron',lastFrame=null,fetching=false;
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function fmtC(v){return Number(v).toFixed(1)+' \u00B0C'}
function setPalette(v){palette=v;drawLast()}
function px(p,x,y){return p[clamp(y,0,SH-1)*SW+clamp(x,0,SW-1)]}
function bilin(p,x,y){
  var x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,SW-1),y1=Math.min(y0+1,SH-1),fx=x-x0,fy=y-y0;
  return lerp(lerp(px(p,x0,y0),px(p,x1,y0),fx),lerp(px(p,x0,y1),px(p,x1,y1),fx),fy);
}
function stops(n){
  if(n==='gray')return[[0,[0,0,0]],[1,[255,255,255]]];
  if(n==='rainbow')return[[0,[35,0,80]],[.16,[0,0,255]],[.33,[0,180,255]],[.5,[0,255,80]],[.66,[255,255,0]],[.83,[255,90,0]],[1,[255,255,255]]];
  return[[0,[0,0,12]],[.18,[34,6,75]],[.36,[132,20,78]],[.55,[224,58,48]],[.72,[255,151,31]],[.88,[255,243,105]],[1,[255,255,255]]];
}
function tcolor(t){
  t=clamp(t,0,1);var s=stops(palette);
  for(var i=0;i<s.length-1;i++){var a=s[i],b=s[i+1];
    if(t>=a[0]&&t<=b[0]){var k=(t-a[0])/(b[0]-a[0]);
      return[lerp(a[1][0],b[1][0],k),lerp(a[1][1],b[1][1],k),lerp(a[1][2],b[1][2],k)]}}
  return s[s.length-1][1];
}
function paintLegend(){
  document.getElementById('legendBar').style.background='linear-gradient(90deg,'+
    stops(palette).map(function(s){return 'rgb('+s[1][0]+','+s[1][1]+','+s[1][2]+') '+Math.round(s[0]*100)+'%'}).join(',')+')';
}
function marker(sx,sy,label,color){
  var x=(sx/(SW-1))*OW,y=(sy/(SH-1))*OH;
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y+12);ctx.stroke();
  ctx.font='bold 13px system-ui,sans-serif';ctx.fillText(label,clamp(x+9,4,OW-110),clamp(y-9,14,OH-4));ctx.restore();
}
function drawThermal(d){
  var lo=d.min,hi=d.max,span=Math.max(.25,hi-lo);
  for(var py=0;py<OH;py++){var sy=(py/(OH-1))*(SH-1);
    for(var pxI=0;pxI<OW;pxI++){var sx=(pxI/(OW-1))*(SW-1);
      var c=tcolor((bilin(d.pixels,sx,sy)-lo)/span),o=(py*OW+pxI)*4;
      imgData.data[o]=c[0];imgData.data[o+1]=c[1];imgData.data[o+2]=c[2];imgData.data[o+3]=255}}
  ctx.putImageData(imgData,0,0);
  marker(d.maxX,d.maxY,'HOT '+fmtC(d.max),'#fff');
  document.getElementById('legendMin').textContent=lo.toFixed(1)+' \u00B0C';
  document.getElementById('legendMax').textContent=hi.toFixed(1)+' \u00B0C';
  document.getElementById('hudRange').textContent='Range '+lo.toFixed(1)+'\u2013'+hi.toFixed(1)+' \u00B0C';
}
function drawLast(){if(lastFrame)drawThermal(lastFrame)}
function tempClass(t){return t>=40?'t-bad':t>=39.5?'t-warn':'t-normal'}
// Per-mic verdict words: 0 = NO MIC (certain), 1 = tap-the-mic test,
// 2 = LIVE with current level.
function micWord(s,rms){
  if(s===2)return Math.min(100,Math.round(rms*400))+'% LIVE';
  if(s===1)return 'TAP MIC TO TEST';
  return 'NO MIC';
}
function frameAgeText(ms){
  if(ms===4294967295)return 'never';
  if(ms<1000)return ms+'ms old';
  return (ms/1000).toFixed(1)+'s old';
}
function setBanner(alerts,body){
  var b=document.getElementById('alertBanner'),msgs=[];
  if(alerts&0x02)msgs.push('HYPERTHERMIA '+body.toFixed(1)+' \u00B0C');
  else if(alerts&0x01)msgs.push('FEVER DETECTED '+body.toFixed(1)+' \u00B0C');
  if(alerts&0x08)msgs.push('CRITICAL BATTERY');
  else if(alerts&0x04)msgs.push('LOW BATTERY');
  if(alerts&0x10)msgs.push('THERMAL SENSOR FAIL');
  if(alerts&0x20)msgs.push('AUDIO FAIL');
  if(alerts&0x40)msgs.push('COUGH DETECTED');
  if(alerts&0x80)msgs.push('DISTRESS VOCALIZATION');
  if(!msgs.length){b.className='';b.textContent='';return}
  var crit=(alerts&(0x01|0x02|0x08))!==0;
  b.className='show '+(crit?'crit':'warn');
  b.textContent='!! '+msgs.join(' | ')+' !!';
}
async function fetchStats(){
  var t0=(typeof performance!=='undefined')?performance.now():Date.now();
  try{
    var r=await fetch('/data?ts='+Date.now(),{cache:'no-store'}),d=await r.json();
    var dt=Math.round(((typeof performance!=='undefined')?performance.now():Date.now())-t0);
    document.getElementById('liveDot').classList.add('ok');
    document.getElementById('liveText').textContent='Live';
    document.getElementById('footDev').textContent=d.device+' '+d.fw;
    var sb=document.getElementById('sBody');
    sb.textContent=fmtC(d.center_temp);sb.className='value '+tempClass(d.center_temp);
    document.getElementById('sMax').textContent=fmtC(d.max_temp);
    document.getElementById('sMaxPos').textContent='x='+d.max_x+', y='+d.max_y;
    document.getElementById('sMin').textContent=fmtC(d.min_temp);
    document.getElementById('sAvg').textContent=fmtC(d.avg_temp);
    document.getElementById('sAmb').textContent=fmtC(d.ambient_temp);
    var fs=document.getElementById('feverState');
    if(d.center_temp>=41){fs.textContent='HYPERTHERMIA';fs.className='big t-bad'}
    else if(d.center_temp>=40){fs.textContent='FEVER';fs.className='big t-bad'}
    else if(d.center_temp>=39.5){fs.textContent='WATCH';fs.className='big t-warn'}
    else{fs.textContent='NORMAL';fs.className='big t-normal'}
    document.getElementById('feverDetail').textContent='body '+d.center_temp.toFixed(1)+' \u00B0C, ambient '+d.ambient_temp.toFixed(1)+' \u00B0C';
    var pct=Math.min(100,Math.round(d.audio_rms*400));
    if(d.audio_stuck){
      document.getElementById('aLevel').textContent='NO MIC';
      document.getElementById('audioFill').style.width='0%';
      document.getElementById('aDetail').textContent='input dead (stuck/rail) \u2022 wire the mics';
    }else{
      document.getElementById('aLevel').textContent=pct+' %';
      document.getElementById('audioFill').style.width=pct+'%';
      document.getElementById('aDetail').textContent=d.cough+' coughs \u2022 '+d.distress_freq.toFixed(0)+' Hz dominant';
      document.getElementById('lrDetail').textContent='L (pig): '+micWord(d.l_state,d.rms_l)+' \u2022 R (ref): '+micWord(d.r_state,d.rms_r);
    }
    document.getElementById('bVolt').textContent=d.battery_v.toFixed(2)+' V';
    document.getElementById('battFill').style.width=d.battery_pct+'%';
    document.getElementById('battFill').style.background=d.battery_pct>50?'var(--good)':d.battery_pct>20?'var(--warn)':'var(--bad)';
    document.getElementById('bDetail').textContent=d.battery_pct+'% \u2022 alert flags 0x'+d.alerts.toString(16);
    document.getElementById('sysDetail').textContent='heap '+d.heap+' B \u2022 RSSI '+d.wifi_rssi+' dBm \u2022 up '+Math.floor(d.uptime/60000)+' min \u2022 LAN '+d.sta_ip+' \u2022 stats '+dt+'ms \u2022 frame '+frameAgeText(d.frame_age_ms);
async function wifiSetup(){
  try{await fetch('/wifisetup?ts='+Date.now(),{cache:'no-store'});
    alert('Join WiFi network PigPulse-Setup, pick your WiFi there, then reconnect here.')}catch(e){alert('WiFi setup failed: '+e)}
}
function listen(){
  var el=document.getElementById('clip');
  el.style.display='block';
  el.src='/clip.wav?ts='+Date.now();
  el.play().catch(function(){/* user presses play manually */});
}
var waveFetching=false;
async function fetchWave(){
  if(waveFetching)return;waveFetching=true;
  try{
    var r=await fetch('/wave?ts='+Date.now(),{cache:'no-store'}),d=await r.json();
    var cv=document.getElementById('wave'),c=cv.getContext('2d');
    c.clearRect(0,0,cv.width,cv.height);
    c.strokeStyle='#333';c.beginPath();c.moveTo(0,cv.height/2);c.lineTo(cv.width,cv.height/2);c.stroke();
    if(!d.n)return;
    c.strokeStyle=d.stuck?'#ff4444':'#00d4aa';c.lineWidth=1.5;c.beginPath();
    d.wave.forEach(function(v,i){
      var x=(i/(d.n-1))*cv.width,y=cv.height/2-(v/32768)*(cv.height/2-2);
      i?c.lineTo(x,y):c.moveTo(x,y)});
    c.stroke();
  }catch(e){}
  waveFetching=false;
}
    var dm=document.getElementById('dMlx');
    if(d.mlx_ok&&d.frames>0){dm.textContent='LINK OK';dm.className='big t-normal'}
    else if(d.mlx_ok){dm.textContent='FOUND, NO FRAMES';dm.className='big t-warn'}
    else{dm.textContent='NOT FOUND';dm.className='big t-bad'}
    document.getElementById('dErr').textContent=d.mlx_err;
    document.getElementById('dFrames').textContent='frames: '+d.frames;
    document.getElementById('status').textContent='Stats updated '+new Date().toLocaleTimeString();
    setBanner(d.alerts,d.center_temp);
  }catch(e){
    document.getElementById('liveDot').classList.remove('ok');
    document.getElementById('liveText').textContent='Disconnected';
    document.getElementById('status').textContent='Stats error: '+e;
  }
}
async function fetchFrame(){
  if(fetching)return;fetching=true;
  var t0=(typeof performance!=='undefined')?performance.now():Date.now();
  try{
    var r=await fetch('/thermal?ts='+Date.now(),{cache:'no-store'}),d=await r.json();
    var dt=Math.round(((typeof performance!=='undefined')?performance.now():Date.now())-t0);
    if(d.ok){lastFrame=d;drawThermal(d);
      document.getElementById('status').textContent='Thermal '+dt+'ms \u2022 updated '+new Date().toLocaleTimeString()}
  }catch(e){}
  fetching=false;
}
async function fetchHistory(){
  try{
    var r=await fetch('/history?ts='+Date.now(),{cache:'no-store'}),d=await r.json();
    var cv=document.getElementById('spark'),c=cv.getContext('2d');
    c.clearRect(0,0,cv.width,cv.height);
    var h=d.history||[];
    if(!h.length){document.getElementById('sparkDetail').textContent='no history yet';return}
    var temps=h.map(function(e){return e.c}),lo=Math.min.apply(null,temps.concat([38])),hi=Math.max.apply(null,temps.concat([41]));
    function X(i){return 4+(i*(cv.width-8))/Math.max(1,h.length-1)}
    function Y(t){return cv.height-4-((t-lo)/Math.max(.5,hi-lo))*(cv.height-12)}
    c.strokeStyle='#ff4444';c.setLineDash([4,3]);c.beginPath(); // 40C fever line
    c.moveTo(0,Y(40));c.lineTo(cv.width,Y(40));c.stroke();c.setLineDash([]);
    c.strokeStyle='#00d4aa';c.lineWidth=2;c.beginPath();
    h.forEach(function(e,i){i?c.lineTo(X(i),Y(e.c)):c.moveTo(X(i),Y(e.c))});c.stroke();
    h.forEach(function(e,i){if(e.f&0x01){c.fillStyle='#ff4444';c.fillRect(X(i)-1.5,Y(e.c)-1.5,3,3)}});
    document.getElementById('sparkDetail').textContent=h.length+' readings \u2022 red dashed = fever line \u2022 dots = alerts';
  }catch(e){document.getElementById('sparkDetail').textContent='history error'}
}
canvas.addEventListener('mousemove',function(ev){
  if(!lastFrame)return;
  var rc=canvas.getBoundingClientRect();
  var sx=Math.floor(clamp((ev.clientX-rc.left)/rc.width,0,.9999)*SW);
  var sy=Math.floor(clamp((ev.clientY-rc.top)/rc.height,0,.9999)*SH);
  document.getElementById('hudCursor').textContent='x='+sx+' y='+sy+' \u2022 '+fmtC(lastFrame.pixels[sy*SW+sx]);
});
paintLegend();fetchStats();fetchFrame();fetchHistory();
setInterval(fetchStats,10000);setInterval(fetchFrame,1500);setInterval(fetchHistory,60000);setInterval(fetchWave,1000);
</script>
</body>
</html>
)rawliteral";

#endif // WEBPAGE_H
