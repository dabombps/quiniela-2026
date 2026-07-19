import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// QUINIELA MUNDIAL 2026 — USA/México/Canadá
// ─────────────────────────────────────────────────────────────────────────────
const WORKER_URL = "https://quiniela-proxy.dabombps.workers.dev";
const LEAGUE_ID  = 1;
const SEASON     = 2026;
const ADMIN_PASS = "Contraseña";

// Config se pasa como prop (ver index.js router)
const QUINIELA_CONFIGS = {
  familia: { label:"FAM. VÁZQUEZ",  color:"#f59e0b", participantes:6, eqPorPersona:8  },
  amigos:  { label:"AMIGOS",   color:"#3b82f6", participantes:8, eqPorPersona:6  },
  test:    { label:"TEST",     color:"#a855f7", participantes:2, eqPorPersona:4  },
};

const CACHE_FIXTURES_MS  = 30 * 1000; // 30 seg — sincronizado con Worker TTL
const CACHE_EVENTS_MS    = 24 * 60 * 60 * 1000; // 24h — eventos no cambian
const CACHE_STANDINGS_MS = 30 * 1000; // 30 seg — sincronizado con Worker TTL

// ─── Reglas (mismas que 2022) ─────────────────────────────────────────────────
const REGLAS_DEFAULT = {
  ganado:5, empate:2, perdido:0,
  amarilla:-1, roja:-5, difGoles:1,
  primeroGrupo:7, segundoGrupo:4,
  eliminatoria:10,
  fairPlay:10, portero:3, goleo:5,
};

// ─── Asignaciones Quiniela Amigos (pendiente — se asignan desde Admin) ───────
const DUENOS_AMIGOS_DEFAULT = {
  "Uzbekistan":"Ruben","Tunisia":"Ruben","Canada":"Ruben","Uruguay":"Ruben","Japan":"Ruben","Brazil":"Ruben",
  "Curaçao":"Bolas","Ghana":"Bolas","Ivory Coast":"Bolas","Senegal":"Bolas","United States":"Bolas","England":"Bolas",
  "Jordan":"Chikilín","New Zealand":"Chikilín","Scotland":"Chikilín","Turkey":"Chikilín","Norway":"Chikilín","Netherlands":"Chikilín",
  "Panama":"Foca","Australia":"Foca","Algeria":"Foca","Austria":"Foca","Belgium":"Foca","Argentina":"Foca",
  "Iraq":"Manu","Saudi Arabia":"Manu","Korea Republic":"Manu","Sweden":"Manu","Mexico":"Manu","France":"Manu",
  "Qatar":"Novoa","South Africa":"Novoa","Czechia":"Novoa","Croatia":"Novoa","Ecuador":"Novoa","Portugal":"Novoa",
  "Haiti":"Gabrich","DR Congo":"Gabrich","Egypt":"Gabrich","Paraguay":"Gabrich","Colombia":"Gabrich","Germany":"Gabrich",
  "Cape Verde":"Rodrigo","Iran":"Rodrigo","Bosnia":"Rodrigo","Switzerland":"Rodrigo","Morocco":"Rodrigo","Spain":"Rodrigo",
};

// ─── Asignaciones Quiniela Familia (precargadas) ─────────────────────────────
const DUENOS_FAMILIA_DEFAULT = {
  "Curaçao":"Leo","Saudi Arabia":"Leo","Tunisia":"Leo","Egypt":"Leo",
  "Senegal":"Leo","Japan":"Leo","Belgium":"Leo","Argentina":"Leo",
  "Iraq":"Carlos","New Zealand":"Carlos","Algeria":"Carlos","Czechia":"Carlos",
  "Turkey":"Carlos","United States":"Carlos","Germany":"Carlos","Brazil":"Carlos",
  "Cape Verde":"Marioly","South Africa":"Marioly","Iran":"Marioly","Bosnia":"Marioly",
  "Austria":"Marioly","Switzerland":"Marioly","Norway":"Marioly","France":"Marioly",
  "Uzbekistan":"Rodrigo","Qatar":"Rodrigo","Australia":"Rodrigo","Canada":"Rodrigo",
  "Croatia":"Rodrigo","Ecuador":"Rodrigo","Colombia":"Rodrigo","England":"Rodrigo",
  "Jordan":"Melo","Panama":"Melo","Korea Republic":"Melo","Scotland":"Melo",
  "Sweden":"Melo","Uruguay":"Melo","Netherlands":"Melo","Portugal":"Melo",
  "Haiti":"Oralia","DR Congo":"Oralia","Ghana":"Oralia","Ivory Coast":"Oralia",
  "Paraguay":"Oralia","Mexico":"Oralia","Morocco":"Oralia","Spain":"Oralia",
};

// ─── Equipos 2026 ─────────────────────────────────────────────────────────────
// Los 48 países clasificados al Mundial 2026
const EQUIPOS_2026 = [
  // CONCACAF (incluye hosts con clasificación automática)
  "United States","Mexico","Canada",
  "Honduras","Panama","Costa Rica","Jamaica","El Salvador",
  // CONMEBOL
  "Argentina","Brazil","Colombia","Uruguay","Ecuador","Venezuela","Bolivia","Chile","Paraguay","Peru",
  // UEFA
  "Spain","France","England","Germany","Portugal","Netherlands","Italy","Belgium",
  "Croatia","Switzerland","Austria","Denmark","Sweden","Poland","Serbia","Turkey",
  "Hungary","Scotland","Romania","Slovakia","Slovenia","Czechia","Albania","Ukraine","Georgia",
  // AFC
  "Japan","South Korea","Saudi Arabia","Iran","Australia","Qatar","Uzbekistan","Jordan","Iraq","Indonesia","Oman",
  // CAF
  "Morocco","Senegal","Nigeria","Egypt","South Africa","Ivory Coast","Cameroon","DR Congo","Ghana","Tunisia","Mali","Algeria",
  // OFC
  "New Zealand",
];

// Nombres en español
const EQUIPOS_ES = {
  "United States":"EE.UU.","Mexico":"México","Canada":"Canadá",
  "Honduras":"Honduras","Panama":"Panamá","Costa Rica":"Costa Rica",
  "Jamaica":"Jamaica","El Salvador":"El Salvador",
  "Argentina":"Argentina","Brazil":"Brasil","Colombia":"Colombia",
  "Uruguay":"Uruguay","Ecuador":"Ecuador","Venezuela":"Venezuela",
  "Bolivia":"Bolivia","Chile":"Chile","Paraguay":"Paraguay","Peru":"Perú",
  "Spain":"España","France":"Francia","England":"Inglaterra",
  "Germany":"Alemania","Portugal":"Portugal","Netherlands":"Países Bajos",
  "Italy":"Italia","Belgium":"Bélgica","Croatia":"Croacia",
  "Switzerland":"Suiza","Austria":"Austria","Denmark":"Dinamarca",
  "Sweden":"Suecia","Poland":"Polonia","Serbia":"Serbia","Turkey":"Turquía",
  "Hungary":"Hungría","Scotland":"Escocia","Romania":"Rumanía",
  "Slovakia":"Eslovaquia","Slovenia":"Eslovenia","Czechia":"Chequia",
  "Albania":"Albania","Ukraine":"Ucrania","Georgia":"Georgia",
  "Japan":"Japón","South Korea":"Corea del Sur","Saudi Arabia":"Arabia Saudita",
  "Iran":"Irán","Australia":"Australia","Qatar":"Qatar",
  "Uzbekistan":"Uzbekistán","Jordan":"Jordania","Iraq":"Irak",
  "Indonesia":"Indonesia","Oman":"Omán",
  "Morocco":"Marruecos","Senegal":"Senegal","Nigeria":"Nigeria",
  "Egypt":"Egipto","South Africa":"Sudáfrica","Ivory Coast":"Costa de Marfil",
  "Cameroon":"Camerún","DR Congo":"R.D. Congo","Ghana":"Ghana",
  "Tunisia":"Túnez","Mali":"Mali","Algeria":"Argelia",
  "New Zealand":"Nueva Zelanda","Curaçao":"Curaçao","Cape Verde":"Cabo Verde","Haiti":"Haití","DR Congo":"R.D. Congo","Bosnia":"Bosnia y Herz.","Norway":"Noruega","Sweden":"Suecia",
  // Aliases que puede usar la API
  "USA":"EE.UU.","Korea Republic":"Corea del Sur","Côte d'Ivoire":"Costa de Marfil",
  "Wales":"Gales","Iran":"Irán","Senegal":"Senegal",
};
const esp = n => EQUIPOS_ES[n] || n;

// ─── Banderas ─────────────────────────────────────────────────────────────────
const FL = {
  "United States":"🇺🇸","USA":"🇺🇸","Mexico":"🇲🇽","Canada":"🇨🇦",
  "Honduras":"🇭🇳","Panama":"🇵🇦","Costa Rica":"🇨🇷","Jamaica":"🇯🇲","El Salvador":"🇸🇻",
  "Argentina":"🇦🇷","Brazil":"🇧🇷","Colombia":"🇨🇴","Uruguay":"🇺🇾","Ecuador":"🇪🇨",
  "Venezuela":"🇻🇪","Bolivia":"🇧🇴","Chile":"🇨🇱","Paraguay":"🇵🇾","Peru":"🇵🇪",
  "Spain":"🇪🇸","France":"🇫🇷","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Germany":"🇩🇪","Portugal":"🇵🇹",
  "Netherlands":"🇳🇱","Italy":"🇮🇹","Belgium":"🇧🇪","Croatia":"🇭🇷","Switzerland":"🇨🇭",
  "Austria":"🇦🇹","Denmark":"🇩🇰","Sweden":"🇸🇪","Poland":"🇵🇱","Serbia":"🇷🇸",
  "Turkey":"🇹🇷","Hungary":"🇭🇺","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Romania":"🇷🇴","Slovakia":"🇸🇰",
  "Slovenia":"🇸🇮","Czechia":"🇨🇿","Albania":"🇦🇱","Ukraine":"🇺🇦","Georgia":"🇬🇪",
  "Japan":"🇯🇵","South Korea":"🇰🇷","Korea Republic":"🇰🇷","Saudi Arabia":"🇸🇦",
  "Iran":"🇮🇷","Australia":"🇦🇺","Qatar":"🇶🇦","Uzbekistan":"🇺🇿","Jordan":"🇯🇴",
  "Iraq":"🇮🇶","Indonesia":"🇮🇩","Oman":"🇴🇲",
  "Morocco":"🇲🇦","Senegal":"🇸🇳","Nigeria":"🇳🇬","Egypt":"🇪🇬","South Africa":"🇿🇦",
  "Ivory Coast":"🇨🇮","Côte d'Ivoire":"🇨🇮","Cameroon":"🇨🇲","DR Congo":"🇨🇩",
  "Ghana":"🇬🇭","Tunisia":"🇹🇳","Mali":"🇲🇱","Algeria":"🇩🇿","New Zealand":"🇳🇿","Curaçao":"🇨🇼","Cape Verde":"🇨🇻","Haiti":"🇭🇹","DR Congo":"🇨🇩","Bosnia":"🇧🇦","Norway":"🇳🇴","Sweden":"🇸🇪",
  "Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};
const fl = n => FL[n] || "🏳️";

const FINAL   = ["FT","AET","PEN","AWD","WO"];
const VIVO    = ["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"];

const faseLabel = r => {
  if (!r) return ""; const l = r.toLowerCase();
  if (l.includes("group"))   return "Fase de Grupos";
  if (l.includes("32"))      return "Ronda de 32";
  if (l.includes("16"))      return "Octavos";
  if (l.includes("quarter")) return "Cuartos";
  if (l.includes("semi"))    return "Semifinal";
  if (l.includes("third")||l.includes("3rd")) return "3er Lugar";
  if (l.includes("final"))   return "Final";
  return r;
};
const esKO = r => {
  if (!r) return false; const l = r.toLowerCase();
  return l.includes("32")||l.includes("16")||l.includes("quarter")||
         l.includes("semi")||l.includes("final")||l.includes("third")||l.includes("3rd");
};

const LD  = (k,d) => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; }};
const LS  = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const LDT = k     => { try { return parseInt(localStorage.getItem(k+"_ts")||"0"); } catch { return 0; }};
const LST = k     => { try { localStorage.setItem(k+"_ts", String(Date.now())); } catch {} };

// ─── Cálculo puntos ───────────────────────────────────────────────────────────
// Normalize team names that API may return differently
function normalizeName(n) {
  const map = {"USA":"United States","South Korea":"Korea Republic","Ivory Coast":"Ivory Coast","Côte d'Ivoire":"Ivory Coast","IR Iran":"Iran","Korea DPR":"North Korea","Curacao":"Curaçao","Türkiye":"Turkey","Bosnia & Herzegovina":"Bosnia","Cape Verde Islands":"Cape Verde","Congo DR":"DR Congo","Czechia":"Czechia"};
  return map[n] || n;
}
function calcPuntos(p, eq, eventos, R) {
  const homeN = normalizeName(p.teams?.home?.name);
  const awayN = normalizeName(p.teams?.away?.name);
  const esL = homeN===eq, esV = awayN===eq;
  if (!esL&&!esV) return null;
  if (p.goals?.home==null||p.goals?.away==null) return null;
  const mg=esL?p.goals.home:p.goals.away, sg=esL?p.goals.away:p.goals.home, diff=mg-sg;
  const ko=esKO(p.league?.round);
  let pt;
  if (ko) {
    const ganador = esL ? p.teams?.home?.winner : p.teams?.away?.winner;
    pt = ganador===true ? R.eliminatoria : 0;
    if (ganador===true && diff>0) pt += diff*R.difGoles;
  } else {
    pt = diff>0 ? R.ganado : diff===0 ? R.empate : R.perdido;
    if (diff>0) pt += diff*R.difGoles;
  }
  const teamId = esL ? p.teams?.home?.id : p.teams?.away?.id;
  const teamName = esL ? p.teams?.home?.name : p.teams?.away?.name;
  const evs=(eventos[p.fixture?.id]||[])
    .filter(e=>e.team?.id===teamId || e.team?.name===teamName);
  const am=evs.filter(e=>e.type==="Card"&&e.detail==="Yellow Card").length;
  const ro=evs.filter(e=>e.type==="Card"&&(e.detail==="Red Card"||e.detail==="Second Yellow card"||e.detail==="Second Yellow Card"||e.detail==="Direct Red Card")).length;
  pt += am*R.amarilla + ro*R.roja;
  return { pt, mg, sg, diff, ko, am, ro, esL };
}

async function apiFetchWithCache(path) {
  const res = await fetch(`${WORKER_URL}/proxy${path}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length>0)
    throw new Error(Object.values(data.errors)[0]);
  return { data: data.response||[], cache: res.headers.get("X-Cache")||"MISS" };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App({ quinielaId = "familia" }) {
  const cfg = QUINIELA_CONFIGS[quinielaId] || QUINIELA_CONFIGS.familia;
  const QUINIELA_ID = quinielaId;
  const QUINIELA_LABEL = cfg.label;
  const QUINIELA_COLOR = cfg.color;
  const NUM_PARTICIPANTES = cfg.participantes;
  const EQ_POR_PERSONA = cfg.eqPorPersona;
  const KV_PREFIX = `q26_${QUINIELA_ID}`;

  const [partidos,  setPartidos]  = useState(()=>LD(`${KV_PREFIX}_fix`,[]));
  const [eventos,   setEventos]   = useState(()=>LD(`${KV_PREFIX}_evs`,{}));
  const [standings, setStandings] = useState(()=>LD(`${KV_PREFIX}_std`,{}));
  const [reglas,    setReglas]    = useState(()=>({...REGLAS_DEFAULT,...LD(`${KV_PREFIX}_reg`,{})}));
  const [bonos,     setBonos]     = useState(()=>({fairPlay:"",portero:"",goleo:"",...LD(`${KV_PREFIX}_bon`,{})}));
  const defaultDuenos = QUINIELA_ID === 'familia' ? DUENOS_FAMILIA_DEFAULT : QUINIELA_ID === 'amigos' ? DUENOS_AMIGOS_DEFAULT : {};
  const [duenos,    setDuenosState] = useState(()=>{ const saved=LD(`${KV_PREFIX}_due`,{}); const merged={...saved,...defaultDuenos}; return merged; });

  const [estado,    setEstado]    = useState({fixtures:"idle",eventos:"idle",standings:"idle"});
  const [ultimaAct, setUltimaAct] = useState(null);
  const [tab,       setTab]       = useState("tabla");
  const [logMsgs,   setLogMsgs]   = useState([]);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminError,setAdminError]= useState("");
  const [editDueno, setEditDueno] = useState({});
  const [editReglas,setEditReglas]= useState(false);
  const [editBonos, setEditBonos] = useState(false);
  const [reglasTmp, setReglasTmp] = useState(reglas);
  const [bonosTmp,  setBonosTmp]  = useState(bonos);

  const addLog = msg => setLogMsgs(p=>[`${new Date().toLocaleTimeString("es-MX")}: ${msg}`,...p.slice(0,19)]);

  // ── Fetch fixtures ──────────────────────────────────────────────────────────
  const fetchFixtures = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LDT(`${KV_PREFIX}_fix`);
    if (!forzar&&partidos.length>0&&(ahora-ts)<CACHE_FIXTURES_MS) return;
    setEstado(e=>({...e,fixtures:"loading"}));
    addLog("📡 Cargando fixtures 2026...");
    try {
      const { data: lista, cache } = await apiFetchWithCache(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`);
      addLog(`${cache==="HIT"?"💾":"🌐"} fixtures: ${lista.length} partidos`);
      LS(`${KV_PREFIX}_fix`,lista); LST(`${KV_PREFIX}_fix`);
      setPartidos(lista); setUltimaAct(new Date());
      setEstado(e=>({...e,fixtures:"ok"}));
    } catch(err) {
      addLog(`❌ Fixtures: ${err.message}`);
      setEstado(e=>({...e,fixtures:"error"}));
    }
  }, [partidos.length]);

  // ── Fetch eventos ───────────────────────────────────────────────────────────
  const fetchEventos = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LDT(`${KV_PREFIX}_evs`);
    if (!forzar&&(ahora-ts)<CACHE_EVENTS_MS&&Object.keys(eventos).length>0) {
      addLog(`💾 Eventos en caché (${Object.keys(eventos).length} partidos)`);
      return;
    }
    const terminados = partidos.filter(p=>
      FINAL.includes(p.fixture?.status?.short) || VIVO.includes(p.fixture?.status?.short)
    );
    if (terminados.length===0) return;
    const todos = terminados.filter(p=>{
      if(forzar) return true;
      if(VIVO.includes(p.fixture?.status?.short)) return true;
      // Always re-fetch knockout matches to ensure cards are current
      if(esKO(p.league?.round)) return true;
      // For group matches, skip if already have events
      return !eventos[p.fixture.id] || eventos[p.fixture.id].length === 0;
    });
    if (todos.length===0) { setEstado(e=>({...e,eventos:"ok"})); return; }
    setEstado(e=>({...e,eventos:"loading"}));
    addLog(`📡 Cargando ${todos.length} partidos (KV caché en servidor)...`);
    const nuevosEvs={...eventos}; let cargados=0,reqAPI=0,reqCache=0;
    for (const p of todos) {
      try {
        // Use /fixtures/events endpoint — returns only events, more reliable than /fixtures?id=
        const { data: evData, cache } = await apiFetchWithCache(`/fixtures/events?fixture=${p.fixture.id}`);
        nuevosEvs[p.fixture.id] = evData||[];
        cargados++;
        if (cache==="HIT") reqCache++; else reqAPI++;
        if (cargados%10===0||cargados===todos.length)
          addLog(`${cache==="HIT"?"💾":"🌐"} ${cargados}/${todos.length} · API:${reqAPI} KV:${reqCache}`);
        await new Promise(r=>setTimeout(r,150));
      } catch(e) {
        if (e.message.includes("limit")||e.message.includes("429")) {
          addLog("🛑 Límite alcanzado — reintenta mañana"); break;
        }
      }
    }
    LS(`${KV_PREFIX}_evs`,nuevosEvs); LST(`${KV_PREFIX}_evs`);
    setEventos(nuevosEvs); setEstado(e=>({...e,eventos:"ok"}));
    addLog(`✅ ${cargados}/${terminados.length} eventos · ${reqAPI} API · ${reqCache} KV`);
  }, [partidos, eventos]);

  // ── Fetch standings ─────────────────────────────────────────────────────────
  const fetchStandings = useCallback(async (forzar=false) => {
    const ahora=Date.now(), ts=LDT(`${KV_PREFIX}_std`);
    if (!forzar&&Object.keys(standings).length>0&&(ahora-ts)<CACHE_STANDINGS_MS) return;
    setEstado(e=>({...e,standings:"loading"}));
    addLog("📡 Cargando standings...");
    try {
      const { data, cache } = await apiFetchWithCache(`/standings?league=${LEAGUE_ID}&season=${SEASON}`);
      const mapa={};
      (data[0]?.league?.standings||[]).forEach(grupo=>grupo.forEach(eq=>{mapa[eq.team.name]=eq.rank;}));
      addLog(`${cache==="HIT"?"💾":"🌐"} standings: ${Object.keys(mapa).length} equipos`);
      LS(`${KV_PREFIX}_std`,mapa); LST(`${KV_PREFIX}_std`);
      setStandings(mapa); setEstado(e=>({...e,standings:"ok"}));
    } catch(err) {
      addLog(`❌ Standings: ${err.message}`);
      setEstado(e=>({...e,standings:"error"}));
    }
  }, [standings]);

  useEffect(()=>{ fetchFixtures().then(()=>{ fetchEventos(); fetchStandings(); }); },[]);
  const timerRef=useRef(null);
  useEffect(()=>{ timerRef.current=setInterval(()=>fetchFixtures(),CACHE_FIXTURES_MS); return()=>clearInterval(timerRef.current); },[fetchFixtures]);
  useEffect(()=>{ if(partidos.length>0) fetchEventos(); },[partidos]);

  // Reiniciar dueños cuando cambia la quiniela (hash navigation)
  useEffect(()=>{
    const saved=LD(`${KV_PREFIX}_due`,{});
    setDuenosState({...saved,...defaultDuenos});
  },[QUINIELA_ID]);

  // ── Admin helpers ───────────────────────────────────────────────────────────
  const saveDuenos  = d => { setDuenosState(d); LS(`${KV_PREFIX}_due`,d); };
  const guardarBonos  = () => { setBonos(bonosTmp);  LS(`${KV_PREFIX}_bon`,bonosTmp);  setEditBonos(false);  };
  const guardarReglas = () => { setReglas(reglasTmp); LS(`${KV_PREFIX}_reg`,reglasTmp); setEditReglas(false); };

  const eqPorD={};
  Object.entries(duenos).forEach(([eq,d])=>{ if(!d||!d.trim())return; if(!eqPorD[d])eqPorD[d]=[]; eqPorD[d].push(eq); });

  const statsD={};
  Object.keys(eqPorD).forEach(d=>{ if(!d||!d.trim())return; statsD[d]={pt:0,g:0,e:0,p_:0,gl:0,am:0,ro:0,det:[]}; });

  const jugados = partidos.filter(p=>FINAL.includes(p.fixture?.status?.short));
  const enVivo  = partidos.filter(p=>VIVO.includes(p.fixture?.status?.short));

  // Score both finished AND live matches so table updates in real time
  const aCalcular = [...jugados, ...enVivo];
  aCalcular.forEach(par=>{
    [normalizeName(par.teams?.home?.name),normalizeName(par.teams?.away?.name)].forEach(eq=>{
      const d=duenos[eq]; if(!d||!statsD[d]) return;
      const r=calcPuntos(par,eq,eventos,reglas); if(!r) return;
      const s=statsD[d];
      s.pt+=r.pt; if(r.diff>0)s.g++;else if(r.diff===0&&!r.ko)s.e++;else s.p_++;
      s.gl+=(r.diff>0?r.diff:0); s.am+=r.am; s.ro+=r.ro; s.det.push({par,eq,r});
    });
  });

  // Standings bonus — only apply for a group when ALL 3 group stage matches
  // for that group are finished (i.e. each team has played 3 matches)
  // This prevents awarding +7/+4 mid-group-stage
  const matchesPlayedByTeam = {};
  jugados.forEach(p => {
    const h = normalizeName(p.teams?.home?.name);
    const a = normalizeName(p.teams?.away?.name);
    matchesPlayedByTeam[h] = (matchesPlayedByTeam[h]||0) + 1;
    matchesPlayedByTeam[a] = (matchesPlayedByTeam[a]||0) + 1;
  });
  Object.entries(standings).forEach(([eq,rank])=>{
    // Only award standings bonus if this team has completed all 3 group matches
    if((matchesPlayedByTeam[eq]||0) < 3) return;
    const d=duenos[eq]; if(!d||!statsD[d]) return;
    if(rank===1) statsD[d].pt+=reglas.primeroGrupo;
    else if(rank===2) statsD[d].pt+=reglas.segundoGrupo;
  });

  // Bonos
  if(bonos.fairPlay&&duenos[bonos.fairPlay]&&statsD[duenos[bonos.fairPlay]]) statsD[duenos[bonos.fairPlay]].pt+=reglas.fairPlay;
  if(bonos.portero&&duenos[bonos.portero]&&statsD[duenos[bonos.portero]])    statsD[duenos[bonos.portero]].pt+=reglas.portero;
  if(bonos.goleo&&duenos[bonos.goleo]&&statsD[duenos[bonos.goleo]])          statsD[duenos[bonos.goleo]].pt+=reglas.goleo;

  const tabla = Object.entries(statsD).sort((a,b)=>b[1].pt-a[1].pt).map(([d,s],i)=>({pos:i+1,d,...s}));

  const evCargados = Object.keys(eventos).length;
  const pctEventos = jugados.length>0 ? Math.round(evCargados/jugados.length*100) : 0;
  const allParticipantes = [...new Set(Object.values(duenos).filter(Boolean))].sort();
  const equiposQuiniela = Object.keys(duenos);
  const todosEquiposAsignados = equiposQuiniela.filter(eq=>!duenos[eq]);
  const med = p=>p===1?"🥇":p===2?"🥈":p===3?"🥉":`${p}.`;

  const TABS=[
    {id:"tabla",   lbl:"🏆 Tabla"},
    {id:"partidos",lbl:`📅 Partidos${jugados.length>0?` (${jugados.length})`:""}`},
    {id:"bonos",   lbl:"🎖 Bonos"},
    {id:"reglas",  lbl:"📋 Reglas"},
    {id:"debug",   lbl:"🔧 Debug"},
    {id:"admin",   lbl:"⚙️ Admin"},
  ];

  return (
    <div style={S.root}>
      {/* HEADER */}
      <header style={{...S.hdr, borderBottomColor: QUINIELA_COLOR}}>
        <div style={S.hdrTop}>
          <div style={S.logo}>
            <span style={{fontSize:28}}>⚽</span>
            <div>
              <div style={{fontSize:22,fontWeight:900,letterSpacing:4,color:QUINIELA_COLOR}}>
                QUINIELA 2026
              </div>
              <div style={S.logoS}>
                USA · MÉXICO · CANADÁ &nbsp;·&nbsp;
                <span style={{color:QUINIELA_COLOR,fontWeight:700}}>{QUINIELA_LABEL}</span>
                &nbsp;·&nbsp; {NUM_PARTICIPANTES} jugadores · {EQ_POR_PERSONA} equipos c/u
              </div>
            </div>
          </div>
          <div style={S.hdrR}>
            {enVivo.length>0&&<span style={S.vivoBadge}>🔴 {enVivo.length} EN VIVO</span>}
            {ultimaAct&&<span style={S.mini}>🔄 {ultimaAct.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>}
            <span style={{fontSize:10,color:pctEventos===100?"#4ade80":pctEventos>0?"#fbbf24":"#64748b"}}>
              🃏 {pctEventos}%
            </span>
            <span style={{fontSize:10,color:Object.keys(standings).length>0?"#4ade80":"#64748b"}}>
              📊{Object.keys(standings).length>0?"✅":"❌"}
            </span>
            <span style={{fontSize:11,color:estado.fixtures==="ok"?"#4ade80":estado.fixtures==="error"?"#f87171":"#64748b"}}>
              {estado.fixtures==="loading"?"⏳":estado.fixtures==="ok"?`✅ ${jugados.length}J`:"❌"}
            </span>
            <button onClick={()=>fetchFixtures(true).then(()=>{fetchEventos(true);fetchStandings(true);})} style={{...S.btnAct,background:`linear-gradient(135deg,${QUINIELA_COLOR},#ef4444)`}}>↺</button>
          </div>
        </div>
        {/* Enlace a la otra quiniela */}
        <div style={{padding:"4px 16px",background:"rgba(0,0,0,0.2)",display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:11,color:"#475569"}}>Cambiar quiniela:</span>
          {[
            {h:"#/familia",lbl:"🏠 Fam. Vázquez"},
            {h:"#/amigos", lbl:"👥 Amigos"},
          ].map(n=>(
            <span key={n.h} onClick={()=>{window.location.hash=n.h;}}
              style={{fontSize:11,color:n.h==="#/"+QUINIELA_ID?QUINIELA_COLOR:"#64748b",fontWeight:700,cursor:"pointer",padding:"2px 4px"}}>
              {n.lbl}
            </span>
          ))}
        </div>
        <nav style={S.tabs}>
          {TABS.map(t=>(
            <button key={t.id} style={{...S.tab,...(tab===t.id?{...S.tabA,borderBottomColor:QUINIELA_COLOR,color:QUINIELA_COLOR}:{})}} onClick={()=>setTab(t.id)}>
              {t.lbl}
            </button>
          ))}
        </nav>
      </header>

      <main style={S.main}>
        {estado.fixtures==="error"&&<div style={S.errBox}>❌ Error conectando. Verifica que el Worker de Cloudflare esté activo.</div>}

        {/* ══ TABLA ══ */}
        {tab==="tabla"&&(
          <div>
            <H2 color={QUINIELA_COLOR}>Tabla de Posiciones</H2>

            {tabla.length===0?(
              <div style={S.infoBox}>
                ⏳ El Mundial 2026 empieza el <strong>11 de junio de 2026</strong>. 
                Después del sorteo (5 junio), ve a ⚙️ Admin para asignar los 48 equipos a los {NUM_PARTICIPANTES} participantes.
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {tabla.map(row=>(
                  <div key={row.d} style={{...S.cardD,...(row.pos===1?{border:`1px solid ${QUINIELA_COLOR}`}:{})}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:22}}>{med(row.pos)}</div>
                        <div style={{fontSize:20,fontWeight:900}}>{row.d}</div>
                        <div style={{...S.bigPts,color:QUINIELA_COLOR}}>
                          {row.pt}<span style={{fontSize:12,fontWeight:400,marginLeft:4,color:"#94a3b8"}}>pts</span>
                        </div>
                        <div style={S.chips}>
                          <span style={S.chip}>✅ {row.g}G</span>
                          <span style={S.chip}>➖ {row.e}E</span>
                          <span style={S.chip}>❌ {row.p_}P</span>
                          <span style={S.chip}>⚽ {row.gl>0?"+":""}{row.gl}</span>
                          {row.am>0&&<span style={{...S.chip,color:"#fbbf24"}}>🟨 {row.am}</span>}
                          {row.ro>0&&<span style={{...S.chip,color:"#f87171"}}>🟥 {row.ro}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",maxWidth:180}}>
                        {[...(eqPorD[row.d]||[])].reverse().map(eq=>(
                          <div key={eq} style={{fontSize:11,color:"#94a3b8"}}>{fl(eq)} {esp(eq)}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ PARTIDOS ══ */}
        {tab==="partidos"&&(
          <div>
            <TabPartidos partidos={partidos} tabla={tabla} reglas={reglas} duenos={duenos} quinielaColor={QUINIELA_COLOR}/>
          </div>
        )}

        {/* ══ BONOS ══ */}
        {tab==="bonos"&&(
          <div>
            <H2 color={QUINIELA_COLOR}>Bonos Especiales</H2>
            <p style={{color:"#64748b",fontSize:13,marginBottom:16}}>
              FIFA anuncia estos premios al final del torneo. Captúralos manualmente en ✏️ Editar.
            </p>
            {[
              {k:"goleo",   icon:"⚽", lbl:"Campeón Goleo (Golden Boot)",    pts:reglas.goleo},
              {k:"fairPlay",icon:"🏅", lbl:"FIFA Fair Play",                 pts:reglas.fairPlay},
              {k:"portero", icon:"🧤", lbl:"Mejor Portero (Golden Glove)",   pts:reglas.portero},
            ].map(b=>(
              <div key={b.k} style={S.bonoCard}>
                <div style={S.bonoHdr}>
                  <span style={{fontSize:20}}>{b.icon}</span>
                  <div>
                    <div style={{fontWeight:900,fontSize:15}}>{b.lbl}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>+{b.pts} pts — captura manual</div>
                  </div>
                  {!editBonos&&b.k==="goleo"&&(
                    <button style={{...S.btnSmall,marginLeft:"auto"}} onClick={()=>{
                      if(adminAuth){setBonosTmp({...bonos});setEditBonos(true);}else setTab("admin");
                    }}>{adminAuth?"✏️ Editar":"🔐 Editar (Admin)"}</button>
                  )}
                  {editBonos&&b.k==="goleo"&&(
                    <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                      <button style={{...S.btnSmall,background:"#64748b"}} onClick={()=>setEditBonos(false)}>Cancelar</button>
                      <button style={{...S.btnSmall,background:"#16a34a"}} onClick={guardarBonos}>✅ Guardar</button>
                    </div>
                  )}
                </div>
                {editBonos?(
                  <div style={{marginTop:8}}>
                    <label style={S.lbl}>Equipo {b.lbl}</label>
                    <input style={S.inp} value={bonosTmp[b.k]} placeholder="ej. France"
                      onChange={e=>setBonosTmp(p=>({...p,[b.k]:e.target.value}))}/>
                  </div>
                ):(
                  <div style={{...S.bonoVal,marginTop:8}}>
                    <span style={{fontSize:22}}>{bonos[b.k]?fl(bonos[b.k]):"❓"}</span>
                    <div>
                      <div style={{fontWeight:700}}>{bonos[b.k]?esp(bonos[b.k]):"No capturado aún"}</div>
                      {bonos[b.k]&&<div style={{fontSize:12,color:QUINIELA_COLOR,fontWeight:700}}>
                        → {duenos[bonos[b.k]]||"Sin dueño"} +{b.pts} pts
                      </div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══ REGLAS ══ */}
        {tab==="reglas"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <H2 color={QUINIELA_COLOR}>Reglas de Puntuación</H2>
              {!editReglas
                ?<button style={S.btnEdit} onClick={()=>{if(adminAuth){setReglasTmp({...reglas});setEditReglas(true);}else setTab("admin");}}>
                  {adminAuth?"✏️ Editar":"🔐 Editar (Admin)"}
                </button>
                :<div style={{display:"flex",gap:8}}>
                  <button style={{...S.btnEdit,background:"#64748b"}} onClick={()=>setEditReglas(false)}>Cancelar</button>
                  <button style={{...S.btnEdit,background:"#16a34a"}} onClick={guardarReglas}>✅ Guardar</button>
                </div>
              }
            </div>
            <div style={S.gridReglas}>
              {[
                {k:"ganado",lbl:"Partido ganado (grupo)"},{k:"empate",lbl:"Empate (grupo)"},
                {k:"perdido",lbl:"Partido perdido"},{k:"difGoles",lbl:"Por gol de diferencia"},
                {k:"amarilla",lbl:"Tarjeta amarilla 🟨"},{k:"roja",lbl:"Expulsado (roja) 🟥"},
                {k:"primeroGrupo",lbl:"Primero de grupo"},{k:"segundoGrupo",lbl:"Segundo de grupo"},
                {k:"eliminatoria",lbl:"Ganar en eliminatoria"},{k:"goleo",lbl:"Campeón Goleo"},
                {k:"portero",lbl:"Mejor Portero"},{k:"fairPlay",lbl:"FIFA Fair Play"},
              ].map(r=>(
                <div key={r.k} style={S.cardRegla}>
                  <span style={{fontSize:12,color:"#94a3b8",flex:1}}>{r.lbl}</span>
                  {editReglas
                    ?<input type="number" style={{...S.inp,width:60,textAlign:"center",padding:"3px 6px"}}
                        value={reglasTmp[r.k]} onChange={e=>setReglasTmp(p=>({...p,[r.k]:Number(e.target.value)}))}/>
                    :<span style={{fontSize:15,fontWeight:900,color:QUINIELA_COLOR}}>{reglas[r.k]>0?"+":""}{reglas[r.k]} pts</span>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ DEBUG ══ */}
        {tab==="debug"&&(
          <div>
            <H2 color={QUINIELA_COLOR}>🔧 Debug</H2>
            <div style={S.debugBox}>
              <div style={S.debugRow}><span>Quiniela:</span><span style={{color:QUINIELA_COLOR,fontWeight:700}}>{QUINIELA_LABEL}</span></div>
              <div style={S.debugRow}><span>Fixtures:</span><span style={{color:estado.fixtures==="ok"?"#4ade80":"#f87171"}}>{estado.fixtures} ({jugados.length} terminados)</span></div>
              <div style={S.debugRow}><span>Caché servidor (KV):</span><span style={{color:"#4ade80"}}>Cloudflare Worker KV</span></div>
              <div style={S.debugRow}><span>Caché local:</span><span>{evCargados} eventos guardados</span></div>
              <div style={S.debugRow}><span>Eventos/tarjetas:</span><span style={{color:pctEventos===100?"#4ade80":"#fbbf24"}}>{evCargados}/{jugados.length} ({pctEventos}%)</span></div>
              <div style={S.debugRow}><span>Standings:</span><span style={{color:Object.keys(standings).length>0?"#4ade80":"#f87171"}}>{Object.keys(standings).length} equipos</span></div>
              <div style={S.debugRow}><span>Participantes asignados:</span><span>{Object.keys(eqPorD).length} de {NUM_PARTICIPANTES}</span></div>
              <div style={S.debugRow}><span>Equipos sin asignar:</span><span style={{color:todosEquiposAsignados.length>0?"#fbbf24":"#4ade80"}}>{todosEquiposAsignados.length} de {equiposQuiniela.length}</span></div>
            </div>
            {/* Nombres API vs nuestras claves */}
            {partidos.length>0&&(()=>{
              const apiNames = [...new Set(partidos.flatMap(p=>[p.teams?.home?.name,p.teams?.away?.name].filter(Boolean)))].sort();
              const noReconocidos = apiNames.filter(n=>!duenos[normalizeName(n)]);
              const nuestrosSinPartido = equiposQuiniela.filter(eq=>!apiNames.some(n=>normalizeName(n)===eq));
              return(
                <div style={{...S.debugBox,marginTop:10}}>
                  <div style={{fontSize:12,color:QUINIELA_COLOR,fontWeight:700,marginBottom:8}}>🔍 Diagnóstico de nombres</div>
                  {noReconocidos.length>0?(
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:11,color:"#fbbf24",fontWeight:700,marginBottom:4}}>⚠️ Nombres API sin dueño ({noReconocidos.length}):</div>
                      {noReconocidos.map(n=>(
                        <div key={n} style={{fontSize:11,color:"#94a3b8",padding:"1px 0"}}>
                          API: <span style={{color:"#f87171",fontWeight:700}}>"{n}"</span>
                          {" → normalizeName: "}<span style={{color:"#fbbf24"}}>"{normalizeName(n)}"</span>
                        </div>
                      ))}
                    </div>
                  ):<div style={{fontSize:11,color:"#4ade80",marginBottom:8}}>✅ Todos los nombres API reconocidos</div>}
                  {nuestrosSinPartido.length>0&&(
                    <div>
                      <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:4}}>📋 Nuestros equipos sin partido aún:</div>
                      {nuestrosSinPartido.map(n=>(
                        <div key={n} style={{fontSize:11,color:"#475569",padding:"1px 0"}}>{fl(n)} {esp(n)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{...S.debugBox,marginTop:10}}>
              <div style={{fontSize:12,color:QUINIELA_COLOR,fontWeight:700,marginBottom:6}}>Log</div>
              {logMsgs.map((l,i)=><div key={i} style={{fontSize:11,color:"#64748b",padding:"2px 0"}}>{l}</div>)}
            </div>
            <button onClick={()=>fetchFixtures(true).then(()=>{fetchEventos(true);fetchStandings(true);})}
              style={{...S.btnEdit,marginTop:12,width:"100%",padding:"10px",background:`linear-gradient(135deg,${QUINIELA_COLOR},#ef4444)`}}>
              🔄 Forzar actualización completa
            </button>
          </div>
        )}

        {/* ══ ADMIN ══ */}
        {tab==="admin"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <H2 color={QUINIELA_COLOR}>⚙️ Admin — {QUINIELA_LABEL}</H2>
              {!adminAuth
                ?<button style={{...S.btnEdit,fontSize:12}} onClick={()=>setAdminAuth("pending")}>🔐 Editar</button>
                :<div style={{display:"flex",gap:8}}>
                  <button style={{...S.btnSmall,background:"#dc2626"}} onClick={()=>{setAdminAuth(false);setAdminPass("");}}>🔒 Salir</button>
                </div>
              }
            </div>

            {adminAuth==="pending"&&(
              <div style={{background:"#0f172a",border:`1px solid ${QUINIELA_COLOR}`,borderRadius:10,padding:16,marginBottom:16,maxWidth:380}}>
                <p style={{color:"#94a3b8",fontSize:13,marginBottom:10}}>Contraseña de admin:</p>
                <div style={{display:"flex",gap:8}}>
                  <input type="password" style={{...S.inp,flex:1}} placeholder="Contraseña..."
                    value={adminPass} onChange={e=>setAdminPass(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"){if(adminPass===ADMIN_PASS){setAdminAuth(true);setAdminError("");}else setAdminError("Incorrecta");}}}
                    autoFocus/>
                  <button style={S.btnEdit} onClick={()=>{
                    if(adminPass===ADMIN_PASS){setAdminAuth(true);setAdminError("");}
                    else setAdminError("Contraseña incorrecta");
                  }}>Entrar</button>
                </div>
                {adminError&&<p style={{color:"#f87171",fontSize:12,marginTop:6}}>{adminError}</p>}
              </div>
            )}

            {/* Resumen visible para todos */}
            <H2 color={QUINIELA_COLOR}>Participantes y Equipos</H2>
            {Object.keys(eqPorD).length===0?(
              <div style={S.infoBox}>
                {QUINIELA_ID==="test"
                ? <>🧪 Quiniela de prueba. Entra como admin y asigna 4 equipos a cada uno de los 2 participantes de prueba.</>
                : <>⏳ Después del <strong>sorteo del 5 de junio</strong>, inicia sesión como admin y asigna los 48 equipos a los {NUM_PARTICIPANTES} participantes ({EQ_POR_PERSONA} equipos por persona).</>
              }
              </div>
            ):(
              <div style={S.tblD}>
                <div style={{...S.fD,gridTemplateColumns:"1fr 2fr"}}>
                  <span style={S.hD}>Participante</span>
                  <span style={S.hD}>Equipos ({EQ_POR_PERSONA} c/u)</span>
                </div>
                {[...new Set(Object.values(duenos).filter(Boolean))].sort().map((p,i)=>{
                  const eqs=Object.entries(duenos).filter(([,d])=>d===p).map(([eq])=>eq);
                  return(
                    <div key={p} style={{...S.fD,gridTemplateColumns:"1fr 2fr",background:i%2===0?"rgba(255,255,255,0.03)":"transparent",alignItems:"center"}}>
                      <span style={{...S.cD,fontWeight:700,color:QUINIELA_COLOR,fontSize:13}}>{p}</span>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"4px 0"}}>
                        {eqs.map(eq=><span key={eq} style={{background:"rgba(255,255,255,0.06)",borderRadius:20,padding:"1px 8px",fontSize:11,color:"#cbd5e1"}}>{fl(eq)} {esp(eq)}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Edición solo admin */}
            {adminAuth===true&&(
              <div style={{marginTop:20}}>
                {adminAuth===true&&<p style={{color:"#4ade80",fontSize:12,marginBottom:12}}>✅ Modo edición activo</p>}
                <H2 color={QUINIELA_COLOR}>Asignar Equipos</H2>
                {todosEquiposAsignados.length>0&&(
                  <div style={{...S.infoBox,marginBottom:12}}>
                    ⚠️ {todosEquiposAsignados.length} de {equiposQuiniela.length} equipos sin asignar: {todosEquiposAsignados.map(e=>esp(e)).join(", ")}
                  </div>
                )}
                <div style={S.listaEq}>
                  {EQUIPOS_2026.map(eq=>(
                    <div key={eq} style={S.filaEq}>
                      <span style={{fontSize:18,width:24,textAlign:"center"}}>{fl(eq)}</span>
                      <span style={{flex:1,fontSize:13,fontWeight:600}}>{esp(eq)}</span>
                      <input
                        style={{...S.inputD,width:140}}
                        value={editDueno[eq]!==undefined?editDueno[eq]:(duenos[eq]||"")}
                        placeholder="Participante..."
                        list="lista-participantes-2026"
                        onChange={e=>setEditDueno(prev=>({...prev,[eq]:e.target.value}))}
                        onBlur={e=>{
                          const val=e.target.value.trim();
                          saveDuenos({...duenos,[eq]:val});
                          setEditDueno(prev=>{const n={...prev};delete n[eq];return n;});
                        }}
                      />
                    </div>
                  ))}
                  <datalist id="lista-participantes-2026">
                    {allParticipantes.map(n=><option key={n} value={n}/>)}
                  </datalist>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={{textAlign:"center",padding:12,fontSize:11,color:"#334155",borderTop:`1px solid ${QUINIELA_COLOR}22`,marginTop:20}}>
        ⚽ Quiniela 2026 · {QUINIELA_LABEL} · USA · México · Canadá · API-Football
      </footer>
    </div>
  );
}

// ─── Coordenadas sedes Mundial 2026 (para clima) ──────────────────────────────
const VENUE_COORDS = {
  "SoFi Stadium":           { lat: 33.9534, lon: -118.3392, tz: "America/Los_Angeles" },
  "MetLife Stadium":        { lat: 40.8135, lon: -74.0745,  tz: "America/New_York" },
  "AT&T Stadium":           { lat: 32.7473, lon: -97.0945,  tz: "America/Chicago" },
  "Levi's Stadium":         { lat: 37.4033, lon: -121.9694, tz: "America/Los_Angeles" },
  "Arrowhead Stadium":      { lat: 39.0489, lon: -94.4839,  tz: "America/Chicago" },
  "Lincoln Financial Field":{ lat: 39.9007, lon: -75.1675,  tz: "America/New_York" },
  "Hard Rock Stadium":      { lat: 25.9580, lon: -80.2389,  tz: "America/New_York" },
  "Lumen Field":            { lat: 47.5952, lon: -122.3316, tz: "America/Los_Angeles" },
  "NRG Stadium":            { lat: 29.6847, lon: -95.4107,  tz: "America/Chicago" },
  "Gillette Stadium":       { lat: 42.0909, lon: -71.2643,  tz: "America/New_York" },
  "Mercedes-Benz Stadium":  { lat: 33.7554, lon: -84.4010,  tz: "America/New_York" },
  "BMO Field":              { lat: 43.6333, lon: -79.4186,  tz: "America/Toronto" },
  "BC Place":               { lat: 49.2767, lon: -123.1117, tz: "America/Vancouver" },
  "Estadio Azteca":         { lat: 19.3029, lon: -99.1505,  tz: "America/Mexico_City" },
  "Estadio BBVA":           { lat: 25.6694, lon: -100.2438, tz: "America/Monterrey" },
  "Estadio Akron":          { lat: 20.6597, lon: -103.4068, tz: "America/Mexico_City" },
};

// ─── WeatherBadge ─────────────────────────────────────────────────────────────
// Cache key: wx_<venue>_<date>, refreshed daily at 5am CDMX
function getWxCacheKey(venue, date) {
  return `wx_${venue.replace(/[^a-z0-9]/gi,"_")}_${date}`;
}

function shouldRefreshWx(cacheKey) {
  // Refresh if cached data is older than 6 hours
  try {
    const meta = localStorage.getItem(cacheKey + "_ts");
    if (!meta) return true;
    return (Date.now() - parseInt(meta)) > 6 * 60 * 60 * 1000;
  } catch { return true; }
}

function WeatherBadge({ venueName, matchDate }) {
  const [wx, setWx] = useState(null);

  useEffect(() => {
    const coords = VENUE_COORDS[venueName];
    if (!coords || !matchDate) return;

    const matchUTC  = new Date(matchDate);
    const now       = new Date();
    const daysAhead = (matchUTC - now) / (1000 * 60 * 60 * 24);

    // Match already played — no forecast needed
    if (daysAhead < -1) return;

    // Beyond 16-day window — mark as pending, will appear when window rolls forward
    if (daysAhead > 16) {
      setWx({ pending: true });
      return;
    }

    const date     = matchDate.split("T")[0];
    const cacheKey = getWxCacheKey(venueName, date);

    // Check localStorage cache — refresh every 6h
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached && !shouldRefreshWx(cacheKey)) {
        setWx(JSON.parse(cached));
        return;
      }
    } catch {}

    // UTC offset for venue (June-July DST values)
    const offsets = {
      "America/Los_Angeles": -7,
      "America/Chicago":     -5,
      "America/New_York":    -4,
      "America/Toronto":     -4,
      "America/Vancouver":   -7,
      "America/Mexico_City": -6, // CDT in summer
      "America/Monterrey":   -5,
    };
    const offset    = offsets[coords.tz] ?? -5;
    const localHour = ((matchUTC.getUTCHours() + offset) % 24 + 24) % 24;

    // Open-Meteo hourly forecast — use UTC timezone to match exactly
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}`
      + `&hourly=temperature_2m,weathercode,precipitation_probability`
      + `&timezone=UTC`
      + `&start_date=${date}&end_date=${date}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const h = data.hourly;
        if (!h) return;

        // With timezone=UTC, times are "YYYY-MM-DDTHH:00" in UTC
        // Match UTC hour directly
        const utcHour = matchUTC.getUTCHours();
        const idx = h.time.findIndex(t => parseInt(t.split("T")[1]) === utcHour);
        if (idx === -1) return;

        const result = {
          code : h.weathercode[idx],
          temp : Math.round(h.temperature_2m[idx]),
          rain : h.precipitation_probability[idx] ?? 0,
        };

        // Save to localStorage
        try {
          localStorage.setItem(cacheKey, JSON.stringify(result));
          localStorage.setItem(cacheKey + "_ts", String(Date.now()));
        } catch {}

        setWx(result);
      })
      .catch(() => {});
  }, [venueName, matchDate]);

  if (!wx) return null;

  // Beyond 16-day forecast window — show placeholder
  if (wx.pending) return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:"#475569",background:"rgba(255,255,255,0.03)",borderRadius:20,padding:"2px 8px",border:"1px solid rgba(255,255,255,0.05)"}}>
      🌡️ <span>Pronóstico próximamente</span>
    </span>
  );

  const { icon, label } = wxInfo(wx.code);
  const rainColor = wx.rain > 60 ? "#60a5fa" : wx.rain > 30 ? "#93c5fd" : "#64748b";

  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,color:"#94a3b8",background:"rgba(255,255,255,0.05)",borderRadius:20,padding:"2px 8px",border:"1px solid rgba(255,255,255,0.08)"}}>
      <span style={{fontSize:13}}>{icon}</span>
      <span style={{fontWeight:700,color:"#e2e8f0"}}>{wx.temp}°C</span>
      <span style={{color:"#64748b"}}>{label}</span>
      {wx.rain > 0 && <span style={{color:rainColor}}>💧{wx.rain}%</span>}
    </span>
  );
}

function wxInfo(code) {
  if (code === undefined || code === null) return { icon:"🌡️", label:"" };
  if (code === 0)        return { icon:"☀️",  label:"Soleado" };
  if (code === 1)        return { icon:"🌤️",  label:"Mayormente soleado" };
  if (code === 2)        return { icon:"⛅",   label:"Parcialmente nublado" };
  if (code === 3)        return { icon:"☁️",  label:"Nublado" };
  if (code <= 49)        return { icon:"🌫️",  label:"Neblina" };
  if (code <= 59)        return { icon:"🌦️",  label:"Llovizna" };
  if (code <= 69)        return { icon:"🌧️",  label:"Lluvia" };
  if (code <= 79)        return { icon:"🌨️",  label:"Nieve" };
  if (code <= 84)        return { icon:"🌧️",  label:"Lluvia fuerte" };
  if (code <= 94)        return { icon:"⛈️",  label:"Tormenta" };
  return { icon:"🌩️", label:"Tormenta eléctrica" };
}

// ─── TabPartidos (vista unificada) ────────────────────────────────────────────
function TabPartidos({ partidos, tabla, reglas, duenos, quinielaColor }) {
  const FINAL = ["FT","AET","PEN","AWD","WO"];
  const VIVO  = ["1H","2H","HT","ET","BT","P"];

  const [vista,         setVista]         = useState("todos");   // todos | jugados | porjugar
  const [filtroJugador, setFiltroJugador] = useState("TODOS");
  const [filtroFase,    setFiltroFase]    = useState("TODOS");
  const [sortBy,        setSortBy]        = useState("fecha");   // fecha | pts | difgoles | amarillas | rojas
  const [sortDir,       setSortDir]       = useState("asc");

  const eqDueno = duenos || {};

  const fmt = (isoDate) => {
    if(!isoDate) return {fecha:"",hora:""};
    const d    = new Date(isoDate);
    const cdmx = new Date(d.getTime() - 6*60*60*1000);
    const fecha = cdmx.toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"short",timeZone:"UTC"});
    const hora  = cdmx.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"UTC"});
    return {fecha, hora};
  };

  // Construir lista enriquecida: un item por equipo de la quiniela en cada partido
  // Para partidos no jugados, mostrar la tarjeta del partido (sin dueño repetido)
  // Para jugados, mostrar la tarjeta con desglose de pts por cada dueño involucrado
  const jugadosMap = new Map(); // fixture.id → array de rows del desglose
  tabla.forEach(row => {
    row.det.forEach(d => {
      if(!FINAL.includes(d.par.fixture?.status?.short)) return;
      const fid = d.par.fixture?.id;
      if(!jugadosMap.has(fid)) jugadosMap.set(fid, []);
      jugadosMap.get(fid).push({dueno:row.d, eq:d.eq, r:d.r, par:d.par});
    });
  });

  // Lista de todos los partidos como unidades base
  const todosPartidos = partidos.map(p => {
    const fid     = p.fixture?.id;
    const jugado  = FINAL.includes(p.fixture?.status?.short);
    const vivo    = VIVO.includes(p.fixture?.status?.short);
    const homeN   = normalizeName(p.teams?.home?.name);
    const awayN   = normalizeName(p.teams?.away?.name);
    const dHome   = eqDueno[homeN];
    const dAway   = eqDueno[awayN];
    const desgRows = jugadosMap.get(fid) || [];
    // Para ordenar por pts/goles/tarjetas: usar suma de pts de los dueños involucrados
    const ptSum   = desgRows.reduce((s,x)=>s+x.r.pt,0);
    const difSum  = desgRows.reduce((s,x)=>s+(x.r.diff||0),0);
    const amSum   = desgRows.reduce((s,x)=>s+(x.r.am||0),0);
    const roSum   = desgRows.reduce((s,x)=>s+(x.r.ro||0),0);
    // Jugadores involucrados (dueños que tienen homeN o awayN)
    const jugInv  = [dHome,dAway].filter(Boolean);
    const fase    = faseLabel(p.league?.round);
    return { p, fid, jugado, vivo, homeN, awayN, dHome, dAway, desgRows, ptSum, difSum, amSum, roSum, jugInv, fase, fecha:p.fixture?.date||"" };
  });

  // Todos los jugadores y fases para filtros
  const allJugadores = ["TODOS",...new Set(todosPartidos.flatMap(x=>x.jugInv))];
  const allFases     = ["TODOS",...new Set(todosPartidos.map(x=>x.fase).filter(Boolean))];

  const handleSort = k => {
    if(sortBy===k) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortBy(k); setSortDir(k==="pts"?"desc":"asc"); }
  };

  const lista = todosPartidos
    .filter(x => {
      if(vista==="jugados")   return x.jugado;
      if(vista==="porjugar")  return !x.jugado && !x.vivo;
      return true;
    })
    .filter(x => filtroJugador==="TODOS" || x.jugInv.includes(filtroJugador))
    .filter(x => filtroFase==="TODOS"    || x.fase===filtroFase)
    .sort((a,b) => {
      let cmp = 0;
      if(sortBy==="fecha")      cmp = a.fecha.localeCompare(b.fecha);
      else if(sortBy==="pts")   cmp = a.ptSum - b.ptSum;
      else if(sortBy==="difgoles") cmp = a.difSum - b.difSum;
      else if(sortBy==="amarillas") cmp = a.amSum - b.amSum;
      else if(sortBy==="rojas") cmp = a.roSum - b.roSum;
      return sortDir==="asc" ? cmp : -cmp;
    });

  const btnF = (val,actual,set,lbl) => (
    <button key={val} style={{...S.btnF,...(actual===val?S.btnFA:{})}} onClick={()=>set(val)}>{lbl||val}</button>
  );
  const SORTS = [{k:"fecha",lbl:"📅 Fecha"},{k:"pts",lbl:"🏆 Pts"},{k:"difgoles",lbl:"⚽ Goles"},{k:"amarillas",lbl:"🟨"},{k:"rojas",lbl:"🟥"}];

  return (
    <div>
      {/* ── Filtros ── */}
      <div style={{marginBottom:6}}>
        <span style={{fontSize:11,color:"#475569",marginRight:6,textTransform:"uppercase",letterSpacing:1}}>Ver:</span>
        {btnF("todos",vista,setVista,"Todos")}
        {btnF("jugados",vista,setVista,"✅ Jugados")}
        {btnF("porjugar",vista,setVista,"⏳ Por jugar")}
      </div>
      {allJugadores.length>2 && (
        <div style={{marginBottom:6}}>
          <span style={{fontSize:11,color:"#475569",marginRight:6,textTransform:"uppercase",letterSpacing:1}}>Jugador:</span>
          {allJugadores.map(j=>btnF(j,filtroJugador,setFiltroJugador,j==="TODOS"?"Todos":j))}
        </div>
      )}
      {allFases.length>2 && (
        <div style={{marginBottom:6}}>
          <span style={{fontSize:11,color:"#475569",marginRight:6,textTransform:"uppercase",letterSpacing:1}}>Fase:</span>
          {allFases.map(f=>btnF(f,filtroFase,setFiltroFase,f==="TODOS"?"Todas":f))}
        </div>
      )}
      <div style={{marginBottom:14}}>
        <span style={{fontSize:11,color:"#475569",marginRight:6,textTransform:"uppercase",letterSpacing:1}}>Ordenar:</span>
        {SORTS.map(s=>(
          <button key={s.k} style={{...S.btnF,...(sortBy===s.k?S.btnFA:{})}} onClick={()=>handleSort(s.k)}>
            {s.lbl}{sortBy===s.k?(sortDir==="asc"?" ↑":" ↓"):""}
          </button>
        ))}
      </div>
      <div style={{fontSize:12,color:"#475569",marginBottom:10}}>{lista.length} partidos</div>

      {/* ── Lista ── */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {lista.map(({p,jugado,vivo,homeN,awayN,dHome,dAway,desgRows,fase},i) => {
          const {fecha,hora} = fmt(p.fixture?.date);
          const sede   = p.fixture?.venue?.name || "";
          const ciudad = p.fixture?.venue?.city || "";
          const gHome  = p.goals?.home;
          const gAway  = p.goals?.away;
          const borderColor = vivo ? "#f59e0b" : jugado ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)";
          const bgColor     = vivo ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.02)";
          return (
            <div key={p.fixture?.id||i} style={{background:bgColor,border:`1px solid ${borderColor}`,borderRadius:10,overflow:"hidden"}}>
              {/* Header */}
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",padding:"5px 12px",background:"rgba(0,0,0,0.25)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <span style={{fontSize:10,fontWeight:700,color:quinielaColor,background:"rgba(255,255,255,0.07)",borderRadius:4,padding:"1px 6px",textTransform:"uppercase"}}>{fase}</span>
                {vivo && <span style={{fontSize:10,fontWeight:700,color:"#f59e0b",background:"rgba(245,158,11,0.2)",borderRadius:4,padding:"1px 6px"}}>🔴 EN VIVO</span>}
                <span style={{fontSize:11,color:"#64748b"}}>{fecha}</span>
                <span style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>{hora} CDMX</span>
                <span style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                  <span style={{fontSize:11,color:"#475569"}}>📍 {sede}{ciudad?`, ${ciudad}`:""}</span>
                  <WeatherBadge venueName={sede} matchDate={p.fixture?.date}/>
                </span>
              </div>
              {/* Equipos + marcador */}
              <div style={{display:"flex",alignItems:"center",padding:"10px 14px",gap:8}}>
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:22}}>{fl(homeN)}</span>
                    <span style={{fontSize:13,fontWeight:700}}>{esp(homeN)}</span>
                  </div>
                  {dHome && <span style={{fontSize:10,color:quinielaColor,fontWeight:700,paddingLeft:28}}>👤 {dHome}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(0,0,0,0.4)",borderRadius:8,padding:"6px 14px",border:"1px solid rgba(255,255,255,0.1)",minWidth:70,justifyContent:"center"}}>
                  {jugado||vivo
                    ? <><span style={{fontSize:22,fontWeight:900}}>{gHome??"-"}</span>
                        <span style={{fontSize:14,color:"#475569"}}>–</span>
                        <span style={{fontSize:22,fontWeight:900}}>{gAway??"-"}</span></>
                    : <span style={{fontSize:13,color:"#475569",fontWeight:700}}>VS</span>
                  }
                </div>
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:13,fontWeight:700}}>{esp(awayN)}</span>
                    <span style={{fontSize:22}}>{fl(awayN)}</span>
                  </div>
                  {dAway && <span style={{fontSize:10,color:quinielaColor,fontWeight:700,paddingRight:28}}>👤 {dAway}</span>}
                </div>
              </div>
              {/* Desglose pts (solo jugados) */}
              {jugado && desgRows.length>0 && (
                <div style={{padding:"0 12px 10px",display:"flex",flexDirection:"column",gap:4}}>
                  {desgRows.map((x,j)=>(
                    <PtsDesglose key={j} r={x.r} dueno={x.dueno} R={reglas} ko={esKO(p.league?.round)}/>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {lista.length===0 && <p style={{color:"#64748b",fontSize:13,textAlign:"center",padding:20}}>No hay partidos en esta vista.</p>}
      </div>
    </div>
  );
}

// ─── DesglosePartidos ─────────────────────────────────────────────────────────
function DesglosePartidos({ tabla, reglas, filtrados: filtradosProp }) {
  // When filtrados is passed from parent (TabPartidos), use it directly
  const filtrados = filtradosProp ?? [];

  return (
    <div>
      <div style={{fontSize:12,color:"#475569",marginBottom:10}}>{filtrados.length} partidos</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map((t,i)=>{
          const fecha=t.fecha?new Date(t.fecha).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"}):"";
          const bgCard=t.pt>0?"rgba(74,222,128,0.05)":t.pt<0?"rgba(248,113,113,0.05)":"rgba(255,255,255,0.02)";
          const borderCard=t.pt>0?"rgba(74,222,128,0.2)":t.pt<0?"rgba(248,113,113,0.2)":"rgba(255,255,255,0.06)";
          return(
            <div key={i} style={{background:bgCard,border:`1px solid ${borderCard}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"5px 12px",background:"rgba(0,0,0,0.2)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <span style={{fontSize:10,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",background:"rgba(245,158,11,0.15)",borderRadius:4,padding:"1px 6px"}}>{t.fase}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{fecha}</span>
                <span style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginLeft:"auto"}}>{t.dueno}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",padding:"10px 14px",gap:8}}>
                <div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:22}}>{fl(t.eq)}</span>
                  <span style={{fontSize:14,fontWeight:700}}>{esp(t.eq)}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(0,0,0,0.4)",borderRadius:8,padding:"6px 14px",border:"1px solid rgba(255,255,255,0.1)"}}>
                  <span style={{fontSize:22,fontWeight:900}}>{t.gfavor}</span>
                  <span style={{fontSize:14,color:"#475569"}}>–</span>
                  <span style={{fontSize:22,fontWeight:900}}>{t.gcontra}</span>
                </div>
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
                  <span style={{fontSize:14,fontWeight:700,color:"#64748b"}}>{esp(t.rival)}</span>
                  <span style={{fontSize:22}}>{fl(t.rival)}</span>
                </div>
              </div>
              <div style={{padding:"0 12px 10px"}}>
                <PtsDesglose r={t.r} dueno={t.dueno} R={reglas} ko={esKO(t.par.league?.round)}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PtsDesglose({ r, dueno, R, ko }) {
  const ptBase=r.diff>0?(ko?R.eliminatoria:R.ganado):r.diff===0?(ko?0:R.empate):R.perdido;
  const ptDif=(r.diff>0)?r.diff*R.difGoles:0;
  const ptAm=r.am*R.amarilla, ptRo=r.ro*R.roja;
  const color=r.pt>=0?"#4ade80":"#f87171";
  const bgColor=r.pt>0?"rgba(74,222,128,0.08)":r.pt<0?"rgba(248,113,113,0.08)":"rgba(255,255,255,0.04)";
  const borderColor=r.pt>0?"rgba(74,222,128,0.2)":r.pt<0?"rgba(248,113,113,0.2)":"rgba(255,255,255,0.06)";
  const partes=[];
  if(r.diff>0)       partes.push({lbl:ko?"🏆 Eliminatoria":"✅ Victoria",val:ptBase,c:"#4ade80"});
  else if(r.diff===0)partes.push({lbl:ko?"— Elim. empate":"➖ Empate",   val:ptBase,c:"#facc15"});
  else               partes.push({lbl:"❌ Derrota",                      val:ptBase,c:"#64748b"});
  if(ptDif>0)        partes.push({lbl:`⚽ ${r.diff} gol${r.diff>1?"es":""} dif`,val:ptDif,c:"#34d399"});
  if(r.am>0)         partes.push({lbl:`🟨 ${r.am} amarilla${r.am>1?"s":""}`,val:ptAm,c:"#fbbf24"});
  if(r.ro>0)         partes.push({lbl:`🟥 ${r.ro} roja${r.ro>1?"s":""}`,val:ptRo,c:"#f87171"});
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",background:bgColor,borderRadius:8,padding:"6px 10px",border:`1px solid ${borderColor}`}}>
      <span style={{fontSize:12,fontWeight:800,color,minWidth:78}}>{dueno}</span>
      <span style={{fontSize:11,color:"#475569"}}>→</span>
      {partes.map((p,i)=>(
        <span key={i} style={{fontSize:11,color:p.c,background:"rgba(0,0,0,0.25)",borderRadius:20,padding:"2px 8px",fontWeight:600}}>
          {p.lbl} <strong>{p.val>0?"+":""}{p.val}</strong>
        </span>
      ))}
      <span style={{fontSize:13,fontWeight:900,color,marginLeft:"auto",background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"2px 8px"}}>
        {r.pt>0?"+":""}{r.pt} pts
      </span>
    </div>
  );
}

function H2({children,style,color}){
  return <h2 style={{...S.h2,...(color?{color,borderLeftColor:"#ef4444"}:{}),...style}}>{children}</h2>;
}

const S={
  root:{minHeight:"100vh",background:"linear-gradient(160deg,#060d1a,#0a1628,#0d1f3a)",color:"#e2e8f0",fontFamily:"'Barlow Condensed','Oswald','Arial Narrow',sans-serif",fontSize:15},
  hdr:{background:"linear-gradient(180deg,#071020,#0a1628)",borderBottom:"2px solid #1e3a5f",position:"sticky",top:0,zIndex:100,boxShadow:"0 6px 24px rgba(0,0,0,0.6)"},
  hdrTop:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",flexWrap:"wrap",gap:8},
  logo:{display:"flex",alignItems:"center",gap:10},
  logoT:{fontSize:22,fontWeight:900,letterSpacing:4},
  logoS:{fontSize:10,color:"#475569",letterSpacing:1},
  hdrR:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"},
  vivoBadge:{background:"rgba(239,68,68,0.2)",border:"1px solid #ef4444",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#f87171",fontWeight:700},
  mini:{fontSize:10,color:"#64748b"},
  btnAct:{border:"none",borderRadius:6,color:"#fff",padding:"4px 12px",cursor:"pointer",fontSize:12,fontWeight:700},
  tabs:{display:"flex",overflowX:"auto",padding:"0 8px",borderTop:"1px solid #1e3a5f"},
  tab:{background:"transparent",border:"none",color:"#64748b",padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:700,borderBottom:"2px solid transparent",whiteSpace:"nowrap"},
  tabA:{background:"rgba(245,158,11,0.07)"},
  main:{padding:16,maxWidth:960,margin:"0 auto"},
  errBox:{background:"rgba(239,68,68,0.1)",border:"1px solid #ef4444",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#fca5a5",fontSize:13},
  infoBox:{background:"rgba(59,130,246,0.08)",border:"1px solid #3b82f6",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#93c5fd",fontSize:13,lineHeight:1.6},
  h2:{fontSize:16,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#f59e0b",marginBottom:10,marginTop:4,borderLeft:"4px solid #ef4444",paddingLeft:8},
  cardD:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 14px"},
  bigPts:{fontSize:32,fontWeight:900,lineHeight:1.1},
  chips:{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"},
  chip:{fontSize:11,color:"#94a3b8"},
  tblD:{background:"#0f172a",borderRadius:8,border:"1px solid #1e3a5f",overflow:"hidden"},
  fD:{display:"grid",gridTemplateColumns:"1fr 2fr",padding:"5px 10px",gap:3,borderBottom:"1px solid rgba(255,255,255,0.04)"},
  hD:{fontSize:9,color:"#475569",fontWeight:700,textTransform:"uppercase"},
  cD:{fontSize:10,color:"#94a3b8"},
  filtros:{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12},
  btnF:{background:"rgba(255,255,255,0.05)",border:"1px solid #1e3a5f",borderRadius:5,color:"#64748b",padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,marginRight:3,marginBottom:3},
  btnFA:{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",color:"#f59e0b"},
  bonoCard:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 14px",marginBottom:10},
  bonoHdr:{display:"flex",alignItems:"center",gap:10},
  bonoVal:{display:"flex",alignItems:"center",gap:10,padding:"8px",background:"rgba(255,255,255,0.03)",borderRadius:8},
  gridReglas:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6},
  cardRegla:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  debugBox:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:8,padding:12},
  debugRow:{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",fontSize:12,color:"#94a3b8"},
  btnEdit:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:7,color:"#fff",padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700},
  btnSmall:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:6,color:"#fff",padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700},
  lbl:{display:"block",fontSize:11,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:1},
  inp:{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"6px 10px",fontSize:13,outline:"none",boxSizing:"border-box"},
  listaEq:{display:"flex",flexDirection:"column",gap:4,maxHeight:500,overflowY:"auto"},
  filaEq:{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"rgba(255,255,255,0.02)",borderRadius:6,border:"1px solid rgba(255,255,255,0.04)"},
  inputD:{background:"rgba(255,255,255,0.06)",border:"1px solid #334155",borderRadius:5,color:"#e2e8f0",padding:"3px 8px",fontSize:12,outline:"none"},
};
