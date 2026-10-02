import { CHARACTERS as SEED } from "./characters.js";

const KEY="hanzi-saved-ids", LANG="hanzi-meaning-language", THEME="hanzi-theme", DATA_KEY="hsk30-dataset-v1";
const HSK_URL="https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.min.json";
const state={tab:"practice",level:"All",index:0,flipped:false,saved:JSON.parse(localStorage.getItem(KEY)||"[]"),lang:localStorage.getItem(LANG)||"en",theme:localStorage.getItem(THEME)||"dark",q:"",dq:"",cards:[...SEED],loading:true,transCache:{}};
const $=id=>document.getElementById(id);
const levelOrder=["All","Learned","HSK 1","HSK 2","HSK 3","HSK 4","HSK 5","HSK 6","HSK 7–9"];
const deck=()=>state.level==="All"?state.cards:state.level==="Learned"?state.cards.filter(c=>c.level==="Learned"):state.cards.filter(c=>c.level===state.level);
const card=()=>deck()[state.index];
const meaning=c=>c?.[state.lang]??c?.en??c?.meaning??"";

function levelFrom(entry){
  const lv=entry?.level||entry?.l||[]; const a=Array.isArray(lv)?lv:[lv];
  const nums=a.map(x=>String(x).match(/(?:new-|n)([1-7])/i)?.[1]).filter(Boolean).map(Number);
  if(!nums.length)return null; const n=Math.min(...nums); return n===7?"HSK 7–9":`HSK ${n}`;
}

function firstForm(entry){
  const forms=entry?.forms||entry?.f||[]; return Array.isArray(forms)?forms[0]||{}:forms||{};
}

function firstTrans(form){
  return form?.transcriptions||form?.i||{};
}

function extractPinyin(form){
  const t=firstTrans(form);
  return t?.pinyin||t?.y||"";
}

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
      hanzi,
      pinyin,
      meaning:en,
      level,
      en,
      jp:"",
      tr:""
    });
  }

  const seen=new Set(),clean=[];

  for(const c of out){
    if(!seen.has(c.hanzi+"|"+c.level)){
      seen.add(c.hanzi+"|"+c.level);
      clean.push(c);
    }
  }

  return clean;
}

async function loadDataset(){
  try{
    const cached=localStorage.getItem(DATA_KEY);

    if(cached){
      const parsed=JSON.parse(cached);

      if(Array.isArray(parsed)&&parsed.length>5000){
        state.cards=[
          ...SEED.filter(x=>x.level==="Learned"),
          ...parsed
        ];
      }
    }
  }catch{}

  if(state.cards.length>5000){
    state.loading=false;
    render();
    return;
  }

  try{
    const r=await fetch(HSK_URL,{cache:"force-cache"});

    if(!r.ok)throw new Error("dataset");

    const raw=await r.json();
    const data=normalizeRemote(raw);

    if(data.length>5000){
      state.cards=[
        ...SEED.filter(x=>x.level==="Learned"),
        ...data
      ];

      localStorage.setItem(
        DATA_KEY,
        JSON.stringify(data)
      );
    }
  }catch(e){
    console.warn("HSK dataset could not be loaded",e);
  }

  state.loading=false;
  state.index=0;
  render();
}

function render(){
  $("practice-view").hidden=state.tab!=="practice";
  $("dictionary-view").hidden=state.tab!=="dictionary";
  $("saved-view").hidden=state.tab!=="saved";

  document.querySelectorAll(".tab").forEach(x=>{
    x.classList.toggle(
      "is-active",
      x.dataset.tab===state.tab
    );
  });

  document.querySelectorAll(".tab[data-tab=saved]").forEach(x=>{
    x.textContent=`Saved (${state.saved.length})`;
  });

  document.querySelectorAll(".chip").forEach(x=>{
    x.classList.toggle(
      "is-active",
      x.dataset.level===state.level
    );
  });

  if(state.tab==="practice")renderPractice();
  if(state.tab==="dictionary")renderDictionary();
  if(state.tab==="saved")renderSaved();
}

function renderPractice(){
  const d=deck(),c=card();

  $("progress").textContent=
    state.loading
      ?"Loading HSK 3.0…"
      :d.length
        ?`${state.index+1} / ${d.length}`
        :"0 / 0";

  $("practice-hanzi").textContent=c?.hanzi||"";
  $("practice-pinyin").textContent=c?.pinyin||"";

  let displayMeaning=meaning(c);

  if(state.lang!=="en" && c && !c[state.lang]){
    displayMeaning="Loading…";
  }

  $("practice-meaning").textContent=displayMeaning;
  $("practice-level").textContent=c?.level||"";

  $("practice-reveal").classList.toggle(
    "is-visible",
    state.flipped
  );

  $("practice-hint").textContent=
    state.flipped
      ?"Tap to hide meaning"
      :"Tap to reveal meaning";

  $("save-btn").textContent=
    c&&state.saved.includes(c.id)
      ?"Saved"
      :"Save";

  if(c && state.lang!=="en" && !c[state.lang]){
    translateCard(c);
  }
}

function pickFemaleVoice(){
  const voices=speechSynthesis?.getVoices?.()||[];

  const zh=voices.filter(v=>
    /^zh/i.test(v.lang)||
    /Chinese|Mandarin|普通话|中文|Ting|Meijia|Sin-ji|Li-mu|Lili|Xiaoxiao/i.test(v.name)
  );

  return zh.find(v=>
    /female|女|Ting|Meijia|Sin-ji|Lili|Xiaoxiao|Yuna|Samantha/i.test(v.name)
  )||zh[0]||null;
}

function speak(t){
  if(!speechSynthesis)return;

  speechSynthesis.cancel();

  const u=new SpeechSynthesisUtterance(t);
  u.lang="zh-CN";
  u.rate=.82;

  const v=pickFemaleVoice();

  if(v)u.voice=v;

  speechSynthesis.speak(u);
}

async function translateText(text,lang){
  const key=`${lang}:${text}`;

  if(state.transCache[key]){
    return state.transCache[key];
  }

  try{
    const r=await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
    );

    const j=await r.json();

    const val=(j?.[0]||[])
      .map(x=>x?.[0]||"")
      .join("")
      .trim();

    if(val){
      state.transCache[key]=val;
      return val;
    }
  }catch(e){}

  return text;
}

async function translateCard(c){
  if(!c || state.lang==="en")return;
  if(c[state.lang])return;

  const val=await translateText(c.en,state.lang);

  if(val && val!==c.en){
    c[state.lang]=val;
  }

  if(state.tab==="practice"){
    renderPractice();
  }
}

/*
 IMPORTANT:
 Dictionary search NEVER auto-translates.
 This prevents the render/translation loop that was
 crashing the browser when typing in the search box.
*/
async function translateRows(rows){
  return;
}

function renderDictionary(){
  const q=String(state.dq||"")
    .trim()
    .toLowerCase();

  if(state.loading){
    $("dictionary-list").innerHTML=
      `<div class="empty">
        <p>Loading the full HSK 3.0 dictionary…</p>
      </div>`;

    return;
  }

  const a=state.cards.filter(c=>{
    if(!q)return true;

    return [
      c.hanzi,
      c.pinyin,
      c.en,
      c.jp,
      c.tr
    ].some(v=>
      String(v||"")
        .toLowerCase()
        .includes(q)
    );
  });

  const visible=a.slice(0,80);

  $("dictionary-list").innerHTML=
    visible.map(c=>`
      <article class="dictionary-row">

        <div class="dictionary-hanzi">
          ${c.hanzi||""}
        </div>

        <div>
          <div class="dictionary-pinyin">
            ${c.pinyin||""}
          </div>

          <div class="dictionary-meta">
            ${c.level||""}
          </div>
        </div>

        <div class="dictionary-meaning">
          ${meaning(c)||c.en||""}
        </div>

      </article>
    `).join("")
    ||
    `<div class="empty">
      <p>No matches.</p>
    </div>`;
}

function renderSaved(){
  let q=state.q.toLowerCase();

  let a=state.cards
    .filter(c=>state.saved.includes(c.id))
    .filter(c=>
      !q||
      [
        c.hanzi,
        c.pinyin,
        c.en,
        c.jp,
        c.tr
      ].some(v=>
        String(v||"")
          .toLowerCase()
          .includes(q)
      )
    );

  $("empty-state").hidden=a.length>0;

  $("saved-grid").innerHTML=a.map(c=>`
    <article class="card card--compact">

      <button class="card-face" data-flip="${c.id}">

        <span class="card-hint">
          Tap to reveal
        </span>

        <span class="hanzi">
          ${c.hanzi}
        </span>

        <span class="pinyin">
          ${c.pinyin}
        </span>

        <div class="reveal">
          <p class="meaning">
            ${meaning(c)}
          </p>
        </div>

        <span class="level-chip">
          ${c.level}
        </span>

      </button>

      <div class="card-actions">

        <button class="ghost" data-speak="${c.id}">
          🔊 Hear
        </button>

        <button class="save is-saved" data-remove="${c.id}">
          Saved
        </button>

      </div>

    </article>
  `).join("");
}

function applyTheme(){
  document.documentElement.dataset.theme=state.theme;

  localStorage.setItem(
    THEME,
    state.theme
  );

  $("theme-toggle").textContent=
    state.theme==="dark"
      ?"Light"
      :"Dark";
}

document
  .querySelectorAll(".tab")
  .forEach(x=>{
    x.onclick=()=>{
      state.tab=x.dataset.tab;
      render();
    };
  });

document
  .querySelectorAll(".chip")
  .forEach(x=>{
    x.onclick=()=>{
      state.level=x.dataset.level;
      state.index=0;
      state.flipped=false;
      render();
    };
  });

$("language-select").value=state.lang;

$("language-select").onchange=e=>{
  state.lang=e.target.value;

  localStorage.setItem(
    LANG,
    state.lang
  );

  state.index=0;
  state.flipped=false;

  render();
};

$("theme-toggle").onclick=()=>{
  state.theme=
    state.theme==="dark"
      ?"light"
      :"dark";

  applyTheme();
};

$("practice-face").onclick=()=>{
  state.flipped=!state.flipped;
  render();
};

$("speak-btn").onclick=()=>{
  let c=card();

  if(c){
    speak(c.hanzi);
  }
};

$("save-btn").onclick=()=>{
  let c=card();

  if(!c)return;

  state.saved=
    state.saved.includes(c.id)
      ?state.saved.filter(x=>x!==c.id)
      :[...state.saved,c.id];

  localStorage.setItem(
    KEY,
    JSON.stringify(state.saved)
  );

  render();
};

$("prev-btn").onclick=()=>{
  let d=deck();

  if(!d.length)return;

  state.index=
    (state.index-1+d.length)%d.length;

  state.flipped=false;

  render();
};

$("next-btn").onclick=()=>{
  let d=deck();

  if(!d.length)return;

  state.index=
    (state.index+1)%d.length;

  state.flipped=false;

  render();
};

$("search").oninput=e=>{
  state.q=e.target.value;
  renderSaved();
};


// DICTIONARY SEARCH
// Kullanıcı yazmayı bıraktıktan 120ms sonra çalışır.

let dictionarySearchTimer;

$("dictionary-search").oninput=e=>{
  state.dq=e.target.value;

  clearTimeout(dictionarySearchTimer);

  dictionarySearchTimer=setTimeout(()=>{
    renderDictionary();
  },120);
};

$("go-practice").onclick=()=>{
  state.tab="practice";
  render();
};

$("saved-grid").onclick=e=>{
  let r=e.target;

  if(r.dataset.speak){

    let c=state.cards.find(
      x=>x.id===r.dataset.speak
    );

    if(c){
      speak(c.hanzi);
    }
  }

  if(r.dataset.remove){

    state.saved=state.saved.filter(
      x=>x!==r.dataset.remove
    );

    localStorage.setItem(
      KEY,
      JSON.stringify(state.saved)
    );

    render();
  }
};

let sx=0;

$("practice-face").ontouchstart=e=>{
  sx=e.changedTouches[0].clientX;
};

$("practice-face").ontouchend=e=>{

  let dx=
    e.changedTouches[0].clientX-sx;

  if(Math.abs(dx)>55){

    let d=deck();

    if(!d.length)return;

    state.index=
      (
        state.index+
        (dx<0?1:-1)+
        d.length
      )%d.length;

    state.flipped=false;

    render();
  }
};

if("serviceWorker" in navigator){
  navigator.serviceWorker
    .register("./sw.js")
    .catch(()=>{});
}

if("speechSynthesis" in window){
  speechSynthesis.onvoiceschanged=()=>{};
}

applyTheme();
render();
loadDataset();