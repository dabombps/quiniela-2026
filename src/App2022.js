import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// QUINIELA MUNDIAL 2022 — Verificación contra Excel original
// ─────────────────────────────────────────────────────────────────────────────
const WORKER_URL = "https://quiniela-proxy.dabombps.workers.dev";
const API_KEY    = "f511995177592a89c2c38930218b64ba";
const LEAGUE_ID  = 1;
const SEASON     = 2022;
const CACHE_MS   = 10 * 60 * 1000;

// ─── Reglas (exactas del Excel) ───────────────────────────────────────────────
const REGLAS = {
  ganado: 5, empate: 2, perdido: 0,
  amarilla: -1, roja: -5, difGoles: 1,
  primeroGrupo: 7, segundoGrupo: 4,
  eliminatoria: 10,
  fairPlay: 10, goleoPortero: 3, campeonGoleo: 5,
};

// ─── Dueños del Excel (Hoja 5) ────────────────────────────────────────────────
// Nombres en español → inglés para matchear con API-Football
const DUENOS_EXCEL = {
  // Buka
  "Argentina":       "Buka",
  "Denmark":         "Buka",
  "Korea Republic":  "Buka",
  "Wales":           "Buka",
  "Iran":            "Buka",
  // Oralia
  "Belgium":         "Oralia",
  "Croatia":         "Oralia",
  "Tunisia":         "Oralia",
  "Canada":          "Oralia",
  "Switzerland":     "Oralia",
  // Melo
  "Portugal":        "Melo",
  "Uruguay":         "Melo",
  "Japan":           "Melo",
  "Costa Rica":      "Melo",
  "Ghana":           "Melo",
  // Carlos
  "Spain":           "Carlos",
  "Germany":         "Carlos",
  "Poland":          "Carlos",
  "Australia":       "Carlos",
  "Senegal":         "Carlos",
  // Rodrigo
  "Brazil":          "Rodrigo",
  "United States":   "Rodrigo",
  "Serbia":          "Rodrigo",
  "Ecuador":         "Rodrigo",
  "Saudi Arabia":    "Rodrigo",
  // Marioly
  "England":         "Marioly",
  "Netherlands":     "Marioly",
  "Morocco":         "Marioly",
  "Cameroon":        "Marioly",
  "France":          "Marioly",
};

// ─── Bonos especiales del Excel ───────────────────────────────────────────────
const BONOS_ESPECIALES = [
  { desc: "FIFA Fair Play",     equipo: "England",   dueno: "Marioly", pts: 10 },
  { desc: "Campeón Goleo",      equipo: "France",    dueno: "Marioly", pts: 5  },
  { desc: "Mejor Portero",      equipo: "Argentina", dueno: "Buka",    pts: 3  },
];

// ─── Resultados finales del Excel para comparar ───────────────────────────────
const TOTALES_EXCEL = {
  "Marioly": null, // lo calcularemos
  "Buka":    null,
  "Melo":    null,
  "Carlos":  null,
  "Rodrigo": null,
  "Oralia":  null,
};

// ─── Banderas ─────────────────────────────────────────────────────────────────
const FL = {
  "Qatar":"🇶🇦","Ecuador":"🇪🇨","Senegal":"🇸🇳","Netherlands":"🇳🇱","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Iran":"🇮🇷","United States":"🇺🇸","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Argentina":"🇦🇷","Saudi Arabia":"🇸🇦",
  "Denmark":"🇩🇰","Tunisia":"🇹🇳","Mexico":"🇲🇽","Poland":"🇵🇱","France":"🇫🇷",
  "Australia":"🇦🇺","Morocco":"🇲🇦","Croatia":"🇭🇷","Germany":"🇩🇪","Japan":"🇯🇵",
  "Spain":"🇪🇸","Costa Rica":"🇨🇷","Belgium":"🇧🇪","Canada":"🇨🇦","Switzerland":"🇨🇭",
  "Cameroon":"🇨🇲","Uruguay":"🇺🇾","Korea Republic":"🇰🇷","Portugal":"🇵🇹","Ghana":"🇬🇭",
  "Brazil":"🇧🇷","Serbia":"🇷🇸",
};
const fl = n => FL[n] || "🏳️";

const FINAL   = ["FT","AET","PEN","AWD","WO"];
const VIVO    = ["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"];

const faseLabel = r => {
  if (!r) return ""; const l = r.toLowerCase();
  if (l.includes("group")) return "Fase de Grupos";
  if (l.includes("16")) return "Octavos";
  if (l.includes("quarter")) return "Cuartos";
  if (l.includes("semi")) return "Semifinal";
  if (l.includes("third")||l.includes("3rd")) return "3er Lugar";
  if (l.includes("final")) return "Final";
  return r;
};
const esKO = r => {
  if (!r) return false; const l = r.toLowerCase();
  return l.includes("16")||l.includes("quarter")||l.includes("semi")||
         l.includes("final")||l.includes("third")||l.includes("3rd");
};

const LD = (k,d) => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; }};
const LS = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── Cálculo puntos ───────────────────────────────────────────────────────────
function calcPuntos(p, eq) {
  const esL = p.teams?.home?.name===eq, esV = p.teams?.away?.name===eq;
  if (!esL&&!esV) return null;
  if (p.goals?.home==null||p.goals?.away==null) return null;
  const mg=esL?p.goals.home:p.goals.away, sg=esL?p.goals.away:p.goals.home, diff=mg-sg;
  const ko=esKO(p.league?.round);
  let pt = diff>0?(ko?REGLAS.eliminatoria:REGLAS.ganado):diff===0?(ko?0:REGLAS.empate):REGLAS.perdido;
  if (diff>0&&!ko) pt += diff*REGLAS.difGoles;
  const evs=(p.events||[]).filter(e=>e.team?.name===(esL?p.teams.home.name:p.teams.away.name));
  const am=evs.filter(e=>e.type==="Card"&&e.detail==="Yellow Card").length;
  const ro=evs.filter(e=>e.type==="Card"&&(e.detail==="Red Card"||e.detail==="Second Yellow card")).length;
  pt += am*REGLAS.amarilla + ro*REGLAS.roja;
  return { pt, mg, sg, diff, ko, am, ro, esL };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [partidos, setPartidos] = useState(()=>LD("q22_data",[]));
  const [cargando, setCargando] = useState(false);
  const [estadoAPI, setEstadoAPI] = useState("idle");
  const [ultimaAct, setUltimaAct] = useState(null);
  const [tab, setTab] = useState("tabla");
  const [filtroFase, setFiltroFase] = useState("TODOS");
  const [reqRestantes, setReqRestantes] = useState(null);
  const timerRef = useRef(null);

  const fetchPartidos = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LD("q22_ts",0);
    if (!forzar&&partidos.length>0&&(ahora-ts)<CACHE_MS) return;
    setCargando(true); setEstadoAPI("loading");
    try {
      const res = await fetch(
        `${WORKER_URL}/proxy/fixtures?league=${LEAGUE_ID}&season=${SEASON}`,
        { headers: {"x-api-key": API_KEY} }
      );
      const rem = res.headers.get("x-ratelimit-requests-remaining");
      if (rem) setReqRestantes(rem);
      const data = await res.json();
      if (data.errors&&Object.keys(data.errors).length>0) throw new Error(Object.values(data.errors)[0]);
      const lista = data.response||[];
      LS("q22_data",lista); LS("q22_ts",Date.now());
      setPartidos(lista); setUltimaAct(new Date()); setEstadoAPI("ok");
    } catch(e) {
      setEstadoAPI("error");
      console.error(e);
    } finally { setCargando(false); }
  }, [partidos.length]);

  useEffect(()=>{ fetchPartidos(); },[]);
  useEffect(()=>{
    timerRef.current = setInterval(()=>fetchPartidos(), CACHE_MS);
    return ()=>clearInterval(timerRef.current);
  },[fetchPartidos]);

  // ── Calcular stats por dueño ──────────────────────────────────────────────
  const duenos = DUENOS_EXCEL;
  const eqPorD = {};
  Object.entries(duenos).forEach(([eq,d])=>{ if(!eqPorD[d])eqPorD[d]=[]; eqPorD[d].push(eq); });

  const statsD = {};
  Object.keys(eqPorD).forEach(d=>{ statsD[d]={pt:0,g:0,e:0,p_:0,gl:0,am:0,ro:0,det:[]}; });

  const jugados = partidos.filter(p=>FINAL.includes(p.fixture?.status?.short));

  jugados.forEach(par=>{
    [par.teams?.home?.name,par.teams?.away?.name].forEach(eq=>{
      const d=duenos[eq]; if(!d||!statsD[d]) return;
      const r=calcPuntos(par,eq); if(!r) return;
      const s=statsD[d];
      s.pt+=r.pt; if(r.diff>0)s.g++;else if(r.diff===0&&!r.ko)s.e++;else s.p_++;
      s.gl+=r.mg; s.am+=r.am; s.ro+=r.ro; s.det.push({par,eq,r});
    });
  });

  // Agregar bonos especiales
  BONOS_ESPECIALES.forEach(b=>{
    if (statsD[b.dueno]) statsD[b.dueno].pt += b.pts;
  });

  const tabla = Object.entries(statsD)
    .sort((a,b)=>b[1].pt-a[1].pt)
    .map(([d,s],i)=>({pos:i+1,d,...s}));

  const fases = ["TODOS",...new Set(jugados.map(p=>faseLabel(p.league?.round)).filter(Boolean))];
  const jugFilt = filtroFase==="TODOS" ? jugados : jugados.filter(p=>faseLabel(p.league?.round)===filtroFase);
  const med = p => p===1?"🥇":p===2?"🥈":p===3?"🥉":`${p}.`;

  const TABS = [
    {id:"tabla",   lbl:"🏆 Tabla"},
    {id:"partidos",lbl:`📅 Partidos (${jugados.length})`},
    {id:"equipos", lbl:"⚽ Equipos"},
    {id:"bonos",   lbl:"🎖 Bonos"},
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
            <span style={{background:"rgba(234,179,8,0.2)",border:"1px solid #ca8a04",borderRadius:20,padding:"2px 10px",fontSize:11,color:"#fbbf24",fontWeight:700}}>
              🔍 MODO VERIFICACIÓN
            </span>
            {reqRestantes && <span style={{fontSize:11,color:"#64748b"}}>API: {reqRestantes} req</span>}
            {ultimaAct && <span style={{fontSize:11,color:"#64748b"}}>🔄 {ultimaAct.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>}
            <span style={{fontSize:11,color:estadoAPI==="ok"?"#4ade80":estadoAPI==="error"?"#f87171":"#64748b"}}>
              {cargando?"⏳":estadoAPI==="ok"?`✅ ${jugados.length} partidos`:"❌ Error"}
            </span>
            <button onClick={()=>fetchPartidos(true)} disabled={cargando} style={S.btnAct}>
              {cargando?"...":"↺"}
            </button>
          </div>
        </div>
        <nav style={S.tabs}>
          {TABS.map(t=>(
            <button key={t.id} style={{...S.tab,...(tab===t.id?S.tabA:{})}} onClick={()=>setTab(t.id)}>
              {t.lbl}
            </button>
          ))}
        </nav>
      </header>

      <main style={S.main}>
        {estadoAPI==="error" && (
          <div style={S.errBox}>❌ Error conectando con la API. Verifica que el Worker de Cloudflare esté activo.</div>
        )}
        {estadoAPI==="loading" && partidos.length===0 && (
          <div style={S.infoBox}>⏳ Cargando partidos del Mundial 2022 desde API-Football...</div>
        )}

        {/* ══ TABLA ══ */}
        {tab==="tabla" && (
          <div>
            <H2>Tabla de Posiciones</H2>
            <div style={S.infoBox}>
              💡 Compara estos resultados con tu Excel original. Los puntos incluyen partidos de grupo,
              eliminatorias, tarjetas y los bonos especiales (Fair Play, Goleo, Portero).
            </div>

            {jugados.length===0 && estadoAPI==="ok" && (
              <div style={S.errBox}>⚠️ La API no devolvió partidos para 2022. Verifica que el Worker esté activo.</div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {tabla.map(row=>(
                <div key={row.d} style={{...S.cardD,...(row.pos===1?{border:"1px solid #f59e0b"}:row.pos===2?{border:"1px solid #94a3b8"}:row.pos===3?{border:"1px solid #b45309"}:{})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:22}}>{med(row.pos)}</div>
                      <div style={{fontSize:20,fontWeight:900}}>{row.d}</div>
                      <div style={S.bigPts}>{row.pt}<span style={{fontSize:13,fontWeight:400,marginLeft:4}}>pts</span></div>
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
                      <div style={{fontSize:11,color:"#475569",marginBottom:4}}>Equipos</div>
                      {(eqPorD[row.d]||[]).map(eq=>(
                        <div key={eq} style={{fontSize:12,color:"#94a3b8"}}>{fl(eq)} {eq}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desglose */}
            {tabla.length > 0 && (
              <>
                <H2 style={{marginTop:24}}>Desglose por Partido</H2>
                <div style={S.tblD}>
                  <div style={S.fD}>{["Dueño","Equipo","Rival","Marcador","Fase","🟨","🟥","Pts"].map(h=><span key={h} style={S.hD}>{h}</span>)}</div>
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
        {tab==="partidos" && (
          <div>
            <H2>Partidos ({jugados.length})</H2>
            <div style={S.filtros}>
              {fases.map(f=>(
                <button key={f} style={{...S.btnF,...(filtroFase===f?S.btnFA:{})}} onClick={()=>setFiltroFase(f)}>{f}</button>
              ))}
            </div>
            {jugFilt.length===0
              ? <p style={{color:"#64748b",fontSize:13}}>Sin partidos en esta fase.</p>
              : jugFilt.slice().reverse().map(p=><CP key={p.fixture.id} p={p} duenos={duenos}/>)
            }
          </div>
        )}

        {/* ══ EQUIPOS ══ */}
        {tab==="equipos" && (
          <div>
            <H2>Equipos por Participante</H2>
            <p style={{color:"#64748b",fontSize:13,marginBottom:12}}>
              Asignación original del Excel — 5 equipos por participante.
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
              {Object.entries(eqPorD).map(([d,eqs])=>(
                <div key={d} style={{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,padding:12}}>
                  <div style={{fontSize:16,fontWeight:900,color:"#f59e0b",marginBottom:8}}>{d}</div>
                  {eqs.map(eq=>(
                    <div key={eq} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                      <span style={{fontSize:20}}>{fl(eq)}</span>
                      <span style={{fontSize:13,flex:1}}>{eq}</span>
                      <span style={{fontSize:11,color:"#64748b"}}>
                        {statsD[d]?.det.filter(x=>x.eq===eq).length || 0} partidos
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ BONOS ══ */}
        {tab==="bonos" && (
          <div>
            <H2>Bonos Especiales</H2>
            <p style={{color:"#64748b",fontSize:13,marginBottom:12}}>
              Estos bonos se tomaron directamente del Excel original.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {BONOS_ESPECIALES.map((b,i)=>(
                <div key={i} style={{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:700}}>{b.desc}</div>
                    <div style={{fontSize:13,color:"#94a3b8",marginTop:2}}>{fl(b.equipo)} {b.equipo} → <strong style={{color:"#f59e0b"}}>{b.dueno}</strong></div>
                  </div>
                  <div style={{fontSize:24,fontWeight:900,color:"#4ade80"}}>+{b.pts} pts</div>
                </div>
              ))}
            </div>

            <H2 style={{marginTop:24}}>Resumen de Puntos</H2>
            <div style={S.tblD}>
              <div style={{...S.fD, gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr"}}>
                {["Jugador","Pts Partidos","Pts Bonos","TOTAL APP",""].map(h=><span key={h} style={S.hD}>{h}</span>)}
              </div>
              {tabla.map((row,i)=>{
                const bonosD = BONOS_ESPECIALES.filter(b=>b.dueno===row.d).reduce((s,b)=>s+b.pts,0);
                const ptsPartidos = row.pt - bonosD;
                return(
                  <div key={row.d} style={{...S.fD,gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",background:i%2===0?"rgba(255,255,255,0.03)":"transparent"}}>
                    <span style={{...S.cD,fontWeight:700,color:"#e2e8f0"}}>{row.d}</span>
                    <span style={{...S.cD,color:"#94a3b8"}}>{ptsPartidos}</span>
                    <span style={{...S.cD,color:"#4ade80"}}>+{bonosD}</span>
                    <span style={{...S.cD,fontWeight:900,color:"#f59e0b",fontSize:14}}>{row.pt}</span>
                    <span style={{...S.cD,fontSize:16}}>{row.pos===1?"🥇":row.pos===2?"🥈":row.pos===3?"🥉":""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer style={{textAlign:"center",padding:12,fontSize:11,color:"#334155",borderTop:"1px solid #1e3a5f",marginTop:20}}>
        ⚽ Quiniela Qatar 2022 · Datos: API-Football · Verificación vs Excel original
      </footer>
    </div>
  );
}

// ─── Card Partido ─────────────────────────────────────────────────────────────
function CP({ p, duenos }) {
  const local=p.teams?.home?.name, visita=p.teams?.away?.name;
  const dL=duenos[local], dV=duenos[visita];
  const faseStr=faseLabel(p.league?.round);
  const fecha=p.fixture?.date?new Date(p.fixture.date).toLocaleDateString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  const rL=calcPuntos(p,local), rV=calcPuntos(p,visita);
  const evs=p.events||[];
  const gL=evs.filter(e=>e.type==="Goal"&&e.team?.name===local);
  const gV=evs.filter(e=>e.type==="Goal"&&e.team?.name===visita);
  const tL=evs.filter(e=>e.type==="Card"&&e.team?.name===local);
  const tV=evs.filter(e=>e.type==="Card"&&e.team?.name===visita);
  return(
    <div style={S.cardP}>
      <div style={S.metaP}>
        <span style={S.bF}>{faseStr}</span>
        {p.league?.round&&<span style={S.bR}>{p.league.round}</span>}
        <span style={{fontSize:11,color:"#475569",marginLeft:"auto"}}>{fecha}</span>
        {p.fixture?.venue?.city&&<span style={{fontSize:11,color:"#475569"}}>📍{p.fixture.venue.city}</span>}
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

const S = {
  root:{minHeight:"100vh",background:"linear-gradient(160deg,#060d1a,#0a1628,#0d1f3a)",color:"#e2e8f0",fontFamily:"'Barlow Condensed','Oswald','Arial Narrow',sans-serif",fontSize:15},
  hdr:{background:"linear-gradient(180deg,#071020,#0a1628)",borderBottom:"2px solid #1e3a5f",position:"sticky",top:0,zIndex:100,boxShadow:"0 6px 24px rgba(0,0,0,0.6)"},
  hdrTop:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",flexWrap:"wrap",gap:8},
  logo:{display:"flex",alignItems:"center",gap:10},
  logoT:{fontSize:24,fontWeight:900,letterSpacing:4,background:"linear-gradient(90deg,#f59e0b,#ef4444)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  logoS:{fontSize:10,color:"#475569",letterSpacing:2},
  hdrR:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"},
  btnAct:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:6,color:"#fff",padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:700},
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
  fD:{display:"grid",gridTemplateColumns:"1fr 1.2fr 1.2fr 0.5fr 0.9fr 0.3fr 0.3fr 0.4fr",padding:"5px 10px",gap:3,borderBottom:"1px solid rgba(255,255,255,0.04)"},
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
};
