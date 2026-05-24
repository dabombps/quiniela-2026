import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// QUINIELA MUNDIAL 2022 — Con tarjetas, goleo automático, bonos manuales
// ─────────────────────────────────────────────────────────────────────────────
const WORKER_URL = "https://quiniela-proxy.dabombps.workers.dev";
const LEAGUE_ID  = 1;
const SEASON     = 2022;

// Caché: fixtures cada 5min, eventos 1x/día, topscorers 1x/día
const CACHE_FIXTURES_MS  = 5  * 60  * 1000;
const CACHE_EVENTS_MS    = 24 * 60  * 60 * 1000;
const CACHE_STANDINGS_MS = 24 * 60  * 60 * 1000;

// ─── Reglas ───────────────────────────────────────────────────────────────────
const REGLAS_DEFAULT = {
  ganado:5, empate:2, perdido:0,
  amarilla:-1, roja:-5, difGoles:1,
  primeroGrupo:7, segundoGrupo:4,
  eliminatoria:10,
  fairPlay:10, portero:3, goleo:5,
};

// ─── Dueños 2022 ──────────────────────────────────────────────────────────────
const DUENOS_2022 = {
  "Argentina":"Buka","Denmark":"Buka","Korea Republic":"Buka","Wales":"Buka","Iran":"Buka",
  "Belgium":"Oralia","Croatia":"Oralia","Tunisia":"Oralia","Canada":"Oralia","Switzerland":"Oralia",
  "Portugal":"Melo","Uruguay":"Melo","Japan":"Melo","Costa Rica":"Melo","Ghana":"Melo",
  "Spain":"Carlos","Germany":"Carlos","Poland":"Carlos","Australia":"Carlos","Senegal":"Carlos",
  "Brazil":"Rodrigo","United States":"Rodrigo","Serbia":"Rodrigo","Ecuador":"Rodrigo","Saudi Arabia":"Rodrigo",
  "England":"Marioly","Netherlands":"Marioly","Morocco":"Marioly","Cameroon":"Marioly","France":"Marioly",
};

// ─── Banderas ─────────────────────────────────────────────────────────────────
const FL = {
  "Qatar":"🇶🇦","Ecuador":"🇪🇨","Senegal":"🇸🇳","Netherlands":"🇳🇱","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Iran":"🇮🇷","United States":"🇺🇸","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Argentina":"🇦🇷","Saudi Arabia":"🇸🇦",
  "Denmark":"🇩🇰","Tunisia":"🇹🇳","Mexico":"🇲🇽","Poland":"🇵🇱","France":"🇫🇷",
  "Australia":"🇦🇺","Morocco":"🇲🇦","Croatia":"🇭🇷","Germany":"🇩🇪","Japan":"🇯🇵",
  "Spain":"🇪🇸","Costa Rica":"🇨🇷","Belgium":"🇧🇪","Canada":"🇨🇦","Switzerland":"🇨🇭",
  "Cameroon":"🇨🇲","Uruguay":"🇺🇾","Korea Republic":"🇰🇷","Portugal":"🇵🇹","Ghana":"🇬🇭",
  "Brazil":"🇧🇷","Serbia":"🇷🇸","Qatar":"🇶🇦",
};
const fl = n => FL[n] || "🏳️";

const FINAL   = ["FT","AET","PEN","AWD","WO"];
const VIVO    = ["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"];
const PROXIMO = ["NS","TBD","PST"];

const faseLabel = r => {
  if (!r) return ""; const l = r.toLowerCase();
  if (l.includes("group")) return "Fase de Grupos";
  if (l.includes("16"))    return "Octavos";
  if (l.includes("quarter")) return "Cuartos";
  if (l.includes("semi"))  return "Semifinal";
  if (l.includes("third")||l.includes("3rd")) return "3er Lugar";
  if (l.includes("final")) return "Final";
  return r;
};
const esKO = r => {
  if (!r) return false; const l = r.toLowerCase();
  return l.includes("16")||l.includes("quarter")||l.includes("semi")||
         l.includes("final")||l.includes("third")||l.includes("3rd");
};

// ─── LocalStorage helpers ─────────────────────────────────────────────────────
const LD  = (k,d)  => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; }};
const LS  = (k,v)  => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const LDT = k      => { try { return parseInt(localStorage.getItem(k+"_ts")||"0"); } catch { return 0; }};
const LST = k      => { try { localStorage.setItem(k+"_ts", String(Date.now())); } catch {} };

// ─── Cálculo puntos ───────────────────────────────────────────────────────────
function calcPuntos(p, eq, eventos, R) {
  const esL = p.teams?.home?.name===eq, esV = p.teams?.away?.name===eq;
  if (!esL&&!esV) return null;
  if (p.goals?.home==null||p.goals?.away==null) return null;
  const mg=esL?p.goals.home:p.goals.away, sg=esL?p.goals.away:p.goals.home, diff=mg-sg;
  const ko=esKO(p.league?.round);
  let pt = diff>0?(ko?R.eliminatoria:R.ganado):diff===0?(ko?0:R.empate):R.perdido;
  if (diff>0&&!ko) pt += diff*R.difGoles;

  // Tarjetas desde eventos cacheados
  const evs = (eventos[p.fixture.id]||[])
    .filter(e=>e.team?.name===(esL?p.teams.home.name:p.teams.away.name));
  const am = evs.filter(e=>e.type==="Card"&&e.detail==="Yellow Card").length;
  const ro = evs.filter(e=>e.type==="Card"&&(e.detail==="Red Card"||e.detail==="Second Yellow card")).length;
  pt += am*R.amarilla + ro*R.roja;

  return { pt, mg, sg, diff, ko, am, ro, esL };
}

// ─── API fetch helper con info de caché ──────────────────────────────────────
async function apiFetchWithCache(path) {
  const res = await fetch(`${WORKER_URL}/proxy${path}`, {
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length>0)
    throw new Error(Object.values(data.errors)[0]);
  const cache = res.headers.get("X-Cache") || "MISS";
  const age   = res.headers.get("X-Cache-Age");
  return { data: data.response || [], cache, age };
}
// Backwards compat
async function apiFetch(path) {
  const { data } = await apiFetchWithCache(path);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [partidos,  setPartidos]  = useState(()=>LD("q22_fix",[]));
  const [eventos,   setEventos]   = useState(()=>LD("q22_evs",{}));
  const [standings, setStandings] = useState(()=>LD("q22_standings",{}));
  const [reglas,    setReglas]    = useState(()=>({ ...REGLAS_DEFAULT, ...LD("q22_reglas",{}) }));
  const [bonos,     setBonos]     = useState(()=>({ fairPlay:"", portero:"", goleo:"", ...LD("q22_bonos",{}) }));

  const [estado,    setEstado]    = useState({fixtures:"idle", eventos:"idle", standings:"idle"});
  const [ultimaAct, setUltimaAct] = useState(null);
  const [tab,       setTab]       = useState("tabla");
  const [filtroFase, setFiltroFase] = useState("TODOS");
  const [editReglas, setEditReglas] = useState(false);
  const [editBonos,  setEditBonos]  = useState(false);
  const [reglasTmp,  setReglasTmp]  = useState(reglas);
  const [bonosTmp,   setBonosTmp]   = useState(bonos);
  const [logMsgs,    setLogMsgs]    = useState([]);
  const [reqRest,    setReqRest]    = useState(null);

  const addLog = msg => setLogMsgs(p=>[`${new Date().toLocaleTimeString("es-MX")}: ${msg}`,...p.slice(0,19)]);

  // ── 1. Fetch fixtures (cada 5 min) ─────────────────────────────────────────
  const fetchFixtures = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LDT("q22_fix");
    if (!forzar&&partidos.length>0&&(ahora-ts)<CACHE_FIXTURES_MS) return;
    setEstado(e=>({...e,fixtures:"loading"}));
    addLog("📡 Cargando fixtures 2022...");
    try {
      const { data: lista, cache } = await apiFetchWithCache(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`);
      addLog(`${cache==="HIT"?"💾 Caché":"🌐 API"} fixtures: ${lista.length} partidos`);
      LS("q22_fix",lista); LST("q22_fix");
      setPartidos(lista); setUltimaAct(new Date());
      setEstado(e=>({...e,fixtures:"ok"}));
    } catch(err) {
      addLog(`❌ Fixtures: ${err.message}`);
      setEstado(e=>({...e,fixtures:"error"}));
    }
  }, [partidos.length]);

  // ── 2. Fetch eventos — 1 request por partido, KV caché 24h en servidor ──────
  const fetchEventos = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LDT("q22_evs");
    if (!forzar&&(ahora-ts)<CACHE_EVENTS_MS&&Object.keys(eventos).length>0) {
      addLog(`💾 Eventos en caché local (${Object.keys(eventos).length} partidos)`);
      return;
    }
    const terminados = partidos.filter(p=>FINAL.includes(p.fixture?.status?.short));
    if (terminados.length===0) return;
    // Sin KV: cargar solo los que faltan. Con KV: el servidor cachea y no gasta requests reales
    const todos = terminados.filter(p=>forzar||!eventos[p.fixture.id]);
    if (todos.length===0) {
      addLog("✅ Todos los eventos ya cargados");
      setEstado(e=>({...e,eventos:"ok"}));
      return;
    }
    setEstado(e=>({...e,eventos:"loading"}));
    addLog(`📡 Cargando ${todos.length} partidos (1 request c/u, KV caché en servidor)...`);
    const nuevosEvs = {...eventos};
    let cargados=0, reqAPI=0, reqCache=0;
    for (const p of todos) {
      try {
        const { data: evData, cache } = await apiFetchWithCache(`/fixtures?id=${p.fixture.id}`);
        nuevosEvs[p.fixture.id] = evData[0]?.events || [];
        cargados++;
        if (cache==="HIT") reqCache++; else reqAPI++;
        // Solo log cada 10 para no saturar el log
        if (cargados % 10 === 0 || cargados === todos.length) {
          addLog(`${cache==="HIT"?"💾":"🌐"} ${cargados}/${todos.length} · API:${reqAPI} Caché:${reqCache}`);
        }
        // Pausa pequeña entre requests
        await new Promise(r=>setTimeout(r,150));
      } catch(e) {
        addLog(`⚠️ Error partido ${p.fixture.id}: ${e.message}`);
        // Si es rate limit, parar
        if (e.message.includes("limit") || e.message.includes("429")) {
          addLog("🛑 Límite de requests alcanzado — reintenta mañana");
          break;
        }
      }
    }
    LS("q22_evs",nuevosEvs); LST("q22_evs");
    setEventos(nuevosEvs);
    setEstado(e=>({...e,eventos:"ok"}));
    addLog(`✅ Completado: ${cargados}/${terminados.length} partidos · ${reqAPI} API · ${reqCache} KV caché`);
  }, [partidos, eventos]);


  // Carga inicial
  useEffect(()=>{
    fetchFixtures().then(()=>{ fetchEventos(); fetchStandings(); });
  },[]);

  // Auto-refresh fixtures cada 5 min
  const timerRef = useRef(null);
  useEffect(()=>{
    timerRef.current = setInterval(()=>fetchFixtures(), CACHE_FIXTURES_MS);
    return ()=>clearInterval(timerRef.current);
  },[fetchFixtures]);

  // Cuando llegan fixtures nuevos, cargar eventos
  useEffect(()=>{
    if (partidos.length>0) fetchEventos();
  },[partidos]);

  // ── 3. Fetch standings / posiciones de grupo (1x por día) ────────────────
  const fetchStandings = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LDT("q22_standings");
    if (!forzar&&Object.keys(standings).length>0&&(ahora-ts)<CACHE_STANDINGS_MS) {
      addLog(`✅ Standings en caché (${Object.keys(standings).length} equipos)`);
      return;
    }
    setEstado(e=>({...e,standings:"loading"}));
    addLog("📡 Cargando posiciones de grupo...");
    try {
      const { data, cache } = await apiFetchWithCache(`/standings?league=${LEAGUE_ID}&season=${SEASON}`);
      addLog(`${cache==="HIT"?"💾 Caché":"🌐 API"} standings`);
      // data[0].league.standings es array de grupos, cada grupo es array de equipos
      const mapa = {};
      const grupos = data[0]?.league?.standings || [];
      grupos.forEach(grupo => {
        grupo.forEach(equipo => {
          mapa[equipo.team.name] = equipo.rank; // 1, 2, 3, 4
        });
      });
      addLog(`✅ Standings cargados: ${Object.keys(mapa).length} equipos`);
      LS("q22_standings", mapa); LST("q22_standings");
      setStandings(mapa);
      setEstado(e=>({...e,standings:"ok"}));
    } catch(err) {
      addLog(`❌ Standings: ${err.message}`);
      setEstado(e=>({...e,standings:"error"}));
    }
  }, [standings]);

  // ── Calcular tabla ────────────────────────────────────────────────────────
  const eqPorD = {};
  Object.entries(DUENOS_2022).forEach(([eq,d])=>{ if(!eqPorD[d])eqPorD[d]=[]; eqPorD[d].push(eq); });

  const statsD = {};
  Object.keys(eqPorD).forEach(d=>{ statsD[d]={pt:0,g:0,e:0,p_:0,gl:0,am:0,ro:0,det:[]}; });

  const jugados = partidos.filter(p=>FINAL.includes(p.fixture?.status?.short));

  jugados.forEach(par=>{
    [par.teams?.home?.name,par.teams?.away?.name].forEach(eq=>{
      const d=DUENOS_2022[eq]; if(!d||!statsD[d]) return;
      const r=calcPuntos(par,eq,eventos,reglas); if(!r) return;
      const s=statsD[d];
      s.pt+=r.pt; if(r.diff>0)s.g++;else if(r.diff===0&&!r.ko)s.e++;else s.p_++;
      s.gl+=r.mg; s.am+=r.am; s.ro+=r.ro; s.det.push({par,eq,r});
    });
  });

  // Posiciones de grupo (standings)
  Object.entries(standings).forEach(([equipo, rank]) => {
    const d = DUENOS_2022[equipo];
    if (!d || !statsD[d]) return;
    if (rank === 1) statsD[d].pt += reglas.primeroGrupo;
    else if (rank === 2) statsD[d].pt += reglas.segundoGrupo;
  });

  // Bonos especiales
  // Fair Play
  if (bonos.fairPlay) {
    const d = DUENOS_2022[bonos.fairPlay];
    if (d&&statsD[d]) statsD[d].pt += reglas.fairPlay;
  }
  // Portero
  if (bonos.portero) {
    const d = DUENOS_2022[bonos.portero];
    if (d&&statsD[d]) statsD[d].pt += reglas.portero;
  }
  // Goleo (manual)
  if (bonos.goleo) {
    const d = DUENOS_2022[bonos.goleo];
    if (d&&statsD[d]) statsD[d].pt += reglas.goleo;
  }

  const tabla = Object.entries(statsD).sort((a,b)=>b[1].pt-a[1].pt).map(([d,s],i)=>({pos:i+1,d,...s}));

  const proximos = partidos.filter(p=>PROXIMO.includes(p.fixture?.status?.short));
  const enVivo   = partidos.filter(p=>VIVO.includes(p.fixture?.status?.short));
  const fases    = ["TODOS",...new Set(jugados.map(p=>faseLabel(p.league?.round)).filter(Boolean))];
  const jugFilt  = filtroFase==="TODOS"?jugados:jugados.filter(p=>faseLabel(p.league?.round)===filtroFase);

  const evCargados = Object.keys(eventos).length;
  const pctEventos = jugados.length>0 ? Math.round(evCargados/jugados.length*100) : 0;

  const guardarReglas = () => { setReglas(reglasTmp); LS("q22_reglas",reglasTmp); setEditReglas(false); };
  const guardarBonos  = () => { setBonos(bonosTmp);   LS("q22_bonos", bonosTmp);  setEditBonos(false);  };

  const med = p=>p===1?"🥇":p===2?"🥈":p===3?"🥉":`${p}.`;
  const todosOk = estado.fixtures==="ok";
  const hayError = Object.values(estado).some(v=>v==="error");

  const TABS = [
    {id:"tabla",   lbl:"🏆 Tabla"},
    {id:"partidos",lbl:`📅 Partidos (${jugados.length})`},
    {id:"bonos",   lbl:"🎖 Bonos"},
    {id:"reglas",  lbl:"📋 Reglas"},
    {id:"debug",   lbl:"🔧 Debug"},
  ];

  return (
    <div style={S.root}>
      {/* HEADER */}
      <header style={S.hdr}>
        <div style={S.hdrTop}>
          <div style={S.logo}>
            <span style={{fontSize:28}}>⚽</span>
            <div>
              <div style={S.logoT}>QUINIELA 2022</div>
              <div style={S.logoS}>QATAR · VERIFICACIÓN VS EXCEL</div>
            </div>
          </div>
          <div style={S.hdrR}>
            <span style={{background:"rgba(234,179,8,0.2)",border:"1px solid #ca8a04",borderRadius:20,padding:"2px 10px",fontSize:10,color:"#fbbf24",fontWeight:700}}>
              🔍 VERIFICACIÓN
            </span>
            {enVivo.length>0&&<span style={S.vivoBadge}>🔴 VIVO ({enVivo.length})</span>}
            {ultimaAct&&<span style={S.mini}>🔄 {ultimaAct.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>}
            <span style={{fontSize:10,color:pctEventos===100?"#4ade80":pctEventos>0?"#fbbf24":"#64748b"}}>
              🃏 {pctEventos}% eventos
            </span>
            <span style={{fontSize:10,color:Object.keys(standings).length>0?"#4ade80":"#64748b"}}>
              📊 {Object.keys(standings).length>0?"standings ✅":"standings ❌"}
            </span>
            <span style={{fontSize:11,color:todosOk?"#4ade80":hayError?"#f87171":"#64748b"}}>
              {estado.fixtures==="loading"?"⏳":todosOk?`✅ ${jugados.length}J`:"❌"}
            </span>
            <button onClick={()=>{fetchFixtures(true).then(()=>{fetchEventos(true);fetchStandings(true);})}} style={S.btnAct}>
              ↺
            </button>
          </div>
        </div>
        <nav style={S.tabs}>
          {TABS.map(t=>(
            <button key={t.id} style={{...S.tab,...(tab===t.id?S.tabA:{})}} onClick={()=>setTab(t.id)}>{t.lbl}</button>
          ))}
        </nav>
      </header>

      <main style={S.main}>
        {hayError&&<div style={S.errBox}>❌ Error conectando. Verifica que el Worker de Cloudflare esté activo.</div>}

        {/* ══ TABLA ══ */}
        {tab==="tabla"&&(
          <div>
            <H2>Tabla de Posiciones</H2>
            {pctEventos<100&&(
              <div style={S.infoBox}>
                ⏳ Tarjetas cargadas al {pctEventos}% — se completan automáticamente ({evCargados}/{jugados.length} partidos). El límite es 10 por sesión para no agotar las 100 requests diarias.
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {tabla.map(row=>(
                <div key={row.d} style={{...S.cardD,...(row.pos===1?{border:"1px solid #f59e0b"}:row.pos===2?{border:"1px solid #94a3b8"}:row.pos===3?{border:"1px solid #b45309"}:{})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:22}}>{med(row.pos)}</div>
                      <div style={{fontSize:20,fontWeight:900}}>{row.d}</div>
                      <div style={S.bigPts}>{row.pt}<span style={{fontSize:12,fontWeight:400,marginLeft:4}}>pts</span></div>
                      <div style={S.chips}>
                        <span style={S.chip}>✅ {row.g}G</span>
                        <span style={S.chip}>➖ {row.e}E</span>
                        <span style={S.chip}>❌ {row.p_}P</span>
                        <span style={S.chip}>⚽ {row.gl}</span>
                        {row.am>0&&<span style={{...S.chip,color:"#fbbf24"}}>🟨 {row.am}</span>}
                        {row.ro>0&&<span style={{...S.chip,color:"#f87171"}}>🟥 {row.ro}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      {(eqPorD[row.d]||[]).map(eq=>(
                        <div key={eq} style={{fontSize:11,color:"#94a3b8"}}>{fl(eq)} {eq}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desglose */}
            {tabla.length>0&&(
              <>
                <H2 style={{marginTop:20}}>Desglose por Partido</H2>
                <div style={S.tblD}>
                  <div style={S.fD}>{["Dueño","Equipo","Rival","Goles","Fase","🟨","🟥","Pts"].map(h=><span key={h} style={S.hD}>{h}</span>)}</div>
                  {tabla.flatMap(row=>row.det.map((d,i)=>{
                    const rival=d.r.esL?d.par.teams?.away?.name:d.par.teams?.home?.name;
                    const sc=d.r.esL?`${d.par.goals.home}–${d.par.goals.away}`:`${d.par.goals.away}–${d.par.goals.home}`;
                    return(
                      <div key={`${row.d}-${i}`} style={{...S.fD,background:i%2===0?"rgba(255,255,255,0.03)":"transparent"}}>
                        <span style={S.cD}>{row.d}</span>
                        <span style={S.cD}>{fl(d.eq)} {d.eq}</span>
                        <span style={S.cD}>{fl(rival)} {rival}</span>
                        <span style={S.cD}>{sc}</span>
                        <span style={{...S.cD,fontSize:9}}>{faseLabel(d.par.league?.round)}</span>
                        <span style={{...S.cD,color:"#fbbf24"}}>{d.r.am}</span>
                        <span style={{...S.cD,color:"#f87171"}}>{d.r.ro}</span>
                        <span style={{...S.cD,fontWeight:700,color:d.r.pt>0?"#4ade80":d.r.pt<0?"#f87171":"#facc15"}}>
                          {d.r.pt>0?"+":""}{d.r.pt}
                        </span>
                      </div>
                    );
                  }))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ PARTIDOS ══ */}
        {tab==="partidos"&&(
          <div>
            <H2>Partidos ({jugados.length})</H2>
            <div style={S.filtros}>
              {fases.map(f=>(
                <button key={f} style={{...S.btnF,...(filtroFase===f?S.btnFA:{})}} onClick={()=>setFiltroFase(f)}>{f}</button>
              ))}
            </div>
            {jugFilt.length===0?<p style={{color:"#64748b",fontSize:13}}>Sin partidos.</p>
              :jugFilt.slice().reverse().map(p=>(
                <CP key={p.fixture.id} p={p} duenos={DUENOS_2022} eventos={eventos} reglas={reglas}/>
              ))
            }
          </div>
        )}

        {/* ══ BONOS ══ */}
        {tab==="bonos"&&(
          <div>
            <H2>Bonos Especiales</H2>
            <p style={{color:"#64748b",fontSize:13,marginBottom:16}}>
              El Goleador se obtiene automáticamente de la API. El Portero y Fair Play los capturas manualmente cuando FIFA los anuncie al final del torneo.
            </p>

            {/* Goleador manual */}
            <div style={S.bonoCard}>
              <div style={S.bonoHdr}>
                <span style={{fontSize:20}}>⚽</span>
                <div>
                  <div style={{fontWeight:900,fontSize:15}}>Campeón Goleo (Golden Boot)</div>
                  <div style={{fontSize:12,color:"#64748b"}}>+{reglas.goleo} pts — captura manual al final del torneo</div>
                </div>
                {!editBonos&&<button style={{...S.btnSmall,marginLeft:"auto"}} onClick={()=>{setBonosTmp({ fairPlay:"", portero:"", goleo:"", ...bonos });setEditBonos(true);}}>✏️ Editar</button>}
                {editBonos&&(
                  <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                    <button style={{...S.btnSmall,background:"#64748b"}} onClick={()=>setEditBonos(false)}>Cancelar</button>
                    <button style={{...S.btnSmall,background:"#16a34a"}} onClick={guardarBonos}>✅ Guardar</button>
                  </div>
                )}
              </div>
              {editBonos?(
                <div style={{marginTop:8}}>
                  <label style={S.lbl}>Equipo Goleador (Golden Boot)</label>
                  <input style={S.inp} value={bonosTmp.goleo} placeholder="ej. France"
                    onChange={e=>setBonosTmp(p=>({...p,goleo:e.target.value}))}/>
                  <label style={{...S.lbl,marginTop:8}}>Equipo Fair Play</label>
                  <input style={S.inp} value={bonosTmp.fairPlay} placeholder="ej. England"
                    onChange={e=>setBonosTmp(p=>({...p,fairPlay:e.target.value}))}/>
                  <label style={{...S.lbl,marginTop:8}}>Equipo mejor Portero</label>
                  <input style={S.inp} value={bonosTmp.portero} placeholder="ej. Argentina"
                    onChange={e=>setBonosTmp(p=>({...p,portero:e.target.value}))}/>
                </div>
              ):(
                <div style={{marginTop:8}}>
                  <div style={S.bonoVal}>
                    <span style={{fontSize:22}}>{bonos.goleo?fl(bonos.goleo):"❓"}</span>
                    <div>
                      <div style={{fontWeight:700}}>{bonos.goleo||"No capturado aún"}</div>
                      {bonos.goleo&&<div style={{fontSize:12,color:"#f59e0b",fontWeight:700}}>→ {DUENOS_2022[bonos.goleo]||"Sin dueño"} +{reglas.goleo} pts</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fair Play manual */}
            <div style={S.bonoCard}>
              <div style={S.bonoHdr}>
                <span style={{fontSize:20}}>🏅</span>
                <div>
                  <div style={{fontWeight:900,fontSize:15}}>FIFA Fair Play</div>
                  <div style={{fontSize:12,color:"#64748b"}}>+{reglas.fairPlay} pts — captura manual</div>
                </div>
              </div>
              <div style={{marginTop:8}}>
                <div style={S.bonoVal}>
                  <span style={{fontSize:22}}>{bonos.fairPlay?fl(bonos.fairPlay):"❓"}</span>
                  <div>
                    <div style={{fontWeight:700}}>{bonos.fairPlay||"No capturado aún"}</div>
                    {bonos.fairPlay&&<div style={{fontSize:12,color:"#f59e0b",fontWeight:700}}>→ {DUENOS_2022[bonos.fairPlay]||"Sin dueño"} +{reglas.fairPlay} pts</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Portero manual */}
            <div style={S.bonoCard}>
              <div style={S.bonoHdr}>
                <span style={{fontSize:20}}>🧤</span>
                <div>
                  <div style={{fontWeight:900,fontSize:15}}>Mejor Portero (Golden Glove)</div>
                  <div style={{fontSize:12,color:"#64748b"}}>+{reglas.portero} pts — captura manual</div>
                </div>
              </div>
              <div style={{marginTop:8}}>
                <div style={S.bonoVal}>
                  <span style={{fontSize:22}}>{bonos.portero?fl(bonos.portero):"❓"}</span>
                  <div>
                    <div style={{fontWeight:700}}>{bonos.portero||"No capturado aún"}</div>
                    {bonos.portero&&<div style={{fontSize:12,color:"#f59e0b",fontWeight:700}}>→ {DUENOS_2022[bonos.portero]||"Sin dueño"} +{reglas.portero} pts</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen bonos */}
            <H2 style={{marginTop:20}}>Resumen Total</H2>
            <div style={S.tblD}>
              <div style={{...S.fD,gridTemplateColumns:"1fr 1fr 1fr 1fr"}}>
                {["Jugador","Pts Partidos","Pts Bonos","TOTAL"].map(h=><span key={h} style={S.hD}>{h}</span>)}
              </div>
              {tabla.map((row,i)=>{
                let b=0;
                if (bonos.fairPlay&&DUENOS_2022[bonos.fairPlay]===row.d) b+=reglas.fairPlay;
                if (bonos.portero&&DUENOS_2022[bonos.portero]===row.d) b+=reglas.portero;
                if (bonos.goleo&&DUENOS_2022[bonos.goleo]===row.d) b+=reglas.goleo;
                const pp = row.pt-b;
                return(
                  <div key={row.d} style={{...S.fD,gridTemplateColumns:"1fr 1fr 1fr 1fr",background:i%2===0?"rgba(255,255,255,0.03)":"transparent"}}>
                    <span style={{...S.cD,fontWeight:700,color:"#e2e8f0"}}>{row.d}</span>
                    <span style={S.cD}>{pp}</span>
                    <span style={{...S.cD,color:"#4ade80"}}>+{b}</span>
                    <span style={{...S.cD,fontWeight:900,color:"#f59e0b",fontSize:14}}>{row.pt}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ REGLAS ══ */}
        {tab==="reglas"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <H2>Reglas de Puntuación</H2>
              {!editReglas
                ?<button style={S.btnEdit} onClick={()=>{setReglasTmp({...reglas});setEditReglas(true);}}>✏️ Editar</button>
                :<div style={{display:"flex",gap:8}}>
                  <button style={{...S.btnEdit,background:"#64748b"}} onClick={()=>setEditReglas(false)}>Cancelar</button>
                  <button style={{...S.btnEdit,background:"#16a34a"}} onClick={guardarReglas}>✅ Guardar</button>
                </div>
              }
            </div>
            <div style={S.gridReglas}>
              {[
                {k:"ganado",      lbl:"Partido ganado (grupo)"},
                {k:"empate",      lbl:"Empate (grupo)"},
                {k:"perdido",     lbl:"Partido perdido"},
                {k:"difGoles",    lbl:"Por gol de diferencia"},
                {k:"amarilla",    lbl:"Tarjeta amarilla 🟨"},
                {k:"roja",        lbl:"Expulsado (roja) 🟥"},
                {k:"primeroGrupo",lbl:"Primero de grupo"},
                {k:"segundoGrupo",lbl:"Segundo de grupo"},
                {k:"eliminatoria",lbl:"Ganar en eliminatoria"},
                {k:"goleo",       lbl:"Campeón Goleo"},
                {k:"portero",     lbl:"Mejor Portero"},
                {k:"fairPlay",    lbl:"FIFA Fair Play"},
              ].map(r=>(
                <div key={r.k} style={S.cardRegla}>
                  <span style={{fontSize:12,color:"#94a3b8",flex:1}}>{r.lbl}</span>
                  {editReglas
                    ?<input type="number" style={{...S.inp,width:60,textAlign:"center",padding:"3px 6px"}}
                        value={reglasTmp[r.k]}
                        onChange={e=>setReglasTmp(p=>({...p,[r.k]:Number(e.target.value)}))}/>
                    :<span style={{fontSize:15,fontWeight:900,color:"#f59e0b",marginLeft:8}}>
                        {reglas[r.k]>0?"+":""}{reglas[r.k]} pts
                      </span>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ DEBUG ══ */}
        {tab==="debug"&&(
          <div>
            <H2>🔧 Debug</H2>
            <div style={S.debugBox}>
              <div style={S.debugRow}><span>Fixtures:</span><span style={{color:estado.fixtures==="ok"?"#4ade80":"#f87171"}}>{estado.fixtures} ({jugados.length} terminados)</span></div>
              <div style={S.debugRow}><span>Caché servidor (KV):</span><span style={{color:"#4ade80"}}>Cloudflare Worker KV</span></div>
              <div style={S.debugRow}><span>Caché local:</span><span>{Object.keys(eventos).length} eventos guardados</span></div>
              <div style={S.debugRow}><span>Eventos/tarjetas:</span><span style={{color:pctEventos===100?"#4ade80":"#fbbf24"}}>{evCargados}/{jugados.length} partidos ({pctEventos}%)</span></div>
              <div style={S.debugRow}><span>Standings cargados:</span><span style={{color:Object.keys(standings).length>0?"#4ade80":"#f87171"}}>{Object.keys(standings).length} equipos</span></div>
              <div style={S.debugRow}><span>Goleador (Golden Boot):</span><span>{bonos.goleo||"—"}</span></div>
              <div style={S.debugRow}><span>Fair Play:</span><span>{bonos.fairPlay||"—"}</span></div>
              <div style={S.debugRow}><span>Portero:</span><span>{bonos.portero||"—"}</span></div>
            </div>
            <div style={{...S.debugBox,marginTop:10}}>
              <div style={{fontSize:12,color:"#f59e0b",fontWeight:700,marginBottom:6}}>Log de actividad</div>
              {logMsgs.map((l,i)=><div key={i} style={{fontSize:11,color:"#64748b",padding:"2px 0"}}>{l}</div>)}
            </div>
            <button onClick={()=>{fetchFixtures(true).then(()=>{fetchEventos(true);fetchStandings(true);})}}
              style={{...S.btnEdit,marginTop:12,width:"100%",padding:"10px"}}>
              🔄 Forzar actualización completa
            </button>
          </div>
        )}
      </main>

      <footer style={{textAlign:"center",padding:12,fontSize:11,color:"#334155",borderTop:"1px solid #1e3a5f",marginTop:20}}>
        ⚽ Quiniela Qatar 2022 · API-Football · Tarjetas en caché diario · Goleo automático
      </footer>
    </div>
  );
}

// ─── Card Partido ─────────────────────────────────────────────────────────────
function CP({ p, duenos, eventos, reglas }) {
  const local=p.teams?.home?.name, visita=p.teams?.away?.name;
  const dL=duenos[local], dV=duenos[visita];
  const fecha=p.fixture?.date?new Date(p.fixture.date).toLocaleDateString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  const rL=calcPuntos(p,local,eventos,reglas), rV=calcPuntos(p,visita,eventos,reglas);
  const evs=eventos[p.fixture.id]||[];
  const gL=evs.filter(e=>e.type==="Goal"&&e.team?.name===local);
  const gV=evs.filter(e=>e.type==="Goal"&&e.team?.name===visita);
  const tL=evs.filter(e=>e.type==="Card"&&e.team?.name===local);
  const tV=evs.filter(e=>e.type==="Card"&&e.team?.name===visita);
  const tieneEvs=evs.length>0;
  return(
    <div style={S.cardP}>
      <div style={S.metaP}>
        <span style={S.bF}>{faseLabel(p.league?.round)}</span>
        {p.league?.round&&<span style={S.bR}>{p.league.round}</span>}
        <span style={{fontSize:11,color:"#475569",marginLeft:"auto"}}>{fecha}</span>
        {p.fixture?.venue?.city&&<span style={{fontSize:11,color:"#475569"}}>📍{p.fixture.venue.city}</span>}
        {!tieneEvs&&<span style={{fontSize:9,color:"#475569",border:"1px solid #334155",borderRadius:3,padding:"1px 4px"}}>sin eventos</span>}
      </div>
      <div style={S.filaP}>
        <div style={S.ladoP}>
          <span style={{fontSize:22}}>{fl(local)}</span>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>{local}</div>
            {dL&&<div style={{fontSize:11,color:"#f59e0b",fontWeight:700}}>{dL}</div>}
          </div>
        </div>
        <div style={S.marc}>
          <span style={{fontSize:24,fontWeight:900}}>{p.goals?.home??"-"}</span>
          <span style={{fontSize:14,color:"#475569",margin:"0 2px"}}>–</span>
          <span style={{fontSize:24,fontWeight:900}}>{p.goals?.away??"-"}</span>
        </div>
        <div style={{...S.ladoP,justifyContent:"flex-end"}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:13,fontWeight:700}}>{visita}</div>
            {dV&&<div style={{fontSize:11,color:"#f59e0b",fontWeight:700}}>{dV}</div>}
          </div>
          <span style={{fontSize:22}}>{fl(visita)}</span>
        </div>
      </div>
      {(gL.length>0||gV.length>0||tL.length>0||tV.length>0)&&(
        <div style={{display:"flex",padding:"2px 12px 8px",gap:8}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
            {gL.map((e,i)=><span key={i} style={{fontSize:11,color:"#94a3b8"}}>⚽ {e.player?.name} {e.time?.elapsed}'</span>)}
            {tL.map((e,i)=><span key={i} style={{fontSize:11,color:e.detail==="Yellow Card"?"#fbbf24":"#f87171"}}>{e.detail==="Yellow Card"?"🟨":"🟥"} {e.player?.name} {e.time?.elapsed}'</span>)}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end"}}>
            {gV.map((e,i)=><span key={i} style={{fontSize:11,color:"#94a3b8"}}>⚽ {e.player?.name} {e.time?.elapsed}'</span>)}
            {tV.map((e,i)=><span key={i} style={{fontSize:11,color:e.detail==="Yellow Card"?"#fbbf24":"#f87171"}}>{e.detail==="Yellow Card"?"🟨":"🟥"} {e.player?.name} {e.time?.elapsed}'</span>)}
          </div>
        </div>
      )}
      {(rL||rV)&&(
        <div style={{display:"flex",gap:8,padding:"4px 12px 10px",flexWrap:"wrap"}}>
          {rL&&dL&&<span style={{fontSize:12,fontWeight:700,color:rL.pt>=0?"#4ade80":"#f87171"}}>{dL}: {rL.pt>0?"+":""}{rL.pt} pts</span>}
          {rV&&dV&&<span style={{fontSize:12,fontWeight:700,color:rV.pt>=0?"#4ade80":"#f87171"}}>{dV}: {rV.pt>0?"+":""}{rV.pt} pts</span>}
        </div>
      )}
    </div>
  );
}

function H2({children,style}){return <h2 style={{...S.h2,...style}}>{children}</h2>;}

const S={
  root:{minHeight:"100vh",background:"linear-gradient(160deg,#060d1a,#0a1628,#0d1f3a)",color:"#e2e8f0",fontFamily:"'Barlow Condensed','Oswald','Arial Narrow',sans-serif",fontSize:15},
  hdr:{background:"linear-gradient(180deg,#071020,#0a1628)",borderBottom:"2px solid #1e3a5f",position:"sticky",top:0,zIndex:100,boxShadow:"0 6px 24px rgba(0,0,0,0.6)"},
  hdrTop:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",flexWrap:"wrap",gap:8},
  logo:{display:"flex",alignItems:"center",gap:10},
  logoT:{fontSize:22,fontWeight:900,letterSpacing:4,background:"linear-gradient(90deg,#f59e0b,#ef4444)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  logoS:{fontSize:10,color:"#475569",letterSpacing:2},
  hdrR:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"},
  vivoBadge:{background:"rgba(239,68,68,0.2)",border:"1px solid #ef4444",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#f87171",fontWeight:700},
  mini:{fontSize:10,color:"#64748b"},
  btnAct:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:6,color:"#fff",padding:"4px 12px",cursor:"pointer",fontSize:12,fontWeight:700},
  tabs:{display:"flex",overflowX:"auto",padding:"0 8px",borderTop:"1px solid #1e3a5f"},
  tab:{background:"transparent",border:"none",color:"#64748b",padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:700,borderBottom:"2px solid transparent",whiteSpace:"nowrap"},
  tabA:{color:"#f59e0b",borderBottom:"2px solid #f59e0b",background:"rgba(245,158,11,0.07)"},
  main:{padding:16,maxWidth:920,margin:"0 auto"},
  errBox:{background:"rgba(239,68,68,0.1)",border:"1px solid #ef4444",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#fca5a5",fontSize:13},
  infoBox:{background:"rgba(59,130,246,0.08)",border:"1px solid #3b82f6",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#93c5fd",fontSize:13,lineHeight:1.6},
  h2:{fontSize:16,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#f59e0b",marginBottom:10,marginTop:4,borderLeft:"4px solid #ef4444",paddingLeft:8},
  cardD:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 14px"},
  bigPts:{fontSize:32,fontWeight:900,background:"linear-gradient(90deg,#f59e0b,#ef4444)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.1},
  chips:{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"},
  chip:{fontSize:11,color:"#94a3b8"},
  tblD:{background:"#0f172a",borderRadius:8,border:"1px solid #1e3a5f",overflow:"hidden"},
  fD:{display:"grid",gridTemplateColumns:"1fr 1.1fr 1.1fr 0.5fr 0.8fr 0.25fr 0.25fr 0.35fr",padding:"5px 10px",gap:3,borderBottom:"1px solid rgba(255,255,255,0.04)"},
  hD:{fontSize:9,color:"#475569",fontWeight:700,textTransform:"uppercase"},
  cD:{fontSize:10,color:"#94a3b8"},
  filtros:{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12},
  btnF:{background:"rgba(255,255,255,0.05)",border:"1px solid #1e3a5f",borderRadius:5,color:"#64748b",padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700},
  btnFA:{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",color:"#f59e0b"},
  cardP:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:10,marginBottom:8,overflow:"hidden"},
  metaP:{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",padding:"5px 10px",background:"rgba(0,0,0,0.3)",borderBottom:"1px solid rgba(255,255,255,0.05)"},
  bF:{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",borderRadius:3,padding:"1px 5px",fontSize:8,color:"#f59e0b",fontWeight:700,textTransform:"uppercase"},
  bR:{background:"rgba(99,102,241,0.15)",border:"1px solid #6366f1",borderRadius:3,padding:"1px 5px",fontSize:8,color:"#a5b4fc"},
  filaP:{display:"flex",alignItems:"center",padding:"10px 12px",gap:6},
  ladoP:{flex:1,display:"flex",alignItems:"center",gap:6},
  marc:{display:"flex",alignItems:"center",gap:3,minWidth:80,justifyContent:"center",background:"rgba(0,0,0,0.4)",borderRadius:7,padding:"6px 10px",border:"1px solid #1e3a5f"},
  bonoCard:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 14px",marginBottom:10},
  bonoHdr:{display:"flex",alignItems:"center",gap:10},
  bonoVal:{display:"flex",alignItems:"center",gap:10,marginTop:8,padding:"8px",background:"rgba(255,255,255,0.03)",borderRadius:8},
  gridReglas:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6},
  cardRegla:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  debugBox:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:8,padding:12},
  debugRow:{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",fontSize:12,color:"#94a3b8"},
  btnEdit:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:7,color:"#fff",padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700},
  btnSmall:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:6,color:"#fff",padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700},
  lbl:{display:"block",fontSize:11,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:1},
  inp:{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"6px 10px",fontSize:13,outline:"none",boxSizing:"border-box"},
};
