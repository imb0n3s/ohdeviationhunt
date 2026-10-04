Object.assign(process.env,{TWITCH_CLIENT_ID:"x",TWITCH_CLIENT_SECRET:"x",ADMIN_KEY:"k",SESSION_SECRET:"s3cret-local",DATA_DIR:"/tmp/dhtest-trade",BASE_URL:"http://localhost:3997"});
require("fs").rmSync("/tmp/dhtest-trade",{recursive:true,force:true}); process.chdir(require("path").join(__dirname,".."));
const R=m=>require(require("path").join(__dirname,"..",m)); const crypto=require("crypto"); const assert=require("assert");
(async()=>{ const data=R("data"); await data.refresh(); await R("traits").refresh();
 const db=R("db"), game=R("game"), traits=R("traits");
 const seed=(uid,login,devs)=>{ const p=game.loadPlayer(uid,login,login); p.starchrom=1000; p.units={standard:5}; game.savePlayer(p);
   for(const [i,d] of devs.entries()){ const v=i===0?d.variants.find(x=>x.kind==="variation"):null; const variant=v?.name||""; db.q.addCatch.run(uid,d.id,variant,v?.kind||"base",Date.now(),"100"); const sp=traits.rollSpecimen(d.name,variant,d.variants.map(x=>x.name),d.category,null); db.q.addSpecimen.run({user_id:uid,deviation:d.id,variant,...sp,caught_at:Date.now(),channel:"100"}); } };
 const all=data.all(); seed("1","imbon3s",all.slice(0,12)); seed("2","luna_raventhorn",all.slice(10,22));
 const app=R("web").createApp({channels:new Map(),spawns:null}); const srv=app.listen(3997);
 const ck=(uid,login)=>{const body=Buffer.from(JSON.stringify({purpose:"session",uid,login,exp:Date.now()+864e5,ts:Date.now()})).toString("base64url");return "dh_user="+body+"."+crypto.createHmac("sha256","s3cret-local").update(body).digest("base64url");};
 const A=ck("1","imbon3s"), B=ck("2","luna_raventhorn");
 const go=(path,cookie,body)=>fetch("http://localhost:3997"+path,{method:body!==undefined?"POST":"GET",redirect:"manual",headers:{cookie,origin:"http://localhost:3997",...(body!==undefined?{"content-type":"application/x-www-form-urlencoded"}:{})},body}).then(async r=>({s:r.status,loc:r.headers.get("location"),t:await r.text()}));
 const specsA=db.q.userSpecimens.all("1"), specsB=db.q.userSpecimens.all("2");
 let r=await go("/trade/new?with=luna_raventhorn",A); assert.equal(r.s,200); assert.match(r.t,/You give/);
 const give=[specsA[0].id,specsA[1].id], get=[specsB[0].id];
 r=await go("/trade",A,`with=luna_raventhorn&give=${give[0]}&give=${give[1]}&get=${get[0]}`); assert.equal(r.loc,"/trade?m=sent");
 r=await go("/trade",A,`with=luna_raventhorn&give=${give[0]}&get=${get[0]}`); console.log("2nd offer same pair:",r.loc);
 r=await go("/u/luna_raventhorn",B); console.log("B banner:", /1 offer waiting/.test(r.t));
 const tid=R("trade").listFor("2")[0].id;
 r=await go(`/trade/${tid}/accept`,A,""); console.log("A cannot accept own:",r.loc);
 const beforeA=db.q.userSpecimens.all("1").length, beforeB=db.q.userSpecimens.all("2").length;
 r=await go(`/trade/${tid}/accept`,B,""); assert.equal(r.loc,"/trade?m=accepted");
 const afterA=db.q.userSpecimens.all("1"), afterB=db.q.userSpecimens.all("2");
 console.log("counts A",beforeA,"->",afterA.length,"B",beforeB,"->",afterB.length);
 assert(afterB.some(s=>s.id===give[0])&&afterB.some(s=>s.id===give[1])&&afterA.some(s=>s.id===get[0]));
 const moved=db.q.getSpecimen.get(give[0],"2"); console.log("kept ratings/variant:",moved.power+"/"+moved.mood,moved.variant||"(none)");
 console.log("catch rows ok:", !!db.q.getCatch.get("2",specsA[0].deviation,specsA[0].variant), db.q.getCatch.get("1",specsA[1].deviation,"")===undefined||db.q.getCatch.get("1",specsA[1].deviation,"").count>=0);
 // gone case
 const a2=db.q.userSpecimens.all("1"), b2=db.q.userSpecimens.all("2");
 r=await go("/trade",A,`with=luna_raventhorn&give=${a2[0].id}&get=${b2[0].id}`); const t2=R("trade").listFor("2")[0].id;
 db.raw.prepare("DELETE FROM specimens WHERE id=?").run(a2[0].id);
 r=await go(`/trade/${t2}/accept`,B,""); assert.equal(r.loc,"/trade?m=gone");
 // pods full case
 const a3=db.q.userSpecimens.all("1"), b3=db.q.userSpecimens.all("2");
 r=await go("/trade",A,`with=luna_raventhorn&give=${a3[0].id}&get=${b3[0].id}&get=${b3[1].id}`); const t3=R("trade").listFor("2")[0].id;
 const pa=game.loadPlayer("1","imbon3s","imbon3s"); pa.units={standard:100-game.podsUsed(pa)+pa.units.standard}; game.savePlayer(pa);
 r=await go(`/trade/${t3}/accept`,B,""); assert.equal(r.loc,"/trade?m=sender_full");
 r=await go("/trade",A,`with=imbon3s&give=${a3[0].id}&get=${a3[1].id}`); console.log("self trade ->",r.loc);
 r=await go("/trade",A,`with=nobodyhere&give=${a3[0].id}&get=1`); console.log("unknown player ->",r.loc);
 r=await fetch("http://localhost:3997/trade",{method:"POST",redirect:"manual",headers:{cookie:A,origin:"https://evil.example","content-type":"application/x-www-form-urlencoded"},body:"with=luna_raventhorn"}); assert.equal(r.status,403);
 // ---- log + reverse ----
 r=await go("/trade/log",B); assert.equal(r.s,200); assert.match(r.t,new RegExp(`#${tid} `)); assert.match(r.t,/Traded/); console.log("log shows",(r.t.match(/class="toffer"/g)||[]).length,"trades for B");
 r=await go("/trade/admin",B); assert.equal(r.s,403); console.log("non-owner admin page -> 403");
 r=await go(`/trade/${tid}/reverse`,B,"reason=x"); assert.equal(r.s,403); console.log("non-owner reverse -> 403");
 r=await go("/trade/admin",A); assert.equal(r.s,200); assert.match(r.t,/Reverse Trade/);
 r=await go(`/trade/${t3}/reverse`,A,""); assert.equal(r.loc,"/trade/admin?m=not_accepted");
 // reverse the first trade: B gave get[0] and still... give[0] was deleted? no — a2[0] may be one of them; check
 const holdsAll=give.every(id=>db.q.getSpecimen.get(id,"2"))&&get.every(id=>db.q.getSpecimen.get(id,"1"));
 if(!holdsAll){ r=await go(`/trade/${tid}/reverse`,A,""); console.log("reverse with a scrapped specimen ->",r.loc); assert.match(r.loc,/cant_reverse&missing=/);
   r=await go(r.loc,A); assert.match(r.t,/scrapped or traded on/); }
 // fresh trade, accept, then reverse cleanly
 const pa2=game.loadPlayer("1","imbon3s","imbon3s"); pa2.units={standard:5}; game.savePlayer(pa2);
 const a4=db.q.userSpecimens.all("1"), b4=db.q.userSpecimens.all("2");
 r=await go("/trade",A,`with=luna_raventhorn&give=${a4[0].id}&get=${b4[0].id}&get=${b4[1].id}`); const t4=R("trade").listFor("2")[0].id;
 r=await go(`/trade/${t4}/accept`,B,""); assert.equal(r.loc,"/trade?m=accepted");
 const cA=db.q.getCatch.get("1",b4[0].deviation,b4[0].variant||"");
 r=await go(`/trade/${t4}/reverse`,A,"reason=Wrong+deviation+picked"); assert.equal(r.loc,"/trade/admin?m=reversed");
 assert(db.q.getSpecimen.get(a4[0].id,"1")&&db.q.getSpecimen.get(b4[0].id,"2")&&db.q.getSpecimen.get(b4[1].id,"2"));
 assert.deepEqual(db.q.userSpecimens.all("1").map(x=>x.id).sort(),a4.map(x=>x.id).sort()); assert.deepEqual(db.q.userSpecimens.all("2").map(x=>x.id).sort(),b4.map(x=>x.id).sort());
 r=await go(`/trade/${t4}/reverse`,A,""); assert.equal(r.loc,"/trade/admin?m=not_accepted"); console.log("double reverse blocked");
 r=await go("/trade/log",B); assert.match(r.t,/Reversed by the game owner.*Wrong deviation picked/); console.log("B's log shows the reversal + reason");
 // snapshot survives scrapping
 db.raw.prepare("DELETE FROM specimens WHERE id=?").run(get[0]); r=await go("/trade/log",A); assert.match(r.t,/tchip gone" title="Since scrapped/); console.log("scrapped specimen still shown from snapshot");
 r=await go(`/trade/${tid}/reverse`,A,""); assert.equal(r.loc,`/trade/admin?m=cant_reverse&missing=${get[0]}`); r=await go(r.loc,A); assert.match(r.t,/scrapped or traded on since/); assert(db.q.getSpecimen.get(give[0],"2")); console.log("reverse refused (nothing moved) when a specimen is gone");
 r=await go("/trade/admin?player=luna_raventhorn",A); assert.equal(r.s,200);
 require("fs").writeFileSync("/tmp/dh-admin.html",(await go("/trade/admin",A)).t); require("fs").writeFileSync("/tmp/dh-log.html",(await go("/trade/log",B)).t);
 console.log("trade checks passed");
 srv.close(); process.exit(0);})().catch(e=>{console.error(e);process.exit(1)});
