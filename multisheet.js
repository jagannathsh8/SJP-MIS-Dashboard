"use strict";

var SHEET_COLORS = ['#f59e0b','#60a5fa','#22c55e','#a78bfa','#f87171','#38bdf8','#e879f9','#facc15','#4ade80','#fb923c','#818cf8','#2dd4bf'];
var SHEET_DATA = {};
var SHEET_REGISTRY = [];
var activeSheetId = '';
var DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxKEGzsKYdRMFxA1nWjVtifaPMxSzS7Pqqi-lL33UqlRlP--FI1oQK6eDiyvI1zPLVI/exec';

function loadRegistry(){
  try { SHEET_REGISTRY = JSON.parse(localStorage.getItem('sjp_outlets')||'[]'); } catch(e){ SHEET_REGISTRY=[]; }
  activeSheetId = localStorage.getItem('sjp_active_outlet')||'';
  
  // Auto-select latest sheet if none active
  if(!activeSheetId && SHEET_REGISTRY.length) {
    // We'll pick the last one added as the "latest"
    var last = SHEET_REGISTRY[SHEET_REGISTRY.length-1];
    var tabs = Object.keys(SHEET_DATA).filter(function(k){ return SHEET_DATA[k].outletId === last.id; });
    if(tabs.length) activeSheetId = tabs[tabs.length-1];
  }
}
function saveRegistry(){
  localStorage.setItem('sjp_outlets', JSON.stringify(SHEET_REGISTRY));
  localStorage.setItem('sjp_active_outlet', activeSheetId);
}

function switchActiveSheet(id){
  if(!SHEET_DATA[id]) return;
  activeSheetId = id;
  saveRegistry();
  
  var d = SHEET_DATA[id];
  // Inject into global arrays
  DATES.length=0; d.DATES.forEach(function(x){ DATES.push(x); });
  REV.length=0; d.REV.forEach(function(x){ REV.push(x); });
  RM.length=0; d.RM.forEach(function(x){ RM.push(x); });
  CP.length=0; d.CP.forEach(function(x){ CP.push(x); });
  PKG.length=0; d.PKG.forEach(function(x){ PKG.push(x); });
  HK.length=0; d.HK.forEach(function(x){ HK.push(x); });
  GASU.length=0; d.GASU.forEach(function(x){ GASU.push(x); });
  GASV.length=0; d.GASV.forEach(function(x){ GASV.push(x); });
  WATQ.length=0; d.WATQ.forEach(function(x){ WATQ.push(x); });
  WATV.length=0; d.WATV.forEach(function(x){ WATV.push(x); });
  PETTY.length=0; d.PETTY.forEach(function(x){ PETTY.push(x); });
  
  // Inject targets
  window.DYNAMIC_DATA = d.DYNAMIC;
  window.TARGETS = d.TARGETS;
  window.RUN_RATES = d.RUN_RATES;
  window.MTDS = d.MTDS;
  window.TARGET = d.TARGET;
  window.MONTH_DAYS = d.MONTH_DAYS;
  
  killAllCharts();
  Object.keys(builtPages).forEach(function(k){ delete builtPages[k]; });
  renderUI();
  setTimeout(function(){ buildPageCharts('overview'); }, 80);
}

// ── Parse multi-tab Apps Script JSON into data objects ──
function parseAppsScriptTabs(json){
  if(json.status!=='success' || !json.tabs) throw new Error('Invalid multi-tab response');
  var parsedTabs = {};
  
  json.tabs.forEach(function(tab){
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
    
    // Dynamic Extractor & Targets
    var dynamicRows = {};
    var TARGETS = {}, RUN_RATES = {}, MTDS = {};
    data.forEach(function(row){
        var p = row.Particulars;
        if(!p) return;
        
        // Store targets, run rates, MTDs for all rows
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
      
      // Dynamic rows
      Object.keys(dynamicRows).forEach(function(dr){ dynamicRows[dr].push(getVal(findRow(dr), dKey)); });
    }
    
    if(tab.name.toLowerCase().indexOf('employee') !== -1) {
      window.TEAM_DATA = data;
      return;
    }

    parsedTabs[tab.name] = {
      DATES:nd, REV:nr, RM:nrm, CP:ncp, PKG:npk, HK:nhk, 
      GASU:ngu, GASV:ngv, WATQ:nwq, WATV:nwv, PETTY:npt, 
      TARGET:tgt, MONTH_DAYS:nd.length,
      DYNAMIC: dynamicRows,
      TARGETS: TARGETS,
      RUN_RATES: RUN_RATES,
      MTDS: MTDS
    };
  });
  return parsedTabs;
}

// ── Fetch one outlet by URL, store in SHEET_DATA ──
async function fetchOutletData(outletId, url){
  var r = await fetch(url);
  var json = await r.json();
  var parsedTabs = parseAppsScriptTabs(json);
  
  // Save each tab as outletId__tabName
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

// ── Apply a sheet's data to global arrays ──
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

// ── Switch active sheet (called from dropdown) ──
function switchActiveSheet(compositeId){
  if(!compositeId||!SHEET_DATA[compositeId]) return;
  applySheetToGlobals(compositeId);
  var d = SHEET_DATA[compositeId];
  var entry = SHEET_REGISTRY.find(function(s){return s.id===d.outletId;});
  // Update header
  document.getElementById('hdrTitle').innerHTML = (entry?entry.label:'Dashboard')+' - '+d.tabName;
  document.getElementById('hdrSub').textContent = 'MIS Dashboard · '+DATES.length+' days · Jagan';
  killAllCharts();
  Object.keys(builtPages).forEach(function(k){ delete builtPages[k]; });
  renderUI();
  setTimeout(function(){ buildPageCharts('overview'); },80);
  document.getElementById('srcInfoEl').textContent = 'Active: '+(entry?entry.label:'')+' ('+d.tabName+') · '+DATES.length+' days';
}

// ── Render outlet list on Data Source page ──
function renderSheetList(){
  var el = document.getElementById('sheetListEl');
  if(!SHEET_REGISTRY.length){ el.innerHTML='<div style="text-align:center;padding:24px;color:var(--m1);font-size:12px">No outlets added yet.</div>'; return; }
  
  el.innerHTML = SHEET_REGISTRY.map(function(s){
    // Find all tabs for this outlet
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
          +'<button class="icon-btn" data-action="sync" data-sid="'+sid+'" title="Sync Outlet">Sync</button>'
          +'<button class="icon-btn" data-action="edit" data-sid="'+sid+'" title="Edit">Edit</button>'
          +'<button class="icon-btn danger" data-action="remove" data-sid="'+sid+'" title="Remove">Remove</button>'
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

// ── Set active sheet from Data Source page ──
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

// ── Update header dropdown ──
function renderSheetDropdown(){
  var sel = document.getElementById('sheetSelectorDrop');
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

// ── Open add sheet modal ──
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

// ── Save sheet (add or edit) ──
async function saveSheet(){
  var label = document.getElementById('addSheetLabel').value.trim();
  var url = document.getElementById('addSheetUrl').value.trim();
  var editId = document.getElementById('addSheetEditId').value;
  if(!label||!url){ document.getElementById('addSheetErr').textContent='Both fields required.'; return; }
  if(url.indexOf('/macros/s/')===-1){ document.getElementById('addSheetErr').textContent='Must be an Apps Script /exec URL.'; return; }

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

// ── Remove sheet ──
function removeSheet(id){
  SHEET_REGISTRY = SHEET_REGISTRY.filter(function(s){return s.id!==id;});
  // remove all tabs for this outlet
  Object.keys(SHEET_DATA).forEach(function(k){
    if(SHEET_DATA[k].outletId === id) delete SHEET_DATA[k];
  });
  if(activeSheetId && activeSheetId.indexOf(id)===0){ activeSheetId=''; DATES.length=0; REV.length=0; }
  saveRegistry(); renderSheetList(); renderSheetDropdown(); populateAnaSelectors();
}

// ── Sync one sheet ──
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
    if((!activeSheetId || activeSheetId.indexOf(id)===0) && savedKeys.length){
      switchActiveSheet(savedKeys[savedKeys.length-1]); // switch to the latest added tab
    }
  } catch(e){
    showToast('[ERR] Failed: '+e.message);
  }
}

// ── Sync all sheets ──
async function syncAllSheets(){
  showToast('Syncing all outlets...');
  for(var i=0;i<SHEET_REGISTRY.length;i++){
    await syncOneSheet(SHEET_REGISTRY[i].id);
  }
  showToast('[OK] All outlets synced!');
}

// ═══════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════
function setAnaMode(mode, btn){
  ['date','week','month'].forEach(function(m){ document.getElementById('ana-'+m).style.display = m===mode?'block':'none'; });
  document.querySelectorAll('.ana-mode-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
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
  
  var ms = document.getElementById('anaMonthSelectors');
  if(ms){
    ms.innerHTML = Object.keys(SHEET_DATA).map(function(compKey){
      var d = SHEET_DATA[compKey];
      var s = SHEET_REGISTRY.find(function(x){return x.id===d.outletId;});
      return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;background:var(--s2);border:1px solid var(--b2);padding:8px 12px;border-radius:8px">'
        +'<input type="checkbox" class="ana-month-cb" value="'+compKey+'" style="accent-color:'+s.color+'">'
        +'<span class="sheet-dot" style="background:'+s.color+';width:8px;height:8px"></span>'+s.label+' ('+d.tabName+')</label>';
    }).join('');
  }
}

function populateAnaDates(side){
  var compositeId = document.getElementById('anaDateSheet'+side).value;
  var sel = document.getElementById('anaDate'+side);
  sel.innerHTML = '<option value="">-- Date --</option>';
  if(!compositeId||!SHEET_DATA[compositeId]) return;
  SHEET_DATA[compositeId].DATES.forEach(function(d,i){ sel.innerHTML+='<option value="'+i+'">'+d+'</option>'; });
}

function populateAnaWeeks(side){
  var compositeId = document.getElementById('anaWeekSheet'+side).value;
  var sel = document.getElementById('anaWeek'+side);
  sel.innerHTML = '<option value="">-- Week --</option>';
  if(!compositeId||!SHEET_DATA[compositeId]) return;
  var dates = SHEET_DATA[compositeId].DATES;
  var weeks = Math.ceil(dates.length/7);
  for(var w=0;w<weeks;w++){
    var s=w*7, e=Math.min(s+6,dates.length-1);
    sel.innerHTML+='<option value="'+w+'">W'+(w+1)+': '+dates[s]+' to '+dates[e]+'</option>';
  }
}

function deltaPill(a,b){
  if(!a||!b) return '';
  var pct=((a-b)/b*100).toFixed(1);
  var cls=pct>0?'delta-pos':pct<0?'delta-neg':'delta-neu';
  return '<span class="delta-pill '+cls+'">'+(pct>0?'Up ':'Dn ')+Math.abs(pct)+'%</span>';
}

function cmpSection(title){
  return '<div style="margin:24px 0 10px;padding:8px 12px;background:var(--s2);border-radius:8px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--amb);border-left:3px solid var(--amb)">'+title+'</div>';
}

function cmpRow(label,a,b,fmt){
  var va=fmt?fmt(a):fmtL(a), vb=fmt?fmt(b):fmtL(b);
  return '<div class="cmp-grid-row" style="display:grid;grid-template-columns:minmax(140px, 1fr) 100px 100px 80px;align-items:center;padding:12px 0;border-bottom:1px solid var(--b1);font-size:13px">'
    +'<span style="color:var(--m1);font-weight:500">'+label+'</span>'
    +'<span style="color:#f59e0b;font-family:\'DM Mono\',monospace;font-weight:700;text-align:right">'+va+'</span>'
    +'<span style="color:#60a5fa;font-family:\'DM Mono\',monospace;font-weight:700;text-align:right">'+vb+'</span>'
    +'<div style="text-align:right">'+deltaPill(a,b)+'</div></div>';
}

function runDateVsDate(){
  var sA=document.getElementById('anaDateSheetA').value, iA=parseInt(document.getElementById('anaDateA').value);
  var sB=document.getElementById('anaDateSheetB').value, iB=parseInt(document.getElementById('anaDateB').value);
  if(!sA||!sB||isNaN(iA)||isNaN(iB)){ showToast('Select both tabs and dates.'); return; }
  var dA=SHEET_DATA[sA], dB=SHEET_DATA[sB];
  var eA=SHEET_REGISTRY.find(function(x){return x.id===dA.outletId;}), eB=SHEET_REGISTRY.find(function(x){return x.id===dB.outletId;});
  var pct = function(v){ return v.toFixed(1)+'%'; };
  var el=document.getElementById('anaDateResult');
  
  var html = '<div class="card card-body" style="padding:20px">'
    +'<div class="cmp-grid-header" style="display:grid;grid-template-columns:minmax(140px, 1fr) 100px 100px 80px;align-items:center;padding:0 0 16px;border-bottom:2px solid var(--b2);margin-bottom:10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">'
      +'<span style="color:var(--m1)">Particulars</span>'
      +'<span style="text-align:right;color:'+eA.color+'">'+dA.DATES[iA]+'<div style="font-size:8px;font-weight:400;text-transform:none">'+dA.tabName+'</div></span>'
      +'<span style="text-align:right;color:'+eB.color+'">'+dB.DATES[iB]+'<div style="font-size:8px;font-weight:400;text-transform:none">'+dB.tabName+'</div></span>'
      +'<span style="text-align:right;color:var(--m1)">Trend</span>'
    +'</div>'
    +cmpSection('Core Revenue')
    +cmpRow('Net Revenue',dA.REV[iA],dB.REV[iB])
    +cmpSection('Critical Indents')
    +cmpRow('RM Indent',dA.RM[iA],dB.RM[iB])
    +cmpRow('CP Indent',dA.CP[iA],dB.CP[iB])
    +cmpRow('Total Indent',dA.RM[iA]+dA.CP[iA],dB.RM[iB]+dB.CP[iB])
    +cmpRow('Indent %', (dA.RM[iA]+dA.CP[iA])/(dA.REV[iA]||1)*100, (dB.RM[iB]+dB.CP[iB])/(dB.REV[iB]||1)*100, pct)
    +cmpSection('Utilities & Ops')
    +cmpRow('GAIL Gas Value',dA.GASV[iA],dB.GASV[iB])
    +cmpRow('Water Value',dA.WATV[iA],dB.WATV[iB])
    +cmpRow('Packaging',dA.PKG[iA],dB.PKG[iB])
    +cmpRow('HK Materials',dA.HK[iA],dB.HK[iB])
    +cmpRow('Petty Cash',dA.PETTY[iA],dB.PETTY[iB]);

  var dKeys = Object.keys(dA.DYNAMIC || {}).filter(function(k){
     var kl = k.toLowerCase();
     return kl.indexOf('revenue')===-1 && kl.indexOf('indent')===-1 && kl.indexOf('gas')===-1 && kl.indexOf('water')===-1 && kl.indexOf('hk')===-1 && kl.indexOf('packaging')===-1 && kl.indexOf('petty')===-1;
  });

  if(dKeys.length) {
    html += cmpSection('Other Cost Drivers');
    // Sort dKeys by the average value of both sides to put bigger costs on top
    dKeys.sort(function(k1, k2){
       var val1 = ((dA.DYNAMIC[k1]?dA.DYNAMIC[k1][iA]:0) + (dB.DYNAMIC && dB.DYNAMIC[k1] ? dB.DYNAMIC[k1][iB] : 0));
       var val2 = ((dA.DYNAMIC[k2]?dA.DYNAMIC[k2][iA]:0) + (dB.DYNAMIC && dB.DYNAMIC[k2] ? dB.DYNAMIC[k2][iB] : 0));
       return val2 - val1;
    });
    dKeys.forEach(function(k){
      if(dB.DYNAMIC && dB.DYNAMIC[k] !== undefined){
        html += cmpRow(k, dA.DYNAMIC[k][iA], dB.DYNAMIC[k][iB]);
      }
    });
  }

  html += '</div>';
  el.innerHTML = html;
}

function runWeekVsWeek(){
  var sA=document.getElementById('anaWeekSheetA').value, wA=parseInt(document.getElementById('anaWeekA').value);
  var sB=document.getElementById('anaWeekSheetB').value, wB=parseInt(document.getElementById('anaWeekB').value);
  if(!sA||!sB||isNaN(wA)||isNaN(wB)){ showToast('Select both tabs and weeks.'); return; }
  var dA=SHEET_DATA[sA], dB=SHEET_DATA[sB];
  var eA=SHEET_REGISTRY.find(function(x){return x.id===dA.outletId;}), eB=SHEET_REGISTRY.find(function(x){return x.id===dB.outletId;});
  var ss=function(arr,w){ var s=w*7,e=Math.min(s+7,arr.length),t=0; for(var i=s;i<e;i++) t+=arr[i]; return t; };
  var sa=function(arr,w){ var s=w*7,e=Math.min(s+7,arr.length),t=0,c=0; for(var i=s;i<e;i++){t+=arr[i];c++;} return c?t/c:0; };
  var pct=function(v){return v.toFixed(1)+'%';};
  var rA=ss(dA.REV,wA),rB=ss(dB.REV,wB);
  var rmcpA=ss(dA.RM,wA)+ss(dA.CP,wA), rmcpB=ss(dB.RM,wB)+ss(dB.CP,wB);
  var el=document.getElementById('anaWeekResult');
  
  var html = '<div class="card card-body" style="padding:20px">'
    +'<div class="cmp-grid-header" style="display:grid;grid-template-columns:minmax(140px, 1fr) 100px 100px 80px;align-items:center;padding:0 0 16px;border-bottom:2px solid var(--b2);margin-bottom:10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">'
      +'<span style="color:var(--m1)">Particulars</span>'
      +'<span style="text-align:right;color:'+eA.color+'">Week '+(wA+1)+'<div style="font-size:8px;font-weight:400;text-transform:none">'+dA.tabName+'</div></span>'
      +'<span style="text-align:right;color:'+eB.color+'">Week '+(wB+1)+'<div style="font-size:8px;font-weight:400;text-transform:none">'+dB.tabName+'</div></span>'
      +'<span style="text-align:right;color:var(--m1)">Trend</span>'
    +'</div>'
    +cmpSection('Revenue')
    +cmpRow('Total Revenue',rA,rB)
    +cmpRow('Daily Average',sa(dA.REV,wA),sa(dB.REV,wB))
    +cmpSection('Raw Materials')
    +cmpRow('RM Indent',ss(dA.RM,wA),ss(dB.RM,wB))
    +cmpRow('CP Indent',ss(dA.CP,wA),ss(dB.CP,wB))
    +cmpRow('Total Indent',rmcpA,rmcpB)
    +cmpRow('Indent %',rA?rmcpA/rA*100:0,rB?rmcpB/rB*100:0,pct)
    +cmpSection('Packaging & HK')
    +cmpRow('Packaging',ss(dA.PKG,wA),ss(dB.PKG,wB))
    +cmpRow('HK Materials',ss(dA.HK,wA),ss(dB.HK,wB))
    +cmpSection('Gas (GAIL)')
    +cmpRow('Gas Units',ss(dA.GASU,wA),ss(dB.GASU,wB),function(v){return v.toFixed(1)+' u';})
    +cmpRow('Gas Value',ss(dA.GASV,wA),ss(dB.GASV,wB))
    +cmpSection('Water')
    +cmpRow('Water Tankers',ss(dA.WATQ,wA),ss(dB.WATQ,wB),function(v){return v.toFixed(1)+' T';})
    +cmpRow('Water Value',ss(dA.WATV,wA),ss(dB.WATV,wB))
    +cmpSection('Petty Cash')
    +cmpRow('Petty Cash',ss(dA.PETTY,wA),ss(dB.PETTY,wB));

  var dKeys = Object.keys(dA.DYNAMIC || {});
  if(dKeys.length) html += cmpSection('Other Particulars');
  dKeys.forEach(function(k){
     if(dB.DYNAMIC && dB.DYNAMIC[k]){
       html += cmpRow(k, ss(dA.DYNAMIC[k],wA), ss(dB.DYNAMIC[k],wB));
     }
  });

  html += '</div>';
  el.innerHTML = html;
}

function runMonthVsMonth(){
  var checked=[]; document.querySelectorAll('.ana-month-cb:checked').forEach(function(cb){ checked.push(cb.value); });
  if(checked.length<2){ showToast('Select at least 2 months.'); return; }
  if(checked.length>3){ showToast('Maximum 3 months.'); return; }
  var sets=checked.map(function(compKey){ 
    var d = SHEET_DATA[compKey];
    return {id:compKey, d:d, e:SHEET_REGISTRY.find(function(x){return x.id===d.outletId;})}; 
  });

  var el=document.getElementById('anaMonthResult');
  var kpiHtml='<div class="cmp-grid">';
  var metrics=[
    {label:'MTD REVENUE',fn:function(d){return sum(d.REV);},fmt:fmtL},
    {label:'DAILY AVG',fn:function(d){return avg(d.REV);},fmt:function(v){return fmtL(rnd(v));}},
    {label:'INDENT %',fn:function(d){var r=sum(d.REV);return r?(sum(d.RM)+sum(d.CP))/r*100:0;},fmt:function(v){return v.toFixed(1)+'%';}},
    {label:'GAS MTD',fn:function(d){return sum(d.GASV);},fmt:fmtL},
  ];
  metrics.forEach(function(met){
    kpiHtml+='<div class="cmp-card"><div class="cmp-label">'+met.label+'</div>';
    sets.forEach(function(s,i){
      var v=met.fn(s.d);
      kpiHtml+='<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">'
        +'<span style="font-size:10px;color:'+s.e.color+'">'+s.e.label+' ('+s.d.tabName+')</span>'
        +'<span class="cmp-val" style="font-size:15px;color:'+s.e.color+'">'+met.fmt(v)+'</span>'
        +'</div>';
      if(i>0) kpiHtml+=deltaPill(v,met.fn(sets[0].d));
    });
    kpiHtml+='</div>';
  });
  kpiHtml+='</div>';
  el.innerHTML=kpiHtml;

  killChart('chAnaRev'); killChart('chAnaCost'); killChart('chAnaInd');
  document.getElementById('anaMonthChartCard').style.display='block';
  document.getElementById('anaMonthCostCard').style.display='block';
  document.getElementById('anaMonthIndCard').style.display='block';
  
  var maxLen=Math.max.apply(null,sets.map(function(s){return s.d.DATES.length;}));
  var labels=[]; for(var i=0;i<maxLen;i++) labels.push('Day '+(i+1));
  
  var revDs=sets.map(function(s){return{label:s.e.label+' '+s.d.tabName,data:s.d.REV,borderColor:s.e.color,backgroundColor:s.e.color+'30',fill:false,tension:.3,pointRadius:0,borderWidth:2};});
  CI.chAnaRev=new Chart(document.getElementById('chartAnaRev'),{type:'line',data:{labels:labels,datasets:revDs},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},
    scales:{x:{grid:{color:'rgba(26,34,53,0.7)'},ticks:{maxTicksLimit:10}},y:{grid:{color:'rgba(26,34,53,0.7)'},ticks:{callback:function(v){return(v/100000).toFixed(0)+'L';}}}}}});

  var costLabels=['Indent %','Gas %','Pkg %','Water %'];
  var costDs=sets.map(function(s){
    var r=sum(s.d.REV)||1;
    return{label:s.e.label+' '+s.d.tabName,data:[(sum(s.d.RM)+sum(s.d.CP))/r*100,sum(s.d.GASV)/r*100,sum(s.d.PKG)/r*100,sum(s.d.WATV)/r*100],
      backgroundColor:s.e.color+'99',borderRadius:4};
  });
  CI.chAnaCost=new Chart(document.getElementById('chartAnaCost'),{type:'bar',data:{labels:costLabels,datasets:costDs},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},
    scales:{x:{grid:{color:'rgba(26,34,53,0.7)'}},y:{grid:{color:'rgba(26,34,53,0.7)'},ticks:{callback:function(v){return v.toFixed(0)+'%';}}}}}});

  var indDs=sets.map(function(s){
    var ipc=s.d.DATES.map(function(_,i){return s.d.REV[i]?((s.d.RM[i]+s.d.CP[i])/s.d.REV[i]*100):0;});
    return{label:s.e.label+' '+s.d.tabName,data:ipc,borderColor:s.e.color,fill:false,tension:.3,pointRadius:0,borderWidth:2};
  });
  CI.chAnaInd=new Chart(document.getElementById('chartAnaInd'),{type:'line',data:{labels:labels,datasets:indDs},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},
    scales:{x:{grid:{color:'rgba(26,34,53,0.7)'},ticks:{maxTicksLimit:8}},y:{grid:{color:'rgba(26,34,53,0.7)'},ticks:{callback:function(v){return v+'%';}},suggestedMax:45}}}});
}

function parseSheetDate(val) {
  if(!val) return null;
  if(val instanceof Date) return val;
  var d = new Date(val);
  if(!isNaN(d.getTime())) return d;
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  var parts = String(val).split(/[-/]/);
  if(parts.length === 3) {
    // Check if first part is day or year
    if(parts[0].length === 4) return new Date(parts[0], parts[1]-1, parts[2]);
    return new Date(parts[2], parts[1]-1, parts[0]);
  }
  return null;
}

// ═══════════════════════════════════════════════
// TEAM DASHBOARD LOGIC
// ═══════════════════════════════════════════════
function buildTeamCharts() {
  if(!window.TEAM_DATA || !window.TEAM_DATA.length) {
    var el = document.getElementById('teamKpiGrid');
    if(el) el.innerHTML = '<div style="padding:20px;color:var(--m1)">Sync "Employee onboarding data" tab to view insights.</div>';
    return;
  }
  
  var raw = window.TEAM_DATA;
  var filter = document.getElementById('teamTimeSlicer') ? document.getElementById('teamTimeSlicer').value : 'all';
  var now = new Date();
  
  // Filter Data
  var data = raw.filter(function(r){
    if(filter === 'all') return true;
    var dtStr = r['Joining Date'] || r['Hired Date'] || r['Date'] || '';
    var d = parseSheetDate(dtStr);
    if(!d) return filter === 'all';
    
    if(filter === '7d') return (now - d) <= (7 * 24 * 60 * 60 * 1000);
    if(filter === 'mtd') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if(filter === '3m') return (now - d) <= (90 * 24 * 60 * 60 * 1000);
    if(filter === 'custom') {
      var start = parseSheetDate(document.getElementById('teamStart').value);
      var end = parseSheetDate(document.getElementById('teamEnd').value);
      if(!start || !end) return true;
      return d >= start && d <= end;
    }
    return true;
  });

  window.LAST_FILTERED_TEAM = data;

  var total = data.length;
  
  // Aggregates
  var locMap = {}, monthMap = {}, refMap = {}, desigMap = {};
  data.forEach(function(r){
    // Location
    var loc = r['Location'] || r['Work Location'] || r['Store'] || 'Unknown';
    locMap[loc] = (locMap[loc]||0) + 1;
    
    // Designation
    var des = r['Designation'] || r['Role'] || r['Dept'] || 'Other';
    desigMap[des] = (desigMap[des]||0) + 1;
    
    // Referral (Column H priority or header)
    var rKeys = Object.keys(r);
    var rawRef = String(r[rKeys[7]] || r['Referred By'] || r['Reference'] || 'Direct').trim();
    
    var refKey = 'Direct';
    if(rawRef && rawRef.toLowerCase() !== 'direct') {
      // Logic: Look for Employee ID (Minimum 4 digits)
      var idMatch = rawRef.match(/\d{4,}/);
      if(idMatch) {
        refKey = 'ID: ' + idMatch[0]; // Group by ID to ignore spelling differences
      } else {
        refKey = rawRef; // Fallback to name if no ID found
      }
    }
    refMap[refKey] = (refMap[refKey]||0) + 1;
    
    // Months
    var dt = r['Joining Date'] || r['Hired Date'] || r['Date'] || '';
    var mLabel = 'Unknown';
    if(dt) {
      var dObj = new Date(dt);
      if(!isNaN(dObj.getTime())) mLabel = dObj.toLocaleString('default', { month: 'short', year: '2-digit' });
    }
    monthMap[mLabel] = (monthMap[mLabel]||0) + 1;
  });

  // KPIs
  var teamKpis = [
    {l:'TOTAL EMPLOYEES', v:total, s:'Active on roster', c:'#60a5fa'},
    {l:'TOTAL LOCATIONS', v:Object.keys(locMap).length, s:'Total Branches', c:'#22c55e'},
    {l:'REFERRAL RATE',   v:((Object.keys(refMap).filter(k=>k.toLowerCase()!=='direct').length/total)*100).toFixed(0)+'%', s:'Employee referrals', c:'#a78bfa'},
    {l:'NEW ONBOARDED',   v:monthMap[new Date().toLocaleString('default',{month:'short',year:'2-digit'})]||0, s:'This month', c:'#f59e0b'}
  ];
  var kpiEl = document.getElementById('teamKpiGrid');
  if(kpiEl) kpiEl.innerHTML = teamKpis.map(function(k){
    return '<div class="kpi-card"><div class="kpi-lbl">'+k.l+'</div>'
          +'<div class="kpi-val" style="color:'+k.c+'">'+k.v+'</div>'
          +'<div class="kpi-sub">'+k.s+'</div></div>';
  }).join('');

  // Charts
  killChart('chTeamLoc');
  var cLoc = document.getElementById('chartTeamLoc');
  if(cLoc) CI.chTeamLoc = new Chart(cLoc, {
    type:'pie', data:{
      labels:Object.keys(locMap), 
      datasets:[{data:Object.values(locMap), backgroundColor:SHEET_COLORS, borderWidth:0}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#94a3b8',font:{size:10}}}}}
  });

  killChart('chTeamDesig');
  var cDes = document.getElementById('chartTeamDesig');
  var desKeys = Object.keys(desigMap).sort((a,b)=>desigMap[b]-desigMap[a]);
  if(cDes) CI.chTeamDesig = new Chart(cDes, {
    type:'doughnut', data:{
      labels:desKeys, 
      datasets:[{data:desKeys.map(k=>desigMap[k]), backgroundColor:SHEET_COLORS.slice().reverse(), borderWidth:0}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#94a3b8',font:{size:10}}}}, cutout:'65%'}
  });

  killChart('chTeamMonth');
  var mKeys = Object.keys(monthMap);
  var cMonth = document.getElementById('chartTeamMonth');
  if(cMonth) CI.chTeamMonth = new Chart(cMonth, {
    type:'bar', data:{
      labels:mKeys, 
      datasets:[{label:'Hired', data:mKeys.map(k=>monthMap[k]), backgroundColor:'#38bdf8', borderRadius:4}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#64748b'}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#64748b'}}}}
  });

  killChart('chTeamRef');
  var rKeys = Object.keys(refMap).filter(k=>k.toLowerCase()!=='direct').sort((a,b)=>refMap[b]-refMap[a]).slice(0,8);
  var cRef = document.getElementById('chartTeamRef');
  if(cRef) CI.chTeamRef = new Chart(cRef, {
    type:'bar', data:{
      labels:rKeys, 
      datasets:[{label:'Referrals', data:rKeys.map(k=>refMap[k]), backgroundColor:'#a78bfa', borderRadius:4}]
    },
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#64748b'}},y:{grid:{display:false},ticks:{color:'#64748b'}}}}
  });
}

// ═══════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function(){
  loadRegistry();
  if(window.refreshKeyBadge) refreshKeyBadge();
  renderSheetList();
  renderSheetDropdown();
  populateAnaSelectors();

  // Sync the outlet of the active sheet, or the first outlet
  if(SHEET_REGISTRY.length) {
    var targetOutlet = activeSheetId ? activeSheetId.split('__')[0] : SHEET_REGISTRY[0].id;
    syncOneSheet(targetOutlet);
  }
});
