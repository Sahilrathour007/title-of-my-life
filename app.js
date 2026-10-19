(function(){
  var $ = function(id){ return document.getElementById(id) };
  var CFG = window.TOML_CONFIG || {};

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

  function lsGet(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d }catch(e){ return d } }
  function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)) }catch(e){} }
  function rid(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2) }

  // ---------- anonymous identity ----------
  // The ID is the only credential: a random code like AMBER-FOX-7Q4K-9XPM (~50 bits).
  // Only its SHA-256 hash is ever stored with scripts, and cards show a short public tag (#A3F9).
  var ADJ = ["AMBER","BRAVE","CALM","CORAL","DAWN","EARLY","FIERY","GENTLE","GOLDEN","HAZEL","IVORY","JADE","KIND","LUNAR","MAPLE","MISTY",
             "NOBLE","OCEAN","PEARL","QUIET","ROSY","RUSTY","SILVER","SOFT","SUNNY","TIDAL","VELVET","WARM","WILD","WISE","YOUNG","ZESTY"];
  var NOUN = ["FOX","OWL","WREN","HARE","LARK","DEER","OTTER","ROBIN","SWAN","BEAR","LYNX","MOTH","FINCH","CRANE","HERON","SEAL",
              "PINE","FERN","OAK","WILLOW","RIVER","STONE","CLOUD","EMBER","COMET","HARBOR","MEADOW","ORCHID","CEDAR","DUNE","TIDE","STAR"];
  var B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  var ID_RE = /^([A-Z]+)-([A-Z]+)-([0-9A-Z]{4})-([0-9A-Z]{4})$/;

  function newId(){
    var r = new Uint8Array(10); crypto.getRandomValues(r);
    var code=""; for(var i=2;i<10;i++) code += B32[r[i]&31];
    return ADJ[r[0]&31]+"-"+NOUN[r[1]&31]+"-"+code.slice(0,4)+"-"+code.slice(4);
  }
  function normalizeId(s){
    s = String(s||"").toUpperCase().trim().replace(/[\s_]+/g,"-").replace(/-+/g,"-");
    var m = s.match(ID_RE);
    return m && ADJ.indexOf(m[1])>=0 && NOUN.indexOf(m[2])>=0 ? s : null;
  }
  async function sha256(s){
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,"0") }).join("");
  }
  function tagOf(hash){ return "#"+String(hash||"").slice(0,4).toUpperCase() }

  var me = {id:null, hash:null, fresh:false};
  async function setIdentity(id, fresh){
    me.id=id; me.hash=await sha256(id); me.fresh=!!fresh;
    lsSet("toml_id", id);
  }

  // ---------- storage backends ----------
  // Local mode: a private wall in this browser, seeded with labelled examples.
  function localStore(){
    var d = lsGet("toml_v2",null);
    if(!d){
      var t=Date.now();
      d={scripts:EXAMPLES.map(function(x,i){ return {id:"ex"+i,title:x.title,body:x.body,owner_hash:"example"+i,created_at:t-(i+1)*864e5,example:true} }),
         likes:[{script_id:"ex0",owner_hash:"example1"}], comments:[{id:"c0",script_id:"ex0",text:"This made me smile. Go open that bakery.",created_at:t}]};
      lsSet("toml_v2",d);
    }
    function save(){ lsSet("toml_v2",d) }
    return {
      shared:false,
      load:async function(){ return JSON.parse(JSON.stringify(d)) },
      addScript:async function(title,body){ var s={id:rid(),title:title,body:body,owner_hash:me.hash,created_at:Date.now()}; d.scripts.push(s); save(); return s.id },
      toggleLike:async function(id){
        var had = d.likes.some(function(l){ return l.script_id===id&&l.owner_hash===me.hash });
        if(had) d.likes=d.likes.filter(function(l){ return !(l.script_id===id&&l.owner_hash===me.hash) });
        else d.likes.push({script_id:id,owner_hash:me.hash});
        save();
      },
      addComment:async function(id,text){ d.comments.push({id:rid(),script_id:id,text:text,owner_hash:me.hash,created_at:Date.now()}); save() }
    };
  }

  // Shared mode: Supabase. Writes go through database functions that check the ID server-side (supabase/schema.sql).
  function supabaseStore(cfg){
    var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:false}});
    function ok(r){ if(r.error) throw r.error; return r.data }
    function ts(rows){ return rows.map(function(x){ x.created_at=Date.parse(x.created_at); return x }) }
    return {
      shared:true,
      load:async function(){
        var res = await Promise.all([
          sb.from("scripts").select("id,title,body,owner_hash,created_at").order("created_at",{ascending:false}).limit(300),
          sb.from("likes").select("script_id,owner_hash").limit(5000),
          sb.from("comments").select("id,script_id,text,owner_hash,created_at").order("created_at",{ascending:true}).limit(2000)
        ]);
        return {scripts:ts(ok(res[0])), likes:ok(res[1]), comments:ts(ok(res[2]))};
      },
      addScript:async function(title,body){ return ok(await sb.rpc("post_script",{p_key:me.id,p_title:title,p_body:body})) },
      toggleLike:async function(id){ ok(await sb.rpc("toggle_like",{p_key:me.id,p_script:id})) },
      addComment:async function(id,text){ ok(await sb.rpc("add_comment",{p_key:me.id,p_script:id,p_text:text})) },
      subscribe:function(cb){ sb.channel("wall").on("postgres_changes",{event:"*",schema:"public"},cb).subscribe() }
    };
  }

  // ---------- background video ----------
  function setupVideo(){
    var v=$("bgv"), src=CFG.backgroundVideo;
    if(!src) return;
    var portrait = matchMedia("(max-aspect-ratio: 1/1)").matches;
    if(CFG.backgroundPoster) v.poster = CFG.backgroundPoster;
    v.style.objectPosition = (portrait && CFG.videoFocusMobile) || CFG.videoFocus || "50% 50%";
    if(typeof CFG.videoOverlay==="number") document.documentElement.style.setProperty("--ov", Math.round(CFG.videoOverlay*100)+"%");
    document.body.classList.add("has-video");
    v.muted = true; v.defaultMuted = true; // browsers only autoplay muted video; some check the property, not the attribute

    // Upright phones try the phone cut first, then the desktop video. Each tries its WebM twin before the MP4.
    var files = (portrait && CFG.backgroundVideoMobile) ? [CFG.backgroundVideoMobile, src] : [src];
    var webm = !!v.canPlayType('video/webm; codecs="vp9"'), tries = [];
    files.forEach(function(f){ if(webm && /\.mp4$/i.test(f)) tries.push(f.replace(/\.mp4$/i,".webm")); tries.push(f) });
    function play(){ v.play().catch(function(){}) }
    function next(){
      if(!tries.length){
        console.warn("Background video: couldn't play "+files.join(" or ")+". Check the file is in the media folder with exactly that name (web hosts care about upper/lower case), or run tools/prepare-video.");
        if(!CFG.backgroundPoster) document.body.classList.remove("has-video");
        return;
      }
      v.src = tries.shift(); play();
    }
    v.addEventListener("error", function(){ if(v.error) next() });
    next();
    document.addEventListener("visibilitychange",function(){ if(document.hidden) v.pause(); else play() });
    // Low Power Mode (iPhone) can block autoplay; start on the visitor's first touch, scroll or key instead.
    ["pointerdown","keydown","scroll","touchstart"].forEach(function(ev){ addEventListener(ev, function(){ if(v.paused) play() }, {once:true, passive:true}) });
  }

  // ---------- state ----------
  var store=null, data={scripts:[],likes:[],comments:[]};
  var draftTitle="", sortBy="new", busy={}, expanded={}, justPosted=false;

  function show(which){
    ["welcome","s1","s2","dash"].forEach(function(k){ $(k).hidden = k!==which });
    document.body.classList.toggle("on-welcome", which==="welcome");
    window.scrollTo(0,0);
    if(which==="dash") draw();
    if(which==="s1") $("ti").focus();
    if(which==="s2") $("bo").focus();
  }
  document.querySelectorAll("[data-go]").forEach(function(b){ b.addEventListener("click",function(){ show(b.dataset.go) }) });
  $("start").addEventListener("click",function(){ show("s1") });
  $("peek").addEventListener("click",function(){ show("dash") });
  document.querySelector(".scrollcue").addEventListener("click",function(e){ e.preventDefault(); $("below").scrollIntoView({behavior:"smooth"}) });

  // ---------- ID card ----------
  function flash(el,text){ var o=el.textContent; el.textContent=text; setTimeout(function(){ el.textContent=o },1600) }
  function idText(){
    return "Title of My Life — your anonymous ID\n\n"+me.id+"\n\nKeep it private: anyone with this ID can post as you.\nTo come back on any device, open the site, tap “Use a saved ID” and paste it.\n";
  }
  function renderIdCards(){
    document.querySelectorAll("[data-id-slot]").forEach(function(slot){
      var compact = slot.dataset.idSlot==="compact";
      var c=document.createElement("div"); c.className="idcard"+(compact?" compact":"");
      var h=document.createElement("div"); h.className="idhead";
      h.innerHTML='<span class="idlabel"></span><span class="idtag"></span>';
      h.querySelector(".idlabel").textContent = me.fresh&&!compact ? "Your new anonymous ID" : "Your anonymous ID";
      h.querySelector(".idtag").textContent = "shows as "+tagOf(me.hash);
      var code=document.createElement("output"); code.className="idcode"; code.textContent=me.id;
      var p=document.createElement("p"); p.className="idnote";
      p.textContent="No name, no email — this code is you here. Save it to find your script again on any device. Keep it private.";
      var row=document.createElement("div"); row.className="idrow";
      var copy=document.createElement("button"); copy.type="button"; copy.textContent="Copy";
      copy.addEventListener("click",async function(){
        try{ await navigator.clipboard.writeText(me.id); flash(copy,"Copied ✓") }
        catch(e){ var r=document.createRange(); r.selectNodeContents(code); getSelection().removeAllRanges(); getSelection().addRange(r); flash(copy,"Press Ctrl/⌘+C") }
      });
      var save=document.createElement("button"); save.type="button"; save.textContent="Save";
      save.addEventListener("click",async function(){
        // Phones: the share sheet lets people save to Notes/Photos/Messages to themselves. Elsewhere: download a .txt.
        if(navigator.share && matchMedia("(pointer:coarse)").matches){
          try{ await navigator.share({title:"My anonymous ID", text:idText()}); return }catch(e){ if(e && e.name==="AbortError") return }
        }
        var a=document.createElement("a");
        a.href=URL.createObjectURL(new Blob([idText()],{type:"text/plain"}));
        a.download="title-of-my-life-id.txt"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(a.href) },1000);
        flash(save,"Saved ✓");
      });
      var use=document.createElement("button"); use.type="button"; use.className="link"; use.textContent="Use a saved ID";
      use.addEventListener("click",openRestore);
      row.append(copy,save,use);
      if(compact){
        var det=document.createElement("details"); var sum=document.createElement("summary");
        sum.textContent="You're anonymous "+tagOf(me.hash)+" · your ID";
        det.append(sum,code,p,row); c.append(det);
      } else c.append(h,code,p,row);
      slot.replaceChildren(c);
    });
  }
  function openRestore(){
    $("rid").value=""; $("rmsg").textContent="";
    if($("restore").showModal) $("restore").showModal(); else $("restore").setAttribute("open","");
    $("rid").focus();
  }
  $("rcancel").addEventListener("click",function(){ $("restore").close ? $("restore").close() : $("restore").removeAttribute("open") });
  $("rform").addEventListener("submit",async function(e){
    e.preventDefault();
    var id=normalizeId($("rid").value);
    if(!id){ $("rmsg").textContent="That doesn't look like an ID. It should be like AMBER-FOX-7Q4K-9XPM."; return }
    await setIdentity(id,false);
    lsSet("toml_mine",null); justPosted=false;
    $("restore").close ? $("restore").close() : $("restore").removeAttribute("open");
    renderIdCards(); await refresh();
    if(myScript()) show("dash"); else draw();
  });

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
  function iLiked(id){ return data.likes.some(function(l){ return l.script_id===id && l.owner_hash===me.hash }) }
  function myScript(){
    var saved=lsGet("toml_mine",null), found=null;
    data.scripts.forEach(function(s){ if(s.owner_hash===me.hash || s.id===saved){ if(!found||s.created_at>found.created_at) found=s } });
    return found;
  }

  function scriptCard(s,k){
    var card=document.createElement("article"); card.className="script";
    if(s.example){ var ex=document.createElement("span"); ex.className="ex"; ex.textContent="Example"; card.appendChild(ex) }
    var t=document.createElement("p"); t.className="t"; t.textContent=s.title; card.appendChild(t);
    var by=document.createElement("p"); by.className="by";
    by.textContent = s.owner_hash===me.hash ? "written by you ("+tagOf(me.hash)+")" : s.example ? "written by someone like you" : "written by anonymous "+tagOf(s.owner_hash);
    card.appendChild(by);
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
    data.comments.filter(function(x){ return x.script_id===s.id }).forEach(function(x){
      var p=document.createElement("p"); p.textContent=x.text;
      if(x.owner_hash){ var w=document.createElement("small"); w.textContent=" — "+(x.owner_hash===me.hash?"you":tagOf(x.owner_hash)); p.appendChild(w) }
      cm.appendChild(p);
    });
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
    // optimistic update, then reconcile with the store
    if(liked) data.likes=data.likes.filter(function(l){ return !(l.script_id===id&&l.owner_hash===me.hash) });
    else data.likes.push({script_id:id,owner_hash:me.hash});
    draw();
    try{ await store.toggleLike(id) }catch(e){}
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
    setupVideo();
    var saved = normalizeId(lsGet("toml_id",null));
    await setIdentity(saved || newId(), !saved);
    renderIdCards();
    if(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase){
      try{ store = supabaseStore(CFG); await store.load() }catch(e){ store=null; console.warn("Shared wall unavailable, using local mode",e) }
    }
    if(!store) store = localStore();
    await refresh();
    if(store.subscribe) store.subscribe(function(){ refresh() });
    show(myScript() ? "dash" : "welcome");
  })();
})();
