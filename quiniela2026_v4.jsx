import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ⚙️  CONFIGURACIÓN — cambia WORKER_URL después de hacer deploy del Worker
// ─────────────────────────────────────────────────────────────────────────────
const WORKER_URL   = "https://quiniela-proxy.TU-USUARIO.workers.dev";
const DEFAULT_KEY  = "f511995177592a89c2c38930218b64ba";
const LEAGUE_ID    = 1;
const SEASON       = 2026;
const CACHE_MS     = 5 * 60 * 1000;

// ─── Reglas ───────────────────────────────────────────────────────────────────
const R = { ganado:5, empate:2, perdido:0, amarilla:-1, roja:-5, difGoles:1, primeroGrupo:7, segundoGrupo:4, eliminatoria:10 };

// ─── Banderas ─────────────────────────────────────────────────────────────────
const FL = {"Mexico":"🇲🇽","South Africa":"🇿🇦","Korea Republic":"🇰🇷","Czech Republic":"🇨🇿","Argentina":"🇦🇷","Chile":"🇨🇱","Peru":"🇵🇪","Canada":"🇨🇦","Spain":"🇪🇸","Croatia":"🇭🇷","Morocco":"🇲🇦","Japan":"🇯🇵","France":"🇫🇷","Poland":"🇵🇱","Saudi Arabia":"🇸🇦","Australia":"🇦🇺","Brazil":"🇧🇷","Colombia":"🇨🇴","Uruguay":"🇺🇾","Iran":"🇮🇷","Germany":"🇩🇪","Netherlands":"🇳🇱","Senegal":"🇸🇳","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Denmark":"🇩🇰","Tunisia":"🇹🇳","Costa Rica":"🇨🇷","Portugal":"🇵🇹","Belgium":"🇧🇪","Ghana":"🇬🇭","Bolivia":"🇧🇴","United States":"🇺🇸","Ecuador":"🇪🇨","Honduras":"🇭🇳","El Salvador":"🇸🇻","Switzerland":"🇨🇭","Serbia":"🇷🇸","Cameroon":"🇨🇲","Iraq":"🇮🇶","Turkey":"🇹🇷","Ukraine":"🇺🇦","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Qatar":"🇶🇦","Indonesia":"🇮🇩","New Zealand":"🇳🇿","Panama":"🇵🇦","Venezuela":"🇻🇪","Paraguay":"🇵🇾","Nigeria":"🇳🇬","Egypt":"🇪🇬","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Jamaica":"🇯🇲","Guatemala":"🇬🇹","United Arab Emirates":"🇦🇪","Morocco":"🇲🇦","Algeria":"🇩🇿"};
const fl = n => FL[n] || "🏳️";

const FINAL   = ["FT","AET","PEN","AWD","WO"];
const VIVO    = ["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"];
const PROXIMO = ["NS","TBD","PST"];

const fase = r => {
  if (!r) return ""; const l = r.toLowerCase();
  if (l.includes("group")||l.includes("matchday")) return "Fase de Grupos";
  if (l.includes("32")) return "Ronda de 32"; if (l.includes("16")) return "Octavos";
  if (l.includes("quarter")) return "Cuartos"; if (l.includes("semi")) return "Semifinal";
  if (l.includes("third")||l.includes("3rd")) return "3er Lugar";
  if (l.includes("final")) return "Final"; return r;
};
const esKO = r => { if(!r) return false; const l=r.toLowerCase(); return l.includes("32")||l.includes("16")||l.includes("quarter")||l.includes("semi")||l.includes("final")||l.includes("third")||l.includes("3rd"); };

// ─── LocalStorage ─────────────────────────────────────────────────────────────
const LD = (k,d) => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; }};
const LS = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── Cálculo puntos ───────────────────────────────────────────────────────────
function pts(p, eq) {
  const esL = p.teams?.home?.name===eq, esV = p.teams?.away?.name===eq;
  if (!esL&&!esV) return null;
  if (p.goals?.home==null||p.goals?.away==null) return null;
  const mg=esL?p.goals.home:p.goals.away, sg=esL?p.goals.away:p.goals.home, diff=mg-sg, ko=esKO(p.league?.round);
  let pt = diff>0 ? (ko?R.eliminatoria:R.ganado) : diff===0 ? (ko?0:R.empate) : R.perdido;
  if (diff>0&&!ko) pt += diff*R.difGoles;
  const evs=(p.events||[]).filter(e=>e.team?.name===(esL?p.teams.home.name:p.teams.away.name));
  const am=evs.filter(e=>e.type==="Card"&&e.detail==="Yellow Card").length;
  const ro=evs.filter(e=>e.type==="Card"&&(e.detail==="Red Card"||e.detail==="Second Yellow card")).length;
  pt += am*R.amarilla + ro*R.roja;
  return { pt, mg, sg, diff, ko, am, ro, esL };
}

// ─── Fetch via Worker ─────────────────────────────────────────────────────────
async function fetchAPI(path, apiKey, log) {
  // Si aún no hay Worker configurado, mostrar instrucciones
  if (WORKER_URL.includes("TU-USUARIO")) {
    log("⚠️ Worker no configurado — ver tab Setup");
    throw new Error("WORKER_NOT_CONFIGURED");
  }
  const url = `${WORKER_URL}/proxy${path}`;
  log(`📡 Fetch: ${url}`);
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  const rem = res.headers.get("x-ratelimit-requests-remaining");
  if (rem) log(`✅ OK — ${rem} requests restantes`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [workerUrl, setWorkerUrl] = useState(() => LD("q26_worker", WORKER_URL));
  const [apiKey, setApiKey]       = useState(() => LD("q26_key", DEFAULT_KEY));
  const [partidos, setPartidos]   = useState(() => LD("q26_data", []));
  const [duenos, setDuenos]       = useState(() => LD("q26_duenos", {}));
  const [cargando, setCargando]   = useState(false);
  const [estadoAPI, setEstadoAPI] = useState("idle");
  const [msgError, setMsgError]   = useState("");
  const [ultimaAct, setUltimaAct] = useState(null);
  const [tab, setTab]             = useState("setup");
  const [modoEditar, setModoEditar] = useState(false);
  const [filtroFase, setFiltroFase] = useState("TODOS");
  const [logs, setLogs]           = useState([]);
  const [reqRest, setReqRest]     = useState(null);
  const timerRef = useRef(null);

  const workerReady = workerUrl && !workerUrl.includes("TU-USUARIO");

  const addLog = msg => setLogs(p => [`${new Date().toLocaleTimeString("es-MX")}: ${msg}`, ...p.slice(0,14)]);

  // ── Guardar config ────────────────────────────────────────────────────────
  useEffect(() => { LS("q26_worker", workerUrl); }, [workerUrl]);
  useEffect(() => { LS("q26_key", apiKey); }, [apiKey]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchPartidos = useCallback(async (forzar=false) => {
    if (!workerReady) { setTab("setup"); return; }
    const ahora = Date.now(), ts = LD("q26_ts", 0);
    if (!forzar && partidos.length>0 && (ahora-ts)<CACHE_MS) {
      addLog(`✅ Caché válido (${Math.round((ahora-ts)/1000)}s)`);
      return;
    }
    setCargando(true); setEstadoAPI("loading"); setMsgError("");
    try {
      const data = await fetchAPI(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`, apiKey, addLog);
      if (data.errors && Object.keys(data.errors).length>0) {
        const e = Object.values(data.errors)[0];
        throw new Error(typeof e==="string" ? e : JSON.stringify(e));
      }
      const lista = data.response || [];
      addLog(`✅ ${lista.length} partidos cargados`);
      LS("q26_data", lista); LS("q26_ts", Date.now());
      setPartidos(lista); setUltimaAct(new Date()); setEstadoAPI("ok");
    } catch(e) {
      addLog(`❌ ${e.message}`);
      if (e.message !== "WORKER_NOT_CONFIGURED") {
        setMsgError(`Error: ${e.message}`);
      }
      setEstadoAPI("error");
    } finally { setCargando(false); }
  }, [workerUrl, apiKey, workerReady, partidos.length]);

  useEffect(() => {
    if (workerReady) { fetchPartidos(); setTab("tabla"); }
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => { if(workerReady) fetchPartidos(); }, CACHE_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchPartidos, workerReady]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const todosEq = [...new Set(partidos.flatMap(p=>[p.teams?.home?.name,p.teams?.away?.name].filter(Boolean)))].sort();
  const eqPorD = {};
  Object.entries(duenos).forEach(([eq,d]) => { if(d) { if(!eqPorD[d]) eqPorD[d]=[]; eqPorD[d].push(eq); }});

  const statsD = {};
  Object.keys(eqPorD).forEach(d => { statsD[d]={pt:0,g:0,e:0,p:0,gl:0,am:0,ro:0,det:[]}; });
  partidos.forEach(par => {
    if (!FINAL.includes(par.fixture?.status?.short)) return;
    [par.teams?.home?.name,par.teams?.away?.name].forEach(eq => {
      const d=duenos[eq]; if(!d||!statsD[d]) return;
      const r=pts(par,eq); if(!r) return;
      const s=statsD[d];
      s.pt+=r.pt; if(r.diff>0)s.g++;else if(r.diff===0&&!r.ko)s.e++;else s.p++;
      s.gl+=r.mg; s.am+=r.am; s.ro+=r.ro; s.det.push({par,eq,r});
    });
  });
  const tabla = Object.entries(statsD).sort((a,b)=>b[1].pt-a[1].pt).map(([d,s],i)=>({pos:i+1,d,...s}));

  const jugados  = partidos.filter(p=>FINAL.includes(p.fixture?.status?.short));
  const enVivo   = partidos.filter(p=>VIVO.includes(p.fixture?.status?.short));
  const proximos = partidos.filter(p=>PROXIMO.includes(p.fixture?.status?.short));
  const fases = ["TODOS",...new Set(jugados.map(p=>fase(p.league?.round)).filter(Boolean))];
  const jugFilt = filtroFase==="TODOS" ? jugados : jugados.filter(p=>fase(p.league?.round)===filtroFase);

  const setDueno = (eq,v) => { const n={...duenos,[eq]:v.trim()}; setDuenos(n); LS("q26_duenos",n); };
  const nombresD = [...new Set(Object.values(duenos).filter(Boolean))];
  const med = p => p===1?"🥇":p===2?"🥈":p===3?"🥉":`${p}.`;

  const TABS = [
    {id:"tabla",    lbl:"🏆 Tabla"},
    {id:"partidos", lbl:`📅 Jugados (${jugados.length})`},
    {id:"envivo",   lbl:`⚡ Vivo${enVivo.length?` (${enVivo.length})`:""}`},
    {id:"proximos", lbl:`⏱ Próximos (${proximos.length})`},
    {id:"equipos",  lbl:"⚙️ Equipos"},
    {id:"setup",    lbl:"🔧 Setup"},
  ];

  return (
    <div style={S.root}>
      {/* HEADER */}
      <header style={S.hdr}>
        <div style={S.hdrTop}>
          <div style={S.logo}>
            <span style={{fontSize:28}}>⚽</span>
            <div>
              <div style={S.logoT}>QUINIELA</div>
              <div style={S.logoS}>MUNDIAL 2026 · MEX/USA/CAN</div>
            </div>
          </div>
          <div style={S.hdrR}>
            {enVivo.length>0 && <span style={S.vivoBadge}>🔴 VIVO ({enVivo.length})</span>}
            {ultimaAct && <span style={S.mini}>🔄 {ultimaAct.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>}
            <span style={{...S.mini, color:estadoAPI==="ok"?"#4ade80":estadoAPI==="error"?"#f87171":"#64748b"}}>
              {!workerReady?"⚙️ Config pendiente":estadoAPI==="loading"?"⏳":estadoAPI==="ok"?`✅ ${jugados.length}J/${proximos.length}P`:"❌ Error"}
            </span>
            {workerReady && <button onClick={()=>fetchPartidos(true)} disabled={cargando} style={S.btnAct}>{cargando?"...":"↺"}</button>}
          </div>
        </div>
        <nav style={S.tabs}>
          {TABS.map(t=>(
            <button key={t.id} style={{...S.tab,...(tab===t.id?S.tabA:{})}} onClick={()=>setTab(t.id)}>{t.lbl}</button>
          ))}
        </nav>
      </header>

      <main style={S.main}>
        {msgError && <div style={S.err}>⚠️ {msgError}</div>}

        {/* ══ SETUP ══ */}
        {tab==="setup" && (
          <div>
            <H2>🔧 Configuración</H2>

            {/* Paso 1 */}
            <div style={S.setupCard}>
              <div style={S.setupStep}>Paso 1 — Crear el proxy gratuito (5 minutos)</div>
              <p style={S.setupTxt}>
                El browser no puede llamar directamente a API-Football por seguridad (CORS).
                Necesitas un pequeño proxy en Cloudflare Workers — es gratis para siempre.
              </p>
              <ol style={{...S.setupTxt, paddingLeft:20, lineHeight:2}}>
                <li>Ve a <strong style={{color:"#f59e0b"}}>workers.cloudflare.com</strong> → crea cuenta gratis</li>
                <li>Click en <strong>"Create Application"</strong> → <strong>"Create Worker"</strong></li>
                <li>Borra todo el código que aparece y pega el código del archivo <code style={S.code}>cloudflare-worker.js</code> que te genero abajo</li>
                <li>Click <strong>"Deploy"</strong></li>
                <li>Copia la URL que aparece (ej: <code style={S.code}>https://quiniela-proxy.tu-usuario.workers.dev</code>)</li>
                <li>Pégala abajo en el campo "Worker URL"</li>
              </ol>
            </div>

            {/* Paso 2 */}
            <div style={S.setupCard}>
              <div style={S.setupStep}>Paso 2 — Configurar aquí</div>
              <label style={S.lbl}>Worker URL (de Cloudflare)</label>
              <input style={S.inp}
                value={workerUrl}
                onChange={e=>setWorkerUrl(e.target.value.trim())}
                placeholder="https://quiniela-proxy.TU-USUARIO.workers.dev"
              />
              <label style={{...S.lbl, marginTop:12}}>API Key (API-Football)</label>
              <input style={S.inp}
                value={apiKey}
                onChange={e=>setApiKey(e.target.value.trim())}
                placeholder="tu-api-key"
              />
              <button
                style={{...S.btnAct, marginTop:14, padding:"10px 24px", fontSize:14, opacity:workerReady?1:0.5}}
                disabled={!workerReady || cargando}
                onClick={()=>{ fetchPartidos(true); setTab("proximos"); }}
              >
                {cargando ? "Cargando..." : "✅ Conectar y cargar partidos"}
              </button>
              {!workerReady && <p style={{...S.setupTxt, color:"#f87171", marginTop:8}}>⚠️ Primero configura el Worker URL</p>}
              {workerReady && <p style={{...S.setupTxt, color:"#4ade80", marginTop:8}}>✅ Worker configurado</p>}
            </div>

            {/* Logs */}
            {logs.length>0 && (
              <div style={S.setupCard}>
                <div style={S.setupStep}>Log de conexión</div>
                {logs.map((l,i)=><div key={i} style={{fontSize:12,color:"#94a3b8",padding:"2px 0"}}>{l}</div>)}
              </div>
            )}
          </div>
        )}

        {/* ══ TABLA ══ */}
        {tab==="tabla" && (
          <div>
            <H2>Tabla de Posiciones</H2>
            {tabla.length===0
              ? <P>Ve a ⚙️ Equipos y asigna dueños para ver la tabla.</P>
              : <>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {tabla.map(row=>(
                    <div key={row.d} style={{...S.cardD,...(row.pos===1?S.c1:row.pos===2?S.c2:row.pos===3?S.c3:{})}}>
                      <div style={{fontSize:22}}>{med(row.pos)}</div>
                      <div style={{fontSize:20,fontWeight:900}}>{row.d}</div>
                      <div style={S.bigPts}>{row.pt}<span style={{fontSize:13,fontWeight:400,marginLeft:4}}>pts</span></div>
                      <div style={S.chips}>
                        <span style={S.chip}>✅ {row.g}G</span><span style={S.chip}>➖ {row.e}E</span>
                        <span style={S.chip}>❌ {row.p}P</span><span style={S.chip}>⚽ {row.gl}</span>
                        {row.am>0&&<span style={{...S.chip,color:"#fbbf24"}}>🟨 {row.am}</span>}
                        {row.ro>0&&<span style={{...S.chip,color:"#f87171"}}>🟥 {row.ro}</span>}
                      </div>
                      <div style={S.eqChips}>
                        {(eqPorD[row.d]||[]).map(eq=><span key={eq} style={S.eqC}>{fl(eq)} {eq}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
                <H2 style={{marginTop:24}}>Desglose por Partido</H2>
                <div style={S.tblD}>
                  <div style={S.fD}>{["Dueño","Equipo","Rival","Marcador","🟨","🟥","Pts"].map(h=><span key={h} style={S.hD}>{h}</span>)}</div>
                  {tabla.flatMap(row=>row.det.map((d,i)=>{
                    const rival=d.r.esL?d.par.teams?.away?.name:d.par.teams?.home?.name;
                    const sc=d.r.esL?`${d.par.goals.home}–${d.par.goals.away}`:`${d.par.goals.away}–${d.par.goals.home}`;
                    return (
                      <div key={`${row.d}-${i}`} style={{...S.fD,background:i%2===0?"rgba(255,255,255,0.03)":"transparent"}}>
                        <span style={S.cD}>{row.d}</span><span style={S.cD}>{fl(d.eq)} {d.eq}</span>
                        <span style={S.cD}>{fl(rival)} {rival}</span><span style={S.cD}>{sc}</span>
                        <span style={{...S.cD,color:"#fbbf24"}}>{d.r.am}</span>
                        <span style={{...S.cD,color:"#f87171"}}>{d.r.ro}</span>
                        <span style={{...S.cD,fontWeight:700,color:d.r.pt>0?"#4ade80":d.r.pt<0?"#f87171":"#facc15"}}>{d.r.pt>0?"+":""}{d.r.pt}</span>
                      </div>
                    );
                  }))}
                </div>
              </>
            }
          </div>
        )}

        {/* ══ JUGADOS ══ */}
        {tab==="partidos" && (
          <div>
            <H2>Partidos Jugados ({jugados.length})</H2>
            <div style={S.filtros}>
              {fases.map(f=><button key={f} style={{...S.btnF,...(filtroFase===f?S.btnFA:{})}} onClick={()=>setFiltroFase(f)}>{f}</button>)}
            </div>
            {jugFilt.length===0 ? <P>Sin partidos aún.</P> : jugFilt.slice().reverse().map(p=><CP key={p.fixture.id} p={p} duenos={duenos}/>)}
          </div>
        )}

        {/* ══ EN VIVO ══ */}
        {tab==="envivo" && (
          <div>
            <H2>En Vivo</H2>
            {enVivo.length===0 ? <P>No hay partidos en vivo. Se actualiza cada 5 min.</P> : enVivo.map(p=><CP key={p.fixture.id} p={p} duenos={duenos} vivo/>)}
          </div>
        )}

        {/* ══ PRÓXIMOS ══ */}
        {tab==="proximos" && (
          <div>
            <H2>Próximos Partidos ({proximos.length})</H2>
            {!workerReady && <div style={S.err}>⚙️ Configura el Worker en el tab 🔧 Setup primero.</div>}
            {workerReady && proximos.length===0 && estadoAPI==="ok" && (
              <div style={S.infoBox}>
                ℹ️ No se encontraron partidos próximos en la API.<br/>
                El Mundial 2026 empieza el <strong>11 de junio</strong>. Si la API devuelve 0 fixtures,
                puede ser que el plan Free no los tenga disponibles aún. Los partidos aparecerán aquí automáticamente cuando la API los publique.
              </div>
            )}
            {proximos.map(p=><CP key={p.fixture.id} p={p} duenos={duenos} proximo/>)}
          </div>
        )}

        {/* ══ EQUIPOS ══ */}
        {tab==="equipos" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <H2>Equipos ({todosEq.length})</H2>
              <button style={S.btnEdit} onClick={()=>setModoEditar(e=>!e)}>{modoEditar?"✅ Listo":"✏️ Editar"}</button>
            </div>
            {!workerReady && <P>Configura el Worker en 🔧 Setup para ver los equipos.</P>}
            {workerReady && todosEq.length===0 && <P>Cargando equipos... presiona ↺ Actualizar en el header.</P>}
            <div style={S.listaEq}>
              {todosEq.map(eq=>(
                <div key={eq} style={S.filaEq}>
                  <span style={{fontSize:22,width:30,textAlign:"center"}}>{fl(eq)}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:600}}>{eq}</span>
                  {modoEditar
                    ? <input style={S.inputD} value={duenos[eq]||""} placeholder="Dueño..." list="ldns" onChange={e=>setDueno(eq,e.target.value)}/>
                    : <span style={S.badgeD}>{duenos[eq]||<span style={{color:"#475569"}}>—</span>}</span>
                  }
                </div>
              ))}
              <datalist id="ldns">{nombresD.map(n=><option key={n} value={n}/>)}</datalist>
            </div>
          </div>
        )}
      </main>
      <footer style={{textAlign:"center",padding:12,fontSize:11,color:"#334155",borderTop:"1px solid #1e3a5f",marginTop:20}}>
        ⚽ Quiniela Mundial 2026 · API-Football · Auto-refresh 5 min
      </footer>
    </div>
  );
}

// ─── Card Partido ─────────────────────────────────────────────────────────────
function CP({ p, duenos, vivo, proximo }) {
  const local=p.teams?.home?.name, visita=p.teams?.away?.name;
  const dL=duenos[local], dV=duenos[visita];
  const faseStr=fase(p.league?.round);
  const fecha=p.fixture?.date ? new Date(p.fixture.date).toLocaleDateString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "";
  const min=p.fixture?.status?.elapsed;
  const rL=FINAL.includes(p.fixture?.status?.short)?pts(p,local):null;
  const rV=FINAL.includes(p.fixture?.status?.short)?pts(p,visita):null;
  const evs=p.events||[];
  const gL=evs.filter(e=>e.type==="Goal"&&e.team?.name===local);
  const gV=evs.filter(e=>e.type==="Goal"&&e.team?.name===visita);
  const tL=evs.filter(e=>e.type==="Card"&&e.team?.name===local);
  const tV=evs.filter(e=>e.type==="Card"&&e.team?.name===visita);
  return (
    <div style={{...S.cardP,...(vivo?{border:"1px solid #ef4444",boxShadow:"0 0 12px rgba(239,68,68,0.2)"}:{})}}>
      <div style={S.metaP}>
        <span style={S.bF}>{faseStr}</span>
        {p.league?.round&&<span style={S.bR}>{p.league.round}</span>}
        <span style={{fontSize:11,color:"#475569",marginLeft:"auto"}}>{fecha}</span>
        {p.fixture?.venue?.city&&<span style={{fontSize:11,color:"#475569"}}>📍{p.fixture.venue.city}</span>}
        {vivo&&min&&<span style={{background:"rgba(239,68,68,0.25)",border:"1px solid #ef4444",borderRadius:4,padding:"1px 6px",fontSize:10,color:"#f87171",fontWeight:700}}>⏱{min}'</span>}
      </div>
      <div style={S.filaP}>
        <div style={S.ladoP}><span style={{fontSize:24}}>{fl(local)}</span><div><div style={{fontSize:14,fontWeight:700}}>{local}</div>{dL&&<div style={{fontSize:11,color:"#94a3b8"}}>{dL}</div>}</div></div>
        <div style={S.marc}>
          {proximo
            ? <span style={{fontSize:13,fontWeight:800,color:"#475569",letterSpacing:2}}>VS</span>
            : <><span style={{fontSize:26,fontWeight:900}}>{p.goals?.home??"-"}</span><span style={{fontSize:16,color:"#475569"}}>–</span><span style={{fontSize:26,fontWeight:900}}>{p.goals?.away??"-"}</span></>
          }
        </div>
        <div style={{...S.ladoP,justifyContent:"flex-end"}}><div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:700}}>{visita}</div>{dV&&<div style={{fontSize:11,color:"#94a3b8"}}>{dV}</div>}</div><span style={{fontSize:24}}>{fl(visita)}</span></div>
      </div>
      {(gL.length>0||gV.length>0||tL.length>0||tV.length>0)&&(
        <div style={{display:"flex",padding:"4px 14px 8px",gap:8}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
            {gL.map((e,i)=><span key={i} style={{fontSize:11,color:"#94a3b8"}}>⚽{e.player?.name} {e.time?.elapsed}'</span>)}
            {tL.map((e,i)=><span key={i} style={{fontSize:11,color:e.detail==="Yellow Card"?"#fbbf24":"#f87171"}}>{e.detail==="Yellow Card"?"🟨":"🟥"}{e.player?.name} {e.time?.elapsed}'</span>)}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end"}}>
            {gV.map((e,i)=><span key={i} style={{fontSize:11,color:"#94a3b8"}}>⚽{e.player?.name} {e.time?.elapsed}'</span>)}
            {tV.map((e,i)=><span key={i} style={{fontSize:11,color:e.detail==="Yellow Card"?"#fbbf24":"#f87171"}}>{e.detail==="Yellow Card"?"🟨":"🟥"}{e.player?.name} {e.time?.elapsed}'</span>)}
          </div>
        </div>
      )}
      {!proximo&&(rL||rV)&&(
        <div style={{display:"flex",gap:8,padding:"6px 14px 10px",flexWrap:"wrap"}}>
          {rL&&dL&&<span style={{fontSize:12,fontWeight:700,color:rL.pt>=0?"#4ade80":"#f87171"}}>{dL}: {rL.pt>0?"+":""}{rL.pt} pts</span>}
          {rV&&dV&&<span style={{fontSize:12,fontWeight:700,color:rV.pt>=0?"#4ade80":"#f87171"}}>{dV}: {rV.pt>0?"+":""}{rV.pt} pts</span>}
        </div>
      )}
    </div>
  );
}

function H2({children,style}) { return <h2 style={{...S.h2,...style}}>{children}</h2>; }
function P({children}) { return <p style={{color:"#64748b",fontSize:13,marginBottom:12}}>{children}</p>; }

const S = {
  root:{minHeight:"100vh",background:"linear-gradient(160deg,#060d1a,#0a1628,#0d1f3a)",color:"#e2e8f0",fontFamily:"'Barlow Condensed','Oswald','Arial Narrow',sans-serif",fontSize:15},
  hdr:{background:"linear-gradient(180deg,#071020,#0a1628)",borderBottom:"2px solid #1e3a5f",position:"sticky",top:0,zIndex:100,boxShadow:"0 6px 24px rgba(0,0,0,0.6)"},
  hdrTop:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",flexWrap:"wrap",gap:8},
  logo:{display:"flex",alignItems:"center",gap:10},
  logoT:{fontSize:24,fontWeight:900,letterSpacing:4,background:"linear-gradient(90deg,#f59e0b,#ef4444)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  logoS:{fontSize:10,color:"#475569",letterSpacing:2},
  hdrR:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"},
  vivoBadge:{background:"rgba(239,68,68,0.2)",border:"1px solid #ef4444",borderRadius:20,padding:"3px 10px",fontSize:11,color:"#f87171",fontWeight:700},
  mini:{fontSize:11,color:"#64748b"},
  btnAct:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:6,color:"#fff",padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:700},
  tabs:{display:"flex",overflowX:"auto",padding:"0 4px",borderTop:"1px solid #1e3a5f"},
  tab:{background:"transparent",border:"none",color:"#64748b",padding:"10px 10px",cursor:"pointer",fontSize:11,fontWeight:700,borderBottom:"2px solid transparent",whiteSpace:"nowrap"},
  tabA:{color:"#f59e0b",borderBottom:"2px solid #f59e0b",background:"rgba(245,158,11,0.07)"},
  main:{padding:16,maxWidth:920,margin:"0 auto"},
  err:{background:"rgba(239,68,68,0.1)",border:"1px solid #ef4444",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#fca5a5",fontSize:13},
  infoBox:{background:"rgba(59,130,246,0.1)",border:"1px solid #3b82f6",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#93c5fd",fontSize:13,lineHeight:1.6},
  h2:{fontSize:18,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#f59e0b",marginBottom:12,marginTop:4,borderLeft:"4px solid #ef4444",paddingLeft:10},
  // setup
  setupCard:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,padding:16,marginBottom:12},
  setupStep:{fontSize:14,fontWeight:800,color:"#f59e0b",marginBottom:8,textTransform:"uppercase",letterSpacing:1},
  setupTxt:{fontSize:13,color:"#94a3b8",lineHeight:1.7,margin:0},
  code:{background:"rgba(255,255,255,0.1)",borderRadius:4,padding:"1px 6px",fontSize:12,fontFamily:"monospace"},
  lbl:{display:"block",fontSize:12,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:1},
  inp:{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid #334155",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box"},
  btnEdit:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:8,color:"#fff",padding:"7px 16px",cursor:"pointer",fontSize:13,fontWeight:700},
  // tabla
  cardD:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:12,padding:"12px 16px"},
  c1:{border:"1px solid #f59e0b",background:"linear-gradient(135deg,#1c1300,#1a2744)"},
  c2:{border:"1px solid #94a3b8"},
  c3:{border:"1px solid #b45309"},
  bigPts:{fontSize:36,fontWeight:900,background:"linear-gradient(90deg,#f59e0b,#ef4444)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1},
  chips:{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"},
  chip:{fontSize:12,color:"#94a3b8"},
  eqChips:{display:"flex",flexWrap:"wrap",gap:4,marginTop:8},
  eqC:{background:"rgba(255,255,255,0.06)",borderRadius:20,padding:"2px 8px",fontSize:11,color:"#cbd5e1"},
  // desglose
  tblD:{background:"#0f172a",borderRadius:10,border:"1px solid #1e3a5f",overflow:"hidden"},
  fD:{display:"grid",gridTemplateColumns:"1fr 1.2fr 1.2fr 0.6fr 0.3fr 0.3fr 0.4fr",padding:"6px 12px",gap:4,borderBottom:"1px solid rgba(255,255,255,0.04)"},
  hD:{fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase"},
  cD:{fontSize:11,color:"#94a3b8"},
  // filtros
  filtros:{display:"flex",flexWrap:"wrap",gap:4,marginBottom:14},
  btnF:{background:"rgba(255,255,255,0.05)",border:"1px solid #1e3a5f",borderRadius:6,color:"#64748b",padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700},
  btnFA:{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",color:"#f59e0b"},
  // partidos
  cardP:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:12,marginBottom:10,overflow:"hidden"},
  metaP:{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"6px 12px",background:"rgba(0,0,0,0.3)",borderBottom:"1px solid rgba(255,255,255,0.05)"},
  bF:{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",borderRadius:4,padding:"1px 6px",fontSize:9,color:"#f59e0b",fontWeight:700,textTransform:"uppercase"},
  bR:{background:"rgba(99,102,241,0.15)",border:"1px solid #6366f1",borderRadius:4,padding:"1px 6px",fontSize:9,color:"#a5b4fc"},
  filaP:{display:"flex",alignItems:"center",padding:"12px 14px",gap:8},
  ladoP:{flex:1,display:"flex",alignItems:"center",gap:8},
  marc:{display:"flex",alignItems:"center",gap:4,minWidth:86,justifyContent:"center",background:"rgba(0,0,0,0.4)",borderRadius:8,padding:"8px 12px",border:"1px solid #1e3a5f"},
  // equipos
  listaEq:{background:"#0f172a",borderRadius:10,border:"1px solid #1e3a5f",overflow:"hidden"},
  filaEq:{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.05)"},
  inputD:{background:"rgba(255,255,255,0.08)",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"4px 10px",fontSize:13,width:150,outline:"none"},
  badgeD:{fontSize:13,color:"#f59e0b",fontWeight:700,background:"rgba(245,158,11,0.1)",borderRadius:6,padding:"3px 10px",minWidth:90,textAlign:"center"},
};
