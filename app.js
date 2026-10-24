
(() => {
  "use strict";

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const COLORS = ["#ff4b3e","#65a7ff","#4fd391","#a982ff","#efc85b","#52d4de"];

  const state = {
    progress: { athlete:null, results:[], selected:new Set(), resolvedSex:null },
    compare: { athletes:[] }
  };

  // ---------- GENERIC HELPERS ----------
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  function setStatus(target, text="", error=false) {
    const el = $(target);
    el.textContent = text;
    el.className = "status" + (error ? " error" : "");
  }

  async function api(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function yearOf(result) {
    const y = Number(String(result.date || "").slice(0,4));
    return Number.isFinite(y) && y > 1900 ? y : null;
  }

  function dateOnly(value) {
    return String(value || "").slice(0,10);
  }

  function exactAge(birthDate, resultDate) {
    const b = new Date(birthDate), d = new Date(resultDate);
    if (Number.isNaN(+b) || Number.isNaN(+d)) return null;
    let age = d.getFullYear() - b.getFullYear();
    const beforeBirthday = d.getMonth() < b.getMonth() ||
      (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
    if (beforeBirthday) age--;
    return age >= 0 ? age : null;
  }

  function athleteInitials(a) {
    const words = String(a?.name || "A").trim().split(/\s+/);
    return words.slice(0,2).map(x => x[0] || "").join("").toUpperCase();
  }

  // ---------- SCORING / EVENT NORMALIZATION ----------
  const HIGHER_BETTER = new Set(["HJ","PV","LJ","TJ","SP","DT","HT","JT","Hept. sh","Dec.","Pent. sh","Hept."]);

  function normalizedText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/short[\s-]?track/g, " sh ")
      .replace(/\bindoor\b/g, " sh ")
      .replace(/steeplechase/g, " sc ")
      .replace(/hurdles?/g, " h ")
      .replace(/kilometres?|kilometers?/g, " km ")
      .replace(/metres?|meters?/g, " m ")
      .replace(/race\s*walk|walking|walk/g, " w ")
      .replace(/half\s*marathon/g, " hm ")
      .replace(/marathon\s*walk/g, " marw ")
      .replace(/\bmixed\b/g, " mix ")
      .replace(/[×x]/g, "x")
      .replace(/[.,'’"]/g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function aliasesForKey(key) {
    const base = new Set([normalizedText(key), normalizedText(typeof waNice === "function" ? waNice(key) : key)]);
    const k = key.toLowerCase();
    if (key === "HJ") ["high jump"].forEach(x=>base.add(normalizedText(x)));
    if (key === "PV") ["pole vault"].forEach(x=>base.add(normalizedText(x)));
    if (key === "LJ") ["long jump"].forEach(x=>base.add(normalizedText(x)));
    if (key === "TJ") ["triple jump"].forEach(x=>base.add(normalizedText(x)));
    if (key === "SP") ["shot put"].forEach(x=>base.add(normalizedText(x)));
    if (key === "DT") ["discus throw","discus"].forEach(x=>base.add(normalizedText(x)));
    if (key === "HT") ["hammer throw","hammer"].forEach(x=>base.add(normalizedText(x)));
    if (key === "JT") ["javelin throw","javelin"].forEach(x=>base.add(normalizedText(x)));
    if (key === "HM") ["half marathon"].forEach(x=>base.add(normalizedText(x)));
    if (key === "Marathon") base.add(normalizedText("marathon"));
    if (key === "Mile") ["mile","1 mile"].forEach(x=>base.add(normalizedText(x)));
    if (key === "2 Miles") base.add(normalizedText("2 miles"));
    if (key.includes(" SC")) base.add(normalizedText(key.replace(" SC"," steeplechase")));
    if (key.endsWith("H")) base.add(normalizedText(key.replace("H"," hurdles")));
    if (key === "Dec.") base.add(normalizedText("decathlon"));
    if (key === "Hept.") base.add(normalizedText("heptathlon"));
    if (key === "Hept. sh") base.add(normalizedText("heptathlon short track"));
    if (key === "Pent. sh") base.add(normalizedText("pentathlon short track"));
    return [...base];
  }

  const aliasIndex = { Men:new Map(), Women:new Map() };
  ["Men","Women"].forEach(sex => {
    Object.keys(DATA?.[sex] || {}).forEach(key => {
      aliasesForKey(key).forEach(alias => aliasIndex[sex].set(alias, key));
    });
  });

  function resolveEventKey(discipline, sex, indoorHint) {
    if (!sex || !aliasIndex[sex]) return null;
    const text = String(discipline || "");
    const norm = normalizedText(text);
    let key = aliasIndex[sex].get(norm) || null;

    // First match without indoor marker, then upgrade to short-track table when appropriate.
    if (!key) {
      const noSh = norm.replace(/sh/g, "");
      key = aliasIndex[sex].get(noSh) || null;
    }

    const looksIndoor = indoorHint === true || /\b(indoor|short[\s-]?track)\b/i.test(text);
    if (key && looksIndoor) {
      if (DATA[sex][key + " sh"]) return key + " sh";
      if (key.endsWith(" sh")) return key;
    }
    if (key && !looksIndoor && key.endsWith(" sh")) {
      const outdoor = key.replace(/ sh$/, "");
      if (DATA[sex][outdoor]) return outdoor;
    }
    return key;
  }

  function scoreResult(result, sex) {
    const key = resolveEventKey(result.discipline, sex, result.indoor);
    if (!key) return { key:null, score:null, matched:null };
    const scored = waScore(sex, key, result.mark);
    return { key, score:scored.score, matched:scored.matched };
  }

  function markNumeric(mark, eventKey) {
    const n = waNumMark(mark);
    return Number.isFinite(n) ? n : null;
  }

  function formatMarkValue(value, eventKey) {
    if (!Number.isFinite(value)) return "—";
    if (HIGHER_BETTER.has(eventKey)) {
      if (["Dec.","Hept.","Hept. sh","Pent. sh"].includes(eventKey)) return Math.round(value).toString();
      return value.toFixed(2);
    }
    if (value >= 3600) {
      const h=Math.floor(value/3600), m=Math.floor((value-h*3600)/60), s=value-h*3600-m*60;
      return `${h}:${String(m).padStart(2,"0")}:${s.toFixed(2).padStart(5,"0")}`;
    }
    if (value >= 60) {
      const m=Math.floor(value/60), s=value-m*60;
      return `${m}:${s.toFixed(2).padStart(5,"0")}`;
    }
    return value.toFixed(2);
  }

  function betterThan(a, b, eventKey) {
    if (b == null) return true;
    return HIGHER_BETTER.has(eventKey) ? a > b : a < b;
  }

  function seasonBestsForEvent(results, displayEvent, sex) {
    const rows = results
      .filter(r => r.discipline === displayEvent)
      .map(r => {
        const scoring = scoreResult(r, sex);
        const numeric = markNumeric(r.mark, scoring.key);
        return { ...r, ...scoring, numeric, year:yearOf(r) };
      })
      .filter(r => r.year && Number.isFinite(r.numeric));

    const byYear = new Map();
    for (const r of rows) {
      const existing = byYear.get(r.year);
      if (!existing || betterThan(r.numeric, existing.numeric, r.key || existing.key)) {
        byYear.set(r.year, r);
      }
    }
    return [...byYear.values()].sort((a,b)=>a.year-b.year);
  }

  function resolveSex(athlete, override) {
    if (override && override !== "auto") return override;
    return athlete?.sex || null;
  }

  // ---------- CHART ----------
  function tooltipHtml(point, seriesName, metric) {
    const rows = [
      `<strong>${escapeHtml(seriesName)}</strong>`,
      point.label ? `<div class="muted-tip">${escapeHtml(point.label)}</div>` : "",
      point.mark ? `<div>Mark: <b>${escapeHtml(point.mark)}</b></div>` : "",
      point.score != null ? `<div>WA points: <b>${point.score}</b></div>` : "",
      point.date ? `<div class="muted-tip">${escapeHtml(point.date)}</div>` : ""
    ];
    return rows.join("");
  }

  function renderLineChart(svg, series, options={}) {
    const tooltip = $("#tooltip");
    const W=1100,H=options.height||440,p={l:82,r:28,t:28,b:62};
    const points = series.flatMap(s => s.points).filter(q => Number.isFinite(q.x)&&Number.isFinite(q.y));

    svg.innerHTML = "";
    if (!points.length) {
      svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" class="chart-empty">No chartable data for this selection</text>`;
      return;
    }

    let xmin=Math.min(...points.map(q=>q.x)), xmax=Math.max(...points.map(q=>q.x));
    let ymin=Math.min(...points.map(q=>q.y)), ymax=Math.max(...points.map(q=>q.y));
    if (xmin===xmax){xmin-=1;xmax+=1}
    if (ymin===ymax){ymin-=1;ymax+=1}
    const yPad=Math.max((ymax-ymin)*.12, options.yPadMin||0);
    ymin-=yPad; ymax+=yPad;

    const xScale=v=>p.l+(v-xmin)*(W-p.l-p.r)/(xmax-xmin);
    const normalY=v=>p.t+(ymax-v)*(H-p.t-p.b)/(ymax-ymin);
    const invertedY=v=>p.t+(v-ymin)*(H-p.t-p.b)/(ymax-ymin);
    const yScale = options.lowerBetter ? invertedY : normalY;

    let html="";
    for(let i=0;i<5;i++){
      const v=ymin+(ymax-ymin)*i/4, yy=yScale(v);
      html += `<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" stroke="#243147" stroke-width="1"/>`;
      html += `<text x="${p.l-11}" y="${yy+4}" text-anchor="end" fill="#7f8fa5" font-size="11">${escapeHtml(options.yFormat?options.yFormat(v):Math.round(v))}</text>`;
    }

    const xTicks=[...new Set(points.map(q=>q.x))].sort((a,b)=>a-b);
    const xStep=Math.max(1,Math.ceil(xTicks.length/10));
    xTicks.forEach((v,i)=>{
      if(i%xStep===0||i===xTicks.length-1){
        html += `<text x="${xScale(v)}" y="${H-24}" text-anchor="middle" fill="#7f8fa5" font-size="11">${escapeHtml(options.xFormat?options.xFormat(v):v)}</text>`;
      }
    });

    series.forEach((s,si)=>{
      const color=s.color||COLORS[si%COLORS.length];
      const pts=s.points.filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)).sort((a,b)=>a.x-b.x);
      if (!pts.length) return;

      html += `<polyline points="${pts.map(q=>`${xScale(q.x)},${yScale(q.y)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;

      pts.forEach((q,pi)=>{
        const id=`p-${si}-${pi}`;
        html += `<circle id="${id}" cx="${xScale(q.x)}" cy="${yScale(q.y)}" r="5.5" fill="#0f1621" stroke="${color}" stroke-width="3" tabindex="0"/>`;
      });
    });

    svg.innerHTML=html;

    series.forEach((s,si)=>{
      const pts=s.points.filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)).sort((a,b)=>a.x-b.x);
      pts.forEach((q,pi)=>{
        const node=svg.querySelector(`#p-${si}-${pi}`);
        if(!node) return;
        const show=e=>{
          tooltip.innerHTML=tooltipHtml(q,s.name,options.metric);
          tooltip.hidden=false;
          const x=(e.clientX||0)+12,y=(e.clientY||0)+12;
          tooltip.style.left=Math.min(x,window.innerWidth-280)+"px";
          tooltip.style.top=Math.min(y,window.innerHeight-150)+"px";
          node.setAttribute("r","7");
        };
        const hide=()=>{tooltip.hidden=true;node.setAttribute("r","5.5")};
        node.addEventListener("mousemove",show);
        node.addEventListener("mouseenter",show);
        node.addEventListener("mouseleave",hide);
        node.addEventListener("focus",e=>show({clientX:window.innerWidth/2,clientY:120}));
        node.addEventListener("blur",hide);
      });
    });
  }

  // ---------- SEARCH UI ----------
  function athleteHitHtml(a, i) {
    return `<div class="search-hit" data-i="${i}">
      <div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml([a.country,a.birthDate].filter(Boolean).join(" · "))}</small></div>
      <small>#${escapeHtml(a.id)}</small>
    </div>`;
  }

  async function searchAthletes(query) {
    return api(`/api/search?q=${encodeURIComponent(query)}`);
  }

  // ---------- ATHLETE PROGRESS ----------
  async function searchProgress() {
    const q=$("#progress-search").value.trim();
    if(!q) return;
    setStatus("#progress-status","Searching athlete…");
    $("#progress-search-results").innerHTML="";
    try{
      const list=await searchAthletes(q);
      if(!list.length){
        $("#progress-search-results").innerHTML='<div class="status">No athletes found.</div>';
        setStatus("#progress-status","");
        return;
      }
      $("#progress-search-results").innerHTML=list.slice(0,15).map(athleteHitHtml).join("");
      $$("#progress-search-results .search-hit").forEach(el=>{
        el.onclick=()=>loadProgressAthlete(list[+el.dataset.i]);
      });
      setStatus("#progress-status","");
    }catch(e){setStatus("#progress-status",e.message,true)}
  }

  async function loadProgressAthlete(a) {
    $("#progress-search-results").innerHTML="";
    setStatus("#progress-status",`Loading ${a.name}…`);
    try{
      const data=await api(`/api/athlete?id=${encodeURIComponent(a.id)}`);
      state.progress.athlete=data.athlete||a;
      state.progress.results=data.results||[];
      state.progress.selected=new Set();

      $("#progress-name").textContent=state.progress.athlete.name;
      $("#progress-meta").textContent=[state.progress.athlete.country,state.progress.athlete.birthDate].filter(Boolean).join(" · ")||"World Athletics athlete";
      $("#progress-id").textContent=state.progress.athlete.id;
      $("#progress-result-count").textContent=state.progress.results.length;
      $("#progress-avatar").textContent=athleteInitials(state.progress.athlete);
      $("#progress-sex").value="auto";
      $("#progress-app").classList.remove("hidden");

      buildProgressEventSelector();
      setStatus("#progress-status",`Loaded ${state.progress.results.length} performances.`);
    }catch(e){setStatus("#progress-status",e.message,true)}
  }

  function availableProgressEvents() {
    const events=[...new Set(state.progress.results.map(r=>r.discipline).filter(Boolean))];
    return events.sort((a,b)=>a.localeCompare(b));
  }

  function buildProgressEventSelector() {
    const sex=resolveSex(state.progress.athlete,$("#progress-sex").value);
    const events=availableProgressEvents();
    const preferred=events.filter(e=>/800|1500|3000|5000|mile/i.test(e)).slice(0,3);
    if(!state.progress.selected.size){
      (preferred.length?preferred.slice(0,2):events.slice(0,1)).forEach(e=>state.progress.selected.add(e));
    }

    $("#event-selector").innerHTML=events.map(e=>{
      const scoreable=sex ? state.progress.results.some(r=>r.discipline===e && resolveEventKey(e,sex,r.indoor)) : false;
      const selected=state.progress.selected.has(e);
      return `<label class="event-option ${selected?"selected":""}">
        <input type="checkbox" value="${escapeHtml(e)}" ${selected?"checked":""}>
        <span class="score-dot"></span>${escapeHtml(e)}
        ${scoreable?'':'<span title="Scoring mapping unavailable">·</span>'}
      </label>`;
    }).join("");

    $$("#event-selector input").forEach(input=>{
      input.onchange=()=>{
        if(input.checked) state.progress.selected.add(input.value);
        else state.progress.selected.delete(input.value);
        buildProgressEventSelector();
        renderProgress();
      };
    });
    renderProgress();
  }

  function selectedProgressEvents() {
    return [...state.progress.selected];
  }

  function renderProgress() {
    if(!state.progress.athlete) return;

    const sex=resolveSex(state.progress.athlete,$("#progress-sex").value);
    const events=selectedProgressEvents();
    const metric=$("#progress-metric").value;

    const metricSelect=$("#progress-metric");
    const perfOption=metricSelect.querySelector('option[value="performance"]');
    perfOption.disabled=events.length!==1;
    if(events.length!==1 && metric==="performance") metricSelect.value="points";

    const actualMetric=metricSelect.value;
    $("#metric-help").textContent=events.length===1
      ? "Toggle between WA points and the actual performance."
      : "Actual performance is disabled when multiple events are selected.";

    if(!events.length){
      $("#progress-chart-title").textContent="Season-best progression";
      $("#progress-chart-subtitle").textContent="Select at least one event.";
      $("#progress-legend").innerHTML="";
      $("#progress-stat-cards").innerHTML="";
      $("#progress-table-body").innerHTML="";
      $("#progress-coverage").textContent="No events selected";
      renderLineChart($("#progress-chart"),[]);
      return;
    }

    const eventData=events.map((event,i)=>{
      const sb=sex?seasonBestsForEvent(state.progress.results,event,sex):[];
      return {event,color:COLORS[i%COLORS.length],sb};
    });

    const scorable=eventData.reduce((n,x)=>n+x.sb.filter(r=>r.score!=null).length,0);
    const total=eventData.reduce((n,x)=>n+x.sb.length,0);
    $("#progress-coverage").textContent=!sex
      ? "Select athlete sex to score"
      : `${scorable}/${total} season bests scored`;

    let series=[];
    let lowerBetter=false;
    let yFormat=v=>Math.round(v);

    if(actualMetric==="points"){
      series=eventData.map(x=>({
        name:x.event,color:x.color,
        points:x.sb.filter(r=>r.score!=null).map(r=>({
          x:r.year,y:r.score,mark:r.mark,score:r.score,date:dateOnly(r.date),
          label:`${r.year} · ${r.event||x.event}`
        }))
      }));
      yFormat=v=>Math.round(v);
      lowerBetter=false;
      $("#progress-chart-title").textContent=events.length>1 ? "Multi-event WA points progression" : `${events[0]} · WA points`;
      $("#progress-chart-subtitle").textContent="Each point is the athlete’s season best converted with the 2025 scoring tables.";
    }else{
      const x=eventData[0];
      const key=x.sb.find(r=>r.key)?.key || null;
      lowerBetter=key ? !HIGHER_BETTER.has(key) : true;
      series=[{
        name:x.event,color:x.color,
        points:x.sb.map(r=>({
          x:r.year,y:r.numeric,mark:r.mark,score:r.score,date:dateOnly(r.date),label:String(r.year)
        }))
      }];
      yFormat=v=>formatMarkValue(v,key);
      $("#progress-chart-title").textContent=`${x.event} · actual performance`;
      $("#progress-chart-subtitle").textContent="Season best in the event’s native performance unit.";
    }

    $("#progress-legend").innerHTML=series.map((s,i)=>`<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.name)}</span>`).join("");

    renderLineChart($("#progress-chart"),series,{
      lowerBetter,yFormat,metric:actualMetric,yPadMin:actualMetric==="points"?6:0
    });

    renderProgressStats(eventData);
    renderProgressTable(eventData);

    // re-sync selected styling after render
    $$("#event-selector .event-option").forEach(label=>{
      const input=label.querySelector("input");
      label.classList.toggle("selected",input.checked);
    });
  }

  function renderProgressStats(eventData) {
    $("#progress-stat-cards").innerHTML=eventData.map((x,i)=>{
      const rows=x.sb;
      if(!rows.length) return `<div class="event-stat-card"><h4>${escapeHtml(x.event)}</h4><p class="status">No valid season bests.</p></div>`;
      const key=rows.find(r=>r.key)?.key;
      const pb=rows.reduce((best,r)=>!best||betterThan(r.numeric,best.numeric,key)?r:best,null);
      const bestScore=Math.max(...rows.map(r=>r.score??-Infinity));
      const first=rows[0],last=rows.at(-1);
      const firstScore=first.score, latestScore=last.score;
      const improvement=(firstScore!=null && bestScore!==-Infinity)?bestScore-firstScore:null;
      return `<div class="event-stat-card">
        <div class="event-title"><h4>${escapeHtml(x.event)}</h4><span class="pill">${rows.length} seasons</span></div>
        <div class="event-stat-values">
          <div><span>PB</span><strong>${escapeHtml(pb?.mark||"—")}</strong></div>
          <div><span>Best WA score</span><strong>${bestScore===-Infinity?"—":bestScore}</strong></div>
          <div><span>First season</span><strong>${first?.year||"—"}</strong></div>
          <div><span>Gain vs first</span><strong>${improvement==null?"—":`+${improvement} pts`}</strong></div>
        </div>
      </div>`;
    }).join("");
  }

  function renderProgressTable(eventData) {
    const rows=eventData.flatMap(x=>x.sb.map(r=>({...r,eventLabel:x.event})))
      .sort((a,b)=>(b.year-a.year)||a.eventLabel.localeCompare(b.eventLabel));
    $("#progress-table-body").innerHTML=rows.map(r=>`<tr>
      <td>${r.year}</td>
      <td>${escapeHtml(r.eventLabel)}</td>
      <td><strong>${escapeHtml(r.mark)}</strong></td>
      <td>${r.score==null?'<span class="no-score">—</span>':`<span class="wa-score">${r.score}</span>`}</td>
      <td>${escapeHtml(dateOnly(r.date)||"—")}</td>
      <td>${escapeHtml(r.competition||"—")}</td>
    </tr>`).join("") || `<tr><td colspan="6">No season-best data.</td></tr>`;
  }

  function exportProgressCsv() {
    const sex=resolveSex(state.progress.athlete,$("#progress-sex").value);
    if(!sex) return;
    const rows=selectedProgressEvents().flatMap(event=>
      seasonBestsForEvent(state.progress.results,event,sex).map(r=>({
        year:r.year,event,mark:r.mark,points:r.score??"",date:dateOnly(r.date),competition:r.competition||""
      }))
    );
    const fields=["year","event","mark","points","date","competition"];
    const csv=[fields.join(","),...rows.map(r=>fields.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`).join(","))].join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`${state.progress.athlete.name.replace(/\s+/g,"_")}_progress.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- COMPARE ----------
  async function searchCompare() {
    const q=$("#compare-search").value.trim();
    if(!q) return;
    setStatus("#compare-status","Searching athlete…");
    $("#compare-search-results").innerHTML="";
    try{
      const list=await searchAthletes(q);
      $("#compare-search-results").innerHTML=list.slice(0,12).map(athleteHitHtml).join("");
      $$("#compare-search-results .search-hit").forEach(el=>{
        el.onclick=()=>addCompareAthlete(list[+el.dataset.i]);
      });
      setStatus("#compare-status","");
    }catch(e){setStatus("#compare-status",e.message,true)}
  }

  async function addCompareAthlete(a) {
    $("#compare-search-results").innerHTML="";
    if(state.compare.athletes.length>=6){
      setStatus("#compare-status","Maximum 6 athletes.",true);return;
    }
    if(state.compare.athletes.some(x=>String(x.athlete.id)===String(a.id))){
      setStatus("#compare-status","Athlete already added.",true);return;
    }
    setStatus("#compare-status",`Loading ${a.name}…`);
    try{
      const data=await api(`/api/athlete?id=${encodeURIComponent(a.id)}`);
      state.compare.athletes.push({athlete:data.athlete||a,results:data.results||[]});
      $("#compare-search").value="";
      rebuildCompare();
      setStatus("#compare-status","");
    }catch(e){setStatus("#compare-status",e.message,true)}
  }

  function removeCompareAthlete(index) {
    state.compare.athletes.splice(index,1);
    rebuildCompare();
  }

  function rebuildCompare() {
    $("#compare-athlete-chips").innerHTML=state.compare.athletes.map((x,i)=>`
      <span class="athlete-chip">${escapeHtml(x.athlete.name)}<button data-rm="${i}" aria-label="Remove athlete">×</button></span>
    `).join("");
    $$("[data-rm]").forEach(b=>b.onclick=()=>removeCompareAthlete(+b.dataset.rm));

    const eventCounts=new Map();
    state.compare.athletes.forEach(x=>{
      [...new Set(x.results.map(r=>r.discipline).filter(Boolean))].forEach(e=>eventCounts.set(e,(eventCounts.get(e)||0)+1));
    });
    const events=[...eventCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(x=>x[0]);
    const old=$("#compare-event").value;
    $("#compare-event").innerHTML=events.length
      ? events.map(e=>`<option>${escapeHtml(e)}</option>`).join("")
      : '<option value="">Add athletes first</option>';
    if(events.includes(old)) $("#compare-event").value=old;
    else {
      const pref=events.find(e=>/1500/i.test(e))||events[0];
      if(pref) $("#compare-event").value=pref;
    }
    renderCompare();
  }

  function compareRowsForAthlete(item,event) {
    const sex=item.athlete.sex;
    if(!sex) {
      // Performance comparison still works without sex; points will be unavailable.
      const raw=item.results.filter(r=>r.discipline===event);
      const byYear=new Map();
      raw.forEach(r=>{
        const y=yearOf(r), num=waNumMark(r.mark);
        if(!y||!Number.isFinite(num))return;
        const existing=byYear.get(y);
        if(!existing||num<waNumMark(existing.mark))byYear.set(y,r);
      });
      return [...byYear.values()].sort((a,b)=>yearOf(a)-yearOf(b)).map(r=>({
        ...r,year:yearOf(r),numeric:waNumMark(r.mark),key:null,score:null
      }));
    }
    return seasonBestsForEvent(item.results,event,sex);
  }

  function renderCompare() {
    const event=$("#compare-event").value;
    const axis=$("#compare-axis").value;
    const metric=$("#compare-metric").value;

    if(!event||!state.compare.athletes.length){
      $("#compare-chart-title").textContent="Add athletes to compare";
      $("#compare-chart-subtitle").textContent="Season-best progression.";
      $("#compare-legend").innerHTML="";
      $("#compare-table-body").innerHTML="";
      renderLineChart($("#compare-chart"),[]);
      return;
    }

    const series=[];
    const table=[];
    let firstKey=null;

    state.compare.athletes.forEach((item,i)=>{
      const sb=compareRowsForAthlete(item,event);
      const points=[];
      sb.forEach(r=>{
        const age=exactAge(item.athlete.birthDate,r.date);
        const x=axis==="age"?age:r.year;
        if(x==null)return;
        if(firstKey==null&&r.key)firstKey=r.key;
        const y=metric==="points"?r.score:r.numeric;
        if(!Number.isFinite(y))return;
        points.push({
          x,y,mark:r.mark,score:r.score,date:dateOnly(r.date),
          label:axis==="age"?`Age ${age}`:`${r.year}`
        });
        table.push({
          athlete:item.athlete.name,year:r.year,age,mark:r.mark,score:r.score,date:dateOnly(r.date)
        });
      });
      series.push({name:item.athlete.name,color:COLORS[i%COLORS.length],points});
    });

    const lowerBetter=metric==="performance" ? (firstKey ? !HIGHER_BETTER.has(firstKey) : true) : false;
    const yFormat=metric==="performance"
      ? v=>formatMarkValue(v,firstKey)
      : v=>Math.round(v);

    $("#compare-chart-title").textContent=`${event} · ${axis==="age"?"age":"calendar-year"} comparison`;
    $("#compare-chart-subtitle").textContent=metric==="points"
      ? "Season best converted to World Athletics points."
      : "Actual season-best performance.";

    $("#compare-legend").innerHTML=series.map(s=>`<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.name)}</span>`).join("");

    renderLineChart($("#compare-chart"),series,{
      lowerBetter,yFormat,metric,xFormat:v=>axis==="age"?`Age ${v}`:v,yPadMin:metric==="points"?6:0,height:460
    });

    $("#compare-table-body").innerHTML=table
      .sort((a,b)=>(axis==="age"?(a.age??999)-(b.age??999):a.year-b.year)||a.athlete.localeCompare(b.athlete))
      .map(r=>`<tr>
        <td>${escapeHtml(r.athlete)}</td>
        <td>${r.year||"—"}</td>
        <td>${r.age??"—"}</td>
        <td><strong>${escapeHtml(r.mark)}</strong></td>
        <td>${r.score==null?'<span class="no-score">—</span>':`<span class="wa-score">${r.score}</span>`}</td>
        <td>${escapeHtml(r.date||"—")}</td>
      </tr>`).join("") || `<tr><td colspan="6">No chartable data for this event.</td></tr>`;
  }

  // ---------- INIT / EVENTS ----------
  $$(".tab").forEach(tab=>{
    tab.onclick=()=>{
      $$(".tab").forEach(x=>x.classList.toggle("active",x===tab));
      $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${tab.dataset.view}`));
    };
  });

  $("#progress-search-btn").onclick=searchProgress;
  $("#progress-search").addEventListener("keydown",e=>{if(e.key==="Enter")searchProgress()});
  $("#progress-sex").onchange=()=>{buildProgressEventSelector()};
  $("#progress-metric").onchange=renderProgress;
  $("#events-select-all").onclick=()=>{
    availableProgressEvents().forEach(e=>state.progress.selected.add(e));
    buildProgressEventSelector();
  };
  $("#events-clear").onclick=()=>{
    state.progress.selected.clear();
    buildProgressEventSelector();
  };
  $("#progress-export").onclick=exportProgressCsv;

  $("#compare-search-btn").onclick=searchCompare;
  $("#compare-search").addEventListener("keydown",e=>{if(e.key==="Enter")searchCompare()});
  $("#compare-event").onchange=renderCompare;
  $("#compare-axis").onchange=renderCompare;
  $("#compare-metric").onchange=renderCompare;

  rebuildCompare();
})();
