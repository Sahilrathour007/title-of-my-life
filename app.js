(function(){
  var $ = function(id){ return document.getElementById(id) };

  var TITLE_IDEAS = ["The Long Way Home", "Late Bloomer", "Still Becoming", "Small Town, Big Sky", "Second Act", "Nothing Wasted"];
  var NUDGES = [
    ["Where you wake up", "\nINT. MY ROOM — EARLY MORNING\n\nI wake up in "],
    ["Who's with you", "\nThe people around me are "],
    ["What you do all day", "\nMost days I spend my time "],
    ["A line you say", "\nME\n(smiling)\n"],
    ["How it feels", "\nWhat I notice most is how it feels to "]
  ];
  var EXAMPLES = [
    {title:"The Bakery on Elm Street", body:"EXT. A ROOFTOP GARDEN — SUNSET\n\nI'm 41 and I finally opened the bakery. My hands smell like cardamom. My mum sits on an upturned crate, telling customers I was 'always like this'. I wasn't. But I am now."},
    {title:"The Quiet Years", body:"INT. A SMALL APARTMENT BY THE SEA — MORNING\n\nNo alarm. I make tea for two, read for an hour, and walk to the studio where I teach kids to paint. Nobody is in a hurry. Especially not me."},
    {title:"Second Act", body:"INT. A LECTURE HALL — DAY\n\nThe front row is full of people who look like I used to: tired, curious, a little scared. I tell them how I changed careers at 35. Someone in the back starts taking notes."}
  ];

  // ---------- storage backends ----------
  function rid(){ return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2)) }
  function lsGet(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d }catch(e){ return d } }
  function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)) }catch(e){} }

  // Local mode: a private wall in this browser, seeded with labelled examples.
  function localStore(){
    var uid = lsGet("toml_uid",null); if(!uid){ uid=rid(); lsSet("toml_uid",uid) }
    var d = lsGet("toml_data",null);
    if(!d){
      var t=Date.now();
      d={scripts:EXAMPLES.map(function(x,i){ return {id:"ex"+i,title:x.title,body:x.body,owner:"example",created_at:t-(i+1)*864e5,example:true} }),
         likes:[{script_id:"ex0",uid:"example"}], comments:[{id:"c0",script_id:"ex0",text:"This made me smile. Go open that bakery.",created_at:t}]};
      lsSet("toml_data",d);
    }
    function save(){ lsSet("toml_data",d) }
    return {
      shared:false, uid:uid, canWrite:true,
      load:async function(){ return JSON.parse(JSON.stringify(d)) },
      addScript:async function(title,body){ var s={id:rid(),title:title,body:body,owner:uid,created_at:Date.now()}; d.scripts.push(s); save(); return s.id },
      toggleLike:async function(id,liked){
        if(liked) d.likes=d.likes.filter(function(l){ return !(l.script_id===id&&l.uid===uid) });
        else d.likes.push({script_id:id,uid:uid});
        save();
      },
      addComment:async function(id,text){ d.comments.push({id:rid(),script_id:id,text:text,uid:uid,created_at:Date.now()}); save() }
    };
  }

  // Shared mode: Supabase with anonymous sign-in, so every visitor gets a private id without an account.
  async function supabaseStore(cfg){
    var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    var ses = (await sb.auth.getSession()).data.session;
    if(!ses){ var r = await sb.auth.signInAnonymously(); if(r.error) throw r.error; ses = r.data.session }
    var uid = ses.user.id;
    function ok(r){ if(r.error) throw r.error; return r.data }
    function ts(rows){ return rows.map(function(x){ x.created_at=Date.parse(x.created_at); return x }) }
    var st = {
      shared:true, uid:uid, canWrite:true,
      load:async function(){
        var res = await Promise.all([
          sb.from("scripts").select("id,title,body,owner,created_at").order("created_at",{ascending:false}).limit(300),
          sb.from("likes").select("script_id,uid").limit(5000),
          sb.from("comments").select("id,script_id,text,uid,created_at").order("created_at",{ascending:true}).limit(2000)
        ]);
        return {scripts:ts(ok(res[0])), likes:ok(res[1]), comments:ts(ok(res[2]))};
      },
      addScript:async function(title,body){ return ok(await sb.from("scripts").insert({title:title,body:body,owner:uid}).select("id").single()).id },
      toggleLike:async function(id,liked){
        if(liked) ok(await sb.from("likes").delete().eq("script_id",id).eq("uid",uid));
        else ok(await sb.from("likes").insert({script_id:id,uid:uid}));
      },
      addComment:async function(id,text){ ok(await sb.from("comments").insert({script_id:id,text:text,uid:uid})) },
      subscribe:function(cb){
        sb.channel("wall").on("postgres_changes",{event:"*",schema:"public"},cb).subscribe();
      }
    };
    return st;
  }

  // ---------- state ----------
  var store=null, data={scripts:[],likes:[],comments:[]};
  var draftTitle="", sortBy="new", busy={}, expanded={}, justPosted=false;

  function show(which){
    ["welcome","s1","s2","dash"].forEach(function(k){ $(k).hidden = k!==which });
    window.scrollTo(0,0);
    if(which==="dash") draw();
    if(which==="s1") $("ti").focus();
    if(which==="s2") $("bo").focus();
  }
  document.querySelectorAll("[data-go]").forEach(function(b){ b.addEventListener("click",function(){ show(b.dataset.go) }) });
  $("start").addEventListener("click",function(){ show("s1") });
  $("peek").addEventListener("click",function(){ show("dash") });

  // ---------- step 1 ----------
  TITLE_IDEAS.forEach(function(t){
    var b=document.createElement("button"); b.type="button"; b.textContent=t;
    b.addEventListener("click",function(){ $("ti").value=t; $("ti").dispatchEvent(new Event("input")); $("ti").focus() });
    $("titleIdeas").appendChild(b);
  });
  $("ti").addEventListener("input",function(){ $("go1").disabled = !$("ti").value.trim() });
  $("ti").addEventListener("keydown",function(e){ if(e.key==="Enter" && $("ti").value.trim()) $("go1").click() });
  $("go1").addEventListener("click",function(){
    draftTitle=$("ti").value.trim();
    $("h2t").textContent="“"+draftTitle+"”";
    show("s2");
  });

  // ---------- step 2 ----------
  NUDGES.forEach(function(n){
    var b=document.createElement("button"); b.type="button"; b.textContent=n[0];
    b.addEventListener("click",function(){
      var ta=$("bo"); ta.value = (ta.value.replace(/\s+$/,"") + (ta.value.trim()?"\n":"") + n[1]).replace(/^\n+/,"");
      ta.dispatchEvent(new Event("input")); ta.focus(); ta.selectionStart=ta.selectionEnd=ta.value.length;
    });
    $("nudges").appendChild(b);
  });
  $("bo").addEventListener("input",function(){
    var n=$("bo").value.trim().length; $("cnt").textContent=$("bo").value.length;
    $("go2").disabled = n<20;
    $("m2").textContent = n>0 && n<20 ? "Just a little more — a sentence or two is perfect." : "";
  });
  $("go2").addEventListener("click",async function(){
    var body=$("bo").value.trim(); if(!draftTitle||body.length<20||!store) return;
    $("go2").disabled=true; $("m2").textContent="Pinning it up…";
    try{
      var id = await store.addScript(draftTitle,body);
      lsSet("toml_mine",id);
      justPosted=true; $("bo").value=""; $("ti").value=""; $("cnt").textContent="0"; $("m2").textContent="";
      await refresh(); show("dash");
    }catch(e){
      $("m2").textContent="We couldn't pin it just now. Your words are safe here — please try again.";
      $("go2").disabled=false;
    }
  });

  // ---------- wall ----------
  function likeCount(id){ var n=0; data.likes.forEach(function(l){ if(l.script_id===id) n++ }); return n }
  function iLiked(id){ return data.likes.some(function(l){ return l.script_id===id && l.uid===store.uid }) }
  function myScript(){
    var saved=lsGet("toml_mine",null), found=null;
    data.scripts.forEach(function(s){ if(s.owner===store.uid || s.id===saved){ if(!found||s.created_at>found.created_at) found=s } });
    return found;
  }

  function scriptCard(s,k){
    var card=document.createElement("article"); card.className="script";
    if(s.example){ var ex=document.createElement("span"); ex.className="ex"; ex.textContent="Example"; card.appendChild(ex) }
    var t=document.createElement("p"); t.className="t"; t.textContent=s.title; card.appendChild(t);
    var by=document.createElement("p"); by.className="by"; by.textContent = s.owner===store.uid ? "written by you" : "written by someone like you"; card.appendChild(by);
    var b=document.createElement("p"); b.className="b"; b.textContent=s.body;
    var long = s.body.length>600 || s.body.split("\n").length>14, open = !long || expanded[s.id+k];
    if(!open) b.classList.add("clamp");
    card.appendChild(b);
    if(long){
      var mb=document.createElement("button"); mb.className="more"; mb.textContent=open?"Show less":"Keep reading →";
      mb.addEventListener("click",function(){ expanded[s.id+k]=!open; draw() });
      card.appendChild(mb);
    }
    var n=likeCount(s.id), lk=iLiked(s.id);
    var bar=document.createElement("div"); bar.className="bar";
    var lb=document.createElement("button"); lb.type="button"; lb.className="like"; lb.setAttribute("aria-pressed",lk?"true":"false");
    lb.textContent=lk?"♥ Loved":"♡ Love this"; lb.disabled=!!busy[s.id];
    lb.addEventListener("click",function(){ toggleLike(s.id,lk) });
    bar.appendChild(lb);
    var c=document.createElement("span"); c.textContent = n ? n+(n===1?" person loved this":" people loved this") : "Be the first to show some love"; bar.appendChild(c);
    card.appendChild(bar);

    var cm=document.createElement("div"); cm.className="cm";
    data.comments.filter(function(x){ return x.script_id===s.id }).forEach(function(x){ var p=document.createElement("p"); p.textContent=x.text; cm.appendChild(p) });
    var f=document.createElement("form");
    var inp=document.createElement("input"); inp.type="text"; inp.maxLength=280; inp.placeholder="Leave a kind word…"; inp.setAttribute("aria-label","Comment"); inp.dataset.k="c"+s.id+k;
    var sb=document.createElement("button"); sb.type="submit"; sb.textContent="Send";
    f.appendChild(inp); f.appendChild(sb);
    f.addEventListener("submit",function(e){ e.preventDefault(); addComment(s.id,inp,sb) });
    cm.appendChild(f); card.appendChild(cm);
    return card;
  }

  async function toggleLike(id,liked){
    if(busy[id]) return; busy[id]=true;
    // optimistic update, then reconcile with the server
    if(liked) data.likes=data.likes.filter(function(l){ return !(l.script_id===id&&l.uid===store.uid) });
    else data.likes.push({script_id:id,uid:store.uid});
    draw();
    try{ await store.toggleLike(id,liked) }catch(e){}
    busy[id]=false; await refresh();
  }
  async function addComment(id,inp,sb){
    var text=inp.value.trim(); if(!text) return;
    sb.disabled=true;
    try{ await store.addComment(id,text); inp.value="" }catch(e){}
    sb.disabled=false; await refresh();
  }

  function empty(text,full){ var e=document.createElement("div"); e.className="empty"; if(full) e.style.gridColumn="1/-1"; e.textContent=text; return e }

  function draw(){
    if($("dash").hidden||!store) return;
    var keep={}; document.querySelectorAll("input[data-k]").forEach(function(i){ if(i.value) keep[i.dataset.k]=i.value });
    var focusK=document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;

    $("thanks").hidden=!justPosted;
    var note=$("note");
    note.hidden=store.shared;
    if(!store.shared) note.textContent="You're in local mode: scripts are saved only in this browser, and the cards marked “Example” are samples. Connect a database to share the wall with everyone (see the README).";

    var mine=myScript();
    $("writeCta").hidden=!!mine;
    $("mine").replaceChildren(mine ? scriptCard(mine,"m") : empty("Your script will appear here once you write it."));

    var best=null, bn=0;
    data.scripts.forEach(function(s){ if(mine&&s.id===mine.id) return; var n=likeCount(s.id); if(n>bn||(n===bn&&n>0&&best&&s.created_at<best.created_at)){ best=s; bn=n } });
    $("top").replaceChildren(best ? scriptCard(best,"t") : empty("Nothing loved yet. Read a script and tap ♡ on the one that moves you."));

    var sorted=data.scripts.slice().sort(sortBy==="loved"
      ? function(a,b){ return likeCount(b.id)-likeCount(a.id) || b.created_at-a.created_at }
      : function(a,b){ return b.created_at-a.created_at });
    var n=data.scripts.length;
    $("count").textContent = n ? n+(n===1?" script on the wall":" scripts on the wall") : "";
    $("feed").replaceChildren.apply($("feed"), sorted.length ? sorted.map(function(s){ return scriptCard(s,"f") }) : [empty("The wall is empty. Yours could be the very first scene.",true)]);

    document.querySelectorAll("input[data-k]").forEach(function(i){ if(keep[i.dataset.k]) i.value=keep[i.dataset.k] });
    if(focusK){ var f=document.querySelector('input[data-k="'+focusK+'"]'); if(f) f.focus() }
  }
  document.querySelectorAll("[data-sort]").forEach(function(b){
    b.addEventListener("click",function(){
      sortBy=b.dataset.sort;
      document.querySelectorAll("[data-sort]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false") });
      draw();
    });
  });

  async function refresh(){ try{ data = await store.load() }catch(e){} draw() }

  // ---------- boot ----------
  (async function(){
    var cfg=window.TOML_CONFIG||{};
    if(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase){
      try{ store = await supabaseStore(cfg) }catch(e){ console.warn("Shared wall unavailable, using local mode",e) }
    }
    if(!store) store = localStore();
    await refresh();
    if(store.subscribe) store.subscribe(function(){ refresh() });
    show(myScript() ? "dash" : "welcome");
  })();
})();
