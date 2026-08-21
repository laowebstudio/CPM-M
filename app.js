
const STATE={data:null,activities:[],byId:{},zoom:1,criticalOnly:false,scale:'day',collapsed:new Set()};
const DAY_MS=86400000;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate=s=>{const d=new Date(s+'T00:00:00');return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`};
const dateOnly=s=>new Date(s+'T00:00:00');
const addDays=(d,n)=>new Date(d.getTime()+n*DAY_MS);
const daysBetween=(a,b)=>Math.round((b-a)/DAY_MS);

fetch('data.json').then(r=>r.json()).then(data=>{
 STATE.data=data;STATE.activities=data.activities;data.activities.forEach(a=>STATE.byId[a.id]=a);init();
}).catch(e=>document.body.innerHTML=`<pre style="padding:30px;color:#fff">Could not load data.json: ${e}</pre>`);

function init(){
 renderStats();wireTabs();renderNetwork();renderGantt();renderTable();wireCommon();wireDrawer();
}
function renderStats(){
 const m=STATE.data.meta;$('statTotal').textContent=m.total_activities;$('statDuration').textContent=m.project_duration;
 $('statCritical').textContent=m.critical_count;$('statPhases').textContent=m.phases.length;$('statFinish').textContent=fmtDate(m.end_date);
 $('footerStart').textContent=fmtDate(m.start_date);$('footerFinish').textContent=fmtDate(m.end_date);$('footerDuration').textContent=m.project_duration+' days';
}
function wireTabs(){
 document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
   document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
   b.classList.add('active');$('panel-'+b.dataset.tab).classList.add('active');
   if(b.dataset.tab==='gantt')setTimeout(()=>syncScrollHeights(),0);
 });
}
function wireCommon(){
 $('zoomIn').onclick=()=>setZoom(STATE.zoom*1.15);$('zoomOut').onclick=()=>setZoom(STATE.zoom/1.15);
 $('fitNetwork').onclick=fitNetwork;$('criticalOnly').onclick=()=>{STATE.criticalOnly=!STATE.criticalOnly;$('criticalOnly').classList.toggle('active',STATE.criticalOnly);renderNetwork()};
 $('networkSearch').oninput=searchNetwork;$('ganttSearch').oninput=()=>renderGantt();
 $('ganttScale').onchange=e=>{STATE.scale=e.target.value;renderGantt()};
 $('collapseAll').onclick=()=>{STATE.data.meta.phases.forEach(p=>STATE.collapsed.add(p.wbs));renderGantt()};
 $('expandAll').onclick=()=>{STATE.collapsed.clear();renderGantt()};
 $('scrollStart').onclick=()=>{$('timelinePane').scrollLeft=0};
 $('scrollFinish').onclick=()=>{$('timelinePane').scrollLeft=$('timelinePane').scrollWidth};
 $('tableSearch').oninput=renderTable;$('exportCsv').onclick=exportCSV;
}
function wireDrawer(){$('drawerClose').onclick=()=>$('drawer').classList.remove('open')}

function renderNetwork(){
 const nodes=$('networkNodes'),svg=$('networkSvg');nodes.innerHTML='';svg.innerHTML='';
 const acts=STATE.activities.filter(a=>!STATE.criticalOnly||a.critical);
 const visible=new Set(acts.map(a=>a.id));
 const groups=STATE.data.meta.phases.map(p=>({phase:p,acts:acts.filter(a=>a.wbs===p.wbs)})).filter(g=>g.acts.length);
 const nodeW=154,nodeH=82,colGap=46,rowGap=8,top=76,left=126;
 const positions={};let x=left;let maxH=0;
 groups.forEach(g=>{
   const h=g.acts.length*(nodeH+rowGap);maxH=Math.max(maxH,h);
   g.x=x;g.acts.forEach((a,i)=>positions[a.id]={x,y:top+i*(nodeH+rowGap)});
   x+=nodeW+colGap;
 });
 const finishX=x+20,stageW=finishX+130,stageH=Math.max(620,top+maxH+50);
 const stage=$('networkStage');stage.style.width=stageW+'px';stage.style.height=stageH+'px';stage.style.transform=`scale(${STATE.zoom})`;
 svg.setAttribute('width',stageW);svg.setAttribute('height',stageH);

 const start=document.createElement('div');start.className='terminal';start.style.left='16px';start.style.top=(top+10)+'px';start.innerHTML=`START<br>${fmtDate(STATE.data.meta.start_date)}<br>ES 0 EF 0`;nodes.appendChild(start);
 const fin=document.createElement('div');fin.className='terminal';fin.style.left=finishX+'px';fin.style.top=(top+10)+'px';fin.innerHTML=`FINISH<br>${fmtDate(STATE.data.meta.end_date)}<br>${STATE.data.meta.project_duration}d`;nodes.appendChild(fin);

 groups.forEach(g=>{
   const lab=document.createElement('div');lab.className='phase-label';lab.style.left=g.x+'px';lab.style.top='18px';lab.innerHTML=`WBS ${g.phase.wbs}<br>${esc(g.phase.name)}`;nodes.appendChild(lab);
   g.acts.forEach(a=>{
     const p=positions[a.id],n=document.createElement('div');n.className='network-node'+(a.critical?' critical':'');n.dataset.id=a.id;n.dataset.code=a.code;n.dataset.name=a.name.toLowerCase();
     n.style.left=p.x+'px';n.style.top=p.y+'px';
     n.innerHTML=`<div class="n-top"><span>${a.ES}</span><span>${a.duration}d</span><span>${a.EF}</span></div><div class="n-name"><b>${esc(a.code)}</b>&nbsp; ${esc(a.name)}</div><div class="n-bottom"><span>${a.LS}</span><span>TF ${a.TF}</span><span>${a.LF}</span></div>`;
     n.onclick=()=>openDrawer(a.id);nodes.appendChild(n);
   });
 });

 // Dependency connectors
 STATE.activities.forEach(a=>{
   if(!visible.has(a.id))return;
   const b=positions[a.id];if(!b)return;
   if(!a.pred || !visible.has(a.pred)){
     if(!a.pred){drawOrth(svg,111,top+46,b.x,b.y+nodeH/2,a.critical)}
     return;
   }
   const p=positions[a.pred];if(!p)return;
   drawOrth(svg,p.x+nodeW,p.y+nodeH/2,b.x,b.y+nodeH/2,a.critical&&STATE.byId[a.pred].critical);
 });
 // Connect terminal activities to FINISH
 const terminals=acts.filter(a=>!(a.successors||[]).some(s=>visible.has(s)));
 terminals.forEach(a=>{const p=positions[a.id];if(p)drawOrth(svg,p.x+nodeW,p.y+nodeH/2,finishX,top+46,a.critical)});
 searchNetwork();
}
function drawOrth(svg,x1,y1,x2,y2,critical){
 const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path'),mid=x1+Math.max(14,(x2-x1)*.45);
 path.setAttribute('d',`M${x1},${y1} H${mid} V${y2} H${x2-7}`);path.setAttribute('fill','none');path.setAttribute('stroke',critical?'#f05345':'#b6d2e5');path.setAttribute('stroke-width',critical?'2':'1.2');path.setAttribute('opacity',critical?'1':'.72');svg.appendChild(path);
 const ar=document.createElementNS(ns,'polygon');ar.setAttribute('points',`${x2-7},${y2-4} ${x2},${y2} ${x2-7},${y2+4}`);ar.setAttribute('fill',critical?'#f05345':'#b6d2e5');svg.appendChild(ar);
}
function setZoom(v){STATE.zoom=Math.max(.35,Math.min(1.6,v));$('zoomLabel').textContent=Math.round(STATE.zoom*100)+'%';$('networkStage').style.transform=`scale(${STATE.zoom})`}
function fitNetwork(){
 const shell=$('networkShell'),stage=$('networkStage');const naturalW=parseFloat(stage.style.width),naturalH=parseFloat(stage.style.height);
 const v=Math.min((shell.clientWidth-20)/naturalW,(shell.clientHeight-20)/naturalH);setZoom(v);shell.scrollTo(0,0);
}
function searchNetwork(){
 const q=$('networkSearch').value.trim().toLowerCase();document.querySelectorAll('.network-node').forEach(n=>{
   const hit=q&&(n.dataset.code.toLowerCase().includes(q)||n.dataset.name.includes(q));n.classList.toggle('hit',!!hit);
 });
}

function renderGantt(){
 const pane=$('timelinePane'),oldLeft=pane.scrollLeft,taskRows=$('taskRows'),timeline=$('timelineBody'),header=$('calendarHeader');taskRows.innerHTML='';timeline.innerHTML='';header.innerHTML='';
 const query=$('ganttSearch').value.trim().toLowerCase();
 const min=dateOnly(STATE.data.meta.start_date),max=dateOnly(STATE.data.meta.end_date);
 const dayWidth=STATE.scale==='day'?24:10,totalDays=daysBetween(min,max)+1,chartW=totalDays*dayWidth;
 header.style.width=chartW+'px';timeline.style.width=chartW+'px';
 buildCalendar(header,min,totalDays,dayWidth);

 const rows=[];
 STATE.data.meta.phases.forEach(p=>{
   const phaseActs=STATE.activities.filter(a=>a.wbs===p.wbs);
   if(query&&!phaseActs.some(a=>(a.code+' '+a.name).toLowerCase().includes(query)))return;
   rows.push({type:'summary',phase:p,acts:phaseActs});
   if(!STATE.collapsed.has(p.wbs))phaseActs.filter(a=>!query||(a.code+' '+a.name).toLowerCase().includes(query)).forEach(a=>rows.push({type:'activity',a}));
 });
 rows.forEach((row,index)=>{
   if(row.type==='summary'){renderSummaryRow(row.phase,row.acts,taskRows,timeline,min,dayWidth,totalDays)}
   else renderActivityRow(row.a,taskRows,timeline,min,dayWidth,totalDays);
 });
 // task pane and timeline share wheel direction/vertical sync
 setupVerticalSync();
 setTimeout(()=>{pane.scrollLeft=oldLeft},0);
}
function buildCalendar(header,min,totalDays,dayWidth){
 const months=document.createElement('div');months.className='month-row';const days=document.createElement('div');days.className='day-row';
 let i=0;while(i<totalDays){const d=addDays(min,i),m=d.getMonth(),y=d.getFullYear();let count=0;while(i+count<totalDays){const x=addDays(min,i+count);if(x.getMonth()!=m)break;count++}
   const c=document.createElement('div');c.className='month-cell';c.style.width=(count*dayWidth)+'px';c.textContent=d.toLocaleDateString('en-US',{month:'long',year:'numeric'});months.appendChild(c);i+=count}
 for(let k=0;k<totalDays;k++){const d=addDays(min,k),c=document.createElement('div');c.className='day-cell'+([0,6].includes(d.getDay())?' weekend':'');c.style.width=dayWidth+'px';c.textContent=STATE.scale==='day'?String(d.getDate()).padStart(2,'0'):(d.getDay()===1?String(d.getDate()).padStart(2,'0'):'');days.appendChild(c)}
 header.append(months,days);
}
function taskCells(id,name,dur,start,finish,pred,res,summary=false,wbs=''){
 return `<div class="c-id">${id}</div><div class="task-name">${summary?`<button class="twisty" data-wbs="${wbs}">${STATE.collapsed.has(wbs)?'▶':'▼'}</button>`:'<span class="indent"></span>'}${name}</div><div>${dur}</div><div>${start}</div><div>${finish}</div><div>${pred}</div><div>${res}</div>`;
}
function renderSummaryRow(phase,acts,left,right,min,dayWidth,totalDays){
 const start=acts.reduce((m,a)=>a.plan_start<m?a.plan_start:m,acts[0].plan_start),end=acts.reduce((m,a)=>a.plan_end>m?a.plan_end:m,acts[0].plan_end);
 const dur=daysBetween(dateOnly(start),dateOnly(end))+1,l=document.createElement('div');l.className='task-row summary';l.innerHTML=taskCells(phase.wbs,`WBS ${phase.wbs} · ${esc(phase.name)}`,dur+'d',fmtDate(start),fmtDate(end),'-','-',true,phase.wbs);left.appendChild(l);
 l.querySelector('.twisty').onclick=()=>{STATE.collapsed.has(phase.wbs)?STATE.collapsed.delete(phase.wbs):STATE.collapsed.add(phase.wbs);renderGantt()};
 const r=timelineRow(totalDays,dayWidth,true);const bar=document.createElement('div');bar.className='gantt-bar summary';bar.style.left=daysBetween(min,dateOnly(start))*dayWidth+'px';bar.style.width=(dur*dayWidth)+'px';r.appendChild(bar);right.appendChild(r);
}
function renderActivityRow(a,left,right,min,dayWidth,totalDays){
 const l=document.createElement('div');l.className='task-row';l.innerHTML=taskCells(a.code,esc(a.name),a.duration+'d',fmtDate(a.plan_start),fmtDate(a.plan_end),a.pred?`${a.pred}${a.rel?'/'+a.rel:''}`:'-',esc(a.resource));l.onclick=()=>openDrawer(a.id);left.appendChild(l);
 const r=timelineRow(totalDays,dayWidth,false);r.dataset.id=a.id;const offset=daysBetween(min,dateOnly(a.plan_start));const bar=document.createElement('div');bar.className='gantt-bar'+(a.critical?' critical':'');bar.style.left=offset*dayWidth+'px';bar.style.width=Math.max(4,a.duration*dayWidth-2)+'px';bar.title=`${a.code} ${a.name} | ${fmtDate(a.plan_start)} → ${fmtDate(a.plan_end)}`;bar.onclick=()=>openDrawer(a.id);r.appendChild(bar);right.appendChild(r);
}
function timelineRow(totalDays,dayWidth,summary){
 const r=document.createElement('div');r.className='timeline-row'+(summary?' summary':'');const grid=document.createElement('div');grid.className='day-grid';
 const min=dateOnly(STATE.data.meta.start_date);for(let i=0;i<totalDays;i++){const d=addDays(min,i),g=document.createElement('div');g.className='grid-day'+([0,6].includes(d.getDay())?' weekend':'');g.style.width=dayWidth+'px';grid.appendChild(g)}r.appendChild(grid);return r;
}
function setupVerticalSync(){
 const task=qs('.task-pane'),time=$('timelinePane');if(task._sync)return;task._sync=time._sync=true;
 task.addEventListener('scroll',()=>{if(Math.abs(time.scrollTop-task.scrollTop)>1)time.scrollTop=task.scrollTop});
 time.addEventListener('scroll',()=>{if(Math.abs(task.scrollTop-time.scrollTop)>1)task.scrollTop=time.scrollTop});
}
function syncScrollHeights(){}

function renderTable(){
 const q=($('tableSearch')?.value||'').trim().toLowerCase(),tbody=$('activityTable');if(!tbody)return;tbody.innerHTML='';
 STATE.activities.filter(a=>!q||(a.code+' '+a.name+' '+a.resource).toLowerCase().includes(q)).forEach(a=>{
   const tr=document.createElement('tr');if(a.critical)tr.className='critical-row';tr.innerHTML=`<td>${a.id}</td><td>${a.code}</td><td>${a.wbs}</td><td>${esc(a.name)}</td><td>${a.duration}</td><td>${fmtDate(a.plan_start)}</td><td>${fmtDate(a.plan_end)}</td><td>${a.pred??'-'}</td><td>${a.rel??'-'}</td><td>${a.ES}</td><td>${a.EF}</td><td>${a.LS}</td><td>${a.LF}</td><td>${a.TF}</td><td>${a.critical?'CP':'-'}</td><td>${esc(a.resource)}</td>`;tr.onclick=()=>openDrawer(a.id);tbody.appendChild(tr);
 });
}
function openDrawer(id){
 const a=STATE.byId[id],pred=a.pred&&STATE.byId[a.pred]?`${STATE.byId[a.pred].code} ${STATE.byId[a.pred].name}`:'—',succ=(a.successors||[]).map(s=>STATE.byId[s]?.code).filter(Boolean).join(', ')||'—';
 $('drawerContent').innerHTML=`<div class="code">${a.code} · WBS ${a.wbs}</div><h3>${esc(a.name)}</h3><div class="drawer-grid">${metric('ES',a.ES)}${metric('DUR',a.duration)}${metric('EF',a.EF)}${metric('LS',a.LS)}${metric('TF',a.TF)}${metric('LF',a.LF)}</div>
 ${drow('Critical Path',a.critical?'YES · TF = 0':'NO · Float '+a.TF+' days')}${drow('Start',fmtDate(a.plan_start))}${drow('Finish',fmtDate(a.plan_end))}${drow('Predecessor',pred)}${drow('Relationship',a.rel||'-')}${drow('Successors',succ)}${drow('Resource',esc(a.resource))}${drow('Area',esc(a.area))}${drow('Status',esc(a.status))}`;
 $('drawer').classList.add('open');
}
function metric(k,v){return `<div class="metric"><span>${k}</span><b>${v}</b></div>`}function drow(k,v){return `<div class="drawer-row"><span>${k}</span>${v}</div>`}
function exportCSV(){
 const h=['ID','Code','WBS','Activity','Duration','Start','Finish','Predecessor','Relation','ES','EF','LS','LF','TF','Critical','Resource'];
 const rows=STATE.activities.map(a=>[a.id,a.code,a.wbs,a.name,a.duration,a.plan_start,a.plan_end,a.pred??'',a.rel??'',a.ES,a.EF,a.LS,a.LF,a.TF,a.critical?'YES':'NO',a.resource]);
 const csv=[h,...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const b=new Blob([csv],{type:'text/csv'}),u=URL.createObjectURL(b),x=document.createElement('a');x.href=u;x.download='CPM-V3-Activities.csv';x.click();URL.revokeObjectURL(u);
}
function qs(sel){return document.querySelector(sel)}
