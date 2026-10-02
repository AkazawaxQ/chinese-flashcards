import { CHARACTERS as SEED } from "./characters.js";

const KEY="hanzi-saved-ids";
const LANG="hanzi-meaning-language";
const THEME="hanzi-theme";
const ACCENT_DARK="hanzi-accent-dark";
const ACCENT_LIGHT="hanzi-accent-light";
const DATA_KEY="hsk30-dataset-v1";
const HSK_URL="https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.min.json";

const $=id=>document.getElementById(id);
const levelOrder=["All","Learned","HSK 1","HSK 2","HSK 3","HSK 4","HSK 5","HSK 6","HSK 7–9"];

function readJSON(key,fallback){
  try{
    const value=localStorage.getItem(key);
    return value?JSON.parse(value):fallback;
  }catch{return fallback;}
}

function readString(key,fallback){
  try{return localStorage.getItem(key)||fallback;}catch{return fallback;}
}

function writeStorage(key,value){
  try{localStorage.setItem(key,value);}catch{}
}

const savedInitial=readJSON(KEY,[]);
const validLangs=new Set(["en","jp","tr"]);
const initialLang=readString(LANG,"en");

const state={
  tab:"practice",
  level:"All",
  index:0,
  flipped:false,
  saved:Array.isArray(savedInitial)?savedInitial.filter(x=>typeof x==="string"):[],
  lang:validLangs.has(initialLang)?initialLang:"en",
  theme:readString(THEME,"dark")==="light"?"light":"dark",
  accentDark:readString(ACCENT_DARK,"#b56bff"),
  accentLight:readString(ACCENT_LIGHT,"#7c3aed"),
  q:"",
  dq:"",
  cards:[...SEED],
  loading:true,
  transCache:{},
  translationRun:0,
  shuffle:false,
  shuffleOrder:new Map()
};

function ensureShuffleOrder(){
  for(const c of state.cards){
    if(!state.shuffleOrder.has(c.id))state.shuffleOrder.set(c.id,Math.random());
  }
}

function deck(){
  let d=state.level==="All"
    ?[...state.cards]
    :state.level==="Learned"
      ?state.cards.filter(c=>c.level==="Learned")
      :state.cards.filter(c=>c.level===state.level);
  if(state.shuffle){
    ensureShuffleOrder();
    d.sort((a,b)=>state.shuffleOrder.get(a.id)-state.shuffleOrder.get(b.id));
  }
  return d;
}

const card=()=>deck()[state.index];

function meaning(c){
  if(!c)return "";
  return c[state.lang]||c.en||c.meaning||"";
}

function levelFrom(entry){
  const lv=entry?.level||entry?.l||[];
  const a=Array.isArray(lv)?lv:[lv];
  const nums=a.map(x=>String(x).match(/(?:new-|n)([1-7])/i)?.[1]).filter(Boolean).map(Number);
  if(!nums.length)return null;
  const n=Math.min(...nums);
  return n===7?"HSK 7–9":`HSK ${n}`;
}

function firstForm(entry){
  const forms=entry?.forms||entry?.f||[];
  return Array.isArray(forms)?forms[0]||{}:forms||{};
}

function firstTrans(form){return form?.transcriptions||form?.i||{};}
function extractPinyin(form){const t=firstTrans(form);return t?.pinyin||t?.y||"";}
function extractMeanings(form){
  const m=form?.meanings||form?.m||[];
  return Array.isArray(m)?m.join("; "):String(m||"");
}

function normalizeRemote(raw){
  const arr=Array.isArray(raw)?raw:(raw?.data||raw?.words||[]);
  const out=[];

  for(const e of arr){
    const hanzi=e?.simplified||e?.s||e?.word;
    const level=levelFrom(e);
    if(!hanzi||!level)continue;

    const f=firstForm(e);
    const pinyin=extractPinyin(f);
    const en=extractMeanings(f);
    if(!pinyin)continue;

    out.push({
      id:`${level.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${hanzi}`,
      hanzi,pinyin,meaning:en,level,en,jp:"",tr:""
    });
  }

  const seen=new Set();
  return out.filter(c=>{
    const key=c.hanzi+"|"+c.level;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

async function loadDataset(){
  try{
    const cached=localStorage.getItem(DATA_KEY);
    if(cached){
      const parsed=JSON.parse(cached);
      if(Array.isArray(parsed)&&parsed.length>5000){
        state.cards=[...SEED.filter(x=>x.level==="Learned"),...parsed];
      }
    }
  }catch{}

  if(state.cards.length<=5000){
    try{
      const r=await fetch(HSK_URL,{cache:"force-cache"});
      if(!r.ok)throw new Error("dataset");
      const data=normalizeRemote(await r.json());
      if(data.length>5000){
        state.cards=[...SEED.filter(x=>x.level==="Learned"),...data];
        writeStorage(DATA_KEY,JSON.stringify(data));
      }
    }catch(e){console.warn("HSK dataset could not be loaded",e);}
  }

  state.loading=false;
  state.shuffleOrder=new Map();
  ensureShuffleOrder();
  state.index=0;
  render();
}

function render(){
  $("practice-view").hidden=state.tab!=="practice";
  $("dictionary-view").hidden=state.tab!=="dictionary";
  $("saved-view").hidden=state.tab!=="saved";

  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("is-active",x.dataset.tab===state.tab));
  document.querySelectorAll('.tab[data-tab="saved"]').forEach(x=>x.textContent=`Saved (${state.saved.length})`);
  document.querySelectorAll(".chip").forEach(x=>x.classList.toggle("is-active",x.dataset.level===state.level));
  const shuffleBtn=$("shuffle-btn");
  if(shuffleBtn){
    shuffleBtn.classList.toggle("is-active",state.shuffle);
    shuffleBtn.setAttribute("aria-pressed",String(state.shuffle));
  }

  if(state.tab==="practice")renderPractice();
  else if(state.tab==="dictionary")renderDictionary();
  else renderSaved();
}

function renderPractice(){
  const d=deck();
  if(state.index>=d.length)state.index=0;
  const c=card();

  $("progress").textContent=state.loading?"Loading HSK 3.0…":d.length?`${state.index+1} / ${d.length}`:"0 / 0";
  $("practice-hanzi").textContent=c?.hanzi||"";
  $("practice-pinyin").textContent=c?.pinyin||"";
  $("practice-meaning").textContent=c?(state.lang!=="en"&&!c[state.lang]?"Loading…":meaning(c)):"";
  $("practice-level").textContent=c?.level||"";
  $("practice-reveal").classList.toggle("is-visible",state.flipped);
  $("practice-hint").textContent=state.flipped?"Tap to hide meaning":"Tap to reveal meaning";
  $("save-btn").textContent=c&&state.saved.includes(c.id)?"Saved":"Save";

  if(c&&state.lang!=="en"&&!c[state.lang])translatePracticeCard(c);
}

function pickFemaleVoice(){
  const voices=speechSynthesis?.getVoices?.()||[];
  const zh=voices.filter(v=>/^zh/i.test(v.lang)||/Chinese|Mandarin|普通话|中文|Ting|Meijia|Sin-ji|Li-mu|Lili|Xiaoxiao/i.test(v.name));
  return zh.find(v=>/female|女|Ting|Meijia|Sin-ji|Lili|Xiaoxiao|Yuna|Samantha/i.test(v.name))||zh[0]||null;
}

function speak(t){
  if(!window.speechSynthesis||!t)return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(t);
  u.lang="zh-CN";
  u.rate=.82;
  const v=pickFemaleVoice();
  if(v)u.voice=v;
  speechSynthesis.speak(u);
}

async function translateText(text,lang){
  if(!text||lang==="en")return "";
  const key=`${lang}:${text}`;
  if(Object.prototype.hasOwnProperty.call(state.transCache,key))return state.transCache[key];

  try{
    const r=await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);
    if(!r.ok)throw new Error("translation");
    const j=await r.json();
    const val=(Array.isArray(j?.[0])?j[0]:[]).map(x=>x?.[0]||"").join("").trim();
    state.transCache[key]=val;
    return val;
  }catch{
    state.transCache[key]="";
    return "";
  }
}

async function translatePracticeCard(c){
  const run=state.translationRun;
  const lang=state.lang;
  const val=await translateText(c.en,lang);
  if(run!==state.translationRun||state.lang!==lang)return;
  if(val)c[lang]=val;
  if(state.tab==="practice"&&card()?.id===c.id){
    $("practice-meaning").textContent=val||c.en||"";
  }
}

function renderDictionary(){
  const q=String(state.dq||"").trim().toLowerCase();
  if(state.loading){
    $("dictionary-list").innerHTML='<div class="empty"><p>Loading the full HSK 3.0 dictionary…</p></div>';
    return;
  }

  const a=state.cards.filter(c=>!q||[c.hanzi,c.pinyin,c.en,c.jp,c.tr].some(v=>String(v||"").toLowerCase().includes(q)));
  const visible=a.slice(0,80);

  $("dictionary-list").innerHTML=visible.map(c=>`
    <article class="dictionary-row">
      <div class="dictionary-hanzi">${escapeHTML(c.hanzi)}</div>
      <div>
        <div class="dictionary-pinyin">${escapeHTML(c.pinyin)}</div>
        <div class="dictionary-meta">${escapeHTML(c.level)}</div>
      </div>
      <div class="dictionary-meaning" data-meaning-id="${escapeAttr(c.id)}">${escapeHTML(state.lang!=="en"&&!c[state.lang]?"Loading…":meaning(c))}</div>
    </article>`).join("")||'<div class="empty"><p>No matches.</p></div>';

  translateDictionaryCards(visible);
}

async function translateDictionaryCards(rows){
  if(state.lang==="en"||!rows.length)return;
  const run=state.translationRun;
  const lang=state.lang;

  for(let i=0;i<Math.min(rows.length,80);i++){
    if(run!==state.translationRun||state.lang!==lang)return;
    const c=rows[i];
    if(c[lang])continue;
    const val=await translateText(c.en,lang);
    if(run!==state.translationRun||state.lang!==lang)return;
    if(val)c[lang]=val;
    const el=document.querySelector(`[data-meaning-id="${cssEscape(c.id)}"]`);
    if(el)el.textContent=val||c.en||"";
  }
}

function renderSaved(){
  const q=state.q.toLowerCase();
  const a=state.cards.filter(c=>state.saved.includes(c.id)).filter(c=>!q||[c.hanzi,c.pinyin,c.en,c.jp,c.tr].some(v=>String(v||"").toLowerCase().includes(q)));
  $("empty-state").hidden=a.length>0;

  $("saved-grid").innerHTML=a.map(c=>`
    <article class="card card--compact">
      <button class="card-face" data-flip="${escapeAttr(c.id)}">
        <span class="card-hint">Tap to reveal</span>
        <span class="hanzi">${escapeHTML(c.hanzi)}</span>
        <span class="pinyin">${escapeHTML(c.pinyin)}</span>
        <div class="reveal"><p class="meaning" data-saved-meaning-id="${escapeAttr(c.id)}">${escapeHTML(state.lang!=="en"&&!c[state.lang]?"Loading…":meaning(c))}</p></div>
        <span class="level-chip">${escapeHTML(c.level)}</span>
      </button>
      <div class="card-actions">
        <button class="ghost" data-speak="${escapeAttr(c.id)}">🔊 Hear</button>
        <button class="save is-saved" data-remove="${escapeAttr(c.id)}">Saved</button>
      </div>
    </article>`).join("");

  translateSavedCards(a);
}

async function translateSavedCards(rows){
  if(state.lang==="en"||!rows.length)return;
  const run=state.translationRun;
  const lang=state.lang;
  for(const c of rows){
    if(run!==state.translationRun||state.lang!==lang)return;
    if(c[lang])continue;
    const val=await translateText(c.en,lang);
    if(run!==state.translationRun||state.lang!==lang)return;
    if(val)c[lang]=val;
    const el=document.querySelector(`[data-saved-meaning-id="${cssEscape(c.id)}"]`);
    if(el)el.textContent=val||c.en||"";
  }
}

function escapeHTML(value){
  return String(value??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[ch]));
}
function escapeAttr(value){return escapeHTML(value);}
function cssEscape(value){return window.CSS?.escape?CSS.escape(String(value)):String(value).replace(/[^a-zA-Z0-9_-]/g,"\\$&");}

function applyAccent(){
  const accent=state.theme==="dark"?state.accentDark:state.accentLight;
  document.documentElement.style.setProperty("--accent",accent);
  document.documentElement.style.setProperty("--accent-deep",accent);
  document.documentElement.style.setProperty("--glow",`color-mix(in srgb, ${accent} 18%, transparent)`);
  const custom=$("custom-color");
  if(custom)custom.value=accent;
  document.querySelectorAll(".color-swatch").forEach(x=>x.classList.toggle("is-selected",x.dataset.color.toLowerCase()===accent.toLowerCase()));
}

function applyTheme(){
  document.documentElement.dataset.theme=state.theme;
  writeStorage(THEME,state.theme);
  $("theme-toggle").textContent=state.theme==="dark"?"Light":"Dark";
  applyAccent();
}

function setLanguage(lang){
  if(!validLangs.has(lang))lang="en";
  state.translationRun++;
  state.lang=lang;
  writeStorage(LANG,lang);
  state.index=0;
  state.flipped=false;
  render();
}

document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>{
  state.tab=x.dataset.tab;
  render();
});

document.querySelectorAll(".chip").forEach(x=>x.onclick=()=>{
  state.level=x.dataset.level;
  state.index=0;
  state.flipped=false;
  render();
});

applyTheme();
$("language-select").value=state.lang;
$("language-select").onchange=e=>setLanguage(e.target.value);

$("theme-toggle").onclick=()=>{
  state.theme=state.theme==="dark"?"light":"dark";
  applyTheme();
};

$("theme-color-btn").onclick=()=>{
  const panel=$("theme-panel");
  panel.hidden=!panel.hidden;
};

function setAccent(color){
  if(!/^#[0-9a-f]{6}$/i.test(color))return;
  if(state.theme==="dark"){state.accentDark=color;writeStorage(ACCENT_DARK,color);}
  else{state.accentLight=color;writeStorage(ACCENT_LIGHT,color);}
  applyAccent();
}

document.querySelectorAll(".color-swatch").forEach(btn=>btn.onclick=()=>setAccent(btn.dataset.color));
$("custom-color").oninput=e=>setAccent(e.target.value);
document.addEventListener("click",e=>{
  const panel=$("theme-panel"), trigger=$("theme-color-btn");
  if(panel&&!panel.hidden&&!panel.contains(e.target)&&e.target!==trigger)panel.hidden=true;
});

$("practice-face").onclick=()=>{
  state.flipped=!state.flipped;
  renderPractice();
};

$("speak-btn").onclick=()=>{const c=card();if(c)speak(c.hanzi);};

$("shuffle-btn").onclick=()=>{
  state.shuffle=!state.shuffle;
  state.index=0;
  state.flipped=false;
  if(state.shuffle){
    state.shuffleOrder=new Map();
    ensureShuffleOrder();
  }
  render();
};

$("save-btn").onclick=()=>{
  const c=card();
  if(!c)return;
  state.saved=state.saved.includes(c.id)?state.saved.filter(x=>x!==c.id):[...state.saved,c.id];
  writeStorage(KEY,JSON.stringify(state.saved));
  render();
};

$("prev-btn").onclick=()=>{
  const d=deck();
  if(!d.length)return;
  state.index=(state.index-1+d.length)%d.length;
  state.flipped=false;
  render();
};

$("next-btn").onclick=()=>{
  const d=deck();
  if(!d.length)return;
  state.index=(state.index+1)%d.length;
  state.flipped=false;
  render();
};

$("search").oninput=e=>{state.q=e.target.value;renderSaved();};

let dictionarySearchTimer;
$("dictionary-search").oninput=e=>{
  state.dq=e.target.value;
  clearTimeout(dictionarySearchTimer);
  dictionarySearchTimer=setTimeout(()=>renderDictionary(),120);
};

$("go-practice").onclick=()=>{state.tab="practice";render();};

$("saved-grid").onclick=e=>{
  const target=e.target;
  if(target.dataset.speak){
    const c=state.cards.find(x=>x.id===target.dataset.speak);
    if(c)speak(c.hanzi);
  }
  if(target.dataset.remove){
    state.saved=state.saved.filter(x=>x!==target.dataset.remove);
    writeStorage(KEY,JSON.stringify(state.saved));
    render();
  }
};

let sx=0;
$("practice-face").ontouchstart=e=>{sx=e.changedTouches[0].clientX;};
$("practice-face").ontouchend=e=>{
  const dx=e.changedTouches[0].clientX-sx;
  if(Math.abs(dx)>55){
    const d=deck();
    if(!d.length)return;
    state.index=(state.index+(dx<0?1:-1)+d.length)%d.length;
    state.flipped=false;
    render();
  }
};

if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(()=>{});}
if("speechSynthesis" in window){speechSynthesis.onvoiceschanged=()=>{};}

applyTheme();
render();
loadDataset();
