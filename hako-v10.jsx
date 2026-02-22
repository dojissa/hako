import { useState, useRef, useMemo, useEffect, useCallback } from "react";

// ─── PALETTES ────────────────────────────────────────────────────────────────
const PALETTES = {
  lavender: { name:"Lavender", bg:"#b8bfe8", surface:"#c8ceee", card:"#d4d9f4", border:"#8a93c8", text:"#1e2140", muted:"#5a6090", accent:"#3a4080", soft:"#f0f2ff" },
  sage:     { name:"Sage",     bg:"#b0c8bc", surface:"#bdd4c8", card:"#ccddd4", border:"#5a8870", text:"#162418", muted:"#3a6050", accent:"#1e5035", soft:"#eaf5ef" },
  blush:    { name:"Blush",    bg:"#dfc4bc", surface:"#eacec6", card:"#f2d8d0", border:"#a86858", text:"#2e1410", muted:"#805040", accent:"#6e2c1c", soft:"#fff0ec" },
  charcoal: { name:"Charcoal", bg:"#1e2023", surface:"#26292d", card:"#2d3135", border:"#3c4148", text:"#c4cad2", muted:"#666d77", accent:"#7b9fbe", soft:"#dce6f0" },
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_FULL    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const HOUR_H      = 52;
const LABEL_W     = 24; // 2-digit 24h labels
const DEFAULT_DUR = 30; // default event duration in minutes
const QUICK_DURS  = [15, 30, 60, 90, 120];

function uid()        { return Math.random().toString(36).slice(2,9); }
function todayDate()  { return new Date(); }
function fmtDate(d)   { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function parseDate(s) { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function sameDay(a,b) { return a&&b&&fmtDate(a)===fmtDate(b); }
function addDays(d,n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d){ const r=new Date(d); r.setDate(d.getDate()-((d.getDay()+6)%7)); return r; }
function HourLabel(h) { return String(h).padStart(2,"0"); }
function minsToHM(m)  { const h=Math.floor(m/60)%24,mm=m%60; return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; }
function fmtTimeInput(m){ return String(Math.floor(m/60)%24).padStart(2,"0")+":"+String(m%60).padStart(2,"0"); }
function parseTimeInput(s){ const [h,m]=s.split(":").map(Number); return (h||0)*60+(m||0); }

// ─── PANEL DEFINITIONS ───────────────────────────────────────────────────────
// col assignments: defaultCol 0=main, 1=right. compact=true means auto-height (mini-cal).
// flexible=true means panel can be dragged to any column.
const PANEL_DEFS = {
  monthly:   { label:"Monthly",    minW:220, minH:200, defaultCol:0, flexible:true  },
  weekly5:   { label:"Weekly (5)", minW:400, minH:200, defaultCol:0, flexible:false },
  weekly7:   { label:"Weekly (7)", minW:500, minH:200, defaultCol:0, flexible:false },
  daily:     { label:"Daily",      minW:260, minH:200, defaultCol:0, flexible:true  },
  sixmonth:  { label:"6 Months",   minW:340, minH:200, defaultCol:0, flexible:true  },
  agenda:    { label:"Agenda",     minW:200, minH:200, defaultCol:1, flexible:true  },
  ongoing:   { label:"On-Going",   minW:200, minH:200, defaultCol:1, flexible:true  },
  notes:     { label:"Notes",      minW:200, minH:200, defaultCol:1, flexible:true  },
  "mini-cal":{ label:"Mini Cal",   minW:180, minH:10,  defaultCol:1, flexible:true, compact:true },
};

// ─── GLOBAL STYLES ───────────────────────────────────────────────────────────
function GlobalStyle({ palette }) {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body,#root{height:100%;overflow:hidden}
    body{background:${palette.bg};font-family:'DM Sans',sans-serif;font-size:13px;color:${palette.text};line-height:1.4}
    ::-webkit-scrollbar{width:3px;height:3px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${palette.border}55;border-radius:2px}
    input,textarea,button,select{font-family:'DM Sans',sans-serif}
    button{cursor:pointer;border:none;background:none}
    input:focus,textarea:focus{outline:none}
    .today-pill{display:inline-flex;align-items:center;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;letter-spacing:0.04em;cursor:pointer;transition:opacity .15s}
    .today-pill:hover{opacity:0.8}
    .ev-block{touch-action:none;user-select:none;}
    .ev-resize-handle{position:absolute;bottom:0;left:0;right:0;height:8px;cursor:ns-resize;background:linear-gradient(transparent,rgba(0,0,0,0.12));border-radius:0 0 3px 3px;opacity:0;transition:opacity .15s;}
    .ev-block:hover .ev-resize-handle{opacity:1;}
  `}</style>;
}

// ─── LAYOUT ENGINE (removed — panels carry their own col) ────────────────────

// ─── TIME GRID ────────────────────────────────────────────────────────────────
function TimeGrid({ dateKey, events, palette, onSlotClick, onEventDrop, onTaskDrop, onEventClick, onEventResize }) {
  const hours = Array.from({length:24},(_,i)=>i);
  const gridRef = useRef(null);

  const positioned = useMemo(() => {
    const dayEvs = events.filter(e => e.date === dateKey);
    const sorted = [...dayEvs].sort((a,b)=>(a.startHour*60+(a.startMin||0))-(b.startHour*60+(b.startMin||0)));
    const out = [];
    sorted.forEach(ev => {
      const es=ev.startHour*60+(ev.startMin||0), ee=es+(ev.duration||DEFAULT_DUR);
      let col=0;
      while(out.filter(p=>{const ps=p.startHour*60+(p.startMin||0),pe=ps+(p.duration||DEFAULT_DUR);return p.col===col&&es<pe&&ee>ps}).length>0) col++;
      out.push({...ev,col});
    });
    out.forEach(ev=>{
      const es=ev.startHour*60+(ev.startMin||0),ee=es+(ev.duration||DEFAULT_DUR);
      const sibs=out.filter(p=>{const ps=p.startHour*60+(p.startMin||0),pe=ps+(p.duration||DEFAULT_DUR);return es<pe&&ee>ps});
      ev.totalCols=Math.max(...sibs.map(s=>s.col))+1;
    });
    return out;
  },[events,dateKey]);

  const getTimeFromY = clientY => {
    const rect=gridRef.current?.getBoundingClientRect();
    if(!rect) return { hour:9, min:0 };
    const raw = (clientY - rect.top) / HOUR_H;
    const hour = Math.max(0, Math.min(23, Math.floor(raw)));
    const min  = Math.round(((raw - hour) * 60) / 15) * 15;
    return { hour, min: min >= 60 ? 45 : min };
  };

  // Resize drag state (per-event)
  const resizeRef = useRef(null);

  const startResize = (e, ev) => {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY;
    const startDur = ev.duration || 60;
    resizeRef.current = { evId: ev.id, startY, startDur };

    const onMove = me => {
      if (!resizeRef.current) return;
      const dy = me.clientY - resizeRef.current.startY;
      const deltaMins = Math.round((dy / HOUR_H) * 60 / 15) * 15;
      const newDur = Math.max(15, resizeRef.current.startDur + deltaMins);
      onEventResize && onEventResize(resizeRef.current.evId, newDur);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={gridRef}
      style={{position:"relative", height:hours.length*HOUR_H, cursor:"crosshair", minWidth:0}}
      onClick={e=>{e.stopPropagation(); const {hour,min}=getTimeFromY(e.clientY); onSlotClick&&onSlotClick(hour,min);}}
      onDragOver={e=>e.preventDefault()}
      onDrop={e=>{
        e.preventDefault();
        const evId=e.dataTransfer.getData("eventId");
        const tkId=e.dataTransfer.getData("taskId");
        const {hour,min}=getTimeFromY(e.clientY);
        if(evId&&onEventDrop) onEventDrop(evId,dateKey,hour,min);
        if(tkId&&onTaskDrop)  onTaskDrop(tkId,dateKey,hour,min);
      }}>
      {hours.map((hr,i)=>(
        <div key={hr} style={{position:"absolute",top:i*HOUR_H,left:0,right:0,height:HOUR_H,
          borderTop:`1px solid ${palette.border}${hr===0?"":"33"}`,pointerEvents:"none"}}>
          <span style={{position:"absolute",top:2,left:0,fontSize:9,color:palette.muted,
            fontWeight:400,width:LABEL_W,textAlign:"right",paddingRight:2,lineHeight:1,
            whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums",letterSpacing:"0.01em"}}>
            {HourLabel(hr)}
          </span>
        </div>
      ))}
      {positioned.map(ev=>{
        const top=(ev.startHour+(ev.startMin||0)/60)*HOUR_H;
        const ht=Math.max(HOUR_H*0.35,((ev.duration||DEFAULT_DUR)/60)*HOUR_H-2);
        const colW = `calc((100% - ${LABEL_W+4}px) / ${ev.totalCols})`;
        const colOff = `calc(${LABEL_W+2}px + ${ev.col} * (100% - ${LABEL_W+4}px) / ${ev.totalCols})`;
        return (
          <div key={ev.id} className="ev-block" draggable
            onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData("eventId",ev.id);e.dataTransfer.setData("sourceDate",dateKey);e.dataTransfer.effectAllowed="move";}}
            onDragEnd={e=>e.stopPropagation()}
            onClick={e=>{e.stopPropagation();onEventClick&&onEventClick(ev);}}
            style={{position:"absolute",top,left:colOff,width:colW,height:ht,zIndex:2,
              background:palette.surface,border:`1px solid ${palette.border}`,
              borderLeft:`3px solid ${palette.accent}`,borderRadius:4,
              padding:"2px 5px",overflow:"hidden",cursor:"grab",boxSizing:"border-box"}}>
            <div style={{fontWeight:600,fontSize:10,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.3}}>{ev.title}</div>
            {ht>28&&<div style={{fontSize:9,color:palette.muted,whiteSpace:"nowrap"}}>{minsToHM(ev.startHour*60+(ev.startMin||0))}–{minsToHM(ev.startHour*60+(ev.startMin||0)+(ev.duration||DEFAULT_DUR))}</div>}
            <div className="ev-resize-handle" onMouseDown={e=>startResize(e,ev)}/>
          </div>
        );
      })}
    </div>
  );
}

// ─── MONTHLY PANEL ────────────────────────────────────────────────────────────
function MonthlyPanel({ events, tasks, palette, selectedDay, onSelectDay, onCreateHere, onEventDrop, onTaskDrop }) {
  const [viewDate,setViewDate]=useState(()=>{const d=todayDate();return new Date(d.getFullYear(),d.getMonth(),1);});
  const [lastClicked,setLastClicked]=useState(null);
  const td=todayDate();
  const year=viewDate.getFullYear(),month=viewDate.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const dim=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(new Date(year,month,d));

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexShrink:0}}>
        <button onClick={()=>setViewDate(d=>{const r=new Date(d);r.setMonth(r.getMonth()-1);return r;})}
          style={{width:26,height:26,borderRadius:6,border:`1px solid ${palette.border}`,color:palette.text,fontSize:14}}>‹</button>
        <span style={{flex:1,fontSize:15,fontWeight:600,letterSpacing:"-0.02em"}}>{MONTH_NAMES[month]} {year}</span>
        {!(viewDate.getFullYear()===td.getFullYear()&&viewDate.getMonth()===td.getMonth())&&
          <button onClick={()=>setViewDate(new Date(td.getFullYear(),td.getMonth(),1))}
            className="today-pill" style={{background:palette.accent+"18",color:palette.accent,border:`1px solid ${palette.accent}44`}}>today</button>}
        <button onClick={()=>setViewDate(d=>{const r=new Date(d);r.setMonth(r.getMonth()+1);return r;})}
          style={{width:26,height:26,borderRadius:6,border:`1px solid ${palette.border}`,color:palette.text,fontSize:14}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:3,flexShrink:0}}>
        {DAY_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:palette.muted,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em"}}>{d.slice(0,2)}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gridAutoRows:"1fr",gap:2,flex:1,minHeight:0}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const isT=sameDay(d,td),isSel=selectedDay&&sameDay(d,selectedDay),key=fmtDate(d);
          const dayEvs=events.filter(e=>e.date===key);
          return (
            <div key={i}
              onClick={()=>{if(lastClicked===key){onCreateHere(d);setLastClicked(null);}else{onSelectDay(d);setLastClicked(key);}}}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();const eid=e.dataTransfer.getData("eventId"),tid=e.dataTransfer.getData("taskId");if(eid)onEventDrop(eid,key,null);if(tid)onTaskDrop(tid,key,null);}}
              style={{background:isSel?palette.border+"33":isT?palette.accent+"18":palette.surface+"66",
                border:`1px solid ${isT?palette.accent:isSel?palette.border:palette.border+"44"}`,
                borderRadius:6,padding:"3px 4px",cursor:"pointer",overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{fontSize:12,fontWeight:isT?700:400,color:isT?palette.accent:palette.text,marginBottom:2}}>{d.getDate()}</div>
              {dayEvs.slice(0,3).map(e=>(
                <div key={e.id} draggable
                  onDragStart={ev=>{ev.stopPropagation();ev.dataTransfer.setData("eventId",e.id);ev.dataTransfer.setData("sourceDate",key);}}
                  style={{fontSize:11,background:palette.accent+"22",borderLeft:`2px solid ${palette.accent}`,borderRadius:3,padding:"2px 5px",marginTop:2,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",cursor:"grab",fontWeight:500}}>
                  {e.title}
                </div>
              ))}
              {dayEvs.length>3&&<div style={{fontSize:10,color:palette.muted,marginTop:2}}>+{dayEvs.length-3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WEEKLY PANEL ─────────────────────────────────────────────────────────────
function WeeklyPanel({ numDays=5, events, palette, onSlotClick, onEventDrop, onTaskDrop, onEventClick, onEventResize, selectedDay }) {
  const td = todayDate();
  const [weekStart,setWeekStart]=useState(numDays===5 ? td : startOfWeek(td));
  const [weekPrio,setWeekPrio]=useState([]);
  const [prioText,setPrioText]=useState("");
  const prioInputRef = useRef(null);

  useEffect(()=>{
    if(!selectedDay) return;
    setWeekStart(numDays===5 ? selectedDay : startOfWeek(selectedDay));
  },[selectedDay]);

  const days=Array.from({length:numDays},(_,i)=>addDays(weekStart,i));
  const isCurrentView=sameDay(weekStart,numDays===5?td:startOfWeek(td));

  const addPrio=()=>{ if(prioText.trim()){setWeekPrio(p=>[...p,{id:uid(),text:prioText.trim()}]);setPrioText("");} };
  const removePrio=id=>setWeekPrio(p=>p.filter(x=>x.id!==id));

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexShrink:0}}>
        <button onClick={()=>setWeekStart(d=>addDays(d,-numDays))}
          style={{width:24,height:24,borderRadius:6,border:`1px solid ${palette.border}`,color:palette.text,fontSize:13}}>‹</button>
        <span style={{flex:1,fontSize:12,fontWeight:600,letterSpacing:"-0.01em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {MONTH_SHORT[weekStart.getMonth()]} {weekStart.getDate()} – {MONTH_SHORT[addDays(weekStart,numDays-1).getMonth()]} {addDays(weekStart,numDays-1).getDate()}, {addDays(weekStart,numDays-1).getFullYear()}
        </span>
        {!isCurrentView&&
          <button onClick={()=>setWeekStart(numDays===5?td:startOfWeek(td))}
            className="today-pill" style={{background:palette.accent+"18",color:palette.accent,border:`1px solid ${palette.accent}44`}}>today</button>}
        <button onClick={()=>setWeekStart(d=>addDays(d,numDays))}
          style={{width:24,height:24,borderRadius:6,border:`1px solid ${palette.border}`,color:palette.text,fontSize:13}}>›</button>
      </div>

      <div style={{flex:1,display:"flex",gap:4,minHeight:0,overflow:"hidden"}}>
        {/* Day columns */}
        <div style={{flex:1,display:"flex",gap:3,minHeight:0,overflow:"hidden"}}>
          {days.map((d,i)=>{
            const key=fmtDate(d),isT=sameDay(d,td);
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
                {/* Day header — single line always */}
                <div style={{textAlign:"center",fontSize:10,fontWeight:isT?700:500,
                  color:isT?palette.accent:palette.muted,marginBottom:3,flexShrink:0,whiteSpace:"nowrap",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                  <span style={{textTransform:"uppercase",letterSpacing:"0.04em"}}>{DAY_SHORT[d.getDay()].slice(0,2)}</span>
                  <span style={{fontSize:13,color:isT?palette.accent:palette.text,fontWeight:isT?700:400}}>{d.getDate()}</span>
                </div>
                <div style={{flex:1,border:`1px solid ${isT?palette.accent:palette.border}44`,borderRadius:7,
                  overflow:"auto",background:isT?palette.accent+"08":palette.surface+"44"}}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{e.preventDefault();const eid=e.dataTransfer.getData("eventId");const tkId=e.dataTransfer.getData("taskId");if(eid)onEventDrop(eid,key,9,0);if(tkId)onTaskDrop(tkId,key,9,0);}}>
                  <TimeGrid dateKey={key} events={events} palette={palette}
                    onSlotClick={(h,m)=>onSlotClick(d,h,m)}
                    onEventDrop={onEventDrop} onTaskDrop={onTaskDrop}
                    onEventClick={onEventClick} onEventResize={onEventResize}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Priorities — 130px wide */}
        <div style={{width:130,flexShrink:0,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3,flexShrink:0}}>
            <span style={{fontSize:9,fontWeight:600,color:palette.muted,textTransform:"uppercase",letterSpacing:"0.05em",flex:1}}>Priorities</span>
            <button onClick={()=>prioInputRef.current?.focus()}
              style={{fontSize:16,color:palette.accent,fontWeight:300,lineHeight:1}}>+</button>
          </div>
          <div style={{flex:1,background:palette.surface+"66",border:`1px solid ${palette.border}44`,
            borderRadius:7,padding:"6px 8px",overflow:"auto",display:"flex",flexDirection:"column",gap:2}}>
            <div style={{display:"flex",gap:3,marginBottom:4,paddingBottom:5,borderBottom:`1px solid ${palette.border}22`,flexShrink:0}}>
              <input ref={prioInputRef} value={prioText} onChange={e=>setPrioText(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addPrio()}
                placeholder="add…"
                style={{flex:1,background:"transparent",border:"none",borderBottom:`1px solid ${palette.border}`,
                  fontSize:11,color:palette.text,padding:"2px 0"}}/>
              <button onClick={addPrio} style={{fontSize:16,color:palette.accent,fontWeight:300}}>+</button>
            </div>
            {weekPrio.map(item=>(
              <div key={item.id} draggable
                onDragStart={e=>{e.dataTransfer.setData("taskId",item.id);e.dataTransfer.setData("taskText",item.text);e.dataTransfer.effectAllowed="move";}}
                style={{display:"flex",gap:4,alignItems:"flex-start",padding:"4px 3px",
                  borderBottom:`1px solid ${palette.border}18`,cursor:"grab"}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:palette.accent,flexShrink:0,marginTop:5}}/>
                <span style={{fontSize:11,lineHeight:1.4,flex:1,wordBreak:"break-word"}}>{item.text}</span>
                <button onClick={()=>removePrio(item.id)} style={{fontSize:12,color:palette.muted,opacity:0.4,flexShrink:0}}>×</button>
              </div>
            ))}
            {!weekPrio.length&&<div style={{fontSize:10,color:palette.muted,fontStyle:"italic"}}>drag to a day</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DAILY PANEL ─────────────────────────────────────────────────────────────
function DailyPanel({ date, events, tasks, ongoingItems, palette, onSlotClick, onAddTask, onToggleTask, onEventDrop, onTaskDrop, onEventClick, onEventResize }) {
  const [newTask,setNewTask]=useState("");
  const td=todayDate();
  const dateKey=fmtDate(date);
  const dayTasks=tasks.filter(t=>t.date===dateKey);
  const isToday=sameDay(date,td);

  return (
    <div style={{display:"flex",gap:10,height:"100%"}}>
      <div style={{flex:1.8,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexShrink:0}}>
          <span style={{fontSize:12,fontWeight:600,color:palette.muted,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>
            {DAY_FULL[date.getDay()]}, {MONTH_SHORT[date.getMonth()]} {date.getDate()}
          </span>
          {!isToday&&<button className="today-pill" style={{background:palette.accent+"18",color:palette.accent,border:`1px solid ${palette.accent}44`}}>today</button>}
        </div>
        <div style={{flex:1,overflow:"auto"}}>
          <TimeGrid dateKey={dateKey} events={events} palette={palette}
            onSlotClick={(h,m)=>onSlotClick(date,h,m)} onEventDrop={onEventDrop} onTaskDrop={onTaskDrop}
            onEventClick={onEventClick} onEventResize={onEventResize}/>
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:8,minWidth:0,
        borderLeft:`1px solid ${palette.border}33`,paddingLeft:10,overflow:"hidden"}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",color:palette.muted,flexShrink:0}}>
          To-Do {dayTasks.length>0&&<span style={{fontWeight:400,opacity:0.7}}>({dayTasks.filter(t=>t.done).length}/{dayTasks.length})</span>}
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <input value={newTask} onChange={e=>setNewTask(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&newTask.trim()){onAddTask(newTask.trim(),dateKey);setNewTask("");}}}
            placeholder="add task…"
            style={{flex:1,background:"transparent",border:"none",borderBottom:`1px solid ${palette.border}`,padding:"3px 0",color:palette.text,fontSize:12}}/>
          <button onClick={()=>{if(newTask.trim()){onAddTask(newTask.trim(),dateKey);setNewTask("");}}}
            style={{fontSize:17,color:palette.accent,fontWeight:300}}>+</button>
        </div>
        <div style={{overflow:"auto",flex:1,display:"flex",flexDirection:"column",gap:1}}>
          {dayTasks.map(t=>(
            <div key={t.id} draggable
              onDragStart={e=>{e.dataTransfer.setData("taskId",t.id);e.dataTransfer.setData("taskText",t.text);e.dataTransfer.effectAllowed="move";}}
              style={{display:"flex",alignItems:"flex-start",gap:7,padding:"4px 0",borderBottom:`1px solid ${palette.border}18`,cursor:"grab"}}>
              <div onClick={e=>{e.stopPropagation();onToggleTask(t.id);}}
                style={{width:11,height:11,marginTop:2,borderRadius:"50%",border:`1.5px solid ${palette.border}`,
                  background:t.done?palette.accent:"transparent",flexShrink:0,cursor:"pointer"}}/>
              <span style={{fontSize:12,textDecoration:t.done?"line-through":"none",color:t.done?palette.muted:palette.text,flex:1,lineHeight:1.4}}>{t.text}</span>
            </div>
          ))}
          {!dayTasks.length&&<div style={{fontSize:11,color:palette.muted,fontStyle:"italic"}}>drag tasks to timeline →</div>}
        </div>
        <div style={{borderTop:`1px solid ${palette.border}22`,paddingTop:6,flexShrink:0}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",color:palette.muted,marginBottom:4}}>On-Going</div>
          {ongoingItems.slice(0,4).map(t=>(
            <div key={t.id} style={{display:"flex",gap:7,alignItems:"center",padding:"3px 0",borderBottom:`1px solid ${palette.border}18`}}>
              <div style={{width:10,height:10,borderRadius:3,border:`1.5px solid ${palette.border}`,background:t.done?palette.accent:"transparent",flexShrink:0}}/>
              <span style={{fontSize:11,color:t.done?palette.muted:palette.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.text}</span>
            </div>
          ))}
          {!ongoingItems.length&&<div style={{fontSize:11,color:palette.muted,fontStyle:"italic"}}>nothing ongoing</div>}
        </div>
      </div>
    </div>
  );
}

// ─── 6-MONTH PANEL ────────────────────────────────────────────────────────────
function SixMonthPanel({ events, tasks, palette, onMonthClick, onEventDrop, onTaskDrop }) {
  const [start,setStart]=useState(()=>{const d=todayDate();return new Date(d.getFullYear(),d.getMonth(),1);});
  const [activeMonth,setActiveMonth]=useState(null);
  const [addText,setAddText]=useState("");
  const months=Array.from({length:6},(_,i)=>{const d=new Date(start);d.setMonth(start.getMonth()+i);return d;});
  const td=todayDate();
  const popupRef=useRef(null);

  useEffect(()=>{
    if(!activeMonth) return;
    const h=e=>{if(popupRef.current&&!popupRef.current.contains(e.target))setActiveMonth(null);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[activeMonth]);

  const saveToMonth=()=>{
    if(!addText.trim()||!activeMonth) return;
    onMonthClick(addText.trim(),`${activeMonth.year}-${String(activeMonth.month+1).padStart(2,"0")}-01`);
    setAddText(""); setActiveMonth(null);
  };

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexShrink:0}}>
        <button onClick={()=>setStart(d=>{const r=new Date(d);r.setMonth(r.getMonth()-6);return r;})}
          style={{width:24,height:24,borderRadius:6,border:`1px solid ${palette.border}`,color:palette.text,fontSize:13}}>‹</button>
        <span style={{flex:1,fontSize:13,fontWeight:600}}>
          {MONTH_SHORT[months[0].getMonth()]} – {MONTH_SHORT[months[5].getMonth()]} {months[5].getFullYear()}
        </span>
        <button onClick={()=>setStart(new Date(td.getFullYear(),td.getMonth(),1))}
          className="today-pill" style={{background:palette.accent+"18",color:palette.accent,border:`1px solid ${palette.accent}44`}}>today</button>
        <button onClick={()=>setStart(d=>{const r=new Date(d);r.setMonth(r.getMonth()+6);return r;})}
          style={{width:24,height:24,borderRadius:6,border:`1px solid ${palette.border}`,color:palette.text,fontSize:13}}>›</button>
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gridTemplateRows:"repeat(2,1fr)",gap:6,minHeight:0}}>
        {months.map((m,mi)=>{
          const y=m.getFullYear(),mo=m.getMonth();
          const isCur=td.getFullYear()===y&&td.getMonth()===mo;
          const prefix=`${y}-${String(mo+1).padStart(2,"0")}`;
          const mEvs=events.filter(e=>e.date.startsWith(prefix));
          const mTasks=tasks.filter(t=>t.date.startsWith(prefix));
          const isActive=activeMonth?.year===y&&activeMonth?.month===mo;
          return (
            <div key={mi}
              onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();setActiveMonth({year:y,month:mo,rect});setAddText("");}}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();const eid=e.dataTransfer.getData("eventId"),tid=e.dataTransfer.getData("taskId");const d2=`${prefix}-01`;if(eid)onEventDrop(eid,d2,null);if(tid)onTaskDrop(tid,d2,null);}}
              style={{background:isActive?palette.accent+"15":palette.surface+"66",
                border:`1.5px solid ${isActive?palette.accent:isCur?palette.accent+"66":palette.border+"44"}`,
                borderRadius:8,padding:"7px 9px",overflow:"hidden",display:"flex",flexDirection:"column",cursor:"pointer"}}>
              <div style={{fontSize:11,fontWeight:600,color:isCur?palette.accent:palette.text,marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                {MONTH_NAMES[mo]} {y}
                <span style={{fontSize:9,color:palette.muted,fontWeight:400}}>click to add</span>
              </div>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,overflow:"hidden"}}>
                {mEvs.slice(0,4).map(e=>(
                  <div key={e.id} draggable onDragStart={ev=>{ev.stopPropagation();ev.dataTransfer.setData("eventId",e.id);ev.dataTransfer.setData("sourceDate",e.date);}} onClick={ev=>ev.stopPropagation()}
                    style={{fontSize:11,background:palette.accent+"18",borderLeft:`2px solid ${palette.accent}`,borderRadius:3,padding:"2px 5px",cursor:"grab",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",fontWeight:500}}>
                    <span style={{color:palette.muted,fontSize:10}}>{e.date.slice(8)} </span>{e.title}
                  </div>
                ))}
                {mTasks.slice(0,3).map(t=>(
                  <div key={t.id} style={{fontSize:10,color:palette.muted,padding:"1px 4px",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>· {t.text}</div>
                ))}
                {!(mEvs.length+mTasks.length)&&<div style={{fontSize:10,color:palette.muted,fontStyle:"italic"}}>nothing yet</div>}
              </div>
            </div>
          );
        })}
      </div>
      {activeMonth&&(
        <div ref={popupRef}
          style={{position:"fixed",zIndex:500,
            top:Math.min((activeMonth.rect?.bottom||300)+4,window.innerHeight-120),
            left:Math.min((activeMonth.rect?.left||200),window.innerWidth-260),
            background:palette.card,border:`1.5px solid ${palette.accent}`,borderRadius:10,
            padding:"12px 14px",boxShadow:"0 8px 28px #00000033",width:240}}>
          <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:palette.accent}}>
            Add to {MONTH_NAMES[activeMonth.month]} {activeMonth.year}
          </div>
          <input autoFocus value={addText} onChange={e=>setAddText(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")saveToMonth();if(e.key==="Escape")setActiveMonth(null);}}
            placeholder="Event or task title…"
            style={{width:"100%",background:palette.surface,border:`1px solid ${palette.border}`,borderRadius:7,padding:"7px 9px",color:palette.text,fontSize:12,marginBottom:8}}/>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setActiveMonth(null)} style={{flex:1,padding:"6px",background:"transparent",border:`1px solid ${palette.border}`,borderRadius:6,color:palette.muted,fontSize:12}}>cancel</button>
            <button onClick={saveToMonth} style={{flex:2,padding:"6px",background:palette.accent,border:"none",borderRadius:6,color:palette.soft,fontWeight:600,fontSize:12}}>add</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AGENDA VIEW ─────────────────────────────────────────────────────────────
function AgendaView({ events, tasks, palette, compact=false }) {
  const td=todayDate();
  const items=[...events.map(e=>({...e,_type:"event"})),...tasks.map(t=>({...t,title:t.text,_type:"task"}))]
    .filter(e=>{try{return parseDate(e.date)>=new Date(td.getFullYear(),td.getMonth(),td.getDate());}catch{return false;}})
    .sort((a,b)=>a.date.localeCompare(b.date));
  const grouped={};
  items.forEach(e=>{if(!grouped[e.date])grouped[e.date]=[];grouped[e.date].push(e);});
  const keys=Object.keys(grouped);
  if(!keys.length) return <div style={{fontSize:11,color:palette.muted,fontStyle:"italic"}}>nothing coming up</div>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:compact?6:10,height:compact?"auto":"100%",overflow:compact?"visible":"auto"}}>
      {keys.slice(0,compact?6:200).map(date=>{
        const d=parseDate(date),isT=sameDay(d,td);
        return (
          <div key={date}>
            <div style={{fontSize:compact?10:11,fontWeight:600,color:isT?palette.accent:palette.text,
              marginBottom:compact?2:4,display:"flex",gap:6,alignItems:"center",textTransform:"uppercase",letterSpacing:"0.05em"}}>
              {DAY_SHORT[d.getDay()]} {d.getDate()} {MONTH_SHORT[d.getMonth()]}
              {isT&&<span style={{fontSize:8,background:palette.accent,color:palette.soft,borderRadius:3,padding:"1px 4px",fontWeight:700}}>today</span>}
            </div>
            {grouped[date].map(e=>(
              <div key={e.id} style={{display:"flex",gap:6,alignItems:"flex-start",
                padding:compact?"2px 0":"4px 7px",cursor:"default",
                ...(compact?{}:{background:palette.surface,border:`1px solid ${palette.border}33`,borderLeft:`2px solid ${palette.accent}`,borderRadius:5,marginBottom:3})}}>
                {compact&&<div style={{width:5,height:5,marginTop:4,borderRadius:e._type==="task"?"50%":2,background:palette.accent,flexShrink:0}}/>}
                <div style={{flex:1}}>
                  <div style={{fontSize:compact?11:12,fontWeight:500}}>{e.title}</div>
                  {!compact&&e.startHour!=null&&<div style={{fontSize:10,color:palette.muted}}>{HourLabel(e.startHour)}</div>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── ONGOING PANEL ────────────────────────────────────────────────────────────
function OngoingPanel({ items, palette, onAdd, onToggle, onDelete }) {
  const [text,setText]=useState(""), [cat,setCat]=useState("task");
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",gap:4,marginBottom:8,flexShrink:0}}>
        {["task","habit","note"].map(c=>(
          <button key={c} onClick={()=>setCat(c)}
            style={{padding:"2px 8px",borderRadius:10,border:`1px solid ${cat===c?palette.accent:palette.border}`,
              background:cat===c?palette.accent+"18":"transparent",color:cat===c?palette.accent:palette.muted,fontSize:11,fontWeight:cat===c?600:400}}>
            {c}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:5,marginBottom:10,flexShrink:0}}>
        <input value={text} onChange={e=>setText(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&text.trim()){onAdd(text.trim(),cat);setText("");}}}
          placeholder="add item…" style={{flex:1,background:"transparent",border:"none",borderBottom:`1px solid ${palette.border}`,padding:"3px 0",color:palette.text,fontSize:12}}/>
        <button onClick={()=>{if(text.trim()){onAdd(text.trim(),cat);setText("");}}} style={{fontSize:17,color:palette.accent,fontWeight:300}}>+</button>
      </div>
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:2}}>
        {items.map(item=>(
          <div key={item.id} draggable
            onDragStart={e=>{e.dataTransfer.setData("taskId",item.id);e.dataTransfer.setData("taskText",item.text);e.dataTransfer.effectAllowed="move";}}
            style={{display:"flex",alignItems:"center",gap:7,padding:"5px 7px",background:palette.surface+"88",borderRadius:6,border:`1px solid ${palette.border}22`,cursor:"grab"}}>
            <div onClick={()=>onToggle(item.id)}
              style={{width:11,height:11,borderRadius:item.cat==="habit"?"50%":3,border:`1.5px solid ${palette.border}`,background:item.done?palette.accent:"transparent",cursor:"pointer",flexShrink:0}}/>
            <span style={{flex:1,fontSize:12,textDecoration:item.done?"line-through":"none",color:item.done?palette.muted:palette.text}}>{item.text}</span>
            <button onClick={()=>onDelete(item.id)} style={{fontSize:14,color:palette.muted,opacity:0.5}}>×</button>
          </div>
        ))}
        {!items.length&&<div style={{fontSize:11,color:palette.muted,fontStyle:"italic"}}>nothing yet…</div>}
      </div>
    </div>
  );
}

// ─── NOTE STASH ───────────────────────────────────────────────────────────────
function NoteStash({ notes, palette, onSave, onDelete, onExtractTask }) {
  const [text,setText]=useState(""), [editing,setEditing]=useState(null);
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="jot a thought…" rows={3}
        style={{width:"100%",background:"transparent",border:`1px solid ${palette.border}`,borderRadius:7,padding:"6px 8px",color:palette.text,resize:"none",marginBottom:5,fontSize:12,flexShrink:0}}/>
      <button onClick={()=>{if(text.trim()){onSave({id:uid(),text:text.trim(),date:new Date().toISOString()});setText("");}}}
        style={{background:palette.accent+"18",border:`1px solid ${palette.border}`,borderRadius:6,padding:"4px 10px",color:palette.accent,marginBottom:10,fontSize:11,fontWeight:500,width:"100%",flexShrink:0}}>
        save note
      </button>
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:5}}>
        {notes.map(n=>(
          <div key={n.id} style={{background:palette.surface+"88",border:`1px solid ${palette.border}22`,borderRadius:7,padding:"7px 8px"}}>
            {editing===n.id
              ?<textarea defaultValue={n.text} autoFocus rows={3} onBlur={e=>{onSave({...n,text:e.target.value});setEditing(null);}}
                  style={{width:"100%",background:"transparent",border:"none",color:palette.text,resize:"none",fontSize:12}}/>
              :<div onClick={()=>setEditing(n.id)} style={{fontSize:11,cursor:"text",whiteSpace:"pre-wrap",lineHeight:1.5}}>{n.text}</div>
            }
            <div style={{display:"flex",gap:5,marginTop:5}}>
              <button onClick={()=>onExtractTask(n.text.split(/\s+/).slice(0,4).join(" "))}
                style={{fontSize:10,border:`1px solid ${palette.border}`,borderRadius:4,padding:"2px 6px",color:palette.muted}}>→ task</button>
              <button onClick={()=>onDelete(n.id)} style={{fontSize:10,color:palette.muted,opacity:0.6}}>delete</button>
            </div>
          </div>
        ))}
        {!notes.length&&<div style={{fontSize:11,color:palette.muted,fontStyle:"italic"}}>no notes yet</div>}
      </div>
    </div>
  );
}

// ─── MINI CAL PANEL ──────────────────────────────────────────────────────────
function MiniCalPanel({ events, palette, onDayClick, selectedDay }) {
  const [viewDate,setViewDate]=useState(todayDate());
  const year=viewDate.getFullYear(), month=viewDate.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const dim=new Date(year,month+1,0).getDate();
  const td=todayDate();
  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(new Date(year,month,d));
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        <button onClick={()=>setViewDate(d=>{const r=new Date(d);r.setMonth(r.getMonth()-1);return r;})}
          style={{width:22,height:22,borderRadius:5,border:`1px solid ${palette.border}`,color:palette.text,fontSize:12}}>‹</button>
        <span style={{flex:1,fontSize:12,fontWeight:600,textAlign:"center"}}>{MONTH_SHORT[month]} {year}</span>
        <button onClick={()=>setViewDate(todayDate())}
          style={{fontSize:10,color:palette.accent,border:`1px solid ${palette.accent}44`,borderRadius:4,padding:"1px 5px",background:palette.accent+"18"}}>·</button>
        <button onClick={()=>setViewDate(d=>{const r=new Date(d);r.setMonth(r.getMonth()+1);return r;})}
          style={{width:22,height:22,borderRadius:5,border:`1px solid ${palette.border}`,color:palette.text,fontSize:12}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:3}}>
        {["M","T","W","T","F","S","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:9,color:palette.muted,fontWeight:500}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const isT=sameDay(d,td),isSel=selectedDay&&sameDay(d,selectedDay),hasEv=events.some(e=>e.date===fmtDate(d));
          return <div key={i} onClick={()=>onDayClick(d)}
            style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",
              background:isT?palette.accent:isSel?palette.border+"44":"transparent",
              color:isT?palette.soft:isSel?palette.accent:palette.text,
              cursor:"pointer",fontSize:11,fontWeight:isT?600:400,position:"relative"}}>
            {d.getDate()}
            {hasEv&&!isT&&<div style={{position:"absolute",bottom:0,width:3,height:3,borderRadius:"50%",background:palette.accent}}/>}
          </div>;
        })}
      </div>
    </div>
  );
}

// ─── EVENT MODAL ─────────────────────────────────────────────────────────────
function EventModal({ day, initialHour=9, initialMin=0, palette, onClose, onAdd, onUpdate, event=null, prefillTitle="" }) {
  const startMins0 = event ? (event.startHour*60+(event.startMin||0)) : initialHour*60+(initialMin||0);
  const dur0 = event?.duration ?? DEFAULT_DUR;

  const [title,setTitle]    = useState(event?.title||prefillTitle||"");
  const [startM,setStartM]  = useState(startMins0);
  const [endM,setEndM]      = useState(startMins0+dur0);
  const [address,setAddress]= useState(event?.address||"");
  const [note,setNote]      = useState(event?.note||"");
  const [localDay]          = useState(day||todayDate());

  const dur = Math.max(15, endM - startM);

  // Changing start preserves duration
  const handleStartChange = v => { const d=endM-startM; setStartM(v); setEndM(v+d); };
  const handleEndChange   = v => { setEndM(Math.max(v, startM+15)); };
  const handleQuick       = d => { setEndM(startM+d); };

  return (
    <div style={{position:"fixed",inset:0,background:"#00000044",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(2px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:palette.card,border:`1.5px solid ${palette.border}`,borderRadius:14,padding:24,width:380,boxShadow:"0 12px 40px #00000033"}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:3,letterSpacing:"-0.02em"}}>{event?"Edit event":"New event"}</div>
        <div style={{fontSize:12,color:palette.muted,marginBottom:14}}>
          {DAY_FULL[localDay.getDay()]}, {MONTH_NAMES[localDay.getMonth()]} {localDay.getDate()}
        </div>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Event title" autoFocus
          style={{width:"100%",background:palette.surface,border:`1px solid ${palette.border}`,borderRadius:8,
            padding:"8px 10px",color:palette.text,marginBottom:12,fontSize:13}}/>

        {/* Start / End time */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
          {[{label:"Start",val:startM,set:handleStartChange},{label:"End",val:Math.min(endM,23*60+59),set:handleEndChange}].map(({label,val,set})=>(
            <div key={label}>
              <div style={{fontSize:10,color:palette.muted,marginBottom:3,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</div>
              <input type="time" value={fmtTimeInput(val)} onChange={e=>set(parseTimeInput(e.target.value))}
                style={{width:"100%",background:palette.surface,border:`1px solid ${palette.border}`,borderRadius:6,
                  padding:"6px 8px",color:palette.text,fontSize:12}}/>
            </div>
          ))}
        </div>

        {/* Quick duration chips */}
        <div style={{display:"flex",gap:5,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
          {QUICK_DURS.map(d=>(
            <button key={d} onClick={()=>handleQuick(d)}
              style={{padding:"3px 9px",borderRadius:6,fontSize:11,
                border:`1px solid ${dur===d?palette.accent:palette.border}`,
                background:dur===d?palette.accent+"22":"transparent",
                color:dur===d?palette.accent:palette.muted,fontWeight:dur===d?600:400}}>
              {d<60?`${d}m`:d===60?"1h":`${d/60}h`}
            </button>
          ))}
          <span style={{fontSize:10,color:palette.muted,marginLeft:2}}>{dur}m</span>
        </div>

        <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Address"
          style={{width:"100%",background:palette.surface,border:`1px solid ${palette.border}`,borderRadius:8,
            padding:"7px 10px",color:palette.text,marginBottom:8,fontSize:12}}/>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Notes" rows={2}
          style={{width:"100%",background:palette.surface,border:`1px solid ${palette.border}`,borderRadius:8,
            padding:"7px 10px",color:palette.text,resize:"none",marginBottom:16,fontSize:12}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose}
            style={{flex:1,padding:"9px",background:"transparent",border:`1px solid ${palette.border}`,borderRadius:8,color:palette.muted,fontSize:13}}>cancel</button>
          <button onClick={()=>{
            if(!title.trim()) return;
            const sh=Math.floor(startM/60)%24, sm=startM%60;
            const data={id:event?.id||uid(),title:title.trim(),date:fmtDate(localDay),startHour:sh,startMin:sm,duration:dur,address,note};
            event?onUpdate(data):onAdd(data); onClose();
          }} style={{flex:2,padding:"9px",background:palette.accent,border:"none",borderRadius:8,color:palette.soft,fontWeight:600,fontSize:13}}>
            {event?"save changes":"add event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR MINI CAL ─────────────────────────────────────────────────────────
function SidebarMiniCal({ events, palette, onDayClick, selectedDay }) {
  const td=todayDate();
  const year=td.getFullYear(), month=td.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const dim=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(new Date(year,month,d));
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:2}}>
        {["M","T","W","T","F","S","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:8,color:palette.muted,fontWeight:500}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const isT=sameDay(d,td),isSel=selectedDay&&sameDay(d,selectedDay),hasEv=events.some(e=>e.date===fmtDate(d));
          return <div key={i} onClick={()=>onDayClick(d)}
            style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",fontSize:9,
              background:isT?palette.accent:isSel?palette.border+"44":"transparent",
              color:isT?palette.soft:palette.text,cursor:"pointer",fontWeight:isT?600:400,position:"relative"}}>
            {d.getDate()}
            {hasEv&&!isT&&<div style={{position:"absolute",bottom:0,width:2,height:2,borderRadius:"50%",background:palette.accent}}/>}
          </div>;
        })}
      </div>
    </div>
  );
}

// ─── PANEL CARD ───────────────────────────────────────────────────────────────
// Reusable wrapper: header with drag handle + close; content area
function PanelCard({ panel, children, palette, onRemove, onDragStart, isDragging, isDragOver, onDragOver, onDrop, onDragEnd, style={}, contentStyle={} }) {
  const isCompact = PANEL_DEFS[panel.type]?.compact;
  return (
    <div
      style={{display:"flex",flexDirection:"column",
        background:palette.card,
        border:`1.5px solid ${isDragOver?palette.accent:palette.border}`,
        borderRadius:10,overflow:"hidden",
        opacity:isDragging?0.4:1,transition:"opacity .15s, border-color .12s",
        ...style}}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}>
      <div draggable onDragStart={onDragStart}
        style={{background:palette.surface,borderBottom:`1px solid ${palette.border}33`,
          padding:"6px 10px",display:"flex",alignItems:"center",gap:7,
          cursor:"grab",flexShrink:0,userSelect:"none"}}>
        <svg width="8" height="12" viewBox="0 0 8 12" style={{opacity:0.25,flexShrink:0}}>
          {[0,4,8].map(y=>[0,4].map(x=><circle key={`${x}${y}`} cx={x+2} cy={y+2} r="1.4" fill="currentColor"/>))}
        </svg>
        <span style={{fontSize:12,fontWeight:600,flex:1,letterSpacing:"-0.01em"}}>{panel.label}</span>
        <button onClick={()=>onRemove(panel.id)}
          style={{fontSize:14,color:palette.muted,opacity:0.45,lineHeight:1,padding:"0 2px"}}>×</button>
      </div>
      <div style={{flex:isCompact?undefined:1,overflow:isCompact?"visible":"hidden",padding:10,minHeight:0,...contentStyle}}>
        {children}
      </div>
    </div>
  );
}

// ─── PANEL COLUMN ─────────────────────────────────────────────────────────────
// Renders a list of panels vertically with resizable dividers between them.
function PanelColumn({ panels: colPanels, palette, draggingId, dragOverId,
    onDragStart, onDrop, onDragOver, onDragEnd, onRemove, renderContent, padLeft, padRight }) {
  if (!colPanels || colPanels.length === 0) return null;
  // Separate compact (auto-height) from stretchable panels
  const compactPanels = colPanels.filter(p => PANEL_DEFS[p.type]?.compact);
  const stretchPanels = colPanels.filter(p => !PANEL_DEFS[p.type]?.compact);

  // rowFrs only applies to stretchable panels
  const [rowFrs, setRowFrs] = useState(() => stretchPanels.map(() => 1));
  const containerRef = useRef(null);
  const resizeRef = useRef(null);

  const panelKey = colPanels.map(p=>p.id).join(",");
  useEffect(()=>{
    setRowFrs(stretchPanels.map(() => 1));
  },[panelKey]);

  const startRowResize = (e, idx) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    resizeRef.current = { idx, startY: e.clientY, startFrs: [...rowFrs], containerH: rect.height };
    const onMove = me => {
      if (!resizeRef.current) return;
      const {idx,startY,startFrs,containerH} = resizeRef.current;
      const totalFr = startFrs.reduce((a,b)=>a+b,0);
      const delta = ((me.clientY-startY)/containerH)*totalFr;
      const nf=[...startFrs];
      nf[idx]  =Math.max(0.12,startFrs[idx]+delta);
      nf[idx+1]=Math.max(0.12,startFrs[idx+1]-delta);
      setRowFrs(nf);
    };
    const onUp=()=>{resizeRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  const totalFr = rowFrs.reduce((a,b)=>a+b,0)||1;

  // Build ordered render list preserving original order, tracking stretch index
  let stretchIdx = 0;
  const renderItems = colPanels.map(panel => {
    const isCompact = PANEL_DEFS[panel.type]?.compact;
    if (isCompact) return { panel, isCompact: true, fr: 0, si: -1 };
    const si = stretchIdx++;
    return { panel, isCompact: false, fr: rowFrs[si]??1, si };
  });

  return (
    <div ref={containerRef}
      style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",
        padding:`6px ${padRight?6:3}px 6px ${padLeft?6:3}px`}}>
      {renderItems.map(({panel, isCompact, fr, si}, i)=>{
        const hPct = `calc(${(fr/totalFr*100).toFixed(3)}% - ${(stretchPanels.length-1)*6/Math.max(stretchPanels.length,1)}px)`;
        const isLast = i===renderItems.length-1;
        const isLastStretch = si === stretchPanels.length-1;
        return (
          <div key={panel.id} style={{
            display:"flex",flexDirection:"column",
            // compact: shrink to content; stretch: take proportional height
            flex: isCompact ? "0 0 auto" : `0 0 ${hPct}`,
            minHeight: isCompact ? 0 : 60,
            overflow:"hidden",
          }}>
            <PanelCard panel={panel} palette={palette}
              style={{flex: isCompact ? undefined : 1, minHeight:0}}
              onRemove={onRemove}
              onDragStart={e=>{e.stopPropagation();onDragStart(e,panel.id);}}
              isDragging={draggingId===panel.id}
              isDragOver={dragOverId===panel.id}
              onDragOver={e=>onDragOver(e,panel.id)}
              onDrop={e=>onDrop(e,panel.id)}
              onDragEnd={onDragEnd}>
              {renderContent(panel)}
            </PanelCard>
            {/* Row resize handle only between stretchable panels */}
            {!isCompact && !isLastStretch && !isLast && (
              <div onMouseDown={e=>startRowResize(e,si)}
                style={{height:6,cursor:"row-resize",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <div style={{width:36,height:2,borderRadius:1,background:palette.border+"55"}}/>
              </div>
            )}
            {(isCompact || (!isLastStretch && isLast)) && !isLast && <div style={{height:6,flexShrink:0}}/>}
          </div>
        );
      })}
    </div>
  );
}

// ─── BENTO LAYOUT ─────────────────────────────────────────────────────────────
// Up to 3 columns. Each panel has a `col` property (0, 1, or 2).
// Dragging a panel to the right edge drop zone creates col 2 (or moves it there).
// Column widths are resizable via drag dividers.
function BentoLayout({ panels, renderContent, onRemove, onReorder, onMovePanelToCol, palette }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [col2Hover, setCol2Hover]   = useState(false);
  const containerRef = useRef(null);

  const col0 = panels.filter(p=>(p.col??0)===0);
  const col1 = panels.filter(p=>p.col===1);
  const col2 = panels.filter(p=>p.col===2);
  const numCols = col2.length>0 ? 3 : col1.length>0 ? 2 : 1;

  // Column widths as [w0, w1, w2] percentages (sum not necessarily 100; dividers adjust pairs)
  const [colW, setColW] = useState([65, 35, 0]);
  useEffect(()=>{
    if(numCols===1) setColW([100,0,0]);
    else if(numCols===2) setColW(w=>{ const sum=w[0]+w[1]||100; return [Math.min(80,Math.max(20,w[0])),100-(Math.min(80,Math.max(20,w[0]))),0]; });
    else setColW([52,28,20]);
  },[numCols]);

  const startDividerDrag=(e,di)=>{
    e.preventDefault();
    const rect=containerRef.current.getBoundingClientRect();
    const startX=e.clientX, startW=[...colW];
    const onMove=me=>{
      const dx=((me.clientX-startX)/rect.width)*100;
      const nw=[...startW];
      if(di===0){
        nw[0]=Math.max(15,Math.min(numCols===2?85:70,startW[0]+dx));
        if(numCols===2){nw[1]=100-nw[0];}
        else{const rem=100-nw[0];const ratio=startW[1]/(startW[1]+startW[2]||1);nw[1]=rem*ratio;nw[2]=rem-nw[1];}
      } else {
        nw[1]=Math.max(10,Math.min(startW[1]+startW[2]-10,startW[1]+dx));
        nw[2]=startW[1]+startW[2]-nw[1];
      }
      setColW(nw);
    };
    const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  if(!panels.length) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",opacity:0.35}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:300,marginBottom:6}}>empty canvas</div>
        <div style={{fontSize:12}}>add a panel above to get started</div>
      </div>
    </div>
  );

  const hDragStart=(e,id)=>{setDraggingId(id);e.dataTransfer.setData("panelId",id);e.dataTransfer.effectAllowed="move";};
  const hDrop=(e,id)=>{
    e.preventDefault();
    const pid=e.dataTransfer.getData("panelId");
    if(pid&&pid!==id) onReorder(pid,id);
    setDraggingId(null);setDragOverId(null);
  };
  const hDragOver=(e,id)=>{e.preventDefault();setDragOverId(id);};
  const hDragEnd=()=>{setDraggingId(null);setDragOverId(null);setCol2Hover(false);};

  const hCol2Drop=e=>{
    e.preventDefault();
    const pid=e.dataTransfer.getData("panelId");
    if(pid) onMovePanelToCol(pid, numCols); // numCols is always the next col index (0-indexed: 1, 2)
    setCol2Hover(false);setDraggingId(null);setDragOverId(null);
  };

  const Divider=({di})=>(
    <div onMouseDown={e=>startDividerDrag(e,di)}
      style={{width:6,flexShrink:0,cursor:"col-resize",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:2,height:40,borderRadius:1,background:palette.border+"66"}}/>
    </div>
  );

  const isDragging=!!draggingId;
  const showDropZone=isDragging&&numCols<3;

  return (
    <div ref={containerRef} style={{flex:1,display:"flex",overflow:"hidden",minHeight:0,position:"relative"}}>

      {/* Col 0 */}
      <div style={{width:`${colW[0]}%`,display:"flex",overflow:"hidden",flexShrink:0}}>
        <PanelColumn panels={col0} palette={palette} draggingId={draggingId} dragOverId={dragOverId}
            onDragStart={hDragStart} onDrop={hDrop} onDragOver={hDragOver} onDragEnd={hDragEnd}
            onRemove={onRemove} renderContent={renderContent} padLeft padRight={numCols===1}/>
      </div>

      {numCols>=2&&<Divider di={0}/>}

      {/* Col 1 */}
      {numCols>=2&&(
        <div style={{width:`${colW[1]}%`,display:"flex",overflow:"hidden",flexShrink:0}}>
          <PanelColumn panels={col1} palette={palette} draggingId={draggingId} dragOverId={dragOverId}
              onDragStart={hDragStart} onDrop={hDrop} onDragOver={hDragOver} onDragEnd={hDragEnd}
              onRemove={onRemove} renderContent={renderContent} padLeft={false} padRight={numCols===2}/>
        </div>
      )}

      {numCols===3&&<Divider di={1}/>}

      {/* Col 2 */}
      {numCols===3&&(
        <div style={{width:`${colW[2]}%`,display:"flex",overflow:"hidden",flexShrink:0}}>
          {col2.length>0
            ?<PanelColumn panels={col2} palette={palette} draggingId={draggingId} dragOverId={dragOverId}
                onDragStart={hDragStart} onDrop={hDrop} onDragOver={hDragOver} onDragEnd={hDragEnd}
                onRemove={onRemove} renderContent={renderContent} padLeft={false} padRight/>
            :null
          }
        </div>
      )}

      {/* Col-2 creation zone: appears on right edge while dragging any panel (only if <3 cols) */}
      {showDropZone&&(
        <div
          onDragOver={e=>{e.preventDefault();setCol2Hover(true);}}
          onDragLeave={()=>setCol2Hover(false)}
          onDrop={hCol2Drop}
          style={{
            position:"absolute",top:0,right:0,bottom:0,
            width:col2Hover?72:16,
            transition:"width .16s ease, background .16s ease",
            background:col2Hover?palette.accent+"28":"transparent",
            borderLeft:col2Hover?`2px dashed ${palette.accent}77`:"2px dashed transparent",
            display:"flex",alignItems:"center",justifyContent:"center",
            zIndex:30,cursor:"copy",
          }}>
          {col2Hover&&(
            <span style={{fontSize:9,color:palette.accent,fontWeight:600,
              writingMode:"vertical-rl",letterSpacing:"0.1em",opacity:0.9,
              textTransform:"uppercase"}}>+ column</span>
          )}
        </div>
      )}
    </div>
  );
}


// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [palName,setPalName]   = useState("lavender");
  const palette = PALETTES[palName];
  const [sidebarOpen,setSidebarOpen] = useState(true);
  const [selectedDay,setSelectedDay] = useState(todayDate());

  const [events,setEvents]         = useState([]);
  const [tasks,setTasks]           = useState([]);
  const [ongoingItems,setOngoing]  = useState([]);
  const [goals,setGoals]           = useState([]);
  const [stashNotes,setNotes]      = useState([]);

  // Default layout: monthly col0, daily col0
  const [panels,setPanels] = useState([
    { id:uid(), type:"monthly", label:"Monthly", col:0 },
    { id:uid(), type:"daily",   label:"Daily",   col:0 },
  ]);

  const [modal,setModal]           = useState(null);
  const [editTarget,setEditTarget] = useState(null);
  const [prefillModal,setPrefill]  = useState(null);

  const openTypes = panels.map(p=>p.type);
  const agendaInPanel = openTypes.includes("agenda");

  const cssVars = {
    "--card":palette.card,"--surface":palette.surface,
    "--border":palette.border,"--muted":palette.muted,"--accent":palette.accent,
  };

  // ── Data handlers ──
  const addEvent    = ev => setEvents(p=>[...p,ev]);
  const updateEvent = ev => setEvents(p=>p.map(e=>e.id===ev.id?ev:e));
  const resizeEvent = (id,dur) => setEvents(p=>p.map(e=>e.id===id?{...e,duration:dur}:e));
  const addTask     = (text,date) => setTasks(p=>[...p,{id:uid(),text,date,done:false}]);
  const toggleTask  = id => setTasks(p=>p.map(t=>t.id===id?{...t,done:!t.done}:t));
  const addOngoing  = (text,cat) => setOngoing(p=>[...p,{id:uid(),text,cat,done:false}]);
  const toggleOng   = id => setOngoing(p=>p.map(i=>i.id===id?{...i,done:!i.done}:i));
  const deleteOng   = id => setOngoing(p=>p.filter(i=>i.id!==id));
  const addGoal     = text => setGoals(p=>[...p,{id:uid(),text,done:false}]);
  const toggleGoal  = id => setGoals(p=>p.map(g=>g.id===id?{...g,done:!g.done}:g));
  const saveNote    = n => setNotes(p=>{const i=p.findIndex(x=>x.id===n.id);if(i>=0){const q=[...p];q[i]=n;return q;}return[n,...p];});
  const deleteNote  = id => setNotes(p=>p.filter(n=>n.id!==id));
  const extractTask = text => addTask(text,fmtDate(todayDate()));

  const handleEventDrop = (evId,tDate,tHour,tMin=0) =>
    setEvents(p=>p.map(e=>e.id===evId?{...e,date:tDate,...(tHour!=null?{startHour:tHour,startMin:tMin}:{})}:e));

  const handleTaskDrop = (tkId,tDate,tHour,tMin=0) => {
    const t=tasks.find(x=>x.id===tkId)||ongoingItems.find(x=>x.id===tkId);
    if(t) setPrefill({title:t.text,day:tDate?parseDate(tDate):todayDate(),hour:tHour??9});
  };

  const handleMonthAdd = (text,dateStr) => addTask(text,dateStr);

  // ── Panel management ──
  const addPanel = type => {
    if(type==="weekly5"&&openTypes.includes("weekly7")){
      setPanels(p=>p.filter(x=>x.type!=="weekly7").concat({id:uid(),type,label:PANEL_DEFS[type].label,col:PANEL_DEFS[type].defaultCol})); return;
    }
    if(type==="weekly7"&&openTypes.includes("weekly5")){
      setPanels(p=>p.filter(x=>x.type!=="weekly5").concat({id:uid(),type,label:PANEL_DEFS[type].label,col:PANEL_DEFS[type].defaultCol})); return;
    }
    if(openTypes.includes(type)) return;
    // Find the best column: prefer the column with fewest panels among existing columns.
    // Only place in defaultCol if it's the only column or defaultCol is already the least populated.
    const def = PANEL_DEFS[type];
    const bestCol = (currentPanels) => {
      const cols = [...new Set(currentPanels.map(p=>p.col??0))].sort();
      if (cols.length === 0) return def.defaultCol;
      // Count panels per col
      const counts = {};
      cols.forEach(c => { counts[c] = currentPanels.filter(p=>(p.col??0)===c).length; });
      // If the panel type is flexible (can go anywhere), pick least-loaded col
      // For non-flexible (weekly), always use defaultCol
      if (!def.flexible) return def.defaultCol;
      // Pick col with fewest panels
      let bestC = cols[0], bestN = counts[cols[0]];
      cols.forEach(c => { if(counts[c] < bestN) { bestN=counts[c]; bestC=c; }});
      return bestC;
    };
    setPanels(p => {
      const col = bestCol(p);
      return [...p, {id:uid(), type, label:def.label, col}];
    });
  };
  const removePanel = id => setPanels(p=>p.filter(x=>x.id!==id));
  const reorderPanels = (fromId, toId) => setPanels(prev => {
    const from = prev.find(x=>x.id===fromId);
    const to   = prev.find(x=>x.id===toId);
    if (!from || !to) return prev;
    // Dragged panel moves to target's column and position; target panel stays put
    const without = prev.filter(x=>x.id!==fromId);
    const ti = without.findIndex(x=>x.id===toId);
    const moved = {...from, col: to.col??0};
    const result = [...without.slice(0,ti), moved, ...without.slice(ti)];
    // Compact: if col 0 is empty after move, shift remaining cols down
    const hasCol0 = result.some(x=>(x.col??0)===0);
    if (!hasCol0) return result.map(x=>({...x, col:Math.max(0,(x.col??0)-1)}));
    return result;
  });
  // Move panel to col, then compact: if col 0 ends up empty, shift cols down
  const movePanelToCol = (id, col) => setPanels(prev => {
    const next = prev.map(x => x.id===id ? {...x, col} : x);
    const hasCol0 = next.some(x=>(x.col??0)===0);
    if (!hasCol0) return next.map(x=>({...x, col:Math.max(0,(x.col??0)-1)}));
    return next;
  });

  // ── Render panel content ──
  const renderContent = panel => {
    const day = selectedDay||todayDate();
    switch(panel.type){
      case "monthly":
        return <MonthlyPanel events={events} tasks={tasks} palette={palette} selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onCreateHere={d=>{setSelectedDay(d);setModal({day:d,hour:9,min:0});}}
          onEventDrop={handleEventDrop} onTaskDrop={handleTaskDrop}/>;
      case "weekly5":
        return <WeeklyPanel numDays={5} events={events} palette={palette} selectedDay={selectedDay}
          onSlotClick={(d,h,m)=>setModal({day:d,hour:h,min:m||0})}
          onEventDrop={handleEventDrop} onTaskDrop={handleTaskDrop}
          onEventClick={setEditTarget} onEventResize={resizeEvent}/>;
      case "weekly7":
        return <WeeklyPanel numDays={7} events={events} palette={palette} selectedDay={selectedDay}
          onSlotClick={(d,h,m)=>setModal({day:d,hour:h,min:m||0})}
          onEventDrop={handleEventDrop} onTaskDrop={handleTaskDrop}
          onEventClick={setEditTarget} onEventResize={resizeEvent}/>;
      case "daily":
        return <DailyPanel date={day} events={events} tasks={tasks} ongoingItems={ongoingItems} palette={palette}
          onSlotClick={(d,h,m)=>setModal({day:d,hour:h,min:m||0})} onAddTask={addTask} onToggleTask={toggleTask}
          onEventDrop={handleEventDrop} onTaskDrop={handleTaskDrop}
          onEventClick={setEditTarget} onEventResize={resizeEvent}/>;
      case "agenda":
        return <div style={{height:"100%",overflow:"auto"}}><AgendaView events={events} tasks={tasks} palette={palette}/></div>;
      case "ongoing":
        return <OngoingPanel items={ongoingItems} palette={palette} onAdd={addOngoing} onToggle={toggleOng} onDelete={deleteOng}/>;
      case "notes":
        return <NoteStash notes={stashNotes} palette={palette} onSave={saveNote} onDelete={deleteNote} onExtractTask={extractTask}/>;
      case "mini-cal":
        return <MiniCalPanel events={events} palette={palette} onDayClick={setSelectedDay} selectedDay={selectedDay}/>;
      case "sixmonth":
        return <SixMonthPanel events={events} tasks={tasks} palette={palette}
          onMonthClick={handleMonthAdd} onEventDrop={handleEventDrop} onTaskDrop={handleTaskDrop}/>;
      default: return null;
    }
  };

  const [goalsOpen,setGoalsOpen]   = useState(true);
  const [ongoingOpen,setOngOpen]   = useState(false);
  const [goalText,setGoalText]     = useState("");

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",...cssVars}}>
      <GlobalStyle palette={palette}/>

      {/* ── Header ── */}
      <header style={{background:palette.surface,borderBottom:`1.5px solid ${palette.border}`,
        padding:"0 16px",display:"flex",alignItems:"center",gap:10,height:46,flexShrink:0}}>
        <div style={{fontSize:17,fontWeight:700,letterSpacing:"-0.03em",color:palette.accent,marginRight:4}}>hako</div>
        <div style={{flex:1}}/>
        <select onChange={e=>{if(e.target.value){addPanel(e.target.value);e.target.value="";}}} defaultValue=""
          style={{background:palette.surface,border:`1px solid ${palette.border}`,borderRadius:7,padding:"4px 10px",color:palette.text,fontSize:12}}>
          <option value="" disabled>+ panel</option>
          {Object.entries(PANEL_DEFS)
            .filter(([id])=>{
              if(id==="weekly5"&&openTypes.includes("weekly7")) return true;
              if(id==="weekly7"&&openTypes.includes("weekly5")) return true;
              return !openTypes.includes(id);
            })
            .map(([id,def])=><option key={id} value={id}>{def.label}
              {((id==="weekly5"&&openTypes.includes("weekly7"))||(id==="weekly7"&&openTypes.includes("weekly5")))?" (swap)":""}
            </option>)}
        </select>
        {panels.length>0&&
          <button onClick={()=>setPanels([])}
            style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${palette.border}`,fontSize:12,color:palette.muted}}>clear</button>}
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          {Object.entries(PALETTES).map(([key,p])=>(
            <button key={key} onClick={()=>setPalName(key)} title={p.name}
              style={{width:14,height:14,borderRadius:"50%",background:p.bg,border:`2px solid ${palName===key?p.accent:p.border+"66"}`}}/>
          ))}
        </div>
        <button onClick={()=>setSidebarOpen(o=>!o)}
          style={{width:30,height:28,borderRadius:6,border:`1px solid ${palette.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:palette.text}}>
          <svg width="14" height="12" viewBox="0 0 14 12">
            <rect x="0" y="0" width="4" height="12" rx="1.5" fill={sidebarOpen?palette.accent:palette.border}/>
            <rect x="6" y="0" width="8" height="2" rx="1" fill={palette.border}/>
            <rect x="6" y="5" width="8" height="2" rx="1" fill={palette.border}/>
            <rect x="6" y="10" width="8" height="2" rx="1" fill={palette.border}/>
          </svg>
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>
        {sidebarOpen&&(
          <aside style={{width:192,background:palette.surface,borderRight:`1.5px solid ${palette.border}`,flexShrink:0,overflow:"auto",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",color:palette.muted,marginBottom:5}}>
                  {MONTH_NAMES[todayDate().getMonth()]} {todayDate().getFullYear()}
                </div>
                <SidebarMiniCal events={events} palette={palette} onDayClick={setSelectedDay} selectedDay={selectedDay}/>
              </div>
              <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
                <div style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",color:palette.muted,marginBottom:5,borderBottom:`1px solid ${palette.border}33`,paddingBottom:3}}>
                  {agendaInPanel?"Agenda (panel)":"Upcoming"}
                </div>
                <div style={{flex:1,overflow:"auto"}}>
                  {agendaInPanel
                    ?<div style={{fontSize:10,color:palette.muted,fontStyle:"italic"}}>open as panel</div>
                    :<AgendaView events={events} tasks={tasks} palette={palette} compact/>
                  }
                </div>
              </div>
              <div>
                <div onClick={()=>setGoalsOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",marginBottom:goalsOpen?5:0}}>
                  <div style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",color:palette.muted,flex:1}}>Goals / Habits</div>
                  <span style={{fontSize:9,color:palette.muted}}>{goalsOpen?"▲":"▼"}</span>
                </div>
                {goalsOpen&&<>
                  {goals.map(g=>(
                    <div key={g.id} onClick={()=>toggleGoal(g.id)} style={{display:"flex",gap:6,alignItems:"center",padding:"3px 0",cursor:"pointer"}}>
                      <div style={{width:8,height:8,borderRadius:"50%",border:`1.5px solid ${palette.accent}`,background:g.done?palette.accent:"transparent",flexShrink:0}}/>
                      <span style={{fontSize:10,textDecoration:g.done?"line-through":"none",color:g.done?palette.muted:palette.text}}>{g.text}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:4,marginTop:4}}>
                    <input value={goalText} onChange={e=>setGoalText(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&goalText.trim()){addGoal(goalText.trim());setGoalText("");}}}
                      placeholder="add goal…" style={{flex:1,background:"transparent",border:"none",borderBottom:`1px solid ${palette.border}`,padding:"2px 0",fontSize:10,color:palette.text}}/>
                    <button onClick={()=>{if(goalText.trim()){addGoal(goalText.trim());setGoalText("");}}} style={{fontSize:14,color:palette.accent,fontWeight:300}}>+</button>
                  </div>
                </>}
              </div>
              <div>
                <div onClick={()=>setOngOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",marginBottom:ongoingOpen?5:0}}>
                  <div style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",color:palette.muted,flex:1}}>On-Going</div>
                  <span style={{fontSize:9,color:palette.muted}}>{ongoingOpen?"▲":"▼"}</span>
                </div>
                {ongoingOpen&&<div style={{maxHeight:120,overflow:"auto"}}>
                  {ongoingItems.map(item=>(
                    <div key={item.id} onClick={()=>toggleOng(item.id)} style={{display:"flex",gap:6,alignItems:"center",padding:"3px 0",cursor:"pointer"}}>
                      <div style={{width:8,height:8,borderRadius:2,border:`1.5px solid ${palette.border}`,background:item.done?palette.accent:"transparent",flexShrink:0}}/>
                      <span style={{fontSize:10,textDecoration:item.done?"line-through":"none",color:item.done?palette.muted:palette.text}}>{item.text}</span>
                    </div>
                  ))}
                  {!ongoingItems.length&&<div style={{fontSize:10,color:palette.muted,fontStyle:"italic"}}>nothing ongoing</div>}
                </div>}
              </div>
            </div>
          </aside>
        )}

        <BentoLayout panels={panels} renderContent={renderContent} onRemove={removePanel} onReorder={reorderPanels} onMovePanelToCol={movePanelToCol} palette={palette}/>
      </div>

      {/* ── Modals ── */}
      {modal&&<EventModal day={modal.day} initialHour={modal.hour} initialMin={modal.min||0} palette={palette}
        onClose={()=>setModal(null)} onAdd={ev=>{addEvent(ev);setModal(null);}} onUpdate={ev=>{updateEvent(ev);setModal(null);}}/>}
      {editTarget&&<EventModal day={parseDate(editTarget.date)} palette={palette} event={editTarget}
        onClose={()=>setEditTarget(null)} onAdd={addEvent} onUpdate={ev=>{updateEvent(ev);setEditTarget(null);}}/>}
      {prefillModal&&<EventModal day={prefillModal.day} initialHour={prefillModal.hour} initialMin={prefillModal.min||0} palette={palette}
        prefillTitle={prefillModal.title}
        onClose={()=>setPrefill(null)} onAdd={ev=>{addEvent(ev);setPrefill(null);}} onUpdate={ev=>{updateEvent(ev);setPrefill(null);}}/>}
    </div>
  );
}
