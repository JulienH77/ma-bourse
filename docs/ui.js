"use strict";
(() => {
const $ = id => document.getElementById(id);
const pages = {
 dashboard:["Vue d’ensemble","Tableau de bord","La valeur et la répartition de vos investissements."],
 portfolio:["Portefeuille","Portefeuille","Vos positions ouvertes et clôturées, valorisées en euros."],
 trades:["Opérations","Opérations","L’historique de vos achats et ventes."],
 quotes:["Cotations","Cotations","Les cours journaliers et leurs taux de change."],
 alerts:["Alertes","Règles d’alerte","Vos seuils de variation quotidienne par titre."],
 backup:["Sauvegardes","Sauvegardes","Exportez ou restaurez les données du portefeuille actif."]
};
const paths = {
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 portfolio:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12q9 6 18 0"/>',
 trades:'<path d="M3 8h17l-5-5M21 16H4l5 5"/>',quotes:'<path d="M3 19V4m0 15h18M6 14l5-6 4 3 6-7"/>',
 alerts:'<path d="M4 17h16l-2-4V9a6 6 0 0 0-12 0v4zM9 20q3 3 6 0"/>',
 backup:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18m-5 3h2"/>'
};
const icon = k => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+paths[k]+'</svg>';
const palette=["#4779e7","#2bb9a6","#efa44e","#9879ce","#6899b8","#db7989"];
const fmt=(n,d=2)=>Number(n).toLocaleString("fr-FR",{maximumFractionDigits:d});
const eur=n=>fmt(n)+" €", pct=n=>fmt(n,1)+" %";
const sign=n=>n>0?"+":"";
const signed=n=>'<span class="'+(n<0?"neg":"pos")+'">'+sign(n)+eur(n)+'</span>';
const paris=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date()).replace(" ","T");
const dayOffset=(s,n)=>new Date(Date.parse(s+"T12:00:00Z")+n*86400000).toISOString().slice(0,10);
const dateLabel=(s,short=false)=>s?new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:short?"short":"long",...(short?{}:{year:"numeric"}),timeZone:"UTC"}).format(new Date(s.slice(0,10)+"T12:00Z")):"—";
const blank=()=>({trades:[],quotes:{},currencies:{},alerts:{}});
const names={NVDA:"NVIDIA",AAPL:"Apple",MSFT:"Microsoft",MC:"LVMH",AIR:"Airbus"};
function demo(){
 const s=blank(),end="2026-06-30",start=dayOffset(end,-100);
 [["NVDA","USD",36,122],["AAPL","USD",32,184],["MSFT","USD",15,384],["MC","EUR",7,475],["AIR","EUR",19,142]].forEach(([symbol,currency,qty,price],j)=>{
 const fx=currency==="USD"?1.12:1;s.currencies[symbol]=currency;
 s.trades.push({symbol,currency,qty,price,fx,side:"buy",fee:1,date:start+"T10:00"});
 s.quotes[symbol]=[];
 for(let i=0;i<=100;i++){const date=dayOffset(start,i),dow=new Date(date+"T12:00Z").getUTCDay();if(!dow||dow===6)continue;
 const factor=1+i*.0015+Math.sin(i*.18+j)*.023+Math.sin(i*1.67+j)*.011+Math.cos(i*.067)*.022;
 s.quotes[symbol].push({date,price:+(price*factor).toFixed(2),fx});}
 });return s;
}
const dict=o=>o!==null&&typeof o==="object"&&!Array.isArray(o);
const symbolOK=s=>typeof s==="string"&&/^[A-Z0-9][A-Z0-9.:-]{0,23}$/.test(s)&&!Object.hasOwn(Object.prototype,s);
const curOK=c=>typeof c==="string"&&/^[A-Z]{3}$/.test(c);
const positive=v=>Number.isFinite(v)&&v>0;
const validDay=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\d$/.test(s)&&!isNaN(Date.parse(s+"T12:00Z"))&&dayOffset(s,0)===s;
function check(ok,msg){if(!ok)throw Error(msg)}
function validate(s){
 check(dict(s)&&Array.isArray(s.trades)&&dict(s.quotes)&&dict(s.currencies)&&dict(s.alerts),"Structure JSON invalide.");
 for(const [k,c] of Object.entries(s.currencies))check(symbolOK(k)&&curOK(c),"Titre ou devise invalide.");
 const held={};
 for(const t of [...s.trades].sort((a,b)=>String(a.date).localeCompare(String(b.date)))){
 check(symbolOK(t.symbol)&&curOK(t.currency)&&s.currencies[t.symbol]===t.currency,"Devise incohérente pour une opération.");
 check(["buy","sell"].includes(t.side)&&positive(t.qty)&&positive(t.price)&&positive(t.fx)&&Number.isFinite(t.fee)&&t.fee>=0,"Quantité, cours, change ou frais invalides.");
 check(t.currency!=="EUR"||t.fx===1,"Le change EUR doit valoir 1.");
 check(typeof t.date==="string"&&validDay(t.date.slice(0,10))&&/^.{10}T([01]\d|2[0-3]):[0-5]\d$/.test(t.date),"Date ou heure invalide.");
 held[t.symbol]=(held[t.symbol]||0)+(t.side==="buy"?t.qty:-t.qty);
 check(held[t.symbol]>=-1e-10,"La vente dépasse la quantité détenue à cette date.");
 }
 for(const [k,qs] of Object.entries(s.quotes)){
 check(symbolOK(k)&&s.currencies[k]&&Array.isArray(qs),"Série de cours invalide.");const dates=new Set();
 for(const q of qs){check(validDay(q.date)&&positive(q.price)&&positive(q.fx)&&(s.currencies[k]!=="EUR"||q.fx===1)&&!dates.has(q.date),"Cours, change ou date de cotation invalide ou en double.");dates.add(q.date)}
 }
 for(const [k,r] of Object.entries(s.alerts))check(symbolOK(k)&&dict(r)&&positive(r.up)&&positive(r.down)&&curOK(r.currency)&&r.currency===s.currencies[k],"Règle d’alerte invalide.");
 window.Ledger.validate(s.trades,s.quotes);
}
const sorted=qs=>[...qs].sort((a,b)=>a.date.localeCompare(b.date));
function positions(trades,quotes){
 return window.Ledger.positions(trades,quotes);
}
let selected="";
let mode="demo",s=demo(),page="dashboard",range=30,feedState="Recherche du flux…",action="",pending=null,locked=false;
let revision=null,editIndex=null,formRevision=null;
const scope="folio.v1."+location.pathname.replace(/(?:index\.html)?$/,"");
const key=m=>scope+"."+m;
function notice(msg){$("notice").textContent=msg;$("notice").className=msg?"message":""}
function load(m){let next=m==="demo"?demo():blank();locked=false;
 try{const raw=localStorage.getItem(key(m));revision=raw;if(raw){next=JSON.parse(raw);validate(next)}}catch{locked=true;next=blank();notice("Lecture du stockage impossible. Vos données sont préservées. Restaurez une sauvegarde pour reprendre.")}
 mode=m;s=next;
}
async function save(next,recovery=false,expected=revision){
 const target=mode;
 check(!locked||recovery,"Restaurez une sauvegarde avant de modifier ce portefeuille.");
 validate(next);
 check(navigator.locks,"Pour enregistrer avec protection entre onglets, ouvrez Folio en HTTPS ou sur localhost.");
 await navigator.locks.request(key(target),()=>{
 check(mode===target&&localStorage.getItem(key(target))===expected,"Le portefeuille a changé. Rechargez ses données et recommencez.");
 const json=JSON.stringify(next);localStorage.setItem(key(target),json);revision=json;s=next;locked=false;render();
 });
}
function metric(label,value,sub,k){return '<div class="metric"><div class="row">'+label+icon(k)+'</div><strong>'+value+'</strong><small>'+sub+'</small></div>'}
function card(title,sub,body,control=""){return '<section class="card"><div class="cardhead"><div><h2>'+title+'</h2><p>'+sub+'</p></div>'+control+'</div>'+body+'</section>'}
function btn(label,a){return '<button class="textbtn" data-action="'+a+'">'+label+'</button>'}
function table(headers,rows,empty){return rows.length?'<div class="scroll"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<p class="empty">'+empty+'</p>'}
function asset(k,c){return '<div class="asset"><span class="tile">'+k.slice(0,2)+'</span><div><b>'+k+'</b><small>'+(mode==="demo"&&names[k]||c)+'</small></div></div>'}
function history(q){ return window.Ledger.history(s.trades,q,range); }
function graph(data){
 if(!data.length)return '<p class="empty">La courbe apparaîtra après votre première opération.</p>';
 const vals=data.map(x=>x[1]),low=Math.min(...vals),high=Math.max(...vals),pad=Math.max((high-low)*.12,1),min=low-pad,max=high+pad;
 const start=Date.parse(data[0][0]),end=Date.parse(data.at(-1)[0]);
 const points=data.map(([d,v])=>[60+(end===start?.5:(Date.parse(d)-start)/(end-start))*457,12+(max-v)/(max-min)*136]);
 const line=points.map(p=>p.join(",")).join(" "),last=points.at(-1);
 let grid="";for(let i=0;i<4;i++){const y=12+i*136/3;grid+='<path d="M60 '+y+'H517" stroke="#e2e8f1" stroke-dasharray="4 4"/><text x="52" y="'+(y+4)+'" text-anchor="end">'+fmt(max-i*(max-min)/3,0)+'</text>'}
 const labels=[...new Set([0,Math.floor((data.length-1)/2),data.length-1])].map(i=>'<text x="'+points[i][0]+'" y="174" text-anchor="middle">'+dateLabel(data[i][0],true)+'</text>').join("");
 return '<svg class="chart" viewBox="0 0 550 183" role="img" aria-label="Valorisation du '+dateLabel(data[0][0])+' au '+dateLabel(data.at(-1)[0])+', de '+fmt(vals[0])+" "+(selected?s.currencies[selected]:"EUR")+' à '+fmt(vals.at(-1))+" "+(selected?s.currencies[selected]:"EUR")+'" font-size="11" fill="#718197"><defs><linearGradient id="wash" x2="0" y2="1"><stop stop-color="#719aff" stop-opacity=".32"/><stop offset="1" stop-color="#719aff" stop-opacity=".025"/></linearGradient></defs>'+grid+'<polygon points="'+points[0][0]+',148 '+line+' '+last[0]+',148" fill="url(#wash)"/><polyline points="'+line+'" fill="none" stroke="#4779e7" stroke-width="3" stroke-linejoin="round"/><circle cx="'+last[0]+'" cy="'+last[1]+'" r="4" fill="#4779e7" stroke="white"/>'+labels+'</svg>';
}
function allocation(rows,total){
 let n=0;const active=rows.filter(p=>p.value>0),stops=[],lines=[];
 active.forEach((p,i)=>{const share=100*p.value/total,color=palette[i%palette.length];stops.push(color+" "+n+"% "+(n+share)+"%");n+=share;lines.push('<div class="legendline"><span><i class="dot" style="background:'+color+'"></i>'+p.symbol+'</span><b>'+pct(share)+'</b></div>')});
 return '<div class="ring" style="background:'+(stops.length?'conic-gradient('+stops.join(",")+')':'#e9edf4')+'"><div><strong>'+active.length+'</strong><small>ligne'+(active.length>1?'s':'')+'</small></div></div>'+lines.join("");
}
function quoteDate(date){
 if(!date)return "—";
 const stale=mode==="real"&&date<dayOffset(paris().slice(0,10),-7);
 return dateLabel(date)+(stale?' <small class="stale">Cours ancien · plus de 7 jours</small>':'');
}
function render(){
 page=Object.hasOwn(pages,location.hash.slice(1))?location.hash.slice(1):"dashboard";
 const q=s.quotes,rows=positions(s.trades,q).sort((a,b)=>(b.value||0)-(a.value||0));
 const known=p=>!p.qty||Boolean(q[p.symbol]?.length&&Number.isFinite(p.value));
 const open=rows.filter(p=>p.qty>0),complete=open.every(known);
 const value=open.reduce((a,p)=>a+p.value,0),cost=open.reduce((a,p)=>a+p.cost,0);
 const missing="Cours manquant",dash="—";
 $("nav").innerHTML=Object.entries(pages).map(([k,v])=>'<a href="#'+k+'" '+(page===k?'class="active" aria-current="page"':'')+'>'+icon(k)+v[0]+'</a>').join("");
 $("title").textContent=pages[page][1];$("crumb").textContent=pages[page][0];$("subtitle").textContent=pages[page][2];
 $("environment").textContent=mode==="demo"?"DÉMONSTRATION · DONNÉES FICTIVES":"PORTEFEUILLE RÉEL";
 document.querySelectorAll("[data-mode]").forEach(b=>{b.classList.toggle("active",b.dataset.mode===mode);b.setAttribute("aria-pressed",b.dataset.mode===mode)});
 const positionsTable=()=>table(["Titre","Quantité","Coût restant","Valeur estimée","Gain latent","Dernier cours",...(page==="portfolio"?["Gain réalisé"]:[])],(page==="portfolio"?rows:open).map(p=>[asset(p.symbol,p.currency),fmt(p.qty,8),eur(p.cost),known(p)?eur(p.value):dash,known(p)?signed(p.pnl):dash,quoteDate(sorted(q[p.symbol]||[]).at(-1)?.date),...(page==="portfolio"?[signed(p.realized)]:[])]),"Aucune position. Ajoutez une opération pour commencer.");
 let html="";
 if(page==="dashboard"||page==="portfolio"){
 html='<div class="metrics">'+metric("Valeur du portefeuille",complete?eur(value):dash,complete?"Estimation en euros":missing,"portfolio")+metric("Coût des positions",eur(cost),"Positions ouvertes, frais inclus","trades")+metric("Plus-value latente",complete?signed(value-cost):dash,complete?(cost?sign(value-cost)+pct((value-cost)/cost*100)+" du coût restant":"Aucune position ouverte"):missing,"quotes")+'</div>';
 const keys=Object.keys(s.currencies).sort();if(!keys.includes(selected))selected="";
 const opts='<select id="assetChart" aria-label="Série du graphique"><option value="">Portefeuille en EUR</option>'+keys.map(k=>'<option '+(k===selected?'selected ':'')+'value="'+k+'">'+k+' en '+s.currencies[k]+'</option>').join("")+'</select>';
 let points;
 if(selected){const series=sorted(q[selected]||[]);points=series.length?series.filter(x=>x.date>=dayOffset(series.at(-1).date,-range+1)).map(x=>[x.date,x.price]):[]}
 else points=history(q);
 const controls='<div class="ranges">'+[30,90,365].map(d=>'<button data-range="'+d+'" class="'+(range===d?'active':'')+'">'+(d===365?'1 A':d+' J')+'</button>').join("")+'</div>';
 html+='<div class="panels">'+card(selected?"Cours de "+selected:"Évolution du portefeuille",selected?"Cours de clôture · "+s.currencies[selected]:"Valorisation historique · EUR",opts+(points.length?graph(points):'<p class="empty">Historique de cotations indisponible.</p>'),controls)+card("Répartition","Poids dans la valorisation",complete?allocation(open,value):'<p class="empty">Répartition indisponible · cours manquant.</p>')+'</div>';
 html+=card(page==="dashboard"?"Positions ouvertes":"Toutes les positions",open.length+" ligne(s) ouverte(s)",positionsTable(),page==="dashboard"?'<a class="textbtn" href="#portfolio">Détails ↗</a>':"");
 }else if(page==="trades"){
 html=card("Journal des opérations",s.trades.length+" opération(s) · heure de Paris",table(["Titre","Date","Sens","Quantité","Prix unitaire","Change¹","Frais","Actions"],sorted(s.trades).reverse().map(t=>[asset(t.symbol,t.currency),t.date.replace("T"," "),t.side==="buy"?"Achat":"Vente",fmt(t.qty,8),fmt(t.price,6)+" "+t.currency,fmt(t.fx,8),eur(t.fee),'<button class="textbtn" data-edit="'+s.trades.indexOf(t)+'">Modifier</button> <button class="textbtn" data-delete="'+s.trades.indexOf(t)+'">Supprimer</button>']),"Aucune opération enregistrée.")+'<p class="note">¹ Unités de devise pour un euro.</p>');
 }else if(page==="quotes"){
 const list=Object.entries(q).flatMap(([k,qs])=>qs.map(x=>({...x,k}))).sort((a,b)=>b.date.localeCompare(a.date)||a.k.localeCompare(b.k));
 html='<div class="stack">'+card("Sources de cotations",mode==="demo"?"Jeu de données fictives":feedState,'<p>GitHub Pages exclut market.json par défaut. Le flux est publié si ALLOW_PUBLIC_FEED=true. Vous pouvez garder le workflow d’alertes dans un second dépôt privé, puis télécharger son market.json et l’importer ici.</p><p class="note">L’import fusionne les séances par titre et par date et conserve les dates antérieures à la fenêtre de mise à jour. Après un fractionnement d’action, vérifiez la cohérence des cours historiques et des quantités.</p><div class="actions">'+(mode==="real"&&Object.keys(s.currencies).length?btn("Actualiser un titre","provider"):"")+btn("Importer market.json","market")+btn("Saisir un cours","quote")+'</div>')+card("Historique des cours",list.length+" cotation(s)",table(["Titre","Séance","Cours en devise","Change pour 1 EUR"],list.map(x=>[asset(x.k,s.currencies[x.k]),dateLabel(x.date),fmt(x.price,6)+" "+s.currencies[x.k],fmt(x.fx,8)]),"Aucun cours disponible."))+'</div>';
 }else if(page==="alerts"){
 html=card("Seuils par titre","Variation entre les deux dernières séances disponibles",'<p>La variation vaut (dernier cours / cours précédent − 1) × 100, en devise du titre. Une baisse de 3 % déclenche un seuil de baisse saisi à 3. Exportez les règles pour votre workflow d’alertes.</p><div class="actions">'+btn("Ajouter ou modifier une règle","rule")+btn("Exporter les règles JSON","exportRules")+'</div>'+table(["Titre","Hausse","Baisse","Variation","État",""],Object.entries(s.alerts).map(([k,r])=>{const v=sorted(q[k]||[]),d=v.length>1?(v.at(-1).price/v.at(-2).price-1)*100:null;return [asset(k,r.currency),"+"+pct(r.up),"−"+pct(r.down),d===null?dash:sign(d)+pct(d),d===null?"Cours insuffisants":d>=r.up||d<=-r.down?"Seuil atteint":"Sous les seuils",'<button class="textbtn" data-remove="'+k+'">Retirer</button>']}),"Aucune règle configurée.")+'<a href="alerts-guide.html">Guide des alertes ↗</a>');
 }else{
 html=card("Sauvegarde JSON",mode==="demo"?"Portefeuille de démonstration":"Portefeuille réel",'<p>Le fichier contient vos opérations, cotations, devises et règles d’alerte. La restauration remplace le portefeuille actif après confirmation.</p><div class="actions">'+btn("Exporter la sauvegarde","export")+btn("Restaurer un fichier","restore")+'</div>');
 }
 $("view").innerHTML=html+'<footer><a href="guide.html">Guide d’utilisation ↗</a><a href="alerts-guide.html">Guide des alertes ↗</a></footer>';
}
function field(label,name,attrs,value=""){return '<label>'+label+'<input name="'+name+'" '+attrs+' value="'+value+'" required></label>'}
const num='type="number" step="any" min="0"';
function openForm(a,index=null){
 editIndex=index;formRevision=revision;
 action=a;$("error").textContent="";$("submit").textContent="Enregistrer";let fields="";
 if(a==="provider"){
 $("modalTitle").textContent="Actualiser un titre";
 fields='<p>Charger les clôtures et le change auprès de Twelve Data. La clé sert uniquement pour cette demande.</p><label>Titre<select name="ticker">'+Object.keys(s.currencies).sort().map(k=>'<option>'+k+'</option>').join("")+'</select></label><label>Clé API Twelve Data<input type="password" name="providerKey" autocomplete="off" required></label>';
 $("submit").textContent="Charger les clôtures";
 }else if(["trade","quote","rule"].includes(a)){
 $("modalTitle").textContent={trade:index===null?"Nouvelle opération":"Modifier l’opération",quote:"Cours journalier",rule:"Règle d’alerte"}[a];
 fields=field("Symbole","symbol",'maxlength="24" list="tickers" placeholder="NVDA"')+'<datalist id="tickers">'+Object.keys(s.currencies).map(k=>'<option value="'+k+'">').join("")+'</datalist>'+field("Devise","currency",'maxlength="3" placeholder="USD"', "EUR");
 if(a==="trade")fields+='<label>Sens<select name="side"><option value="buy">Achat</option><option value="sell">Vente</option></select></label><label>Saisie<select name="entry"><option value="qty">Quantité</option><option value="amount">Montant en devise</option></select></label><label><span id="unitsLabel">Quantité</span><input type="number" name="units" step="any" min="0" required></label>';
 if(a==="rule")fields+=field("Hausse (%)","up",num,5)+field("Baisse (%)","down",num,3);
 else{fields+=field("Prix unitaire en devise","price",num)+field("Change (devise / EUR)","fx",num,1);
 if(a==="trade")fields+=field("Frais totaux en EUR","fee",num,0);
 fields+=field(a==="trade"?"Date et heure de Paris":"Date de séance","date",a==="trade"?'type="datetime-local"':'type="date"',a==="trade"?paris():paris().slice(0,10))}
 fields='<div class="formgrid">'+fields+'</div>';
 }else if(a==="delete"){const t=s.trades[index];$("modalTitle").textContent="Supprimer cette opération ?";fields="<p>"+t.symbol+" · "+(t.side==="buy"?"Achat":"Vente")+" de "+fmt(t.qty,8)+" · "+t.date.replace("T"," ")+" (Paris).</p>";$("submit").textContent="Confirmer la suppression"}else if(a==="confirm"){ $("modalTitle").textContent="Restaurer la sauvegarde ?";fields='<p>Remplacer les données du portefeuille '+(mode==="demo"?"de démonstration":"réel")+' par '+pending.trades.length+' opération(s) et leurs données associées ?</p>';$("submit").textContent="Remplacer et restaurer"}
 $("fields").innerHTML=fields;
 if(a==="trade"&&index!==null){const t=s.trades[index],f=$("form").elements;
 for(const k of ["symbol","currency","side","price","fx","fee","date"])f[k].value=t[k];f.units.value=t.qty}
 $("modal").showModal();
}
$("form").addEventListener("input",e=>{
 const f=e.currentTarget.elements;
 if(e.target.name==="currency" && f.fx){f.fx.value=f.currency.value.trim().toUpperCase()==="EUR"?"1":""}
 if(e.target.name==="entry")$("unitsLabel").textContent=f.entry.value==="qty"?"Quantité":"Montant en devise hors frais";
 if(e.target.name==="symbol"){
 const k=f.symbol.value.trim().toUpperCase();if(Object.hasOwn(s.currencies,k)&&f.currency&&f.currency.value!==s.currencies[k]){f.currency.value=s.currencies[k];if(f.fx)f.fx.value=f.currency.value==="EUR"?"1":""}
 if(action==="rule"&&Object.hasOwn(s.alerts,k)){f.up.value=s.alerts[k].up;f.down.value=s.alerts[k].down}
 }
});
$("form").onsubmit=async e=>{
 e.preventDefault();try{
 if(action==="provider"){
 const expected=formRevision,target=mode,fields=e.target.elements,k=fields.ticker.value;
 const apiKey=fields.providerKey.value.trim();fields.providerKey.value="";
 $("submit").disabled=true;
 try{
 const feed=await window.FolioProvider.load(k,s.currencies[k],apiKey);
 check(mode===target&&expected===revision&&$("modal").open&&action==="provider","Le portefeuille a changé. Relancez la demande.");
 await save(mergeFeed(s,feed),false,expected);
 $("modal").close();notice("Cotations mises à jour pour "+k+" · dernière séance du "+dateLabel(feed.quotes[k].at(-1).date)+".");
 }catch(err){$("error").textContent=err.name==="TypeError"?"Connexion au fournisseur impossible. Vérifiez le réseau ou importez le fichier market.json.":err.message}
 finally{$("submit").disabled=false}return;
 }
 if(action==="confirm"){await save(pending,true,formRevision);pending=null}else if(action==="delete"){const next=structuredClone(s);next.trades.splice(editIndex,1);await save(next,false,formRevision)}else{
 const f=Object.fromEntries(new FormData(e.target)),k=f.symbol.trim().toUpperCase(),c=f.currency.trim().toUpperCase(),next=structuredClone(s);
 check(symbolOK(k)&&curOK(c),"Saisissez un symbole valide et une devise à trois lettres.");
 check(!next.currencies[k]||next.currencies[k]===c,"Cette devise diffère de celle du titre.");next.currencies[k]=c;
 if(action==="trade")next.trades[editIndex??next.trades.length]={symbol:k,currency:c,side:f.side,qty:f.entry==="amount"?+f.units/+f.price:+f.units,price:+f.price,fx:+f.fx,fee:+f.fee,date:f.date};
 if(action==="quote")next.quotes[k]=sorted([...(next.quotes[k]||[]).filter(q=>q.date!==f.date),{date:f.date,price:+f.price,fx:+f.fx}]);
 if(action==="rule")next.alerts[k]={up:+f.up,down:+f.down,currency:c};await save(next,false,formRevision);
 }$("modal").close();notice("Données enregistrées.");
 }catch(err){$("error").textContent=err.message}
};
function download(name,obj){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}));a.href=url;a.download=name+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function mergeFeed(base,feed,automatic=false){
 check(dict(feed)&&dict(feed.quotes),"Le fichier doit contenir un objet quotes.");const next=structuredClone(base);
 for(const [k,items] of Object.entries(feed.quotes)){
 check(symbolOK(k)&&Array.isArray(items),"Série de marché invalide.");
 const currency=feed.currencies?.[k];
 check(curOK(currency)&&(!base.currencies[k]||currency===base.currencies[k]),"Devise absente ou incompatible pour "+k+".");
 next.currencies[k]=currency;
 const merged=new Map((next.quotes[k]||[]).map(q=>[q.date,q]));
 for(const q of items){check(dict(q)&&(!Object.hasOwn(q,"currency")||q.currency===currency),"Devise du cours incompatible pour "+k+".");if(!automatic||!merged.has(q.date))merged.set(q.date,{date:q.date,price:q.price,fx:q.fx})}
 next.quotes[k]=sorted([...merged.values()]);
 }validate(next);return next;
}
let fileAction="";
$("restoreFile").onchange=async e=>{
 const file=e.target.files[0];e.target.value="";if(!file)return;const target=mode,kind=fileAction,expected=revision;++fetchId;
 try{const obj=JSON.parse(await file.text());check(mode===target&&expected===revision,"Le portefeuille actif a changé.");
 if(kind==="market"){await save(mergeFeed(s,obj),false,expected);notice("Cotation(s) importée(s). Historique conservé.")}else{check(obj.version===1&&obj.mode===mode,"Version ou portefeuille incompatible avec la restauration.");validate(obj.data);pending=obj.data;openForm("confirm")}
 }catch(err){notice("Import impossible · "+err.message)}
};
document.addEventListener("click",async e=>{
 const b=e.target.closest("button");if(!b)return;
 try{
 if(b.dataset.mode){notice("");load(b.dataset.mode);localStorage.setItem(scope+".mode",mode);selected="";render();if(mode==="real")publicFeed();return}
 if(b.dataset.range){range=Number(b.dataset.range);render();return}
 if(b.dataset.remove){const next=structuredClone(s);delete next.alerts[b.dataset.remove];await save(next);return}
 if(b.dataset.edit!==undefined){openForm("trade",Number(b.dataset.edit));return}
 if(b.dataset.delete!==undefined){openForm("delete",Number(b.dataset.delete));return}
 const a=b.dataset.action;
 if(b.id==="close")$("modal").close();
 if(b.id==="add"||["quote","rule","provider"].includes(a))openForm(a||"trade");
 if(a==="export")download("folio-"+mode,{version:1,mode,data:s});
 if(a==="exportRules")download("alertes-"+mode,s.alerts);
 if(a==="restore"||a==="market"){fileAction=a;$("restoreFile").click()}
 }catch(err){notice(err.message)}
});
document.addEventListener("change",e=>{if(e.target.id==="assetChart"){selected=e.target.value;render()}});
let fetchId=0;
async function publicFeed(){
 const id=++fetchId,expected=revision;
 try{const res=await fetch("./market.json",{cache:"no-cache"});if(!res.ok)throw Error();const obj=await res.json();if(id!==fetchId||mode!=="real")return;
 const next=mergeFeed(s,obj,true);
 feedState="Flux public"+(typeof obj.updated==="string"&&validDay(obj.updated.slice(0,10))?" · mise à jour du "+dateLabel(obj.updated):"");
 await save(next,false,expected);
 }catch(err){if(id!==fetchId||mode!=="real")return;feedState="Flux public indisponible · saisie et import manuel disponibles.";render()}
}
window.addEventListener("storage",e=>{
 if(e.key!==key(mode)&&e.key!==null)return;
 ++fetchId;load(mode);render();notice("Données actualisées après une modification dans un autre onglet. Rouvrez toute saisie en cours.");
});
window.addEventListener("hashchange",render);
let initial="demo";try{if(localStorage.getItem(scope+".mode")==="real")initial="real"}catch{}
if(!window.Ledger){notice("Le moteur ledger.js est indisponible. Rechargez la page après avoir vérifié son installation.");return}
load(initial);render();if(mode==="real")publicFeed();
})();
