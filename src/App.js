import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN — cambia WORKER_URL con tu URL de Cloudflare
// ─────────────────────────────────────────────────────────────────────────────
const WORKER_URL  = "https://quiniela-proxy.dabombps.workers.dev";
const API_KEY     = "f511995177592a89c2c38930218b64ba";
const LEAGUE_ID   = 1;
const SEASON      = 2026;
const CACHE_MS    = 5 * 60 * 1000;

// ─── Reglas DEFAULT ───────────────────────────────────────────────────────────
const REGLAS_DEFAULT = {
  ganado: 5, empate: 2, perdido: 0,
  amarilla: -1, roja: -5, difGoles: 1,
  primeroGrupo: 7, segundoGrupo: 4,
  eliminatoria: 10,
};

// ─── Banderas ─────────────────────────────────────────────────────────────────
const FL = {
  "Mexico":"🇲🇽","South Africa":"🇿🇦","Korea Republic":"🇰🇷","Czech Republic":"🇨🇿",
  "Argentina":"🇦🇷","Chile":"🇨🇱","Peru":"🇵🇪","Canada":"🇨🇦","Spain":"🇪🇸",
  "Croatia":"🇭🇷","Morocco":"🇲🇦","Japan":"🇯🇵","France":"🇫🇷","Poland":"🇵🇱",
  "Saudi Arabia":"🇸🇦","Australia":"🇦🇺","Brazil":"🇧🇷","Colombia":"🇨🇴",
  "Uruguay":"🇺🇾","Iran":"🇮🇷","Germany":"🇩🇪","Netherlands":"🇳🇱","Senegal":"🇸🇳",
  "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Denmark":"🇩🇰","Tunisia":"🇹🇳","Costa Rica":"🇨🇷",
  "Portugal":"🇵🇹","Belgium":"🇧🇪","Ghana":"🇬🇭","Bolivia":"🇧🇴",
  "United States":"🇺🇸","Ecuador":"🇪🇨","Honduras":"🇭🇳","El Salvador":"🇸🇻",
  "Switzerland":"🇨🇭","Serbia":"🇷🇸","Cameroon":"🇨🇲","Iraq":"🇮🇶",
  "Turkey":"🇹🇷","Ukraine":"🇺🇦","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Qatar":"🇶🇦",
  "Indonesia":"🇮🇩","New Zealand":"🇳🇿","Panama":"🇵🇦","Venezuela":"🇻🇪",
  "Paraguay":"🇵🇾","Nigeria":"🇳🇬","Egypt":"🇪🇬","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "Jamaica":"🇯🇲","Guatemala":"🇬🇹","Algeria":"🇩🇿","United Arab Emirates":"🇦🇪",
};
const fl = n => FL[n] || "🏳️";

const FINAL   = ["FT","AET","PEN","AWD","WO"];
const VIVO    = ["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"];
const PROXIMO = ["NS","TBD","PST"];

const faseLabel = r => {
  if (!r) return ""; const l = r.toLowerCase();
  if (l.includes("group")||l.includes("matchday")) return "Fase de Grupos";
  if (l.includes("32")) return "Ronda de 32";
  if (l.includes("16")) return "Octavos";
  if (l.includes("quarter")) return "Cuartos";
  if (l.includes("semi")) return "Semifinal";
  if (l.includes("third")||l.includes("3rd")) return "3er Lugar";
  if (l.includes("final")) return "Final";
  return r;
};
const esKO = r => {
  if (!r) return false; const l = r.toLowerCase();
  return l.includes("32")||l.includes("16")||l.includes("quarter")||
         l.includes("semi")||l.includes("final")||l.includes("third")||l.includes("3rd");
};

// ─── LocalStorage ─────────────────────────────────────────────────────────────
const LD = (k,d) => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; }};
const LS = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── Cálculo puntos ───────────────────────────────────────────────────────────
function calcPuntos(p, eq, R) {
  const esL = p.teams?.home?.name===eq, esV = p.teams?.away?.name===eq;
  if (!esL&&!esV) return null;
  if (p.goals?.home==null||p.goals?.away==null) return null;
  const mg=esL?p.goals.home:p.goals.away, sg=esL?p.goals.away:p.goals.home, diff=mg-sg;
  const ko=esKO(p.league?.round);
  let pt = diff>0?(ko?R.eliminatoria:R.ganado):diff===0?(ko?0:R.empate):R.perdido;
  if (diff>0&&!ko) pt += diff*R.difGoles;
  const evs=(p.events||[]).filter(e=>e.team?.name===(esL?p.teams.home.name:p.teams.away.name));
  const am=evs.filter(e=>e.type==="Card"&&e.detail==="Yellow Card").length;
  const ro=evs.filter(e=>e.type==="Card"&&(e.detail==="Red Card"||e.detail==="Second Yellow card")).length;
  pt += am*R.amarilla + ro*R.roja;
  return { pt, mg, sg, diff, ko, am, ro, esL };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE QUINIELA (reutilizable para familia y amigos)
// ─────────────────────────────────────────────────────────────────────────────
function Quiniela({ id, nombre, color, partidos, cargando, estadoAPI }) {
  const lsPrefix = `q26_${id}_`;
  const [duenos, setDuenos]     = useState(() => LD(lsPrefix+"duenos", {}));
  const [reglas, setReglas]     = useState(() => LD(lsPrefix+"reglas", REGLAS_DEFAULT));
  const [tab, setTab]           = useState("tabla");
  const [modoEditar, setModoEditar] = useState(false);
  const [editReglas, setEditReglas] = useState(false);
  const [filtroFase, setFiltroFase] = useState("TODOS");
  const [reglasTmp, setReglasTmp]   = useState(reglas);

  const setDueno = (eq, v) => {
    const n={...duenos,[eq]:v.trim()}; setDuenos(n); LS(lsPrefix+"duenos",n);
  };
  const guardarReglas = () => {
    setReglas(reglasTmp); LS(lsPrefix+"reglas",reglasTmp); setEditReglas(false);
  };

  const todosEq = [...new Set(
    partidos.flatMap(p=>[p.teams?.home?.name,p.teams?.away?.name].filter(Boolean))
  )].sort();

  const eqPorD = {};
  Object.entries(duenos).forEach(([eq,d])=>{ if(d){if(!eqPorD[d])eqPorD[d]=[];eqPorD[d].push(eq);}});

  const statsD = {};
  Object.keys(eqPorD).forEach(d=>{ statsD[d]={pt:0,g:0,e:0,p_:0,gl:0,am:0,ro:0,det:[]};});
  partidos.forEach(par=>{
    if(!FINAL.includes(par.fixture?.status?.short)) return;
    [par.teams?.home?.name,par.teams?.away?.name].forEach(eq=>{
      const d=duenos[eq]; if(!d||!statsD[d]) return;
      const r=calcPuntos(par,eq,reglas); if(!r) return;
      const s=statsD[d];
      s.pt+=r.pt; if(r.diff>0)s.g++;else if(r.diff===0&&!r.ko)s.e++;else s.p_++;
      s.gl+=r.mg; s.am+=r.am; s.ro+=r.ro; s.det.push({par,eq,r});
    });
  });
  const tabla=Object.entries(statsD).sort((a,b)=>b[1].pt-a[1].pt).map(([d,s],i)=>({pos:i+1,d,...s}));

  const jugados  = partidos.filter(p=>FINAL.includes(p.fixture?.status?.short));
  const enVivo   = partidos.filter(p=>VIVO.includes(p.fixture?.status?.short));
  const proximos = partidos.filter(p=>PROXIMO.includes(p.fixture?.status?.short));
  const fases    = ["TODOS",...new Set(jugados.map(p=>faseLabel(p.league?.round)).filter(Boolean))];
  const jugFilt  = filtroFase==="TODOS"?jugados:jugados.filter(p=>faseLabel(p.league?.round)===filtroFase);
  const nombresD = [...new Set(Object.values(duenos).filter(Boolean))];
  const med = p => p===1?"🥇":p===2?"🥈":p===3?"🥉":`${p}.`;

  const TABS = [
    {id:"tabla",   lbl:"🏆 Tabla"},
    {id:"jugados", lbl:`📅 Jugados (${jugados.length})`},
    {id:"envivo",  lbl:`⚡ Vivo${enVivo.length?` (${enVivo.length})`:""}`},
    {id:"proximos",lbl:`⏱ Próximos (${proximos.length})`},
    {id:"equipos", lbl:"⚙️ Equipos"},
    {id:"reglas",  lbl:"📋 Reglas"},
  ];

  return (
    <div style={{...S.quinielaWrap, borderColor: color}}>
      {/* Header quiniela */}
      <div style={{...S.quinielaHdr, background: color+"22", borderColor: color}}>
        <span style={{fontSize:22, fontWeight:900, color: color, letterSpacing:2}}>{nombre}</span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {enVivo.length>0&&<span style={S.vivoBadge}>🔴 VIVO ({enVivo.length})</span>}
          <span style={{fontSize:11, color: estadoAPI==="ok"?"#4ade80":estadoAPI==="error"?"#f87171":"#64748b"}}>
            {cargando?"⏳":estadoAPI==="ok"?`✅ ${jugados.length}J/${proximos.length}P`:"❌"}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <nav style={S.subTabs}>
        {TABS.map(t=>(
          <button key={t.id} style={{...S.subTab,...(tab===t.id?{...S.subTabA, borderColor:color, color:color}:{})}}
            onClick={()=>setTab(t.id)}>{t.lbl}</button>
        ))}
      </nav>

      <div style={S.quinielaBody}>
        {/* ══ TABLA ══ */}
        {tab==="tabla"&&(
          <div>
            <H2>Tabla de Posiciones</H2>
            {tabla.length===0
              ? <Pista>Ve a ⚙️ Equipos y asigna dueños para ver la tabla.</Pista>
              : <>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {tabla.map(row=>(
                      <div key={row.d} style={{...S.cardD,...(row.pos===1?{borderColor:"#f59e0b"}:row.pos===2?{borderColor:"#94a3b8"}:row.pos===3?{borderColor:"#b45309"}:{})}}>
                        <div style={{fontSize:20}}>{med(row.pos)}</div>
                        <div style={{fontSize:18,fontWeight:900}}>{row.d}</div>
                        <div style={{...S.bigPts, background:`linear-gradient(90deg,${color},#ef4444)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent"}}>
                          {row.pt}<span style={{fontSize:12,fontWeight:400,marginLeft:4}}>pts</span>
                        </div>
                        <div style={S.chips}>
                          <span style={S.chip}>✅ {row.g}G</span><span style={S.chip}>➖ {row.e}E</span>
                          <span style={S.chip}>❌ {row.p_}P</span><span style={S.chip}>⚽ {row.gl}</span>
                          {row.am>0&&<span style={{...S.chip,color:"#fbbf24"}}>🟨 {row.am}</span>}
                          {row.ro>0&&<span style={{...S.chip,color:"#f87171"}}>🟥 {row.ro}</span>}
                        </div>
                        <div style={S.eqChips}>
                          {(eqPorD[row.d]||[]).map(eq=><span key={eq} style={S.eqC}>{fl(eq)} {eq}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <H2 style={{marginTop:20}}>Desglose por Partido</H2>
                  <div style={S.tblD}>
                    <div style={S.fD}>{["Dueño","Equipo","Rival","Marcador","🟨","🟥","Pts"].map(h=><span key={h} style={S.hD}>{h}</span>)}</div>
                    {tabla.flatMap(row=>row.det.map((d,i)=>{
                      const rival=d.r.esL?d.par.teams?.away?.name:d.par.teams?.home?.name;
                      const sc=d.r.esL?`${d.par.goals.home}–${d.par.goals.away}`:`${d.par.goals.away}–${d.par.goals.home}`;
                      return(
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
        {tab==="jugados"&&(
          <div>
            <H2>Partidos Jugados ({jugados.length})</H2>
            <div style={S.filtros}>
              {fases.map(f=><button key={f} style={{...S.btnF,...(filtroFase===f?{...S.btnFA,borderColor:color,color:color,background:color+"22"}:{})}} onClick={()=>setFiltroFase(f)}>{f}</button>)}
            </div>
            {jugFilt.length===0?<Pista>Sin partidos aún.</Pista>:jugFilt.slice().reverse().map(p=><CP key={p.fixture.id} p={p} duenos={duenos} reglas={reglas}/>)}
          </div>
        )}

        {/* ══ EN VIVO ══ */}
        {tab==="envivo"&&(
          <div>
            <H2>En Vivo</H2>
            {enVivo.length===0?<Pista>No hay partidos en vivo ahora.</Pista>:enVivo.map(p=><CP key={p.fixture.id} p={p} duenos={duenos} reglas={reglas} vivo/>)}
          </div>
        )}

        {/* ══ PRÓXIMOS ══ */}
        {tab==="proximos"&&(
          <div>
            <H2>Próximos Partidos ({proximos.length})</H2>
            {proximos.length===0&&estadoAPI==="ok"&&(
              <div style={S.infoBox}>ℹ️ La API aún no tiene los fixtures del Mundial 2026 disponibles. Aparecerán automáticamente cuando se publiquen (antes del 11 de junio).</div>
            )}
            {proximos.map(p=><CP key={p.fixture.id} p={p} duenos={duenos} reglas={reglas} proximo/>)}
          </div>
        )}

        {/* ══ EQUIPOS ══ */}
        {tab==="equipos"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <H2>Equipos ({todosEq.length})</H2>
              <button style={{...S.btnEdit,background:color}} onClick={()=>setModoEditar(e=>!e)}>
                {modoEditar?"✅ Listo":"✏️ Editar"}
              </button>
            </div>
            {todosEq.length===0&&<Pista>Los equipos aparecen aquí cuando se carguen los partidos de la API.</Pista>}
            <div style={S.listaEq}>
              {todosEq.map(eq=>(
                <div key={eq} style={S.filaEq}>
                  <span style={{fontSize:20,width:28,textAlign:"center"}}>{fl(eq)}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:600}}>{eq}</span>
                  {modoEditar
                    ?<input style={S.inputD} value={duenos[eq]||""} placeholder="Dueño..." list={`ldns-${id}`} onChange={e=>setDueno(eq,e.target.value)}/>
                    :<span style={{...S.badgeD,background:color+"22",color:color}}>{duenos[eq]||<span style={{color:"#475569"}}>—</span>}</span>
                  }
                </div>
              ))}
              <datalist id={`ldns-${id}`}>{nombresD.map(n=><option key={n} value={n}/>)}</datalist>
            </div>
          </div>
        )}

        {/* ══ REGLAS ══ */}
        {tab==="reglas"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <H2>Reglas de Puntuación</H2>
              {!editReglas
                ?<button style={{...S.btnEdit,background:color}} onClick={()=>{setReglasTmp({...reglas});setEditReglas(true);}}>✏️ Editar</button>
                :<div style={{display:"flex",gap:8}}>
                  <button style={{...S.btnEdit,background:"#64748b"}} onClick={()=>setEditReglas(false)}>Cancelar</button>
                  <button style={{...S.btnEdit,background:"#16a34a"}} onClick={guardarReglas}>✅ Guardar</button>
                </div>
              }
            </div>
            <Pista>Estos son los puntos que se aplican en esta quiniela. {editReglas?"Modifica y guarda.":""}</Pista>
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
                {k:"eliminatoria",lbl:"Ganar en eliminatorias"},
              ].map(r=>(
                <div key={r.k} style={S.cardRegla}>
                  <span style={{fontSize:12,color:"#94a3b8",flex:1}}>{r.lbl}</span>
                  {editReglas
                    ?<input type="number" style={{...S.inputD,width:60,textAlign:"center"}}
                        value={reglasTmp[r.k]}
                        onChange={e=>setReglasTmp(prev=>({...prev,[r.k]:Number(e.target.value)}))}/>
                    :<span style={{fontSize:16,fontWeight:900,color:color,marginLeft:8}}>
                        {reglas[r.k]>0?"+":""}{reglas[r.k]} pts
                      </span>
                  }
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [partidos, setPartidos] = useState(()=>LD("q26_data",[]));
  const [cargando, setCargando] = useState(false);
  const [estadoAPI, setEstadoAPI] = useState("idle");
  const [ultimaAct, setUltimaAct] = useState(null);
  const [quinielaActiva, setQuinielaActiva] = useState("familia");
  const timerRef = useRef(null);

  const fetchPartidos = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LD("q26_ts",0);
    if (!forzar&&partidos.length>0&&(ahora-ts)<CACHE_MS) return;
    setCargando(true); setEstadoAPI("loading");
    try {
      const res = await fetch(`${WORKER_URL}/proxy/fixtures?league=${LEAGUE_ID}&season=${SEASON}`, {
        headers: {"x-api-key": API_KEY}
      });
      const data = await res.json();
      if (data.errors&&Object.keys(data.errors).length>0) throw new Error(Object.values(data.errors)[0]);
      const lista = data.response||[];
      LS("q26_data",lista); LS("q26_ts",Date.now());
      setPartidos(lista); setUltimaAct(new Date()); setEstadoAPI("ok");
    } catch(e) {
      setEstadoAPI("error");
    } finally { setCargando(false); }
  }, [partidos.length]);

  useEffect(()=>{ fetchPartidos(); },[]);
  useEffect(()=>{
    timerRef.current = setInterval(()=>fetchPartidos(), CACHE_MS);
    return ()=>clearInterval(timerRef.current);
  },[fetchPartidos]);

  const enVivoCount = partidos.filter(p=>VIVO.includes(p.fixture?.status?.short)).length;

  return (
    <div style={S.root}>
      {/* HEADER PRINCIPAL */}
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
            {enVivoCount>0&&<span style={S.vivoBadge}>🔴 EN VIVO ({enVivoCount})</span>}
            {ultimaAct&&<span style={S.mini}>🔄 {ultimaAct.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>}
            <span style={{...S.mini,color:estadoAPI==="ok"?"#4ade80":estadoAPI==="error"?"#f87171":"#64748b"}}>
              {cargando?"⏳":estadoAPI==="ok"?`✅ ${partidos.length} partidos`:"❌"}
            </span>
            <button onClick={()=>fetchPartidos(true)} disabled={cargando} style={S.btnAct}>
              {cargando?"...":"↺"}
            </button>
          </div>
        </div>

        {/* Selector de quiniela */}
        <div style={S.selectorBar}>
          <button
            style={{...S.selectorBtn,...(quinielaActiva==="familia"?{...S.selectorBtnA,borderColor:"#f59e0b",background:"rgba(245,158,11,0.15)",color:"#f59e0b"}:{})}}
            onClick={()=>setQuinielaActiva("familia")}
          >
            👨‍👩‍👧‍👦 Quiniela Familia
            <span style={{fontSize:10,opacity:0.7,display:"block"}}>6 jugadores · 8 equipos c/u</span>
          </button>
          <button
            style={{...S.selectorBtn,...(quinielaActiva==="amigos"?{...S.selectorBtnA,borderColor:"#22d3ee",background:"rgba(34,211,238,0.15)",color:"#22d3ee"}:{})}}
            onClick={()=>setQuinielaActiva("amigos")}
          >
            👥 Quiniela Amigos
            <span style={{fontSize:10,opacity:0.7,display:"block"}}>8 jugadores · 6 equipos c/u</span>
          </button>
        </div>
      </header>

      <main style={S.main}>
        {quinielaActiva==="familia" && (
          <Quiniela
            id="familia"
            nombre="👨‍👩‍👧‍👦 QUINIELA FAMILIA"
            color="#f59e0b"
            partidos={partidos}
            cargando={cargando}
            estadoAPI={estadoAPI}
          />
        )}
        {quinielaActiva==="amigos" && (
          <Quiniela
            id="amigos"
            nombre="👥 QUINIELA AMIGOS"
            color="#22d3ee"
            partidos={partidos}
            cargando={cargando}
            estadoAPI={estadoAPI}
          />
        )}
      </main>

      <footer style={{textAlign:"center",padding:12,fontSize:11,color:"#334155",borderTop:"1px solid #1e3a5f",marginTop:20}}>
        ⚽ Quiniela Mundial 2026 · Datos: API-Football · Auto-refresh cada 5 min
      </footer>
    </div>
  );
}

// ─── Card Partido ─────────────────────────────────────────────────────────────
function CP({ p, duenos, reglas, vivo, proximo }) {
  const local=p.teams?.home?.name, visita=p.teams?.away?.name;
  const dL=duenos[local], dV=duenos[visita];
  const faseStr=faseLabel(p.league?.round);
  const fecha=p.fixture?.date?new Date(p.fixture.date).toLocaleDateString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  const min=p.fixture?.status?.elapsed;
  const terminado=FINAL.includes(p.fixture?.status?.short);
  const rL=terminado?calcPuntos(p,local,reglas):null;
  const rV=terminado?calcPuntos(p,visita,reglas):null;
  const evs=p.events||[];
  const gL=evs.filter(e=>e.type==="Goal"&&e.team?.name===local);
  const gV=evs.filter(e=>e.type==="Goal"&&e.team?.name===visita);
  const tL=evs.filter(e=>e.type==="Card"&&e.team?.name===local);
  const tV=evs.filter(e=>e.type==="Card"&&e.team?.name===visita);
  return(
    <div style={{...S.cardP,...(vivo?{border:"1px solid #ef4444",boxShadow:"0 0 12px rgba(239,68,68,0.2)"}:{})}}>
      <div style={S.metaP}>
        <span style={S.bF}>{faseStr}</span>
        {p.league?.round&&<span style={S.bR}>{p.league.round}</span>}
        <span style={{fontSize:11,color:"#475569",marginLeft:"auto"}}>{fecha}</span>
        {p.fixture?.venue?.city&&<span style={{fontSize:11,color:"#475569"}}>📍{p.fixture.venue.city}</span>}
        {vivo&&min&&<span style={{background:"rgba(239,68,68,0.25)",border:"1px solid #ef4444",borderRadius:4,padding:"1px 6px",fontSize:10,color:"#f87171",fontWeight:700}}>⏱{min}'</span>}
      </div>
      <div style={S.filaP}>
        <div style={S.ladoP}><span style={{fontSize:22}}>{fl(local)}</span><div><div style={{fontSize:13,fontWeight:700}}>{local}</div>{dL&&<div style={{fontSize:11,color:"#94a3b8"}}>{dL}</div>}</div></div>
        <div style={S.marc}>
          {proximo?<span style={{fontSize:13,fontWeight:800,color:"#475569",letterSpacing:2}}>VS</span>
            :<><span style={{fontSize:24,fontWeight:900}}>{p.goals?.home??"-"}</span><span style={{fontSize:14,color:"#475569",margin:"0 2px"}}>–</span><span style={{fontSize:24,fontWeight:900}}>{p.goals?.away??"-"}</span></>}
        </div>
        <div style={{...S.ladoP,justifyContent:"flex-end"}}><div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:700}}>{visita}</div>{dV&&<div style={{fontSize:11,color:"#94a3b8"}}>{dV}</div>}</div><span style={{fontSize:22}}>{fl(visita)}</span></div>
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
      {terminado&&(rL||rV)&&(
        <div style={{display:"flex",gap:8,padding:"4px 12px 10px",flexWrap:"wrap"}}>
          {rL&&dL&&<span style={{fontSize:12,fontWeight:700,color:rL.pt>=0?"#4ade80":"#f87171"}}>{dL}: {rL.pt>0?"+":""}{rL.pt} pts</span>}
          {rV&&dV&&<span style={{fontSize:12,fontWeight:700,color:rV.pt>=0?"#4ade80":"#f87171"}}>{dV}: {rV.pt>0?"+":""}{rV.pt} pts</span>}
        </div>
      )}
    </div>
  );
}

function H2({children,style}){return <h2 style={{...S.h2,...style}}>{children}</h2>;}
function Pista({children}){return <p style={{color:"#64748b",fontSize:13,marginBottom:12}}>{children}</p>;}

// ─── Estilos ──────────────────────────────────────────────────────────────────
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
  selectorBar:{display:"flex",gap:8,padding:"8px 16px",borderTop:"1px solid #1e3a5f"},
  selectorBtn:{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid #1e3a5f",borderRadius:10,color:"#64748b",padding:"8px 12px",cursor:"pointer",fontSize:13,fontWeight:700,textAlign:"center",transition:"all 0.15s"},
  selectorBtnA:{fontWeight:900},
  main:{padding:16,maxWidth:960,margin:"0 auto"},
  h2:{fontSize:16,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#f59e0b",marginBottom:10,marginTop:4,borderLeft:"4px solid #ef4444",paddingLeft:8},
  infoBox:{background:"rgba(59,130,246,0.1)",border:"1px solid #3b82f6",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#93c5fd",fontSize:13,lineHeight:1.6},
  // quiniela wrap
  quinielaWrap:{background:"#0a1628",border:"1px solid",borderRadius:14,overflow:"hidden",marginBottom:16},
  quinielaHdr:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:"1px solid"},
  subTabs:{display:"flex",overflowX:"auto",background:"rgba(0,0,0,0.2)",borderBottom:"1px solid #1e3a5f"},
  subTab:{background:"transparent",border:"none",color:"#64748b",padding:"8px 10px",cursor:"pointer",fontSize:11,fontWeight:700,borderBottom:"2px solid transparent",whiteSpace:"nowrap"},
  subTabA:{},
  quinielaBody:{padding:14},
  // tabla
  cardD:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:10,padding:"10px 14px"},
  bigPts:{fontSize:32,fontWeight:900,lineHeight:1},
  chips:{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"},
  chip:{fontSize:11,color:"#94a3b8"},
  eqChips:{display:"flex",flexWrap:"wrap",gap:3,marginTop:6},
  eqC:{background:"rgba(255,255,255,0.06)",borderRadius:20,padding:"1px 7px",fontSize:10,color:"#cbd5e1"},
  tblD:{background:"#0f172a",borderRadius:8,border:"1px solid #1e3a5f",overflow:"hidden"},
  fD:{display:"grid",gridTemplateColumns:"1fr 1.2fr 1.2fr 0.6fr 0.3fr 0.3fr 0.4fr",padding:"5px 10px",gap:3,borderBottom:"1px solid rgba(255,255,255,0.04)"},
  hD:{fontSize:9,color:"#475569",fontWeight:700,textTransform:"uppercase"},
  cD:{fontSize:10,color:"#94a3b8"},
  filtros:{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12},
  btnF:{background:"rgba(255,255,255,0.05)",border:"1px solid #1e3a5f",borderRadius:5,color:"#64748b",padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700},
  btnFA:{},
  cardP:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:10,marginBottom:8,overflow:"hidden"},
  metaP:{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",padding:"5px 10px",background:"rgba(0,0,0,0.3)",borderBottom:"1px solid rgba(255,255,255,0.05)"},
  bF:{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",borderRadius:3,padding:"1px 5px",fontSize:8,color:"#f59e0b",fontWeight:700,textTransform:"uppercase"},
  bR:{background:"rgba(99,102,241,0.15)",border:"1px solid #6366f1",borderRadius:3,padding:"1px 5px",fontSize:8,color:"#a5b4fc"},
  filaP:{display:"flex",alignItems:"center",padding:"10px 12px",gap:6},
  ladoP:{flex:1,display:"flex",alignItems:"center",gap:6},
  marc:{display:"flex",alignItems:"center",gap:3,minWidth:80,justifyContent:"center",background:"rgba(0,0,0,0.4)",borderRadius:7,padding:"6px 10px",border:"1px solid #1e3a5f"},
  listaEq:{background:"#0f172a",borderRadius:8,border:"1px solid #1e3a5f",overflow:"hidden"},
  filaEq:{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:"1px solid rgba(255,255,255,0.05)"},
  inputD:{background:"rgba(255,255,255,0.08)",border:"1px solid #334155",borderRadius:5,color:"#e2e8f0",padding:"3px 8px",fontSize:12,width:140,outline:"none"},
  badgeD:{fontSize:12,fontWeight:700,borderRadius:5,padding:"2px 8px",minWidth:80,textAlign:"center"},
  btnEdit:{border:"none",borderRadius:7,color:"#fff",padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700},
  gridReglas:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6,marginBottom:12},
  cardRegla:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"},
};
