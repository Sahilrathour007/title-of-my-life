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
      updateScript:async function(id,title,body){
        var s=d.scripts.find(function(x){ return x.id===id && x.owner_hash===me.hash }); if(!s) throw new Error("not yours");
        s.title=title; s.body=body; s.edited_at=Date.now(); save();
      },
      deleteScript:async function(id){
        if(!d.scripts.some(function(x){ return x.id===id && x.owner_hash===me.hash })) throw new Error("not yours");
        d.scripts=d.scripts.filter(function(x){ return x.id!==id });
        d.likes=d.likes.filter(function(x){ return x.script_id!==id });
        d.comments=d.comments.filter(function(x){ return x.script_id!==id });
        save();
      },
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
          sb.from("scripts").select("id,title,body,owner_hash,created_at,edited_at").order("created_at",{ascending:false}).limit(300),
          sb.from("likes").select("script_id,owner_hash").limit(5000),
          sb.from("comments").select("id,script_id,text,owner_hash,created_at").order("created_at",{ascending:true}).limit(2000)
        ]);
        return {scripts:ts(ok(res[0])), likes:ok(res[1]), comments:ts(ok(res[2]))};
      },
      addScript:async function(title,body){ return ok(await sb.rpc("post_script",{p_key:me.id,p_title:title,p_body:body})) },
      updateScript:async function(id,title,body){ ok(await sb.rpc("edit_script",{p_key:me.id,p_script:id,p_title:title,p_body:body})) },
      deleteScript:async function(id){ ok(await sb.rpc("delete_script",{p_key:me.id,p_script:id})) },
      toggleLike:async function(id){ ok(await sb.rpc("toggle_like",{p_key:me.id,p_script:id})) },
      addComment:async function(id,text){ ok(await sb.rpc("add_comment",{p_key:me.id,p_script:id,p_text:text})) },
      subscribe:function(cb){ sb.channel("wall").on("postgres_changes",{event:"*",schema:"public"},cb).subscribe() }
    };
  }

  // ---------- background video ----------
  // The background only lives on the home screen. Returns setActive(bool), called from show().
  var video = {setActive:function(){}};
  function setupVideo(){
    var v=$("bgv"), img=$("bgimg"), src=CFG.backgroundVideo;
    if(!src) return;
    var portrait = matchMedia("(max-aspect-ratio: 1/1)").matches;
    if(CFG.backgroundPoster) v.poster = CFG.backgroundPoster;
    v.style.objectPosition = img.style.objectPosition = (portrait && CFG.videoFocusMobile) || CFG.videoFocus || "50% 50%";
    if(typeof CFG.videoOverlay==="number") document.documentElement.style.setProperty("--ov", Math.round(CFG.videoOverlay*100)+"%");
    v.muted = true; v.defaultMuted = true; // browsers only autoplay muted video; some check the property, not the attribute
    v.setAttribute("playsinline",""); v.setAttribute("webkit-playsinline",""); // older iPhones need both to play inline

    // Upright phones try the phone cut first, then the desktop video. MP4 (H.264) comes first because every phone
    // plays and autoplays it; the WebM twin is only a fallback, since some iPhones claim WebM support but stall on it.
    var files = (portrait && CFG.backgroundVideoMobile) ? [CFG.backgroundVideoMobile, src] : [src];
    var webm = !!v.canPlayType('video/webm; codecs="vp9"'), tries = [];
    files.forEach(function(f){ tries.push(f); if(webm && /\.mp4$/i.test(f)) tries.push(f.replace(/\.mp4$/i,".webm")) });

    var ok=true, active=false, usingImage=false;
    function useImage(){
      // Phones that refuse video autoplay (iPhone Low Power Mode, Android data saver, WhatsApp/Instagram's built-in
      // browsers) still animate images, so show the animated WebP made by tools/prepare-video instead.
      if(usingImage || !CFG.backgroundAnimated) return;
      usingImage=true;
      img.onerror=function(){ usingImage=false; img.hidden=true; v.hidden=false };
      img.src=CFG.backgroundAnimated; img.hidden=false; v.hidden=true; v.pause();
    }
    function play(){
      if(!active || usingImage || !v.paused) return;
      var p=v.play();
      if(p && p.catch) p.catch(function(e){ if(e && e.name==="NotAllowedError") useImage() });
    }
    // Ask again at every stage of loading; some phones ignore the first request until enough data has arrived.
    ["loadedmetadata","loadeddata","canplay"].forEach(function(ev){ v.addEventListener(ev, play) });
    addEventListener("pageshow", play); // returning with the back button restores a paused page
    function next(){
      if(!tries.length){
        console.warn("Background video: couldn't play "+files.join(" or ")+". Check the file is in the media folder with exactly that name (web hosts care about upper/lower case), or run tools/prepare-video.");
        if(!CFG.backgroundPoster){ ok=false; document.body.classList.remove("has-video") }
        return;
      }
      v.src = tries.shift(); play();
    }
    v.addEventListener("error", function(){ if(v.error) next() });
    document.addEventListener("visibilitychange",function(){ if(document.hidden) v.pause(); else play() });
    // If the video still hasn't started a few seconds after it could have, treat autoplay as blocked.
    setTimeout(function(){ if(active && v.paused && v.readyState>=2) useImage() }, 3500);
    ["pointerdown","keydown","touchstart"].forEach(function(ev){ addEventListener(ev, play, {once:true, passive:true}) });

    var loaded=false;
    video.setActive=function(on){
      active=on;
      document.body.classList.toggle("has-video", ok && on);
      if(!on){ v.pause(); return }
      if(!loaded){ loaded=true; next() } else play();
    };
  }

  // ---------- state ----------
  var store=null, sharedError=null, data={scripts:[],likes:[],comments:[]};
  var draftTitle="", sortBy="new", busy={}, expanded={}, justPosted=false, editing=null;

  function show(which){
    ["welcome","s1","s2","dash"].forEach(function(k){ $(k).hidden = k!==which });
    document.body.classList.toggle("on-welcome", which==="welcome");
    video.setActive(which==="welcome");
    window.scrollTo(0,0);
    if(which==="dash") draw();
    if(which==="s1") $("ti").focus();
    if(which==="s2") $("bo").focus();
  }
  document.querySelectorAll("[data-go]").forEach(function(b){ b.addEventListener("click",function(){
    if(editing && b.dataset.go==="welcome"){ stopEditing(); $("ti").value=""; $("bo").value=""; return show("dash") }
    show(b.dataset.go);
  }) });
  $("start").addEventListener("click",function(){ show("s1") });
  $("peek").addEventListener("click",function(){ show("dash") });
  document.querySelector(".scrollcue").addEventListener("click",function(e){ e.preventDefault(); $("below").scrollIntoView({behavior:"smooth"}) });

  // ---------- cinema avatars ----------
  // Everyone gets a film-themed picture worked out from their anonymous ID, so the same person always looks the same
  // on every card and comment, and nothing extra is stored.
  var ICONS = [
    ["Clapperboard",'<path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 10 3.3 6.6a1 1 0 0 1 .8-1.2L17.8 3a1 1 0 0 1 1.2.8L19.6 7z"/><path d="m8 5.2 2.4 3.4M13 4.3l2.4 3.4"/>'],
    ["Film reel",'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="7.3" r="1.9"/><circle cx="12" cy="16.7" r="1.9"/><circle cx="7.3" cy="12" r="1.9"/><circle cx="16.7" cy="12" r="1.9"/>'],
    ["Popcorn",'<path d="M6 10h12l-1.6 10.2a1 1 0 0 1-1 .8H8.6a1 1 0 0 1-1-.8z"/><path d="M10 10l.5 11M14 10l-.5 11"/><path d="M6.5 10a2.5 2.5 0 0 1 1-4.6 3 3 0 0 1 5-1.6 3 3 0 0 1 5 1.6 2.5 2.5 0 0 1 1 4.6"/>'],
    ["Movie camera",'<rect x="3" y="10" width="12" height="9" rx="1.5"/><path d="m15 13 5-3v9l-5-3"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="12" cy="6.5" r="2.5"/>'],
    ["Ticket",'<path d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4z"/><path d="M15 7v2M15 11v2M15 15v2"/>'],
    ["Theatre masks",'<path d="M3 5c3 1 6 1 9 0v6a4.5 4.5 0 0 1-9 0z"/><path d="M12 9c3 1 6 1 9 0v6a4.5 4.5 0 0 1-9 0"/><path d="M5.5 8.5H7M8.5 8.5H10M5.8 12.5a2 2 0 0 0 3.4 0M14.5 12.5H16M17.5 12.5H19M14.8 17.5a2 2 0 0 1 3.4 0"/>'],
    ["Director's chair",'<path d="M5 4v8M19 4v8M5 6.5h14M5 12h14M6.5 12 17.5 20M17.5 12 6.5 20"/>'],
    ["Megaphone",'<path d="M3 10v4a1 1 0 0 0 1 1h2l8 4V5L6 9H4a1 1 0 0 0-1 1z"/><path d="m6 15 1.5 5h2l-1-4.5"/><path d="M18 9a4 4 0 0 1 0 6"/>'],
    ["Star",'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'],
    ["Film strip",'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 3v18M16 3v18M4 7.5h4M4 12h4M4 16.5h4M16 7.5h4M16 12h4M16 16.5h4"/>'],
    ["3D glasses",'<path d="M2 9h20v5a2 2 0 0 1-2 2h-4.5l-2-2.5h-3l-2 2.5H4a2 2 0 0 1-2-2z"/><path d="M5 11.5h4M15 11.5h4"/>'],
    ["Award",'<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9.5 17h5v3h-5z"/>']
  ];
  // Velvet red, gold, teal, navy, plum, terracotta, forest, charcoal: all dark enough for a cream icon on top.
  var AV_COLORS = ["#9f1d2d","#a16207","#0f766e","#1e3a8a","#7e2e5c","#b4532a","#2f6b4f","#3b3330"];
  function hnum(str){ var n=0; for(var i=0;i<str.length;i++) n=(n*31+str.charCodeAt(i))>>>0; return n }
  function avatar(hash,size){
    var n=hnum(String(hash||"")), ic=ICONS[n%ICONS.length];
    var a=document.createElement("span"); a.className="av"; a.style.background=AV_COLORS[(n>>>8)%AV_COLORS.length];
    if(size){ a.style.width=a.style.height=size+"px" }
    a.title=ic[0]; a.setAttribute("aria-hidden","true");
    a.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+ic[1]+'</svg>';
    return a;
  }
  function byline(s){
    return s.owner_hash===me.hash ? "written by you" : s.example ? "written by someone like you" : "written by anonymous "+tagOf(s.owner_hash);
  }

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
    $("go2").disabled=true; $("m2").textContent = editing ? "Saving your changes…" : "Pinning it up…";
    try{
      if(editing){ await store.updateScript(editing,draftTitle,body); justPosted=false }
      else { lsSet("toml_mine", await store.addScript(draftTitle,body)); justPosted=true }
      stopEditing(); $("bo").value=""; $("ti").value=""; $("cnt").textContent="0"; $("m2").textContent="";
      await refresh(); show("dash");
    }catch(e){
      $("m2").textContent="We couldn't save it just now. Your words are safe here — please try again.";
      $("go2").disabled=false;
    }
  });

  // Editing reuses the two writing steps, prefilled, with the labels switched.
  function startEditing(s){
    editing=s.id;
    $("ti").value=s.title; $("ti").dispatchEvent(new Event("input"));
    $("bo").value=s.body; $("bo").dispatchEvent(new Event("input"));
    $("go2").textContent="Save changes";
    document.querySelector("#s1 .q-big").textContent="Edit your title";
    show("s1");
  }
  function stopEditing(){
    editing=null;
    $("go2").textContent="Pin it to the wall";
    document.querySelector("#s1 .q-big").textContent="What's the title of your film?";
  }
  async function deleteScript(s){
    if(!confirm("Delete “"+s.title+"”?\n\nIt will be removed from the wall for everyone, with its likes and comments. This can't be undone.")) return;
    try{
      await store.deleteScript(s.id);
      if(lsGet("toml_mine",null)===s.id) lsSet("toml_mine",null);
      justPosted=false; await refresh();
    }catch(e){ alert("We couldn't delete it just now. Please try again.") }
  }

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
    // Author tools sit in their own row at the top of the card, so the like row never has to wrap around them.
    if(s.owner_hash===me.hash && !s.example){
      var own=document.createElement("div"); own.className="own";
      var eb=document.createElement("button"); eb.type="button"; eb.textContent="Edit"; eb.setAttribute("aria-label","Edit “"+s.title+"”");
      eb.addEventListener("click",function(){ startEditing(s) });
      var db=document.createElement("button"); db.type="button"; db.className="danger"; db.textContent="Delete"; db.setAttribute("aria-label","Delete “"+s.title+"”");
      db.addEventListener("click",function(){ deleteScript(s) });
      own.append(eb,db); card.appendChild(own);
    }
    var t=document.createElement("p"); t.className="t"; t.textContent=s.title; card.appendChild(t);
    var by=document.createElement("p"); by.className="by";
    var byText=document.createElement("span"); byText.textContent = byline(s) + (s.edited_at ? " · edited" : "");
    by.append(avatar(s.owner_hash), byText);
    card.appendChild(by);
    // Long scripts scroll inside a fixed-height box; tapping the box (or "Read the full script") opens the big reader.
    var b=document.createElement("p"); b.className="b"; b.textContent=s.body;
    b.addEventListener("click",function(){ if(card.classList.contains("long") && !getSelection().toString()) openReader(s) });
    card.appendChild(b);
    var mb=document.createElement("button"); mb.type="button"; mb.className="more"; mb.textContent="Read the full script ⤢";
    mb.addEventListener("click",function(){ openReader(s) });
    card.appendChild(mb);
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
      var p=document.createElement("p"), tx=document.createElement("span"); tx.textContent=x.text;
      p.append(avatar(x.owner_hash||"anon",24), tx);
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

  // Only scripts that are taller than their box get the scrollbar styling and the "read full" button.
  function markLong(){
    document.querySelectorAll(".script").forEach(function(card){
      var b=card.querySelector(".b"); if(!b) return;
      var long=b.scrollHeight>b.clientHeight+2;
      card.classList.toggle("long",long);
      if(long){ b.tabIndex=0; b.setAttribute("aria-label","Script text, scrollable") } else { b.removeAttribute("tabindex"); b.removeAttribute("aria-label") }
    });
  }
  addEventListener("resize",function(){ if(!$("dash").hidden) markLong() });

  function openReader(s){
    $("rdTitle").textContent=s.title;
    var t=document.createElement("span"); t.textContent=byline(s);
    $("rdBy").replaceChildren(avatar(s.owner_hash,30), t);
    $("rdBody").textContent=s.body;
    var d=$("reader"); d.showModal ? d.showModal() : d.setAttribute("open",""); d.querySelector(".rdscroll").scrollTop=0;
    document.documentElement.classList.add("noscroll");
  }
  function closeReader(){ var d=$("reader"); d.close ? d.close() : d.removeAttribute("open") }
  $("rdClose").addEventListener("click",closeReader);
  $("reader").addEventListener("close",function(){ document.documentElement.classList.remove("noscroll") });
  $("reader").addEventListener("click",function(e){ if(e.target===this) closeReader() }); // tap outside the page to close

  function empty(text,full){ var e=document.createElement("div"); e.className="empty"; if(full) e.style.gridColumn="1/-1"; e.textContent=text; return e }

  function draw(){
    if($("dash").hidden||!store) return;
    var keep={}; document.querySelectorAll("input[data-k]").forEach(function(i){ if(i.value) keep[i.dataset.k]=i.value });
    var focusK=document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;

    $("thanks").hidden=!justPosted;
    var note=$("note");
    note.hidden=store.shared;
    if(!store.shared) note.textContent = sharedError
      ? "Couldn't reach the shared wall, so you're seeing a private copy in this browser. Please try again in a moment. ("+(sharedError.message||sharedError.code||"connection error")+")"
      : "You're in local mode: scripts are saved only in this browser, and the cards marked “Example” are samples. Connect a database to share the wall with everyone (see the README).";

    var ya=document.createElement("span"); ya.textContent="You appear on the wall as";
    var yt=document.createElement("b"); yt.textContent=tagOf(me.hash);
    $("youAre").replaceChildren(ya, avatar(me.hash,30), yt);
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

    markLong();
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
    if(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase){
      try{ store = supabaseStore(CFG); await store.load() }catch(e){ store=null; sharedError=e; console.warn("Shared wall unavailable, using local mode",e) }
    }
    if(!store) store = localStore();
    await refresh();
    if(store.subscribe) store.subscribe(function(){ refresh() });
    show(myScript() ? "dash" : "welcome");
  })();
})();
