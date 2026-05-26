import { useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// QUINIELA 2026 — MODO TEST (datos aleatorios, sin API)
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_PASS = "Contraseña";
const KV_PREFIX  = "q26_test";

const REGLAS_DEFAULT = {
  ganado:5, empate:2, perdido:0,
  amarilla:-1, roja:-5, difGoles:1,
  primeroGrupo:7, segundoGrupo:4,
  eliminatoria:10,
  fairPlay:10, portero:3, goleo:5,
};

// 8 equipos de prueba, 2 participantes × 4 equipos
const EQUIPOS_TEST = ["España","Francia","Brasil","Argentina","Alemania","Inglaterra","Portugal","México"];
const DUENOS_TEST_DEFAULT = {
  "España":"Jugador A","Francia":"Jugador A","Brasil":"Jugador A","Argentina":"Jugador A",
  "Alemania":"Jugador B","Inglaterra":"Jugador B","Portugal":"Jugador B","México":"Jugador B",
};

const FL = {
  "España":"🇪🇸","Francia":"🇫🇷","Brasil":"🇧🇷","Argentina":"🇦🇷",
  "Alemania":"🇩🇪","Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Portugal":"🇵🇹","México":"🇲🇽",
};
const fl = n => FL[n] || "🏳️";

const FINAL = ["FT","AET","PEN"];
const faseLabel = r => {
  if (!r) return "";
  if (r==="group")   return "Fase de Grupos";
  if (r==="r16")     return "Octavos";
  if (r==="qf")      return "Cuartos";
  if (r==="sf")      return "Semifinal";
  if (r==="3rd")     return "3er Lugar";
  if (r==="final")   return "Final";
  return r;
};
const esKO = r => r && ["r16","qf","sf","3rd","final"].includes(r);

const LD  = (k,d) => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; }};
const LS  = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── Generador aleatorio ──────────────────────────────────────────────────────
function rnd(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }

function generarPartidoGrupo(local, visita, jornada) {
  const statusOptions = ["FT","FT","FT","FT","AET","PEN"];
  const gL = rnd(0,4), gV = rnd(0,4);
  const amL = rnd(0,3), amV = rnd(0,3);
  const roL = Math.random()<0.1?1:0, roV = Math.random()<0.1?1:0;
  const fecha = new Date(2026, 5, 10 + jornada).toISOString();
  return {
    fixture: { id: `test_${local}_${visita}_${jornada}`, date: fecha, status: { short:"FT" } },
    league:  { round: "group" },
    teams:   {
      home: { name:local,  winner: gL>gV ? true : gL<gV ? false : null },
      away: { name:visita, winner: gV>gL ? true : gV<gL ? false : null },
    },
    goals: { home:gL, away:gV },
    events: [
      ...Array(amL).fill(null).map((_,i)=>({ type:"Card", detail:"Yellow Card", team:{name:local},  player:{name:`Jugador L${i+1}`}, time:{elapsed:rnd(10,90)} })),
      ...Array(amV).fill(null).map((_,i)=>({ type:"Card", detail:"Yellow Card", team:{name:visita}, player:{name:`Jugador V${i+1}`}, time:{elapsed:rnd(10,90)} })),
      ...(roL?[{ type:"Card", detail:"Red Card", team:{name:local},  player:{name:"Jugador LR"}, time:{elapsed:rnd(50,90)} }]:[]),
      ...(roV?[{ type:"Card", detail:"Red Card", team:{name:visita}, player:{name:"Jugador VR"}, time:{elapsed:rnd(50,90)} }]:[]),
    ],
  };
}

function generarPartidoKO(local, visita, ronda, jornada) {
  let gL = rnd(0,3), gV = rnd(0,3);
  let status = "FT";
  let winnerL = null, winnerV = null;
  if (gL === gV) {
    // Empate → penales
    status = "PEN";
    winnerL = Math.random() > 0.5;
    winnerV = !winnerL;
  } else {
    winnerL = gL > gV;
    winnerV = gV > gL;
  }
  const amL=rnd(0,3), amV=rnd(0,3);
  const roL=Math.random()<0.08?1:0, roV=Math.random()<0.08?1:0;
  const fecha = new Date(2026, 6, jornada).toISOString();
  return {
    fixture: { id:`test_ko_${local}_${visita}_${ronda}`, date:fecha, status:{ short:status } },
    league:  { round:ronda },
    teams:   { home:{ name:local, winner:winnerL }, away:{ name:visita, winner:winnerV } },
    goals:   { home:gL, away:gV },
    events: [
      ...Array(amL).fill(null).map((_,i)=>({ type:"Card", detail:"Yellow Card", team:{name:local},  player:{name:`J${i+1}`}, time:{elapsed:rnd(10,90)} })),
      ...Array(amV).fill(null).map((_,i)=>({ type:"Card", detail:"Yellow Card", team:{name:visita}, player:{name:`J${i+1}`}, time:{elapsed:rnd(10,90)} })),
      ...(roL?[{ type:"Card", detail:"Red Card", team:{name:local},  player:{name:"JR"}, time:{elapsed:rnd(50,90)} }]:[]),
      ...(roV?[{ type:"Card", detail:"Red Card", team:{name:visita}, player:{name:"JR"}, time:{elapsed:rnd(50,90)} }]:[]),
    ],
  };
}

// Generar standings aleatorios (1ro o 2do para cada equipo)
function generarStandings(equipos) {
  const mapa = {};
  // Hacer grupos de 2 y asignar 1ro/2do
  for (let i=0; i<equipos.length; i+=2) {
    mapa[equipos[i]]   = Math.random()>0.5 ? 1 : 2;
    mapa[equipos[i+1]] = mapa[equipos[i]]===1 ? 2 : 1;
  }
  return mapa;
}

// Generar todos los partidos de grupos (round robin entre pares)
function generarFaseGrupos(equipos) {
  const partidos = [];
  // Cada equipo juega contra todos en su "grupo" (pares de 4)
  const grupos = [];
  for (let i=0; i<equipos.length; i+=4) grupos.push(equipos.slice(i,i+4));
  grupos.forEach(g => {
    let j=0;
    for (let a=0; a<g.length; a++) {
      for (let b=a+1; b<g.length; b++) {
        partidos.push(generarPartidoGrupo(g[a], g[b], j++));
      }
    }
  });
  return partidos;
}

// Generar eliminatorias simples
function generarEliminatorias(equipos) {
  const partidos = [];
  // Cuartos (4 equipos → 2 semifinalistas)
  const qf1 = generarPartidoKO(equipos[0], equipos[3], "qf", 1);
  const qf2 = generarPartidoKO(equipos[1], equipos[2], "qf", 2);
  partidos.push(qf1, qf2);

  const ganQ1 = qf1.teams.home.winner ? equipos[0] : equipos[3];
  const ganQ2 = qf2.teams.home.winner ? equipos[1] : equipos[2];
  const perQ1 = qf1.teams.home.winner ? equipos[3] : equipos[0];
  const perQ2 = qf2.teams.home.winner ? equipos[2] : equipos[1];

  // Semis
  const sf = generarPartidoKO(ganQ1, ganQ2, "sf", 5);
  partidos.push(sf);

  const ganSF = sf.teams.home.winner ? ganQ1 : ganQ2;
  const perSF = sf.teams.home.winner ? ganQ2 : ganQ1;

  // 3er lugar
  partidos.push(generarPartidoKO(perQ1, perSF, "3rd", 8));
  // Final
  partidos.push(generarPartidoKO(ganSF, perQ2, "final", 10));

  return partidos;
}

// ─── Cálculo puntos ───────────────────────────────────────────────────────────
function calcPuntos(p, eq, R) {
  const esL = p.teams.home.name===eq, esV = p.teams.away.name===eq;
  if (!esL&&!esV) return null;
  if (p.goals.home==null) return null;
  const mg=esL?p.goals.home:p.goals.away, sg=esL?p.goals.away:p.goals.home, diff=mg-sg;
  const ko=esKO(p.league.round);
  let pt;
  if (ko) {
    const ganador = esL ? p.teams.home.winner : p.teams.away.winner;
    pt = ganador===true ? R.eliminatoria : 0;
    if (ganador===true && diff>0) pt += diff*R.difGoles;
  } else {
    pt = diff>0?R.ganado:diff===0?R.empate:R.perdido;
    if (diff>0) pt += diff*R.difGoles;
  }
  const evs=(p.events||[]).filter(e=>e.team.name===(esL?p.teams.home.name:p.teams.away.name));
  const am=evs.filter(e=>e.type==="Card"&&e.detail==="Yellow Card").length;
  const ro=evs.filter(e=>e.type==="Card"&&(e.detail==="Red Card"||e.detail==="Second Yellow card")).length;
  pt += am*R.amarilla + ro*R.roja;
  return { pt, mg, sg, diff, ko, am, ro, esL };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [duenos,   setDuenosState] = useState(()=>({...DUENOS_TEST_DEFAULT,...LD(`${KV_PREFIX}_due`,{})}));
  const [reglas,   setReglas]      = useState(()=>({...REGLAS_DEFAULT,...LD(`${KV_PREFIX}_reg`,{})}));
  const [bonos,    setBonos]       = useState(()=>({fairPlay:"",portero:"",goleo:"",...LD(`${KV_PREFIX}_bon`,{})}));
  const [semana,   setSemana]      = useState(()=>LD(`${KV_PREFIX}_semana`,0));
  const [seed,     setSeed]        = useState(()=>LD(`${KV_PREFIX}_seed`, Math.floor(Math.random()*99999)));
  const [partidos, setPartidos]    = useState(()=>LD(`${KV_PREFIX}_partidos`,[]));
  const [standings,setStandings]   = useState(()=>LD(`${KV_PREFIX}_std`,{}));

  const [tab,        setTab]       = useState("tabla");
  const [adminAuth,  setAdminAuth] = useState(false);
  const [adminPass,  setAdminPass] = useState("");
  const [adminError, setAdminError]= useState("");
  const [editBonos,  setEditBonos] = useState(false);
  const [editReglas, setEditReglas]= useState(false);
  const [bonosTmp,   setBonosTmp]  = useState(bonos);
  const [reglasTmp,  setReglasTmp] = useState(reglas);
  const [sortBy,     setSortBy]    = useState("fecha");
  const [sortDir,    setSortDir]   = useState("asc");
  const [filtroJ,    setFiltroJ]   = useState("TODOS");
  const [filtroF,    setFiltroF]   = useState("TODOS");

  const FASES_SIMULACION = [
    { id:0, lbl:"🏁 Sin iniciar",     desc:"Presiona 'Iniciar torneo' para generar partidos" },
    { id:1, lbl:"📅 Jornada 1 grupos", desc:"Primeros partidos de grupos" },
    { id:2, lbl:"📅 Jornada 2 grupos", desc:"Segunda jornada de grupos" },
    { id:3, lbl:"📅 Jornada 3 grupos", desc:"Última jornada de grupos" },
    { id:4, lbl:"⚔️ Cuartos",          desc:"Cuartos de final generados" },
    { id:5, lbl:"🏆 Semis + Final",    desc:"Semifinal, 3er lugar y Final" },
  ];

  // Seeded random para reproducibilidad
  function seededRnd(s, extra=0) {
    const x = Math.sin(s+extra+seed)*10000;
    return x - Math.floor(x);
  }

  const avanzarSemana = () => {
    if (semana >= 5) return;
    const nuevaSemana = semana + 1;

    // Regenerar TODOS los partidos hasta la semana actual (para consistencia)
    let todos = [];
    const eq = EQUIPOS_TEST;

    // Usar seed fijo para que los mismos partidos siempre den el mismo resultado
    Math.seedrandom = null; // usamos el seed guardado

    if (nuevaSemana >= 1) {
      // Jornada 1: cada equipo juega 1 partido
      const pares1 = [[eq[0],eq[4]],[eq[1],eq[5]],[eq[2],eq[6]],[eq[3],eq[7]]];
      pares1.forEach((par,i) => todos.push(generarPartidoConSeed(par[0],par[1],"group",100+i)));
    }
    if (nuevaSemana >= 2) {
      // Jornada 2
      const pares2 = [[eq[0],eq[5]],[eq[1],eq[4]],[eq[2],eq[7]],[eq[3],eq[6]]];
      pares2.forEach((par,i) => todos.push(generarPartidoConSeed(par[0],par[1],"group",200+i)));
    }
    if (nuevaSemana >= 3) {
      // Jornada 3 + standings
      const pares3 = [[eq[0],eq[6]],[eq[1],eq[7]],[eq[2],eq[4]],[eq[3],eq[5]]];
      pares3.forEach((par,i) => todos.push(generarPartidoConSeed(par[0],par[1],"group",300+i)));
      // Calcular standings basado en resultados reales
      const std = calcularStandings(todos);
      setStandings(std);
      LS(`${KV_PREFIX}_std`, std);
    }
    if (nuevaSemana >= 4) {
      // Cuartos - top 4 equipos por pts
      const clasificados = getClasificados(todos, 4);
      const qf1 = generarPartidoKOConSeed(clasificados[0], clasificados[3], "qf", 401);
      const qf2 = generarPartidoKOConSeed(clasificados[1], clasificados[2], "qf", 402);
      todos.push(qf1, qf2);
    }
    if (nuevaSemana >= 5) {
      // Necesitamos los ganadores de cuartos
      const clasificados = getClasificados(todos.filter(p=>p.league.round==="group"), 4);
      const qfs = todos.filter(p=>p.league.round==="qf");
      if (qfs.length >= 2) {
        const ganQ1 = qfs[0].teams.home.winner ? qfs[0].teams.home.name : qfs[0].teams.away.name;
        const perQ1 = qfs[0].teams.home.winner ? qfs[0].teams.away.name : qfs[0].teams.home.name;
        const ganQ2 = qfs[1].teams.home.winner ? qfs[1].teams.home.name : qfs[1].teams.away.name;
        const perQ2 = qfs[1].teams.home.winner ? qfs[1].teams.away.name : qfs[1].teams.home.name;
        todos.push(generarPartidoKOConSeed(ganQ1, ganQ2, "sf",   501));
        const sf = todos[todos.length-1];
        const ganSF = sf.teams.home.winner ? sf.teams.home.name : sf.teams.away.name;
        const perSF = sf.teams.home.winner ? sf.teams.away.name : sf.teams.home.name;
        todos.push(generarPartidoKOConSeed(perQ1, perSF, "3rd",  502));
        todos.push(generarPartidoKOConSeed(ganSF, perQ2, "final",503));
      }
    }

    setPartidos(todos);
    setSemana(nuevaSemana);
    LS(`${KV_PREFIX}_partidos`, todos);
    LS(`${KV_PREFIX}_semana`, nuevaSemana);
  };

  const resetTorneo = () => {
    const newSeed = Math.floor(Math.random()*99999);
    setSeed(newSeed); LS(`${KV_PREFIX}_seed`, newSeed);
    setSemana(0);     LS(`${KV_PREFIX}_semana`, 0);
    setPartidos([]);  LS(`${KV_PREFIX}_partidos`, []);
    setStandings({}); LS(`${KV_PREFIX}_std`, {});
  };

  // Generar partido con seed reproducible
  function generarPartidoConSeed(local, visita, ronda, s) {
    const r = (extra) => Math.floor(seededRnd(s, extra)*5);
    const gL = r(1), gV = r(2);
    const amL = Math.floor(seededRnd(s,3)*4), amV = Math.floor(seededRnd(s,4)*4);
    const roL = seededRnd(s,5)<0.1?1:0, roV = seededRnd(s,6)<0.1?1:0;
    const fecha = new Date(2026, 5, 11 + Math.floor(s/100)).toISOString();
    return {
      fixture: { id:`ts_${s}`, date:fecha, status:{ short:"FT" } },
      league:  { round:ronda },
      teams:   { home:{ name:local, winner:gL>gV?true:gL<gV?false:null }, away:{ name:visita, winner:gV>gL?true:gV<gL?false:null } },
      goals:   { home:gL, away:gV },
      events: [
        ...Array(amL).fill(null).map((_,i)=>({ type:"Card",detail:"Yellow Card",team:{name:local},  player:{name:`J${i}`},time:{elapsed:rnd(10,90)} })),
        ...Array(amV).fill(null).map((_,i)=>({ type:"Card",detail:"Yellow Card",team:{name:visita}, player:{name:`J${i}`},time:{elapsed:rnd(10,90)} })),
        ...(roL?[{type:"Card",detail:"Red Card",team:{name:local}, player:{name:"JR"},time:{elapsed:80}}]:[]),
        ...(roV?[{type:"Card",detail:"Red Card",team:{name:visita},player:{name:"JR"},time:{elapsed:80}}]:[]),
      ],
    };
  }

  function generarPartidoKOConSeed(local, visita, ronda, s) {
    const gL = Math.floor(seededRnd(s,1)*4), gV = Math.floor(seededRnd(s,2)*4);
    const amL = Math.floor(seededRnd(s,3)*4), amV = Math.floor(seededRnd(s,4)*4);
    const roL = seededRnd(s,5)<0.1?1:0, roV = seededRnd(s,6)<0.1?1:0;
    let winnerL=null, winnerV=null, status="FT";
    if (gL===gV) { status="PEN"; winnerL=seededRnd(s,7)>0.5; winnerV=!winnerL; }
    else { winnerL=gL>gV; winnerV=gV>gL; }
    const fecha = new Date(2026, 6, s%100).toISOString();
    return {
      fixture:{ id:`ts_ko_${s}`, date:fecha, status:{ short:status } },
      league: { round:ronda },
      teams:  { home:{ name:local, winner:winnerL }, away:{ name:visita, winner:winnerV } },
      goals:  { home:gL, away:gV },
      events: [
        ...Array(amL).fill(null).map((_,i)=>({ type:"Card",detail:"Yellow Card",team:{name:local},  player:{name:`J${i}`},time:{elapsed:rnd(10,90)} })),
        ...Array(amV).fill(null).map((_,i)=>({ type:"Card",detail:"Yellow Card",team:{name:visita}, player:{name:`J${i}`},time:{elapsed:rnd(10,90)} })),
        ...(roL?[{type:"Card",detail:"Red Card",team:{name:local}, player:{name:"JR"},time:{elapsed:80}}]:[]),
        ...(roV?[{type:"Card",detail:"Red Card",team:{name:visita},player:{name:"JR"},time:{elapsed:80}}]:[]),
      ],
    };
  }

  function calcularStandings(todos) {
    const pts={}, goles={};
    EQUIPOS_TEST.forEach(e=>{ pts[e]=0; goles[e]=0; });
    todos.filter(p=>p.league.round==="group").forEach(p=>{
      const {home:h, away:a} = p.teams;
      const gh=p.goals.home, ga=p.goals.away;
      if(gh>ga){ pts[h.name]=(pts[h.name]||0)+3; }
      else if(gh===ga){ pts[h.name]=(pts[h.name]||0)+1; pts[a.name]=(pts[a.name]||0)+1; }
      else { pts[a.name]=(pts[a.name]||0)+3; }
      goles[h.name]=(goles[h.name]||0)+gh-ga;
      goles[a.name]=(goles[a.name]||0)+ga-gh;
    });
    // Asignar 1ro/2do por pares (grupos de 2 equipos en esta simulación)
    const mapa = {};
    for (let i=0; i<EQUIPOS_TEST.length; i+=2) {
      const a=EQUIPOS_TEST[i], b=EQUIPOS_TEST[i+1];
      mapa[a] = (pts[a]||0)>=(pts[b]||0) ? 1 : 2;
      mapa[b] = mapa[a]===1 ? 2 : 1;
    }
    return mapa;
  }

  function getClasificados(grupoPartidos, n) {
    const pts={};
    EQUIPOS_TEST.forEach(e=>pts[e]=0);
    grupoPartidos.forEach(p=>{
      const {home:h,away:a}=p.teams, gh=p.goals.home, ga=p.goals.away;
      if(gh>ga) pts[h.name]+=3;
      else if(gh===ga){ pts[h.name]+=1; pts[a.name]+=1; }
      else pts[a.name]+=3;
    });
    return Object.entries(pts).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>e[0]);
  }

  // Calcular tabla
  const eqPorD={};
  Object.entries(duenos).forEach(([eq,d])=>{ if(!eqPorD[d])eqPorD[d]=[]; eqPorD[d].push(eq); });
  const statsD={};
  Object.keys(eqPorD).forEach(d=>{ statsD[d]={pt:0,g:0,e:0,p_:0,gl:0,am:0,ro:0,det:[]}; });

  const jugados = partidos.filter(p=>FINAL.includes(p.fixture.status.short));
  jugados.forEach(par=>{
    [par.teams.home.name, par.teams.away.name].forEach(eq=>{
      const d=duenos[eq]; if(!d||!statsD[d]) return;
      const r=calcPuntos(par,eq,reglas); if(!r) return;
      statsD[d].pt+=r.pt;
      if(r.diff>0)statsD[d].g++;else if(r.diff===0&&!r.ko)statsD[d].e++;else statsD[d].p_++;
      statsD[d].gl+=r.mg; statsD[d].am+=r.am; statsD[d].ro+=r.ro;
      statsD[d].det.push({par,eq,r});
    });
  });

  // Standings bonus
  Object.entries(standings).forEach(([eq,rank])=>{
    const d=duenos[eq]; if(!d||!statsD[d]) return;
    if(rank===1) statsD[d].pt+=reglas.primeroGrupo;
    else if(rank===2) statsD[d].pt+=reglas.segundoGrupo;
  });

  // Bonos
  if(bonos.fairPlay&&duenos[bonos.fairPlay]&&statsD[duenos[bonos.fairPlay]]) statsD[duenos[bonos.fairPlay]].pt+=reglas.fairPlay;
  if(bonos.portero&&duenos[bonos.portero]&&statsD[duenos[bonos.portero]])    statsD[duenos[bonos.portero]].pt+=reglas.portero;
  if(bonos.goleo&&duenos[bonos.goleo]&&statsD[duenos[bonos.goleo]])          statsD[duenos[bonos.goleo]].pt+=reglas.goleo;

  const tabla=Object.entries(statsD).sort((a,b)=>b[1].pt-a[1].pt).map(([d,s],i)=>({pos:i+1,d,...s}));
  const med=p=>p===1?"🥇":p===2?"🥈":p===3?"🥉":`${p}.`;

  const saveDuenos  = d => { setDuenosState(d); LS(`${KV_PREFIX}_due`,d); };
  const guardarBonos  = () => { setBonos(bonosTmp);  LS(`${KV_PREFIX}_bon`,bonosTmp);  setEditBonos(false); };
  const guardarReglas = () => { setReglas(reglasTmp); LS(`${KV_PREFIX}_reg`,reglasTmp); setEditReglas(false); };

  const handleSort = k => { if(sortBy===k) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy(k);setSortDir("asc");}};
  const allFases = ["TODOS",...new Set(jugados.map(p=>faseLabel(p.league.round)).filter(Boolean))];
  const allJugadores = ["TODOS",...new Set(Object.values(duenos).filter(Boolean))];

  const todos_desglose = tabla.flatMap(row=>
    row.det.filter(d=>FINAL.includes(d.par.fixture.status.short)).map(d=>({
      dueno:row.d, eq:d.eq,
      rival:d.r.esL?d.par.teams.away.name:d.par.teams.home.name,
      gfavor:d.r.esL?d.par.goals.home:d.par.goals.away,
      gcontra:d.r.esL?d.par.goals.away:d.par.goals.home,
      diff:d.r.diff, fase:faseLabel(d.par.league.round),
      fecha:d.par.fixture.date||"", am:d.r.am, ro:d.r.ro, pt:d.r.pt, r:d.r, par:d.par,
    }))
  ).filter(t=>filtroJ==="TODOS"||t.dueno===filtroJ)
   .filter(t=>filtroF==="TODOS"||t.fase===filtroF)
   .sort((a,b)=>{
     let cmp=0;
     if(sortBy==="fecha") cmp=a.fecha.localeCompare(b.fecha);
     else if(sortBy==="pts") cmp=a.pt-b.pt;
     else if(sortBy==="amarillas") cmp=a.am-b.am;
     else if(sortBy==="difgoles") cmp=a.diff-b.diff;
     return sortDir==="asc"?cmp:-cmp;
   });

  const TABS=[{id:"tabla",lbl:"🏆 Tabla"},{id:"partidos",lbl:`📅 Partidos (${jugados.length})`},{id:"bonos",lbl:"🎖 Bonos"},{id:"reglas",lbl:"📋 Reglas"},{id:"admin",lbl:"⚙️ Admin"}];
  const faseActual = FASES_SIMULACION[semana];
  const COLOR="#a855f7";

  const btnF=(val,act,set,lbl)=><button key={val} style={{...S.btnF,...(act===val?{...S.btnF,background:"rgba(168,85,247,0.2)",border:"1px solid #a855f7",color:"#a855f7"}:{})}} onClick={()=>set(val)}>{lbl||val}</button>;
  const SORTS=[{k:"fecha",lbl:"📅 Fecha"},{k:"pts",lbl:"🏆 Pts"},{k:"difgoles",lbl:"⚽ Goles"},{k:"amarillas",lbl:"🟨"}];

  return (
    <div style={S.root}>
      <header style={{...S.hdr,borderBottomColor:COLOR}}>
        <div style={S.hdrTop}>
          <div style={S.logo}>
            <span style={{fontSize:28}}>🧪</span>
            <div>
              <div style={{fontSize:20,fontWeight:900,letterSpacing:3,background:`linear-gradient(90deg,${COLOR},#ef4444)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                QUINIELA TEST
              </div>
              <div style={{fontSize:10,color:"#475569",letterSpacing:1}}>
                SIMULACIÓN ALEATORIA · 8 EQUIPOS · 2 PARTICIPANTES
              </div>
            </div>
          </div>
          <div style={S.hdrR}>
            <span style={{fontSize:11,fontWeight:700,color:COLOR,background:"rgba(168,85,247,0.15)",borderRadius:20,padding:"2px 10px",border:`1px solid ${COLOR}`}}>
              {faseActual.lbl}
            </span>
            <span style={{fontSize:10,color:"#64748b"}}>{jugados.length}J jugados</span>
          </div>
        </div>
        {/* Nav */}
        <div style={{padding:"3px 16px",background:"rgba(0,0,0,0.3)",display:"flex",gap:12,alignItems:"center",borderTop:"1px solid #1e3a5f"}}>
          <span style={{fontSize:10,color:"#475569"}}>Quinielas:</span>
          <a href="#/" style={{fontSize:11,color:"#64748b",fontWeight:700,textDecoration:"none"}}>🔍 2022</a>
          <a href="#/test" style={{fontSize:11,color:COLOR,fontWeight:700,textDecoration:"none"}}>🧪 Test</a>
          <a href="#/familia" style={{fontSize:11,color:"#64748b",fontWeight:700,textDecoration:"none"}}>🏠 Familia</a>
          <a href="#/amigos" style={{fontSize:11,color:"#64748b",fontWeight:700,textDecoration:"none"}}>👥 Amigos</a>
        </div>
        <nav style={S.tabs}>
          {TABS.map(t=>(
            <button key={t.id} style={{...S.tab,...(tab===t.id?{color:COLOR,borderBottom:`2px solid ${COLOR}`,background:"rgba(168,85,247,0.07)"}:{})}} onClick={()=>setTab(t.id)}>
              {t.lbl}
            </button>
          ))}
        </nav>
      </header>

      <main style={S.main}>

        {/* ══ CONTROL SIMULACIÓN ══ */}
        <div style={{background:"rgba(168,85,247,0.08)",border:`1px solid ${COLOR}33`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:14,fontWeight:900,color:COLOR}}>{faseActual.lbl}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{faseActual.desc}</div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {semana < 5 && (
                <button onClick={avanzarSemana} style={{background:`linear-gradient(135deg,${COLOR},#ec4899)`,border:"none",borderRadius:8,color:"#fff",padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:700}}>
                  {semana===0?"🎲 Iniciar torneo":`⏭ Avanzar → ${FASES_SIMULACION[semana+1].lbl}`}
                </button>
              )}
              {semana > 0 && (
                <button onClick={resetTorneo} style={{background:"#1e293b",border:"1px solid #475569",borderRadius:8,color:"#94a3b8",padding:"8px 14px",cursor:"pointer",fontSize:12}}>
                  🔄 Nuevo torneo
                </button>
              )}
            </div>
          </div>
          {/* Barra de progreso */}
          <div style={{marginTop:10,background:"rgba(255,255,255,0.05)",borderRadius:20,height:6,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${semana/5*100}%`,background:`linear-gradient(90deg,${COLOR},#ec4899)`,borderRadius:20,transition:"width 0.5s"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            {FASES_SIMULACION.map(f=>(
              <span key={f.id} style={{fontSize:9,color:semana>=f.id?COLOR:"#334155",fontWeight:semana===f.id?700:400}}>{f.id}</span>
            ))}
          </div>
        </div>

        {/* ══ TABLA ══ */}
        {tab==="tabla"&&(
          <div>
            <H2 color={COLOR}>Tabla de Posiciones</H2>
            {tabla.length===0
              ? <p style={{color:"#64748b",fontSize:13}}>Presiona "🎲 Iniciar torneo" para generar resultados aleatorios.</p>
              : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {tabla.map(row=>(
                    <div key={row.d} style={{...S.cardD,...(row.pos===1?{border:`1px solid ${COLOR}`}:{})}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div>
                          <div style={{fontSize:22}}>{med(row.pos)}</div>
                          <div style={{fontSize:20,fontWeight:900}}>{row.d}</div>
                          <div style={{fontSize:32,fontWeight:900,background:`linear-gradient(90deg,${COLOR},#ec4899)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                            {row.pt}<span style={{fontSize:12,WebkitTextFillColor:"#94a3b8",marginLeft:4}}>pts</span>
                          </div>
                          <div style={S.chips}>
                            <span style={S.chip}>✅{row.g}G</span>
                            <span style={S.chip}>➖{row.e}E</span>
                            <span style={S.chip}>❌{row.p_}P</span>
                            <span style={S.chip}>⚽{row.gl}</span>
                            {row.am>0&&<span style={{...S.chip,color:"#fbbf24"}}>🟨{row.am}</span>}
                            {row.ro>0&&<span style={{...S.chip,color:"#f87171"}}>🟥{row.ro}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          {(eqPorD[row.d]||[]).map(eq=><div key={eq} style={{fontSize:11,color:"#94a3b8"}}>{fl(eq)} {eq}</div>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            }

            {/* Standings */}
            {Object.keys(standings).length>0&&(
              <div style={{marginTop:16}}>
                <H2 color={COLOR}>Posiciones de Grupo</H2>
                <div style={S.tblD}>
                  {Object.entries(standings).map(([eq,rank],i)=>(
                    <div key={eq} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 12px",borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"rgba(255,255,255,0.02)":"transparent"}}>
                      <span style={{fontSize:13}}>{fl(eq)} {eq}</span>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontSize:11,color:"#64748b"}}>{duenos[eq]||"Sin dueño"}</span>
                        <span style={{fontSize:12,fontWeight:700,color:rank===1?"#f59e0b":rank===2?"#94a3b8":"#64748b"}}>
                          {rank===1?"🥇 1ro":rank===2?"🥈 2do":"3ro+"}
                          <span style={{color:COLOR,marginLeft:4}}>+{rank===1?reglas.primeroGrupo:rank===2?reglas.segundoGrupo:0}pts</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ PARTIDOS ══ */}
        {tab==="partidos"&&(
          <div>
            <H2 color={COLOR}>Partidos ({jugados.length})</H2>
            {jugados.length===0
              ? <p style={{color:"#64748b",fontSize:13}}>Inicia el torneo para ver partidos.</p>
              : <>
                  <div style={{marginBottom:6}}>
                    <span style={S.lblFiltro}>Jugador: </span>
                    {allJugadores.map(j=>btnF(j,filtroJ,setFiltroJ,j==="TODOS"?"Todos":j))}
                  </div>
                  <div style={{marginBottom:6}}>
                    <span style={S.lblFiltro}>Fase: </span>
                    {allFases.map(f=>btnF(f,filtroF,setFiltroF,f==="TODOS"?"Todas":f))}
                  </div>
                  <div style={{marginBottom:12}}>
                    <span style={S.lblFiltro}>Ordenar: </span>
                    {SORTS.map(s=>(
                      <button key={s.k} style={{...S.btnF,...(sortBy===s.k?{background:"rgba(168,85,247,0.2)",border:`1px solid ${COLOR}`,color:COLOR}:{})}} onClick={()=>handleSort(s.k)}>
                        {s.lbl}{sortBy===s.k?(sortDir==="asc"?" ↑":" ↓"):""}
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:12,color:"#475569",marginBottom:10}}>{todos_desglose.length} partidos</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {todos_desglose.map((t,i)=>{
                      const fecha=t.fecha?new Date(t.fecha).toLocaleDateString("es-MX",{day:"2-digit",month:"short"}):"";
                      const bgCard=t.pt>0?"rgba(74,222,128,0.05)":t.pt<0?"rgba(248,113,113,0.05)":"rgba(255,255,255,0.02)";
                      const brd=t.pt>0?"rgba(74,222,128,0.2)":t.pt<0?"rgba(248,113,113,0.2)":"rgba(255,255,255,0.06)";
                      return(
                        <div key={i} style={{background:bgCard,border:`1px solid ${brd}`,borderRadius:10,overflow:"hidden"}}>
                          <div style={{display:"flex",gap:6,alignItems:"center",padding:"4px 12px",background:"rgba(0,0,0,0.2)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                            <span style={{fontSize:10,fontWeight:700,color:"#f59e0b",background:"rgba(245,158,11,0.15)",borderRadius:4,padding:"1px 5px"}}>{t.fase}</span>
                            <span style={{fontSize:10,color:"#475569"}}>{fecha}</span>
                            <span style={{marginLeft:"auto",fontSize:11,color:"#f59e0b",fontWeight:700}}>{t.dueno}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",padding:"10px 14px",gap:8}}>
                            <div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:20}}>{fl(t.eq)}</span>
                              <span style={{fontSize:14,fontWeight:700}}>{t.eq}</span>
                            </div>
                            <div style={{background:"rgba(0,0,0,0.4)",borderRadius:8,padding:"6px 14px",border:"1px solid rgba(255,255,255,0.1)",display:"flex",gap:4,alignItems:"center"}}>
                              <span style={{fontSize:22,fontWeight:900}}>{t.gfavor}</span>
                              <span style={{color:"#475569"}}>–</span>
                              <span style={{fontSize:22,fontWeight:900}}>{t.gcontra}</span>
                              {t.par.fixture.status.short==="PEN"&&<span style={{fontSize:9,color:"#64748b",marginLeft:2}}>(PEN)</span>}
                            </div>
                            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
                              <span style={{fontSize:14,fontWeight:700,color:"#64748b"}}>{t.rival}</span>
                              <span style={{fontSize:20}}>{fl(t.rival)}</span>
                            </div>
                          </div>
                          <div style={{padding:"0 12px 10px"}}>
                            <PtsDesglose r={t.r} dueno={t.dueno} R={reglas} ko={esKO(t.par.league.round)} color={COLOR}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
            }
          </div>
        )}

        {/* ══ BONOS ══ */}
        {tab==="bonos"&&(
          <div>
            <H2 color={COLOR}>Bonos Especiales</H2>
            <div style={S.infoBox}>
              En el torneo real FIFA anuncia estos premios al final. En el test puedes asignarlos manualmente para verificar el cálculo.
            </div>
            {[
              {k:"goleo",icon:"⚽",lbl:"Campeón Goleo",pts:reglas.goleo},
              {k:"fairPlay",icon:"🏅",lbl:"FIFA Fair Play",pts:reglas.fairPlay},
              {k:"portero",icon:"🧤",lbl:"Mejor Portero",pts:reglas.portero},
            ].map((b,bi)=>(
              <div key={b.k} style={S.bonoCard}>
                <div style={S.bonoHdr}>
                  <span style={{fontSize:20}}>{b.icon}</span>
                  <div><div style={{fontWeight:900}}>{b.lbl}</div><div style={{fontSize:12,color:"#64748b"}}>+{b.pts} pts</div></div>
                  {!editBonos&&bi===0&&<button style={{...S.btnSmall,marginLeft:"auto"}} onClick={()=>{if(adminAuth){setBonosTmp({...bonos});setEditBonos(true);}else setTab("admin");}}>
                    {adminAuth?"✏️ Editar":"🔐 Editar"}
                  </button>}
                  {editBonos&&bi===0&&<div style={{marginLeft:"auto",display:"flex",gap:6}}>
                    <button style={{...S.btnSmall,background:"#64748b"}} onClick={()=>setEditBonos(false)}>Cancelar</button>
                    <button style={{...S.btnSmall,background:"#16a34a"}} onClick={guardarBonos}>✅ Guardar</button>
                  </div>}
                </div>
                {editBonos
                  ?<div style={{marginTop:8}}><label style={S.lbl}>{b.lbl}</label><input style={S.inp} value={bonosTmp[b.k]} placeholder="Equipo..." onChange={e=>setBonosTmp(p=>({...p,[b.k]:e.target.value}))}/></div>
                  :<div style={{...S.bonoVal,marginTop:8}}>
                    <span style={{fontSize:20}}>{bonos[b.k]?fl(bonos[b.k]):"❓"}</span>
                    <div>
                      <div style={{fontWeight:700}}>{bonos[b.k]||"No asignado"}</div>
                      {bonos[b.k]&&<div style={{fontSize:12,color:COLOR,fontWeight:700}}>→ {duenos[bonos[b.k]]||"Sin dueño"} +{b.pts} pts</div>}
                    </div>
                  </div>
                }
              </div>
            ))}
          </div>
        )}

        {/* ══ REGLAS ══ */}
        {tab==="reglas"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <H2 color={COLOR}>Reglas</H2>
              {!editReglas
                ?<button style={S.btnEdit} onClick={()=>{if(adminAuth){setReglasTmp({...reglas});setEditReglas(true);}else setTab("admin");}}>{adminAuth?"✏️ Editar":"🔐 Editar"}</button>
                :<div style={{display:"flex",gap:8}}>
                  <button style={{...S.btnEdit,background:"#64748b"}} onClick={()=>setEditReglas(false)}>Cancelar</button>
                  <button style={{...S.btnEdit,background:"#16a34a"}} onClick={guardarReglas}>✅ Guardar</button>
                </div>
              }
            </div>
            <div style={S.gridReglas}>
              {[
                {k:"ganado",lbl:"Ganado (grupo)"},{k:"empate",lbl:"Empate (grupo)"},{k:"perdido",lbl:"Perdido"},
                {k:"difGoles",lbl:"Dif goles"},{k:"amarilla",lbl:"🟨 Amarilla"},{k:"roja",lbl:"🟥 Roja"},
                {k:"primeroGrupo",lbl:"1ro grupo"},{k:"segundoGrupo",lbl:"2do grupo"},{k:"eliminatoria",lbl:"Victoria KO"},
                {k:"goleo",lbl:"Goleo"},{k:"portero",lbl:"Portero"},{k:"fairPlay",lbl:"Fair Play"},
              ].map(r=>(
                <div key={r.k} style={S.cardRegla}>
                  <span style={{fontSize:12,color:"#94a3b8",flex:1}}>{r.lbl}</span>
                  {editReglas
                    ?<input type="number" style={{...S.inp,width:55,textAlign:"center",padding:"3px"}} value={reglasTmp[r.k]} onChange={e=>setReglasTmp(p=>({...p,[r.k]:Number(e.target.value)}))}/>
                    :<span style={{fontSize:14,fontWeight:900,color:COLOR}}>{reglas[r.k]>0?"+":""}{reglas[r.k]}</span>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ ADMIN ══ */}
        {tab==="admin"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <H2 color={COLOR}>⚙️ Admin Test</H2>
              {!adminAuth
                ?<button style={S.btnEdit} onClick={()=>setAdminAuth("pending")}>🔐 Editar</button>
                :<button style={{...S.btnEdit,background:"#dc2626"}} onClick={()=>{setAdminAuth(false);setAdminPass("");}}>🔒 Salir</button>
              }
            </div>
            {adminAuth==="pending"&&(
              <div style={{background:"#0f172a",border:`1px solid ${COLOR}`,borderRadius:10,padding:16,maxWidth:360,marginBottom:12}}>
                <div style={{display:"flex",gap:8}}>
                  <input type="password" style={{...S.inp,flex:1}} placeholder="Contraseña..." value={adminPass}
                    onChange={e=>setAdminPass(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"){if(adminPass===ADMIN_PASS){setAdminAuth(true);setAdminError("");}else setAdminError("Incorrecta");}}}
                    autoFocus/>
                  <button style={S.btnEdit} onClick={()=>{if(adminPass===ADMIN_PASS){setAdminAuth(true);setAdminError("");}else setAdminError("Incorrecta");}}>Entrar</button>
                </div>
                {adminError&&<p style={{color:"#f87171",fontSize:12,marginTop:6}}>{adminError}</p>}
              </div>
            )}

            {/* Resumen siempre visible */}
            <H2 color={COLOR}>Equipos por Participante</H2>
            <div style={S.tblD}>
              {Object.entries(eqPorD).map(([d,eqs],i)=>(
                <div key={d} style={{...S.fD,gridTemplateColumns:"1fr 2fr",background:i%2===0?"rgba(255,255,255,0.03)":"transparent",alignItems:"center"}}>
                  <span style={{...S.cD,fontWeight:700,color:COLOR,fontSize:13}}>{d}</span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"4px 0"}}>
                    {eqs.map(eq=><span key={eq} style={{background:"rgba(255,255,255,0.06)",borderRadius:20,padding:"1px 8px",fontSize:11}}>{fl(eq)} {eq}</span>)}
                  </div>
                </div>
              ))}
            </div>

            {adminAuth===true&&(
              <div style={{marginTop:16}}>
                <p style={{color:"#4ade80",fontSize:12,marginBottom:10}}>✅ Modo edición activo</p>
                <H2 color={COLOR}>Reasignar Equipos</H2>
                <div style={S.listaEq}>
                  {EQUIPOS_TEST.map(eq=>(
                    <div key={eq} style={S.filaEq}>
                      <span style={{fontSize:18,width:24}}>{fl(eq)}</span>
                      <span style={{flex:1,fontSize:13,fontWeight:600}}>{eq}</span>
                      <input style={{...S.inputD,width:130}}
                        value={duenos[eq]||""} placeholder="Participante..."
                        list="lista-p-test"
                        onChange={e=>saveDuenos({...duenos,[eq]:e.target.value})}
                      />
                    </div>
                  ))}
                  <datalist id="lista-p-test">
                    {[...new Set(Object.values(duenos).filter(Boolean))].map(n=><option key={n} value={n}/>)}
                  </datalist>
                </div>
                <button onClick={()=>saveDuenos({...DUENOS_TEST_DEFAULT})} style={{...S.btnEdit,background:"#64748b",marginTop:10}}>↺ Restaurar default</button>
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={{textAlign:"center",padding:12,fontSize:11,color:"#334155",borderTop:`1px solid ${COLOR}22`,marginTop:20}}>
        🧪 Quiniela Test · Resultados Aleatorios · Sin API · Datos de prueba
      </footer>
    </div>
  );
}

function PtsDesglose({ r, dueno, R, ko, color="#f59e0b" }) {
  const ptBase=r.diff>0?(ko?R.eliminatoria:R.ganado):r.diff===0?(ko?0:R.empate):R.perdido;
  const ptDif=r.diff>0?r.diff*R.difGoles:0;
  const ptAm=r.am*R.amarilla, ptRo=r.ro*R.roja;
  const c=r.pt>=0?"#4ade80":"#f87171";
  const bg=r.pt>0?"rgba(74,222,128,0.08)":r.pt<0?"rgba(248,113,113,0.08)":"rgba(255,255,255,0.04)";
  const brd=r.pt>0?"rgba(74,222,128,0.2)":r.pt<0?"rgba(248,113,113,0.2)":"rgba(255,255,255,0.06)";
  const partes=[];
  if(r.diff>0)        partes.push({lbl:ko?"🏆 Eliminatoria":"✅ Victoria",val:ptBase,c:"#4ade80"});
  else if(r.diff===0) partes.push({lbl:ko?"— Elim. empate":"➖ Empate",   val:ptBase,c:"#facc15"});
  else                partes.push({lbl:"❌ Derrota",                      val:ptBase,c:"#64748b"});
  if(ptDif>0) partes.push({lbl:`⚽ ${r.diff} gol${r.diff>1?"es":""} dif`,val:ptDif,c:"#34d399"});
  if(r.am>0)  partes.push({lbl:`🟨 ${r.am} amarilla${r.am>1?"s":""}`,val:ptAm,c:"#fbbf24"});
  if(r.ro>0)  partes.push({lbl:`🟥 ${r.ro} roja${r.ro>1?"s":""}`,    val:ptRo,c:"#f87171"});
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",background:bg,borderRadius:8,padding:"6px 10px",border:`1px solid ${brd}`}}>
      <span style={{fontSize:12,fontWeight:800,color:c,minWidth:80}}>{dueno}</span>
      <span style={{fontSize:11,color:"#475569"}}>→</span>
      {partes.map((p,i)=><span key={i} style={{fontSize:11,color:p.c,background:"rgba(0,0,0,0.25)",borderRadius:20,padding:"2px 8px",fontWeight:600}}>{p.lbl} <strong>{p.val>0?"+":""}{p.val}</strong></span>)}
      <span style={{fontSize:13,fontWeight:900,color:c,marginLeft:"auto",background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"2px 8px"}}>{r.pt>0?"+":""}{r.pt} pts</span>
    </div>
  );
}

function H2({children,color,style}){
  return <h2 style={{fontSize:16,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:color||"#f59e0b",marginBottom:10,marginTop:4,borderLeft:"4px solid #ef4444",paddingLeft:8,...style}}>{children}</h2>;
}

const S={
  root:{minHeight:"100vh",background:"linear-gradient(160deg,#060d1a,#0a1628,#0d1f3a)",color:"#e2e8f0",fontFamily:"'Barlow Condensed','Oswald','Arial Narrow',sans-serif",fontSize:15},
  hdr:{background:"linear-gradient(180deg,#071020,#0a1628)",borderBottom:"2px solid",position:"sticky",top:0,zIndex:100,boxShadow:"0 6px 24px rgba(0,0,0,0.6)"},
  hdrTop:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",flexWrap:"wrap",gap:8},
  logo:{display:"flex",alignItems:"center",gap:10},
  hdrR:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"},
  tabs:{display:"flex",overflowX:"auto",padding:"0 8px",borderTop:"1px solid #1e3a5f"},
  tab:{background:"transparent",border:"none",color:"#64748b",padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:700,borderBottom:"2px solid transparent",whiteSpace:"nowrap"},
  main:{padding:16,maxWidth:900,margin:"0 auto"},
  infoBox:{background:"rgba(59,130,246,0.08)",border:"1px solid #3b82f6",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#93c5fd",fontSize:13,lineHeight:1.6},
  cardD:{background:"linear-gradient(135deg,#0f172a,#1a2744)",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 14px"},
  chips:{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"},
  chip:{fontSize:11,color:"#94a3b8"},
  tblD:{background:"#0f172a",borderRadius:8,border:"1px solid #1e3a5f",overflow:"hidden"},
  fD:{display:"grid",padding:"5px 10px",gap:3,borderBottom:"1px solid rgba(255,255,255,0.04)"},
  hD:{fontSize:9,color:"#475569",fontWeight:700,textTransform:"uppercase"},
  cD:{fontSize:10,color:"#94a3b8"},
  btnF:{background:"rgba(255,255,255,0.05)",border:"1px solid #1e3a5f",borderRadius:5,color:"#64748b",padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,marginRight:3,marginBottom:3},
  bonoCard:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 14px",marginBottom:10},
  bonoHdr:{display:"flex",alignItems:"center",gap:10},
  bonoVal:{display:"flex",alignItems:"center",gap:10,padding:"8px",background:"rgba(255,255,255,0.03)",borderRadius:8},
  gridReglas:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:6},
  cardRegla:{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  btnEdit:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:7,color:"#fff",padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700},
  btnSmall:{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:6,color:"#fff",padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700},
  lbl:{display:"block",fontSize:11,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:1},
  inp:{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"6px 10px",fontSize:13,outline:"none",boxSizing:"border-box"},
  listaEq:{display:"flex",flexDirection:"column",gap:4},
  filaEq:{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"rgba(255,255,255,0.02)",borderRadius:6},
  inputD:{background:"rgba(255,255,255,0.06)",border:"1px solid #334155",borderRadius:5,color:"#e2e8f0",padding:"3px 8px",fontSize:12,outline:"none"},
  lblFiltro:{fontSize:11,color:"#475569",marginRight:4,textTransform:"uppercase",letterSpacing:1},
};
