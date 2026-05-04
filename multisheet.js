"use strict";

var SHEET_COLORS = ['#f59e0b','#60a5fa','#22c55e','#a78bfa','#f87171','#38bdf8','#e879f9','#facc15','#4ade80','#fb923c','#818cf8','#2dd4bf'];
var SHEET_DATA = {};
var SHEET_REGISTRY = [];
var activeSheetId = '';
var DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxKEGzsKYdRMFxA1nWjVtifaPMxSzS7Pqqi-lL33UqlRlP--FI1oQK6eDiyvI1zPLVI/exec';

// ── REGISTRY MGMT ──
function loadRegistry(){
  try { SHEET_REGISTRY = JSON.parse(localStorage.getItem('sjp_outlets')||'[]'); } catch(e){ SHEET_REGISTRY=[]; }
  activeSheetId = localStorage.getItem('sjp_active_outlet')||'';
  
  // Auto-select latest sheet if none active
  if(!activeSheetId && SHEET_REGISTRY.length) {
    var last = SHEET_REGISTRY[SHEET_REGISTRY.length-1];
    var tabs = Object.keys(SHEET_DATA).filter(function(k){ return SHEET_DATA[k].outletId === last.id; });
    if(tabs.length) activeSheetId = tabs[tabs.length-1];
  }
}
function saveRegistry(){
  localStorage.setItem('sjp_outlets', JSON.stringify(SHEET_REGISTRY));
  localStorage.setItem('sjp_active_outlet', activeSheetId);
}

function getActiveSheet(){ return SHEET_DATA[activeSheetId]; }

// ── DATA PROCESSING ──
function parseAppsScriptTabs(json){
  if(json.status!=='success' || !json.tabs) throw new Error('Invalid multi-tab response');
  var parsedTabs = {};
  
  json.tabs.forEach(function(tab){
    if(tab.name.trim().toUpperCase() === 'MIS') {
      if(tab.rawData) window.MIS_DATA = tab.rawData;
      return; 
    }
    
    var data = tab.data;
    if(!data || !data.length) return;
    
    var keys = Object.keys(data[0]);
    var dateKeys = keys.filter(function(k){ return k!=='Particulars'&&k!=='Target'&&k!=='Run Rate'&&k!=='MTD'&&k!==''; });
    
    var findRow = function(name){ return data.find(function(x){ return x.Particulars&&x.Particulars.toLowerCase().indexOf(name.toLowerCase())!==-1; }); };
    var getVal = function(row,dKey){ return row&&row[dKey]!==''&&row[dKey]!=null?(parseFloat(row[dKey])||0):0; };
    
    var nd=[],nr=[],nrm=[],ncp=[],npk=[],nhk=[],ngu=[],ngv=[],nwq=[],nwv=[],npt=[];
    var revRow=findRow('Net Revenue'), rmRow=findRow('RM Indent'), cpRow=findRow('CP Indent');
    var pkRow=findRow('Packaging Indent'), hkRow=findRow('HK Materials');
    var guRow=findRow('Gail Gas consumption Unit') || findRow('Gas consumption Unit'), gvRow=findRow('Gail gas consumption Value') || findRow('Gas consumption Value') || findRow('Total Gas consumption Value');
    var wqRow=findRow('Water consumption Unit'), wvRow=findRow('Water consumption Value');
    var ptRow=findRow('Petty cash');
    var tgt = 14200000;
    if(revRow&&revRow['Target']&&parseFloat(revRow['Target'])) tgt=parseFloat(revRow['Target']);
    
    var dynamicRows = {};
    var TARGETS = {}, RUN_RATES = {}, MTDS = {};
    data.forEach(function(row){
        var p = row.Particulars;
        if(!p) return;
        var getNum = function(val){ return val!==''&&val!=null?(parseFloat(val)||0):0; };
        TARGETS[p] = getNum(row['Target']);
        RUN_RATES[p] = getNum(row['Run Rate']);
        MTDS[p] = getNum(row['MTD']);
        if(p==='Net Revenue' || p==='Total Revenue' || p.indexOf('Indent')!==-1 || p.indexOf('HK')!==-1 || p.toLowerCase().indexOf('packaging')!==-1) return;
        dynamicRows[p] = [];
    });

    for(var i=0;i<dateKeys.length;i++){
      var dKey=dateKeys[i], rv=revRow?revRow[dKey]:'';
      if(rv===''||rv==null) continue;
      var parts=dKey.split('\n');
      var dStr = parts.length>1 ? parts[1] : parts[0];
      
      var match = dStr.match(/(\d{1,2})\s*([a-zA-Z]{3,})/);
      if (match) {
          var dateNum = match[1];
          var monthStr = match[2].substring(0,3);
          var dObj = new Date(dateNum + " " + monthStr + " 2026");
          if(!isNaN(dObj.getTime())) {
             var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
             dStr = dayNames[dObj.getDay()] + ' ' + dateNum + ' ' + monthStr;
          }
      }
      
      nd.push(dStr);
      nr.push(parseFloat(rv)||0); nrm.push(getVal(rmRow,dKey)); ncp.push(getVal(cpRow,dKey));
      npk.push(getVal(pkRow,dKey)); nhk.push(getVal(hkRow,dKey));
      ngu.push(getVal(guRow,dKey)); ngv.push(getVal(gvRow,dKey));
      nwq.push(getVal(wqRow,dKey)); nwv.push(getVal(wvRow,dKey)); npt.push(getVal(ptRow,dKey));
      Object.keys(dynamicRows).forEach(function(dr){ dynamicRows[dr].push(getVal(findRow(dr), dKey)); });
    }
    
    if(tab.name.toLowerCase().indexOf('employee') !== -1) { window.TEAM_DATA = data; return; }

    parsedTabs[tab.name] = {
      name: tab.name, DATES:nd, REV:nr, RM:nrm, CP:ncp, PKG:npk, HK:nhk, 
      GASU:ngu, GASV:ngv, WATQ:nwq, WATV:nwv, PETTY:npt, 
      TARGET:tgt, MONTH_DAYS:nd.length,
      DYNAMIC: dynamicRows, TARGETS: TARGETS, RUN_RATES: RUN_RATES, MTDS: MTDS
    };
  });
  return parsedTabs;
}

async function fetchOutletData(outletId, url){
  var r = await fetch(url);
  var json = await r.json();
  var parsedTabs = parseAppsScriptTabs(json);
  var savedKeys = [];
  Object.keys(parsedTabs).forEach(function(tabName){
    var compositeId = outletId + '__' + tabName;
    parsedTabs[tabName].id = compositeId;
    parsedTabs[tabName].outletId = outletId;
    parsedTabs[tabName].tabName = tabName;
    SHEET_DATA[compositeId] = parsedTabs[tabName];
    savedKeys.push(compositeId);
  });
  return savedKeys;
}

// ── UI RENDERING ──
function applySheetToGlobals(compositeId){
  var d = SHEET_DATA[compositeId];
  if(!d) return;
  function inject(arr,vals){ arr.length=0; for(var i=0;i<vals.length;i++) arr.push(vals[i]); }
  inject(DATES,d.DATES); inject(REV,d.REV); inject(RM,d.RM); inject(CP,d.CP);
  inject(PKG,d.PKG); inject(HK,d.HK); inject(GASU,d.GASU); inject(GASV,d.GASV);
  inject(WATQ,d.WATQ); inject(WATV,d.WATV); inject(PETTY,d.PETTY);
  TARGET = d.TARGET; MONTH_DAYS = d.MONTH_DAYS;
  window.DYNAMIC_DATA = d.DYNAMIC || {};
  window.TARGETS = d.TARGETS || {};
  window.RUN_RATES = d.RUN_RATES || {};
  window.MTDS = d.MTDS || {};
  activeSheetId = compositeId;
  saveRegistry();
}

function switchActiveSheet(compositeId){
  if(!compositeId||!SHEET_DATA[compositeId]) return;
  applySheetToGlobals(compositeId);
  var d = SHEET_DATA[compositeId];
  var entry = SHEET_REGISTRY.find(function(s){return s.id===d.outletId;});
  document.getElementById('hdrTitle').innerHTML = (entry?entry.label:'Dashboard')+' - '+d.tabName;
  document.getElementById('hdrSub').textContent = 'MIS Dashboard · '+DATES.length+' days · Jagan';
  killAllCharts();
  Object.keys(builtPages).forEach(function(k){ delete builtPages[k]; });
  renderUI();
  setTimeout(function(){ buildPageCharts('overview'); },80);
  document.getElementById('srcInfoEl').textContent = 'Active: '+(entry?entry.label:'')+' ('+d.tabName+') · '+DATES.length+' days';
}

function renderSheetList(){
  var el = document.getElementById('sheetListEl');
  if(!el) return;
  if(!SHEET_REGISTRY.length){ el.innerHTML='<div style="text-align:center;padding:24px;color:var(--m1);font-size:12px">No outlets added yet. Click "+ Add Sheet" to connect your first month.</div>'; return; }
  
  el.innerHTML = SHEET_REGISTRY.map(function(s){
    var outletTabs = Object.keys(SHEET_DATA).filter(function(k){ return SHEET_DATA[k].outletId === s.id; });
    var isSynced = outletTabs.length > 0;
    var statusColor = isSynced ? '#22c55e' : '#f59e0b';
    var sid = s.id;
    
    var html = '<div class="sheet-card" style="border-color:var(--b2); flex-direction:column; align-items:stretch;">'
      +'<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--b1); padding-bottom:12px; margin-bottom:12px;">'
        +'<div style="display:flex; align-items:center; gap:12px;">'
          +'<div class="sheet-dot" style="background:'+s.color+'"></div>'
          +'<div class="sheet-info">'
            +'<div class="sheet-label">'+s.label+'</div>'
            +'<div class="sheet-url">'+s.url.substring(0,60)+'...</div>'
            +'<div class="sheet-meta" style="color:'+statusColor+'">'+(isSynced?'[OK] '+outletTabs.length+' months found':'[WAIT] Not synced')+(s.lastSynced?' · '+s.lastSynced:'')+'</div>'
          +'</div>'
        +'</div>'
        +'<div class="sheet-actions">'
          +'<button class="icon-btn" data-action="sync" data-sid="'+sid+'">Sync</button>'
          +'<button class="icon-btn" data-action="edit" data-sid="'+sid+'">Edit</button>'
          +'<button class="icon-btn danger" data-action="remove" data-sid="'+sid+'">Remove</button>'
        +'</div>'
      +'</div>';
      
    if(isSynced) {
      html += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
      outletTabs.forEach(function(compKey){
         var d = SHEET_DATA[compKey];
         var isAct = (compKey === activeSheetId);
         html += '<button data-action="activate" data-sid="'+compKey+'" style="background:'+(isAct?'#166534':'var(--s2)')+'; border:1px solid '+(isAct?'#22c55e':'var(--b2)')+'; color:'+(isAct?'#fff':'var(--m1)')+'; padding:4px 10px; border-radius:12px; font-size:11px; cursor:pointer;">'
              + d.tabName + ' ('+d.DATES.length+'d)'
              + '</button>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }).join('');

  el.onclick = function(ev){
    var btn = ev.target.closest('[data-action]');
    if(!btn) return;
    var action = btn.getAttribute('data-action');
    var sid = btn.getAttribute('data-sid');
    if(action==='activate') setActiveSheet(sid);
    else if(action==='sync') syncOneSheet(sid);
    else if(action==='edit') editSheet(sid);
    else if(action==='remove') removeSheet(sid);
  };
}

function setActiveSheet(compositeId){
  if(!SHEET_DATA[compositeId]){ showToast('Sync this sheet first.'); return; }
  switchActiveSheet(compositeId);
  renderSheetList();
  renderSheetDropdown();
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelector('[data-page="overview"]').classList.add('active');
  document.getElementById('page-overview').classList.add('active');
  setTimeout(function(){ buildPageCharts('overview'); }, 80);
}

function renderSheetDropdown(){
  var sel = document.getElementById('sheetSelectorDrop');
  if(!sel) return;
  sel.innerHTML = '<option value="">-- Select Month --</option>';
  SHEET_REGISTRY.forEach(function(s){
    var outletTabs = Object.keys(SHEET_DATA).filter(function(k){ return SHEET_DATA[k].outletId === s.id; });
    if(outletTabs.length) {
      sel.innerHTML += '<optgroup label="'+s.label+'">';
      outletTabs.forEach(function(compKey){
         var d = SHEET_DATA[compKey];
         sel.innerHTML += '<option value="'+compKey+'"'+(compKey===activeSheetId?' selected':'')+'>'+d.tabName+' ('+d.DATES.length+'d)</option>';
      });
      sel.innerHTML += '</optgroup>';
    } else {
      sel.innerHTML += '<option value="" disabled>'+s.label+' (Not synced)</option>';
    }
  });
  sel.value = activeSheetId || '';
}

function populateAnaSelectors(){
  var opts = '';
  SHEET_REGISTRY.forEach(function(s){
    var outletTabs = Object.keys(SHEET_DATA).filter(function(k){ return SHEET_DATA[k].outletId === s.id; });
    if(outletTabs.length) {
      opts += '<optgroup label="'+s.label+'">';
      outletTabs.forEach(function(compKey){
         opts += '<option value="'+compKey+'">'+s.label+' - '+SHEET_DATA[compKey].tabName+'</option>';
      });
      opts += '</optgroup>';
    }
  });

  ['anaDateSheetA','anaDateSheetB','anaWeekSheetA','anaWeekSheetB'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.innerHTML = '<option value="">-- Select --</option>'+opts;
  });
}

// ── SHEET MGMT ──
function openAddSheet(){
  document.getElementById('addSheetModalTitle').textContent = '+ Add Outlet';
  document.getElementById('addSheetLabel').value = '';
  document.getElementById('addSheetUrl').value = '';
  document.getElementById('addSheetEditId').value = '';
  document.getElementById('addSheetErr').textContent = '';
  openModal('addSheetModal');
}
function editSheet(id){
  var s = SHEET_REGISTRY.find(function(x){return x.id===id;});
  if(!s) return;
  document.getElementById('addSheetModalTitle').textContent = 'Edit Outlet';
  document.getElementById('addSheetLabel').value = s.label;
  document.getElementById('addSheetUrl').value = s.url;
  document.getElementById('addSheetEditId').value = id;
  document.getElementById('addSheetErr').textContent = '';
  openModal('addSheetModal');
}
async function saveSheet(){
  var label = document.getElementById('addSheetLabel').value.trim();
  var url = document.getElementById('addSheetUrl').value.trim();
  var editId = document.getElementById('addSheetEditId').value;
  if(!label||!url){ document.getElementById('addSheetErr').textContent='Both fields required.'; return; }
  
  if(editId){
    var existing = SHEET_REGISTRY.find(function(x){return x.id===editId;});
    if(existing){ existing.label=label; existing.url=url; }
  } else {
    var id = 'outlet_'+Date.now();
    SHEET_REGISTRY.push({id:id, label:label, url:url, color:SHEET_COLORS[SHEET_REGISTRY.length%SHEET_COLORS.length], lastSynced:null});
    editId = id;
  }
  saveRegistry();
  closeModal('addSheetModal');
  renderSheetList();
  renderSheetDropdown();
  populateAnaSelectors();
  await syncOneSheet(editId);
}
function removeSheet(id){
  if(!confirm("Are you sure? This will remove all local cache for this outlet.")) return;
  SHEET_REGISTRY = SHEET_REGISTRY.filter(function(s){return s.id!==id;});
  Object.keys(SHEET_DATA).forEach(function(k){ if(SHEET_DATA[k].outletId === id) delete SHEET_DATA[k]; });
  if(activeSheetId && activeSheetId.indexOf(id)===0) activeSheetId='';
  saveRegistry(); renderSheetList(); renderSheetDropdown(); populateAnaSelectors();
}
async function syncOneSheet(id){
  var s = SHEET_REGISTRY.find(function(x){return x.id===id;});
  if(!s) return;
  try{
    var savedKeys = await fetchOutletData(id, s.url);
    s.lastSynced = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    saveRegistry();
    renderSheetList();
    renderSheetDropdown();
    populateAnaSelectors();
    if((!activeSheetId || activeSheetId.indexOf(id)===0) && savedKeys.length) switchActiveSheet(savedKeys[savedKeys.length-1]);
    showToast('✅ ' + s.label + ' Synced');
  } catch(e){
    console.error(e);
    showToast('[ERR] Failed: '+e.message);
  }
}
async function syncAllSheets(){
  showToast('Syncing all outlets...');
  for(var i=0;i<SHEET_REGISTRY.length;i++) await syncOneSheet(SHEET_REGISTRY[i].id);
}

// ── ANALYSIS ENGINE ──
function buildAnOverview() {
  var s = getActiveSheet();
  if(!s || !s.REV || !s.REV.length) return;
  
  var totRev = s.REV.reduce((a,b)=>a+b,0);
  var totRm  = s.RM.reduce((a,b)=>a+b,0);
  var totCp  = s.CP.reduce((a,b)=>a+b,0);
  
  var margin = totRev > 0 ? ((totRev - totRm - totCp) / totRev) * 100 : 0;
  document.getElementById('anKpiMargin').innerText = margin.toFixed(1) + '%';
  
  var daysElapsed = s.REV.filter(v=>v>0).length || 1;
  var totalDays = s.REV.length;
  var runRate = (totRev / daysElapsed) * totalDays;
  document.getElementById('anKpiRunRate').innerText = '₹' + fmtN(runRate);
  
  var peak = Math.max(...s.REV);
  document.getElementById('anKpiPeak').innerText = '₹' + fmtN(peak);

  var weeks = [[],[],[],[],[]];
  s.REV.forEach((v,i)=>{
    var wIdx = Math.floor(i/7);
    if(weeks[wIdx]) weeks[wIdx].push(v);
  });
  
  killChart('chAnRevTrend');
  var cTrend = document.getElementById('chartAnRevTrend');
  if(cTrend) CI.chAnRevTrend = new Chart(cTrend, {
    type: 'bar',
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'],
      datasets: [{ label: 'Total Revenue', data: weeks.map(w => w.reduce((a,b)=>a+b,0)), backgroundColor: '#60a5fa', borderRadius: 4 }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{grid:{color:'rgba(255,255,255,0.05)'}},x:{ticks:{color:'#64748b'}}}}
  });

  var dailyMargins = s.REV.map((r,i) => {
    if(r===0) return 0;
    return ((r - (s.RM[i]||0) - (s.CP[i]||0)) / r) * 100;
  });

  killChart('chAnMargin');
  var cMargin = document.getElementById('chartAnMargin');
  if(cMargin) CI.chAnMargin = new Chart(cMargin, {
    type: 'line',
    data: {
      labels: s.REV.map((_,i)=>i+1),
      datasets: [{ label: 'Margin %', data: dailyMargins, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4, pointRadius: 0 }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>v+'%'}}}}
  });
}

function buildAnBenchmark() {
  var s = getActiveSheet();
  if(!s || !s.REV || !s.REV.length) return;
  
  var todayIdx = s.REV.findLastIndex(v=>v>0);
  if(todayIdx === -1) todayIdx = s.REV.length - 1;
  var todayVal = s.REV[todayIdx];
  var todayDOW = todayIdx % 7; 
  
  var sameDOWData = [];
  Object.values(SHEET_DATA).forEach(sh => {
    sh.REV.forEach((v, i) => {
      if(i % 7 === todayDOW && v > 0 && !(sh.id === s.id && i === todayIdx)) sameDOWData.push(v);
    });
  });
  
  var avg4 = sameDOWData.slice(-4).reduce((a,b)=>a+b,0) / Math.min(sameDOWData.length, 4) || 0;
  var pct = avg4 > 0 ? ((todayVal - avg4) / avg4) * 100 : 0;
  
  var grid = document.getElementById('anBenchmarkGrid');
  if(grid) {
    grid.innerHTML = `
      <div class="kpi-card"><div class="kpi-lbl">TODAY PERFORMANCE</div><div class="kpi-val">₹${fmtN(todayVal)}</div><div class="kpi-sub">Actual Sales</div></div>
      <div class="kpi-card"><div class="kpi-lbl">HIST. BENCHMARK</div><div class="kpi-val">₹${fmtN(rnd(avg4))}</div><div class="kpi-sub">Avg of same weekdays</div></div>
      <div class="kpi-card"><div class="kpi-lbl">VARIANCE</div><div class="kpi-val" style="color:${pct>=0?'var(--grn)':'var(--red)'}">${pct>=0?'+':''}${pct.toFixed(1)}%</div><div class="kpi-sub">${pct>=0?'Above':'Below'} history</div></div>
    `;
  }

  killChart('chAnBenchmark');
  var cBench = document.getElementById('chartAnBenchmark');
  if(cBench) CI.chAnBenchmark = new Chart(cBench, {
    type: 'bar',
    data: { labels: ['Benchmark', 'Today'], datasets: [{ data: [avg4, todayVal], backgroundColor: ['rgba(255,255,255,0.1)', '#f59e0b'], borderRadius: 8, barThickness: 60 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, datalabels:{color:'#fff',formatter:v=>'₹'+fmtN(rnd(v)),anchor:'end',align:'top'}}, scales:{y:{display:false}, x:{ticks:{color:'#f1f5f9',font:{weight:'bold'}}}}}
  });
}

// ── PREDICTIVE MIS ──
function switchPredTab(id, btn) {
  document.querySelectorAll('.pred-section').forEach(s => s.style.display = 'none');
  var target = document.getElementById('predSection' + id.charAt(0).toUpperCase() + id.slice(1));
  if(target) target.style.display = 'block';
  btn.parentNode.querySelectorAll('.an-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

var HIST_MONTHS_MAP = {}; 
async function runPredictiveAnalysis(btn) {
  var s = getActiveSheet();
  if(!s) { alert("Please connect and select a Google Sheet first."); return; }
  var entry = SHEET_REGISTRY.find(function(x){return x.id===s.outletId;});
  if(!entry || !entry.url) { alert("Outlet configuration error."); return; }
  
  btn = btn || (event ? event.currentTarget : null);
  var oldText = btn ? btn.innerHTML : 'Analyze MIS Data';
  if(btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Syncing MIS...'; }
  
  try {
    var url = entry.url + (entry.url.indexOf('?')===-1?'?':'&') + 'action=getMIS';
    var resp = await fetch(url);
    var json = await resp.json();
    
    if(json.status === 'success') {
      var misTab = (json.tabs || []).find(t => t.name === 'MIS');
      if(misTab && misTab.rawData) {
        processHistoricalData(misTab.rawData);
        document.getElementById('predictiveContent').style.display = 'block';
        showToast("✅ MIS Data Synced Successfully!");
      } else {
        alert("No tab named 'MIS' found in your sheet.");
      }
    } else { alert("Sheet Error: " + (json.message || "Unknown error")); }
  } catch(e) {
    console.error(e);
    alert("Connection Error: " + e.message);
  } finally { if(btn) { btn.disabled = false; btn.innerHTML = oldText; } }
}

function processHistoricalData(rawRows) {
  try {
    if(!rawRows || !rawRows.length) return;
    window.LAST_HIST_ROWS = rawRows;
    var monthsToPredict = parseInt(document.getElementById('predMonths').value || '1', 10);
    
    document.getElementById('thFore1').style.display = 'table-cell';
    document.getElementById('thFore2').style.display = monthsToPredict >= 2 ? 'table-cell' : 'none';
    document.getElementById('thFore3').style.display = monthsToPredict >= 3 ? 'table-cell' : 'none';

    var dynamicItems = [], totalRevenueHist = 0, histMonths = []; 
    HIST_MONTHS_MAP = {}; 
    
    var topleft = String(rawRows[0][0]||'').trim().toLowerCase();
    var isNewPivot = topleft.includes('particulars');
    var startCol = isNewPivot ? 4 : 2, colStep = isNewPivot ? 1 : 2, startRow = isNewPivot ? 1 : 3;
    
    for(var c=startCol; c<rawRows[0].length; c+=colStep) {
      var mName = String(rawRows[0][c] || '').trim();
      if(mName) { histMonths.push(mName); HIST_MONTHS_MAP[mName] = {}; }
    }
    
    var monthsCount = isNewPivot ? histMonths.length / 30 : histMonths.length;
    for(var r=startRow; r<rawRows.length; r++) {
      var sub = isNewPivot ? String(rawRows[r][0] || '').trim() : String(rawRows[r][1] || '').trim();
      var cat = isNewPivot ? 'MIS Data' : String(rawRows[r][0] || '').trim();
      if(!sub) continue;
      if(isNewPivot && sub.toLowerCase().includes('%age')) continue;
      
      var sum = 0, mIdx = 0;
      for(var c=startCol; c<rawRows[r].length; c+=colStep) {
        var val = parseFloat(rawRows[r][c]) || 0;
        sum += val;
        if(histMonths[mIdx]) HIST_MONTHS_MAP[histMonths[mIdx]][sub] = val;
        mIdx++;
      }
      var isRev = sub.toLowerCase().includes('revenue');
      if(isRev && totalRevenueHist === 0) totalRevenueHist = sum;
      if(sum !== 0 || isRev) dynamicItems.push({ cat:cat, sub:sub, totalHist:sum, histMonthlyAvg: monthsCount>0?sum/monthsCount:0, isRev:isRev });
    }

    if(totalRevenueHist === 0) { alert("No revenue data in MIS."); return; }

    var trendHead = '<th>Metric</th>';
    histMonths.forEach(m => trendHead += `<th class="num">${m}</th>`);
    document.getElementById('predTrendHead').innerHTML = trendHead;
    
    var trendHtml = '';
    dynamicItems.forEach(item => {
      trendHtml += `<tr><td>${item.sub}</td>`;
      histMonths.forEach(m => trendHtml += `<td class="num">₹${fmtN(HIST_MONTHS_MAP[m][item.sub]||0)}</td>`);
      trendHtml += '</tr>';
    });
    document.getElementById('predTrendTbl').innerHTML = trendHtml;

    var optHtml = histMonths.map(m => `<option value="${m}">${m}</option>`).join('');
    document.getElementById('compMonthA').innerHTML = optHtml;
    document.getElementById('compMonthB').innerHTML = optHtml;
    if(histMonths.length > 1) document.getElementById('compMonthB').value = histMonths[histMonths.length-1];
    runPredCompare();

    var s = getActiveSheet();
    var liveAvgRev = s ? (s.REV.reduce((a,b)=>a+b,0) / (s.REV.filter(v=>v>0).length || 1)) : 0;
    var liveMthEstSales = liveAvgRev * 30;
    var histDailyAvgRev = totalRevenueHist / (isNewPivot ? histMonths.length : histMonths.length * 30);
    var growthMult = histDailyAvgRev > 0 ? (liveAvgRev / histDailyAvgRev) : 1;
    var safeMult = Math.min(Math.max(growthMult, 0.8), 1.15); 
    
    document.getElementById('predHistAvg').innerText = '₹' + fmtN(histDailyAvgRev);
    document.getElementById('predCurrRun').innerText = '₹' + fmtL(liveMthEstSales);
    document.getElementById('predGrowth').innerText = (growthMult * 100).toFixed(1) + '%';

    var plannerHtml = '', m1Sales = liveMthEstSales || (histDailyAvgRev * 30 * safeMult);
    dynamicItems.forEach(item => {
      var ratio = item.totalHist / totalRevenueHist;
      var m1Val = item.isRev ? m1Sales : m1Sales * ratio;
      plannerHtml += `<tr><td>${item.cat}</td><td style="font-weight:700">${item.sub}</td><td class="num">₹${fmtL(item.histMonthlyAvg)}</td><td class="num" style="color:var(--pur);font-weight:800">₹${fmtL(m1Val)}</td><td class="num" style="display:${monthsToPredict>=2?'table-cell':'none'}">₹${fmtL(m1Val * safeMult)}</td><td class="num" style="display:${monthsToPredict>=3?'table-cell':'none'}">₹${fmtL(m1Val * safeMult * safeMult)}</td><td class="num">${(ratio*100).toFixed(1)}%</td></tr>`;
    });
    document.getElementById('predBudgetTbl').innerHTML = plannerHtml;
    document.getElementById('predInsights').innerHTML = `<strong>Summary:</strong> Projecting <strong>₹${fmtL(m1Sales)}</strong> next month based on history.`;
    document.getElementById('predictiveContent').style.display='block';
  } catch(e) { console.error(e); }
}

function runPredCompare() {
  var mA = document.getElementById('compMonthA').value, mB = document.getElementById('compMonthB').value;
  document.getElementById('lblCompA').innerText = mA; document.getElementById('lblCompB').innerText = mB;
  var dataA = HIST_MONTHS_MAP[mA] || {}, dataB = HIST_MONTHS_MAP[mB] || {};
  var html = '';
  Object.keys(dataA).forEach(k => {
    var vA = dataA[k] || 0, vB = dataB[k] || 0, diff = vB - vA, diffP = vA ? (diff / vA) * 100 : 0;
    html += `<tr><td>${k}</td><td class="num">₹${fmtN(vA)}</td><td class="num">₹${fmtN(vB)}</td><td class="num" style="color:${diffP>=0?'var(--grn)':'var(--red)'}">${fmtN(diff)} (${diffP.toFixed(1)}%)</td></tr>`;
  });
  document.getElementById('predCompareTbl').innerHTML = html;
}

// ── TEAM & OTHER ──
function toggleTeamRange(val){
  document.getElementById('teamRangeWrap').style.display = (val==='custom'?'flex':'none');
  buildTeamCharts();
}
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

// ── BOOT ──
document.addEventListener('DOMContentLoaded', function(){
  loadRegistry();
  if(window.refreshKeyBadge) refreshKeyBadge();
  renderSheetList();
  renderSheetDropdown();
  populateAnaSelectors();
  if(SHEET_REGISTRY.length) {
    var targetOutlet = activeSheetId ? activeSheetId.split('__')[0] : SHEET_REGISTRY[0].id;
    syncOneSheet(targetOutlet);
  }
});
