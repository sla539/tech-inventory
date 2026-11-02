import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getFirestore,collection,doc,setDoc,addDoc,deleteDoc,onSnapshot,getDoc,query,where} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {getAuth,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {firebaseConfig,ADMIN_UID,INV_DAYS,SITE_NAME} from "./config.js";
import {SEED_DEVICES,SEED_STOCK} from "./seed.js";

const fapp=initializeApp(firebaseConfig),fdb=getFirestore(fapp),auth=getAuth(fapp);

/* ---------- довідники ---------- */
const STATUSES=["в роботі","на складі","в ремонті","списано","втрачено"];
const KINDS={printer:{one:"Принтер",many:"Принтери",icon:"🖨️",route:"printers"},laptop:{one:"Ноутбук",many:"Ноутбуки",icon:"💻",route:"laptops"}};
const WORK_TYPES=["Заміна картриджа","Заправка","Ремонт","Чистка","Заміна комплектуючих","Інше"];
const ROLES={pending:"очікує",viewer:"перегляд",tech:"технік",admin:"адмін"};
const EV={checkout:"Видано",checkin:"Прийнято",status:"Статус",inventory:"Звірено",work:"Робота",edit:"Зміна"};

/* ---------- стан ---------- */
const S={devices:[],events:[],users:[],files:[],stock:[]};
const LOADED={dev:false,stk:false};
let ME=null,ST="load",ERR="",REG=null,NOPROF=false,started=false,TAB="info",lastKey="";
const freshF=()=>({q:"",status:"",loc:"",resp:"",model:""});
let F=freshF(),LB=new Set(),R={from:"",to:"",kind:""};

/* ---------- утиліти ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const p2=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
const today=()=>ymd(new Date());
const daysAgo=n=>ymd(new Date(Date.now()-n*864e5));
const fmt=d=>d?String(d).slice(0,10).split("-").reverse().join("."):"—";
const num=v=>Number(v)||0;
const uah=v=>Math.round(v).toLocaleString("uk-UA")+" ₴";
const val=id=>{const e=$("#"+id);return e?e.value.trim():""};
const dv=id=>S.devices.find(x=>x.id===id);
const dname=d=>d?(d.model+(d.sn?" "+d.sn:"")):"(видалено)";
const sc=s=>"s"+Math.max(0,STATUSES.indexOf(s));
const statusTag=s=>`<span class="tag ${s==="в роботі"?"o":s==="в ремонті"?"w":s==="втрачено"?"e":s==="списано"?"g":""}">${esc(s)}</span>`;
const canView=()=>!!ME&&["viewer","tech","admin"].includes(ME.role);
const canEdit=()=>!!ME&&["tech","admin"].includes(ME.role);
const isAdmin=()=>!!ME&&ME.role==="admin";
const route=()=>{const p=location.hash.replace(/^#\/?/,"").split("/");return{page:p[0]||"dash",id:p[1]||""}};
const fld=(l,id,v="",t="text",x="")=>`<label for=${id}>${l}</label><input id=${id} type=${t} value="${esc(v)}" ${x}>`;
const sel=(l,id,opts,v,x="")=>`<label for=${id}>${l}</label><select id=${id} ${x}>${opts.map(o=>`<option value="${esc(o[0])}" ${o[0]===v?"selected":""}>${esc(o[1])}</option>`).join("")}</select>`;
const dlg=h=>{const d=$("#dg");d.innerHTML=h;d.showModal()};
const uniq=(arr)=>[...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"uk"));
const ph=(t,i,s,crumb)=>`<div class=ph><div class=bc><a href="#/">Головна</a> <span>›</span> ${crumb||`<b>${t}</b>`}</div><h2><span class=ni>${i}</span>${t}</h2>${s?`<p class=mu>${s}</p>`:""}</div>`;

/* ---------- запис у базу ---------- */
async function addEvent(did,type,text,x={}){
  const d=dv(did);
  return addDoc(collection(fdb,"events"),{did,type,sub:String(x.sub||"").slice(0,60),date:x.date||today(),text:String(text).slice(0,300),cost:Math.min(999999,Math.max(0,num(x.cost))),by:auth.currentUser.email,resp:String(x.resp??(d?d.resp:"")).slice(0,80),ts:Date.now()});
}
const patchDevice=(id,upd)=>setDoc(doc(fdb,"devices",id),upd,{merge:true});
const fail=e=>alert("Помилка: "+(e&&(e.code||e.message)||e));

/* ---------- файли пристрою ---------- */
let unF=null,watchedId=null;
function watchFiles(id){
  if(watchedId===id)return;
  if(unF){unF();unF=null}
  S.files=[];watchedId=id;
  if(!id)return;
  unF=onSnapshot(query(collection(fdb,"files"),where("did","==",id)),sn=>{S.files=sn.docs.map(d=>({...d.data(),id:d.id}));if(route().page==="d")render()},()=>{});
}
const toData=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)});
async function shrink(f){
  const url=await toData(f);
  if(!f.type.startsWith("image/"))return url;
  const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
  const k=Math.min(1,1280/Math.max(im.width,im.height)),c=document.createElement("canvas");
  c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
  c.getContext("2d").drawImage(im,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",.72);
}
async function uploadFile(file,did){
  const isImg=file.type.startsWith("image/"),isPdf=file.type==="application/pdf";
  if(!isImg&&!isPdf)return alert("Підтримуються лише фото та PDF");
  if(isPdf&&file.size>650000)return alert("PDF завеликий (до ~0,6 МБ). Стисніть файл або додайте фото сторінки.");
  try{
    const data=await shrink(file);
    if(data.length>900000)return alert("Файл завеликий після стиснення");
    await addDoc(collection(fdb,"files"),{did,name:file.name.slice(0,120),data,by:auth.currentUser.email,ts:Date.now()});
  }catch(e){fail(e)}
}
const safeData=s=>/^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,[A-Za-z0-9+\/=]+$/.test(s||"");

/* ---------- етикетки з QR ---------- */
function printLabels(ids){
  const ds=ids.map(dv).filter(Boolean);
  if(!ds.length)return alert("Оберіть пристрої");
  let sh=$("#sheet");if(sh)sh.remove();
  sh=document.createElement("div");sh.id="sheet";
  sh.innerHTML=ds.map((d,i)=>`<div class=lb><div id=qr${i}></div><div class=lt><b>${esc(d.tag||"—")}</b><span>${esc(d.model)}</span><span>${esc(d.sn)}</span></div></div>`).join("");
  document.body.appendChild(sh);
  ds.forEach((d,i)=>{try{new QRCode($("#qr"+i),{text:location.origin+location.pathname+"#/d/"+d.id,width:96,height:96})}catch(e){}});
  setTimeout(()=>window.print(),400);
}
window.addEventListener("afterprint",()=>{const s=$("#sheet");if(s)s.remove()});

/* ---------- сторінки ---------- */
function hbars(data){
  const mx=Math.max(1,...data.map(d=>d[1]));
  return data.length?data.map(d=>`<div style="margin:8px 0"><div class=row style="justify-content:space-between;flex-wrap:nowrap"><span>${esc(d[0])}</span><b style="flex:0">${d[1]}</b></div><div class=bar><i style="width:${d[1]/mx*100}%"></i></div></div>`).join(""):"<p class=mu>Немає даних</p>";
}
function dash(){
  const d=S.devices,n=k=>d.filter(x=>x.status===k).length,lim=Date.now()-INV_DAYS*864e5;
  const unv=d.filter(x=>!x.lastInv||new Date(x.lastInv)<lim).length;
  const grp=key=>{const m={};d.forEach(x=>{const k=x[key]||"—";m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8)};
  const pr=d.filter(x=>x.kind==="printer").length,lp=d.length-pr;
  const low=S.stock.filter(s=>num(s.qty)<=num(s.min)).length;
  const needDev=LOADED.dev&&!SEED_DEVICES.some(x=>d.some(y=>y.id===x.id)),needStk=LOADED.stk&&!SEED_STOCK.some(x=>S.stock.some(y=>y.id===x.id));
  const impCard=isAdmin()&&(needDev||needStk)?`<div class=card style="border-color:var(--ac)"><b>Початкові дані з таблиці</b><p class=mu>Можна імпортувати: ${needDev?"принтерів — "+SEED_DEVICES.length:""}${needDev&&needStk?", ":""}${needStk?"матеріалів — "+SEED_STOCK.length:""}. Повторне натискання дублів не створює.</p><button class=p data-a=imp>⬇ Імпортувати</button></div>`:"";
  return ph("Статистика","📊","Стан техніки та розташування")+impCard+
  `<div class=kg><div class=kt><span class=mu>Усього</span><b>${d.length}</b></div><div class="kt k3"><span class=mu>Мало на складі</span><b>${low}</b></div><div class="kt k2"><span class=mu>В роботі</span><b>${n("в роботі")}</b></div><div class=kt><span class=mu>На складі</span><b>${n("на складі")}</b></div><div class="kt k3"><span class=mu>В ремонті</span><b>${n("в ремонті")}</b></div><div class="kt k4"><span class=mu>Не звірено (${INV_DAYS} дн.)</span><b>${unv}</b></div></div>
  <p class=mu>Принтерів: ${pr}, ноутбуків: ${lp}.</p>
  <div class=grid2><div class=card><b>За розташуванням</b>${hbars(grp("loc"))}</div><div class=card><b>За моделями</b>${hbars(grp("model"))}</div></div>`;
}
function listFor(kind){
  const f=F,q=f.q.toLowerCase();
  return S.devices.filter(d=>d.kind===kind&&(!f.status||d.status===f.status)&&(!f.loc||d.loc===f.loc)&&(!f.resp||d.resp===f.resp)&&(!f.model||d.model===f.model)&&(!q||[d.tag,d.model,d.sn,d.loc,d.resp,d.ip].join(" ").toLowerCase().includes(q)))
    .sort((a,b)=>(a.model+a.sn).localeCompare(b.model+b.sn,"uk"));
}
const fsel=(l,key,opts)=>`<div><label>${l}</label><select data-f=${key}><option value="">Усі</option>${opts.map(o=>`<option ${F[key]===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>`;
const card=d=>`<a class="card dv ${sc(d.status)}" href="#/d/${esc(d.id)}"><b>${esc(d.model)} ${esc(d.sn)}</b><div>${statusTag(d.status)}${d.tag?`<span class="tag g">${esc(d.tag)}</span>`:""}</div><div class=mu>${esc(d.loc||"без розташування")}${d.ip?" · "+esc(d.ip):""}</div><div class=mu>${d.resp?"Відповідальний: "+esc(d.resp):"Без відповідального"}</div></a>`;
function listPage(kind){
  const K=KINDS[kind],l=listFor(kind),ds=S.devices.filter(x=>x.kind===kind);
  return ph(K.many,K.icon,"Усі пристрої цього типу")+
  `<div class="card row"><div><label>Пошук</label><input id=q placeholder="Тег, модель, серійний №, IP…" value="${esc(F.q)}"></div>${fsel("Статус","status",STATUSES)}${fsel("Розташування","loc",uniq(ds.map(x=>x.loc)))}${fsel("Відповідальний","resp",uniq(ds.map(x=>x.resp)))}${fsel("Модель","model",uniq(ds.map(x=>x.model)))}</div>
  <div class=row style="margin-bottom:8px">${canEdit()?`<button class=p data-a=add data-k=${kind}>＋ ${K.one}</button>`:""}</div>
  <p class=mu>Знайдено: ${l.length}</p>
  <div class=grid>${l.map(card).join("")||"<p class=mu>Нічого не знайдено</p>"}</div>`;
}
function evRow(e){
  return `<div class=ev><div class=evd>${fmt(e.date)}</div><div><span class=tag>${esc(EV[e.type]||e.type)}</span> ${esc(e.text)}${e.cost?` · <b>${uah(e.cost)}</b>`:""}<div class=mu>${esc(e.by)}</div></div></div>`;
}
function devPage(id){
  const d=dv(id);
  if(!d)return ph("Не знайдено","❓","")+`<p class=mu>Пристрій не знайдено. Можливо, його видалено або дані ще завантажуються.</p>`;
  const K=KINDS[d.kind],evs=S.events.filter(e=>e.did===id).sort((a,b)=>b.ts-a.ts),works=evs.filter(e=>e.type==="work");
  const crumb=`<a href="#/${K.route}">${K.many}</a> <span>›</span> <b>${esc(dname(d))}</b>`;
  const ce=canEdit(),assigned=d.status==="в роботі",avail=d.status==="на складі";
  const acts=ce?`<div class=row style="margin:10px 0">${avail?`<button class=p data-a=co data-id="${esc(id)}">Видати</button>`:""}${assigned?`<button class=p data-a=ci data-id="${esc(id)}">Прийняти</button>`:""}<button data-a=st data-id="${esc(id)}">Змінити статус</button><button data-a=wk data-id="${esc(id)}">＋ Робота</button><button data-a=inv data-id="${esc(id)}">✔ Звірити</button><button data-a=lab data-id="${esc(id)}">QR-етикетка</button><button data-a=edit data-id="${esc(id)}">✎ Редагувати</button>${isAdmin()?`<button class=d data-a=del data-id="${esc(id)}">Видалити</button>`:""}</div>`:"";
  const tabs=[["info","Інформація"],["hist","Історія ("+evs.length+")"],["works","Роботи ("+works.length+")"],["files","Файли ("+S.files.length+")"]];
  let body="";
  if(TAB==="info"){
    const li=d.lastInv?fmt(d.lastInv):"ніколи",old=!d.lastInv||new Date(d.lastInv)<Date.now()-INV_DAYS*864e5;
    body=`<div class=card><dl class=kv><dt>Тип</dt><dd>${K.one}</dd><dt>Інвентарний номер</dt><dd>${esc(d.tag||"—")}</dd><dt>Модель</dt><dd>${esc(d.model)}</dd><dt>Серійний номер</dt><dd>${esc(d.sn||"—")}</dd><dt>Статус</dt><dd>${statusTag(d.status)}</dd><dt>Розташування</dt><dd>${esc(d.loc||"—")}</dd><dt>Відповідальний</dt><dd>${esc(d.resp||"—")}</dd>${d.kind==="printer"?`<dt>IP</dt><dd>${esc(d.ip||"—")}</dd><dt>Картридж</dt><dd>${esc(d.cart||"—")}</dd><dt>Лічильник, стор.</dt><dd>${d.cnt?esc(d.cnt):"—"}</dd>`:""}<dt>Остання звірка</dt><dd>${li} ${old?'<span class="tag w">потрібна звірка</span>':""}</dd><dt>Нотатка</dt><dd>${esc(d.note||"—")}</dd></dl></div>`;
  }else if(TAB==="hist"){
    body=`<div class=card>${evs.length?evs.map(evRow).join(""):"<p class=mu>Подій ще немає</p>"}</div>`;
  }else if(TAB==="works"){
    const sum=works.reduce((a,e)=>a+num(e.cost),0);
    body=`<div class=card><p class=mu>Робіт: ${works.length} · витрати: <b>${uah(sum)}</b></p>${works.length?works.map(evRow).join(""):"<p class=mu>Робіт ще немає</p>"}</div>`;
  }else{
    const fs=[...S.files].sort((a,b)=>b.ts-a.ts);
    body=`<div class=card>${ce?`<label style="display:inline-block;border:1px solid var(--bd);padding:9px 13px;border-radius:8px;cursor:pointer;color:var(--tx);font-size:14px;margin:0 0 12px">📎 Додати фото або PDF<input id=fu type=file accept="image/*,application/pdf" hidden></label>`:""}<div class=files>${fs.length?fs.map(f=>safeData(f.data)?`<div class=fi>${f.data.startsWith("data:image/")?`<a href="${f.data}" download="${esc(f.name)}"><img src="${f.data}" alt="${esc(f.name)}"></a>`:`<a href="${f.data}" download="${esc(f.name)}" style="font-size:28px">📄</a>`}<div>${esc(f.name)}</div><div class=mu>${esc(f.by)}</div>${ce?`<button class=d data-a=delf data-id="${esc(f.id)}" style="min-height:30px;padding:4px 8px;margin-top:6px">Видалити</button>`:""}</div>`:"").join(""):"<p class=mu>Файлів немає</p>"}</div><p class=mu style="margin-top:10px">Файли зберігаються в базі: до ~0,9 МБ кожен. Фото стискаються автоматично.</p></div>`;
  }
  return ph(esc(dname(d)),K.icon,esc(d.tag?"№ "+d.tag:""),crumb)+acts+`<div class=tabs>${tabs.map(t=>`<button data-tab=${t[0]} class="${TAB===t[0]?"on":""}">${t[1]}</button>`).join("")}</div>`+body;
}
function reports(){
  if(!R.from)R.from=daysAgo(90);if(!R.to)R.to=today();
  const ws=S.events.filter(e=>e.type==="work"&&e.date>=R.from&&e.date<=R.to&&(!R.kind||(dv(e.did)||{}).kind===R.kind)).sort((a,b)=>b.date.localeCompare(a.date)||b.ts-a.ts);
  const sum=ws.reduce((a,e)=>a+num(e.cost),0);
  const grp=fn=>{const m={};ws.forEach(e=>{const k=fn(e)||"—",o=m[k]||(m[k]={n:0,s:0});o.n++;o.s+=num(e.cost)});return Object.entries(m).sort((a,b)=>b[1].s-a[1].s)};
  const gt=(title,rows)=>`<div class=card><b>${title}</b><div class=ch><table><tr><th></th><th>Робіт</th><th>Сума</th></tr>${rows.map(([k,o])=>`<tr><td>${esc(k)}</td><td>${o.n}</td><td>${uah(o.s)}</td></tr>`).join("")||"<tr><td class=mu>Немає даних</td></tr>"}</table></div></div>`;
  return ph("Звіти","📈","Роботи та витрати за період")+
  `<div class="card row noprint"><div>${fld("Від","r1",R.from,"date","data-r=from")}</div><div>${fld("До","r2",R.to,"date","data-r=to")}</div><div>${sel("Тип","r3",[["","Усі"],["printer","Принтери"],["laptop","Ноутбуки"]],R.kind,"data-r=kind")}</div><button data-a=print>🖨 Друк</button></div>
  <div class=kg><div class=kt><span class=mu>Робіт</span><b>${ws.length}</b></div><div class="kt k3"><span class=mu>Витрати</span><b>${uah(sum)}</b></div><div class="kt k2"><span class=mu>Середня вартість</span><b>${ws.length?uah(sum/ws.length):"—"}</b></div></div>
  <div class=grid2>${gt("За пристроями",grp(e=>dname(dv(e.did))+(dv(e.did)&&dv(e.did).tag?" ("+dv(e.did).tag+")":"")))}${gt("За відповідальними",grp(e=>e.resp))}</div>
  <div class=card><b>Усі роботи</b><div class=ch><table><tr><th>Дата</th><th>Пристрій</th><th>Робота</th><th>Відповідальний</th><th>Сума</th></tr>${ws.map(e=>`<tr><td>${fmt(e.date)}</td><td><a href="#/d/${esc(e.did)}">${esc(dname(dv(e.did)))}</a></td><td>${esc(e.text)}</td><td>${esc(e.resp||"—")}</td><td>${e.cost?uah(e.cost):""}</td></tr>`).join("")||"<tr><td class=mu colspan=5>Немає робіт за цей період</td></tr>"}</table></div></div>`;
}
function stockPage(){
  const ce=canEdit(),l=[...S.stock].sort((a,b)=>a.name.localeCompare(b.name,"uk"));
  const lowN=l.filter(s=>num(s.qty)<=num(s.min)).length;
  return ph("Склад","📦","Витратні матеріали та їхні залишки")+
  `<div class=row style="margin-bottom:8px">${ce?`<button class=p data-a=adds>＋ Матеріал</button>`:""}</div>
  <p class=mu>Позицій: ${l.length}${lowN?` · <span class="tag e">мало: ${lowN}</span>`:""}. Позначка «мало» з'являється, коли залишок не більший за мінімум.</p>
  <div class=card><div class=ch><table><tr><th>Назва</th><th>К-сть</th><th>Мін.</th><th></th></tr>${l.map(s=>`<tr><td>${esc(s.name)}${num(s.qty)<=num(s.min)?' <span class="tag e">мало</span>':""}</td><td><b>${esc(s.qty)}</b></td><td class=mu>${esc(s.min)}</td><td>${ce?`<div class=row style="flex-wrap:nowrap;justify-content:flex-end;gap:4px"><button data-a=stm data-id="${esc(s.id)}" aria-label="Зменшити на 1" title="Списати 1">−1</button><button data-a=stp data-id="${esc(s.id)}" aria-label="Збільшити на 1" title="Додати 1">+1</button><button data-a=edits data-id="${esc(s.id)}" aria-label="Редагувати" title="Редагувати">✎</button></div>`:""}</td></tr>`).join("")||"<tr><td class=mu colspan=4>Матеріалів ще немає</td></tr>"}</table></div></div>`;
}
function formStock(s={}){
  dlg(`<h3>${s.id?"Редагувати матеріал":"Новий матеріал"}</h3>${fld("Назва","k1",s.name,"text","maxlength=100")}<div class=row>${fld("Кількість","k2",s.qty??0,"number","min=0 step=any")}${fld("Мінімальний залишок","k3",s.min??1,"number","min=0 step=any")}</div><div class=row style="margin-top:12px"><button class=p data-a=saves data-id="${esc(s.id||"")}">Зберегти</button>${s.id&&isAdmin()?`<button class=d data-a=dels data-id="${esc(s.id)}">Видалити</button>`:""}<button data-a=x>Скасувати</button></div>`);
}
function labels(){
  const ds=[...S.devices].sort((a,b)=>(a.kind+a.model).localeCompare(b.kind+b.model,"uk"));
  return ph("Етикетки","🏷️","Друк QR-наклейок: QR відкриває картку пристрою")+
  `<div class=row style="margin-bottom:8px"><button data-a=lball>Вибрати всі</button><button data-a=lbnone>Зняти вибір</button><button class=p data-a=lbprint>🖨 Друкувати (${LB.size})</button></div>
  <div class=card><div class=ch><table>${ds.map(d=>`<tr><td style="width:30px"><input type=checkbox data-lb="${esc(d.id)}" ${LB.has(d.id)?"checked":""}></td><td>${KINDS[d.kind].icon} ${esc(dname(d))}</td><td class=mu>${esc(d.tag||"без тегу")}</td><td class=mu>${esc(d.loc)}</td></tr>`).join("")||"<tr><td class=mu>Пристроїв немає</td></tr>"}</table></div></div>`;
}
function usersPage(){
  const l=[...S.users].sort((a,b)=>(a.role==="pending"?0:1)-(b.role==="pending"?0:1)||a.email.localeCompare(b.email));
  const main=u=>u.id===ADMIN_UID,self=u=>u.id===ME.uid;
  return ph("Користувачі","👤","Схвалення доступу й ролі: перегляд, технік, адмін")+
  `<div class=card><div class=ch><table>${l.map(u=>`<tr><td>${esc(u.name)}<div class=mu>${esc(u.email)}</div></td><td>${main(u)||self(u)?`<span class=tag>${ROLES[u.role]||u.role}</span>`:`<select data-ur="${esc(u.id)}">${Object.entries(ROLES).map(([k,v])=>`<option value=${k} ${u.role===k?"selected":""}>${v}</option>`).join("")}</select>`}</td><td>${u.active?'<span class="tag o">активний</span>':'<span class="tag e">вимкнений</span>'}</td><td>${main(u)||self(u)?"":`<button data-a=tgl data-id="${esc(u.id)}">${u.active?"⏸ Вимкнути":"▶ Увімкнути"}</button>`}</td></tr>`).join("")}</table></div></div><p class=mu>Нові користувачі реєструються самі й отримують статус «очікує». Призначте їм роль, щоб відкрити доступ.</p>`;
}
function authHtml(){
  const box=h=>`<div class="card auth"><div style="text-align:center;font-weight:700;font-size:18px;margin-bottom:6px">${esc(SITE_NAME)}</div>${h}</div>`;
  if(ST==="load")return `<p class=mu style="text-align:center;margin-top:40px">Завантаження…</p>`;
  if(ST==="register")return box(`<h3>Реєстрація</h3><p class=mu>Після реєстрації адміністратор призначить вам роль.</p>${fld("Ім'я","rn")}${fld("Email","re","","email")}${fld("Пароль (від 8 символів)","rp","","password")}<div class=row style="margin-top:12px"><button class=p data-a=register>Зареєструватися</button><button data-a=tologin>Назад</button></div>`);
  if(ST==="noaccess")return box(`<h3>Доступ не надано</h3><p>${NOPROF?"Для цього облікового запису ще не подано заявку.":"Обліковий запис вимкнено. Зверніться до адміністратора."}</p>${NOPROF?`<button class=p data-a=req>Подати заявку на доступ</button> `:""}<button data-a=logout>Вийти</button>${ERR?`<p class=mu>${esc(ERR)}</p>`:""}`);
  return box(`<h3>Вхід</h3>${fld("Email","le","","email")}${fld("Пароль","lp","","password")}<div class=row style="margin-top:12px"><button class=p data-a=login>Увійти</button><button data-a=regform>Реєстрація</button></div><p style="margin:12px 0 0"><a href="#" data-a=forgot class=mu style="text-decoration:underline">Забули пароль?</a></p>`);
}

/* ---------- головний рендер ---------- */
function render(){
  document.body.classList.toggle("noauth",ST!=="ok");
  if(ST!=="ok"){$("#m").innerHTML=authHtml();return}
  const r=route(),key=r.page+"/"+r.id,keep=document.activeElement&&document.activeElement.id==="q";
  if(key!==lastKey){if(r.page!==lastKey.split("/")[0])F=freshF();if(r.page==="d")TAB="info";lastKey=key}
  watchFiles(r.page==="d"&&canView()?r.id:null);
  $("#who").textContent=(ME.name||ME.email)+" · "+(ROLES[ME.role]||ME.role);
  const pend=S.users.filter(u=>u.role==="pending"&&u.active).length;
  const items=[["dash","📊","Статистика"],["printers","🖨️","Принтери"],["laptops","💻","Ноутбуки"],["stock","📦","Склад"]];
  if(canEdit())items.push(["labels","🏷️","Етикетки"]);
  items.push(["reports","📈","Звіти"]);
  if(isAdmin())items.push(["users","👤","Користувачі"+(pend?" ("+pend+")":"")]);
  const cur=r.page==="d"?((dv(r.id)||{}).kind==="laptop"?"laptops":"printers"):r.page;
  $("#nav").innerHTML=items.map(x=>`<button data-v=${x[0]} class="${cur===x[0]?"on":""}"><span class=ni>${x[1]}</span>${x[2]}</button>`).join("");
  let h;
  if(!canView())h=`<div class=card style="border-color:var(--wr)">⏳ Ваш доступ очікує схвалення адміністратором. Після призначення ролі сторінка оновиться сама.</div>`;
  else if(r.page==="printers")h=listPage("printer");
  else if(r.page==="laptops")h=listPage("laptop");
  else if(r.page==="d")h=devPage(r.id);
  else if(r.page==="stock")h=stockPage();
  else if(r.page==="reports")h=reports();
  else if(r.page==="labels"&&canEdit())h=labels();
  else if(r.page==="users"&&isAdmin())h=usersPage();
  else h=dash();
  $("#m").innerHTML=h;
  if(keep){const e=$("#q");if(e){e.focus();e.setSelectionRange(999,999)}}
}

/* ---------- форми ---------- */
function formDev(d={}){
  const kind=d.kind,K=KINDS[kind],pr=kind==="printer",dl=uniq(S.devices.map(x=>x.loc)),dr=uniq(S.devices.map(x=>x.resp));
  dlg(`<h3>${d.id?"Редагувати":"Новий"}: ${K.one.toLowerCase()}</h3>
  <datalist id=dl_loc>${dl.map(x=>`<option value="${esc(x)}">`).join("")}</datalist><datalist id=dl_resp>${dr.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>
  <div class=row>${fld("Інвентарний номер (тег)","f1",d.tag,"text","maxlength=60")}${fld("Модель","f2",d.model,"text","maxlength=80")}</div>
  <div class=row>${fld("Серійний номер","f3",d.sn,"text","maxlength=80")}${sel("Статус","f4",STATUSES.map(s=>[s,s]),d.status||"на складі")}</div>
  <div class=row>${fld("Розташування","f5",d.loc,"text","list=dl_loc maxlength=80")}${fld("Відповідальний","f6",d.resp,"text","list=dl_resp maxlength=80")}</div>
  ${pr?`<div class=row>${fld("IP","f7",d.ip,"text","maxlength=60")}${fld("Картридж","f8",d.cart,"text","maxlength=100")}${fld("Лічильник, стор.","f9",d.cnt||"","number","min=0")}</div>`:""}
  ${fld("Нотатка","f10",d.note,"text","maxlength=300")}
  <div class=row style="margin-top:12px"><button class=p data-a=savedev data-id="${esc(d.id||"")}" data-k="${kind}">Зберегти</button><button data-a=x>Скасувати</button></div>`);
}
function formCheckout(d){
  const opts=uniq([...S.devices.map(x=>x.resp),...S.devices.map(x=>x.loc)]);
  dlg(`<h3>Видати: ${esc(dname(d))}</h3><datalist id=dl_all>${opts.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>
  ${sel("Кому","c1",[["person","Співробітнику"],["location","У кабінет / на локацію"]],"person")}
  ${fld("Ім'я або кабінет","c2","","text","list=dl_all maxlength=80")}${fld("Дата","c3",today(),"date")}${fld("Коментар","c4","","text","maxlength=150")}
  <div class=row style="margin-top:12px"><button class=p data-a=saveco data-id="${esc(d.id)}">Видати</button><button data-a=x>Скасувати</button></div>`);
}
const formCheckin=d=>dlg(`<h3>Прийняти: ${esc(dname(d))}</h3><p class=mu>Зараз у: ${esc(d.resp||d.loc||"—")}. Після прийому статус стане «на складі».</p>${fld("Дата","i1",today(),"date")}${fld("Коментар / стан","i2","","text","maxlength=150")}<div class=row style="margin-top:12px"><button class=p data-a=saveci data-id="${esc(d.id)}">Прийняти</button><button data-a=x>Скасувати</button></div>`);
const formStatus=d=>dlg(`<h3>Статус: ${esc(dname(d))}</h3><p class=mu>Зараз: ${esc(d.status)}. Статус «на складі» очищає відповідального.</p>${sel("Новий статус","t1",STATUSES.filter(s=>s!==d.status).map(s=>[s,s]),"")}${fld("Коментар","t2","","text","maxlength=150")}<div class=row style="margin-top:12px"><button class=p data-a=savest data-id="${esc(d.id)}">Зберегти</button><button data-a=x>Скасувати</button></div>`);
const formWork=d=>dlg(`<h3>Робота: ${esc(dname(d))}</h3>${sel("Тип","w1",WORK_TYPES.map(t=>[t,t]),WORK_TYPES[0])}<div class=row>${fld("Дата","w2",today(),"date")}${fld("Вартість, ₴","w3","","number","min=0")}</div>${fld("Несправність / що зроблено","w4","","text","maxlength=200")}${d.kind==="printer"?fld("Лічильник на момент роботи, стор. (необов'язково)","w5","","number","min=0"):""}<div class=row style="margin-top:12px"><button class=p data-a=savewk data-id="${esc(d.id)}">Зберегти</button><button data-a=x>Скасувати</button></div>`);

/* ---------- обробники ---------- */
document.addEventListener("click",async e=>{
  const b=e.target.closest("button,a[data-a]");if(!b)return;
  const a=b.dataset.a,id=b.dataset.id,d=$("#dg");
  if(b.dataset.v){location.hash="#/"+(b.dataset.v==="dash"?"":b.dataset.v);return}
  if(b.dataset.tab){TAB=b.dataset.tab;render();return}
  if(b.id==="bt"){const r=document.documentElement,dk=getComputedStyle(r).colorScheme==="dark";r.dataset.theme=dk?"light":"dark";try{localStorage.setItem("ti_th",r.dataset.theme)}catch(x){}return}
  if(b.id==="bo"){signOut(auth).then(()=>location.reload());return}
  if(!a)return;
  if(a==="forgot"){e.preventDefault();const em=val("le");if(!em)return alert("Введіть email у полі входу");sendPasswordResetEmail(auth,em).then(()=>alert("Лист для скидання пароля надіслано")).catch(fail);return}
  if(a==="login"){signInWithEmailAndPassword(auth,val("le"),val("lp")).catch(()=>alert("Невірний email або пароль"));return}
  if(a==="logout"){signOut(auth).then(()=>location.reload());return}
  if(a==="regform"){ST="register";render();return}
  if(a==="tologin"){ST="login";render();return}
  if(a==="register"){const nm=val("rn"),em=val("re"),pw=val("rp");if(!nm||!em||pw.length<8)return alert("Вкажіть ім'я, email і пароль від 8 символів");REG={name:nm.slice(0,60)};
    try{await createUserWithEmailAndPassword(auth,em,pw)}catch(x){REG=null;alert(x.code==="auth/email-already-in-use"?"Такий email уже зареєстровано. Спробуйте увійти.":"Помилка: "+(x.code||x.message))}return}
  if(a==="req"){try{const u=auth.currentUser;await setDoc(doc(fdb,"users",u.uid),{email:u.email,name:(u.email||"").slice(0,60),role:"pending",active:true});location.reload()}catch(x){fail(x)}return}
  if(a==="x"){d.close();return}
  if(a==="print"){window.print();return}
  /* усе нижче потребує прав */
  const needEdit=["adds","edits","saves","stp","stm","add","savedev","co","ci","st","wk","inv","lab","edit","saveco","saveci","savest","savewk","delf","lball","lbnone","lbprint"];
  if(needEdit.includes(a)&&!canEdit())return alert("Ця дія доступна лише техніку або адміністратору.");
  if(["del","tgl","dels","imp"].includes(a)&&!isAdmin())return alert("Ця дія доступна лише адміністратору.");
  const dev=id?dv(id):null;
  try{
  if(a==="add")formDev({kind:b.dataset.k});
  else if(a==="edit"&&dev)formDev(dev);
  else if(a==="savedev"){
    const old=id?dv(id):null,kind=old?old.kind:b.dataset.k,pr=kind==="printer";
    const o={kind,tag:val("f1").slice(0,60),model:val("f2").slice(0,80),sn:val("f3").slice(0,80),status:val("f4"),loc:val("f5").slice(0,80),resp:val("f6").slice(0,80),ip:pr?val("f7").slice(0,60):"",cart:pr?val("f8").slice(0,100):"",cnt:pr?Math.max(0,num(val("f9"))):0,lastInv:old?old.lastInv||"":"",note:val("f10").slice(0,300),ts:old?old.ts:Date.now()};
    if(!o.model)return alert("Вкажіть модель");
    if(o.tag&&S.devices.some(x=>x.id!==id&&(x.tag||"").toLowerCase()===o.tag.toLowerCase()))return alert("Пристрій з таким інвентарним номером уже є");
    const nid=id||newId();
    await setDoc(doc(fdb,"devices",nid),o);
    if(!old)await addEvent(nid,"edit","Пристрій додано",{resp:o.resp});
    else{
      if(old.status!==o.status)await addEvent(nid,"status","Статус: "+old.status+" → "+o.status,{resp:o.resp});
      const keys=["tag","model","sn","loc","resp","ip","cart","cnt","note"];
      if(keys.some(k=>String(old[k]??"")!==String(o[k]??"")))await addEvent(nid,"edit","Дані змінено",{resp:o.resp});
    }
    d.close();if(!old)location.hash="#/d/"+nid;
  }
  else if(a==="co"&&dev)formCheckout(dev);
  else if(a==="saveco"&&dev){
    if(dev.status!=="на складі")return alert("Видати можна лише пристрій зі статусом «на складі».");
    const kind=val("c1"),target=val("c2").slice(0,80),date=val("c3")||today(),cm=val("c4");
    if(!target)return alert("Вкажіть, кому або куди видається пристрій");
    const upd=kind==="person"?{status:"в роботі",resp:target}:{status:"в роботі",loc:target,resp:""};
    await patchDevice(id,upd);
    await addEvent(id,"checkout",(kind==="person"?"Видано співробітнику: ":"Переміщено в кабінет: ")+target+(cm?". "+cm:""),{date,resp:upd.resp??""});
    d.close();
  }
  else if(a==="ci"&&dev)formCheckin(dev);
  else if(a==="saveci"&&dev){
    if(dev.status!=="в роботі")return alert("Прийняти можна лише пристрій зі статусом «в роботі».");
    const date=val("i1")||today(),cm=val("i2"),from=dev.resp||dev.loc||"—";
    await patchDevice(id,{status:"на складі",resp:""});
    await addEvent(id,"checkin","Прийнято від: "+from+(cm?". "+cm:""),{date,resp:dev.resp});
    d.close();
  }
  else if(a==="st"&&dev)formStatus(dev);
  else if(a==="savest"&&dev){
    const ns=val("t1"),cm=val("t2");if(!ns)return;
    const upd={status:ns};if(ns==="на складі")upd.resp="";
    await patchDevice(id,upd);
    await addEvent(id,"status","Статус: "+dev.status+" → "+ns+(cm?". "+cm:""),{resp:dev.resp});
    d.close();
  }
  else if(a==="wk"&&dev)formWork(dev);
  else if(a==="savewk"&&dev){
    const sub=val("w1"),date=val("w2")||today(),cost=Math.min(999999,Math.max(0,num(val("w3")))),tx=val("w4").slice(0,200),cnt=num(val("w5"));
    await addEvent(id,"work",sub+(tx?": "+tx:""),{sub,date,cost,resp:dev.resp});
    if(dev.kind==="printer"&&cnt>0)await patchDevice(id,{cnt});
    d.close();
  }
  else if(a==="inv"&&dev){
    await patchDevice(id,{lastInv:new Date().toISOString()});
    await addEvent(id,"inventory","Звірено з наявністю",{resp:dev.resp});
  }
  else if(a==="lab"&&dev)printLabels([id]);
  else if(a==="del"&&dev){
    if(!confirm("Видалити «"+dname(dev)+"» разом з історією та файлами? Дію не скасувати."))return;
    for(const e of S.events.filter(x=>x.did===id))await deleteDoc(doc(fdb,"events",e.id));
    for(const f of S.files)await deleteDoc(doc(fdb,"files",f.id));
    await deleteDoc(doc(fdb,"devices",id));
    location.hash="#/"+KINDS[dev.kind].route;
  }
  else if(a==="delf"){if(confirm("Видалити файл?"))await deleteDoc(doc(fdb,"files",id))}
  else if(a==="lball"){S.devices.forEach(x=>LB.add(x.id));render()}
  else if(a==="lbnone"){LB.clear();render()}
  else if(a==="lbprint")printLabels([...LB]);
  else if(a==="adds")formStock();
  else if(a==="edits"){const s=S.stock.find(x=>x.id===id);if(s)formStock(s)}
  else if(a==="saves"){
    const old=id?S.stock.find(x=>x.id===id):null,nm=val("k1").slice(0,100),qty=Math.max(0,num(val("k2"))),mn=Math.max(0,num(val("k3")));
    if(!nm)return alert("Вкажіть назву");
    if(S.stock.some(x=>x.id!==id&&x.name.trim().toLowerCase()===nm.toLowerCase()))return alert("Матеріал з такою назвою вже є");
    await setDoc(doc(fdb,"stock",id||newId()),{name:nm,qty,min:mn,ts:old?old.ts:Date.now()});d.close();
  }
  else if(a==="dels"){if(confirm("Видалити матеріал?")){await deleteDoc(doc(fdb,"stock",id));d.close()}}
  else if(a==="stp"||a==="stm"){
    const s=S.stock.find(x=>x.id===id);if(!s)return;
    const q=Math.max(0,Math.round((num(s.qty)+(a==="stp"?1:-1))*100)/100);
    if(q===num(s.qty))return;
    await setDoc(doc(fdb,"stock",id),{qty:q},{merge:true});
  }
  else if(a==="imp"){
    if(!LOADED.dev||!LOADED.stk)return alert("Дані ще завантажуються, зачекайте кілька секунд.");
    const needDev=!SEED_DEVICES.some(x=>S.devices.some(y=>y.id===x.id)),needStk=!SEED_STOCK.some(x=>S.stock.some(y=>y.id===x.id));
    const nd=needDev?SEED_DEVICES:[],ns=needStk?SEED_STOCK:[];
    if(!nd.length&&!ns.length)return alert("Усе вже імпортовано.");
    if(!confirm("Імпортувати: принтерів — "+nd.length+", матеріалів — "+ns.length+"?"))return;
    b.disabled=true;const ts=Date.now();
    try{
      for(const [i,x] of nd.entries()){const {id:sid,...o}=x;await setDoc(doc(fdb,"devices",sid),{...o,lastInv:"",ts:ts+i})}
      for(const [i,x] of ns.entries()){const {id:sid,...o}=x;await setDoc(doc(fdb,"stock",sid),{...o,ts:ts+i})}
      alert("Готово. Імпортовано: принтерів — "+nd.length+", матеріалів — "+ns.length+".");
    }finally{b.disabled=false}
  }
  else if(a==="tgl"){const u=S.users.find(x=>x.id===id);if(u&&id!==ADMIN_UID&&id!==ME.uid)await setDoc(doc(fdb,"users",id),{active:!u.active},{merge:true})}
  }catch(x){fail(x)}
});
document.addEventListener("change",async e=>{
  const t=e.target;
  if(t.dataset.f){F[t.dataset.f]=t.value;render();return}
  if(t.dataset.r){R[t.dataset.r]=t.value;render();return}
  if(t.dataset.lb){t.checked?LB.add(t.dataset.lb):LB.delete(t.dataset.lb);render();return}
  if(t.dataset.ur&&isAdmin()){
    if(t.dataset.ur===ADMIN_UID||t.dataset.ur===ME.uid){render();return}
    try{await setDoc(doc(fdb,"users",t.dataset.ur),{role:t.value},{merge:true})}catch(x){fail(x)}return}
  if(t.id==="fu"&&t.files[0]&&canEdit()){const id=route().id;await uploadFile(t.files[0],id);t.value=""}
});
document.addEventListener("input",e=>{if(e.target.id==="q"){F.q=e.target.value;render()}});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="lp"){const b=document.querySelector("[data-a=login]");if(b)b.click()}});
window.addEventListener("hashchange",()=>{if(ST==="ok")render()});

/* ---------- підписки на дані ---------- */
function start(){
  if(started)return;started=true;
  if(canView()){
    onSnapshot(collection(fdb,"devices"),sn=>{S.devices=sn.docs.map(d=>({...d.data(),id:d.id}));LOADED.dev=true;render()},e=>alert("Помилка доступу до бази: "+(e.code||e.message)));
    onSnapshot(collection(fdb,"stock"),sn=>{S.stock=sn.docs.map(d=>({...d.data(),id:d.id}));LOADED.stk=true;render()},()=>{});
    onSnapshot(collection(fdb,"events"),sn=>{S.events=sn.docs.map(d=>({...d.data(),id:d.id}));render()},()=>{});
  }
  if(isAdmin())onSnapshot(collection(fdb,"users"),sn=>{S.users=sn.docs.map(d=>({...d.data(),id:d.id}));render()},()=>{});
}

/* ---------- вхід ---------- */
try{const t=localStorage.getItem("ti_th");if(t)document.documentElement.dataset.theme=t}catch(e){}
$("#site").textContent=SITE_NAME;document.title=SITE_NAME;
onAuthStateChanged(auth,async u=>{
  if(!u){ME=null;ST="login";render();return}
  try{
    let sn=await getDoc(doc(fdb,"users",u.uid));
    if(!sn.exists()&&u.uid===ADMIN_UID){await setDoc(doc(fdb,"users",u.uid),{email:u.email,name:"Адмін",role:"admin",active:true});sn=await getDoc(doc(fdb,"users",u.uid))}
    else if(sn.exists()&&u.uid===ADMIN_UID&&sn.data().role!=="admin"){await setDoc(doc(fdb,"users",u.uid),{role:"admin",active:true},{merge:true});sn=await getDoc(doc(fdb,"users",u.uid))}
    if(!sn.exists()&&REG){await setDoc(doc(fdb,"users",u.uid),{email:u.email,name:REG.name,role:"pending",active:true});REG=null;sn=await getDoc(doc(fdb,"users",u.uid))}
    if(!sn.exists()||sn.data().active!==true){NOPROF=!sn.exists();ME=null;ST="noaccess";render();return}
    ME={uid:u.uid,...sn.data()};ST="ok";render();start();
    onSnapshot(doc(fdb,"users",u.uid),s2=>{const d2=s2.data();if(!d2||!ME)return;if(d2.active!==true||d2.role!==ME.role){location.reload();return}ME={uid:u.uid,...d2};render()},()=>{});
  }catch(e){ME=null;ST="noaccess";ERR=e.code||e.message;render()}
});
render();
