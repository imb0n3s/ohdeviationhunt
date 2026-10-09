// panel.js — Securement Pods panel. Shows the viewer's own collection (same on every channel).
(function () {
  "use strict";
  var API = window.DH_API || "https://deviationhunt.ohwikiguide.com";
  var app = document.getElementById("app");
  var who = document.getElementById("who");
  var token = null, bag = null, view = { page: "bag", cat: "all", ownedOnly: false, open: null }, cart = {}, notice = null, busy = false;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(html) { app.innerHTML = html; }

  function load() {
    if (!token) return;
    fetch(API + "/ext/bag", { headers: { Authorization: "Bearer " + token } })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (j) {
        if (j.needsIdentity) return askIdentity(j.botLogin);
        bag = j; render();
      })
      .catch(function () { el('<div class="msg">Couldn’t load your Securement Pods right now. Try again in a minute.</div>'); });
  }

  function askIdentity(botLogin) {
    who.textContent = "";
    el('<div class="msg"><p>See every deviation you’ve secured — on any channel running Deviation Hunt.</p>' +
       '<p>Twitch needs you to share your username with this panel once.</p>' +
       '<button class="btn" id="share">Show my Securement Pods</button></div>');
    document.getElementById("share").onclick = function () { window.Twitch.ext.actions.requestIdShare(); };
  }

  // ---------- free hourly Securement Unit countdown (under the name) ----------
  var timerEl = document.getElementById("timer"), hourly = null, skew = 0, refetchAt = 0;
  function tickTimer() {
    if (!hourly) { timerEl.textContent = ""; timerEl.className = "timer"; return; }
    if (hourly.state === "needs_daily") { timerEl.textContent = "🎁 Type !daily in a live stream to start free hourly Securement Units"; timerEl.className = "timer idle"; return; }
    if (hourly.state === "paused") { timerEl.textContent = "🎁 Free unit timer paused — use a game command in a live stream to resume"; timerEl.className = "timer idle"; return; }
    var left = Math.max(0, Math.ceil((hourly.at - (Date.now() + skew)) / 1000));
    if (left <= 0) {
      timerEl.textContent = "🎁 Free Securement Unit arriving…"; timerEl.className = "timer soon";
      if (Date.now() > refetchAt && !busy) { refetchAt = Date.now() + 20000; setTimeout(load, 5000); } // the server pays it within a minute
      return;
    }
    var m = Math.floor(left / 60), sec = left % 60;
    timerEl.innerHTML = '🎁 Free Securement Unit in <b>' + m + ':' + (sec < 10 ? "0" : "") + sec + '</b>';
    timerEl.className = "timer" + (left <= 60 ? " soon" : "");
  }
  setInterval(tickTimer, 1000);

  function whoLine() {
    var p = bag && bag.player;
    hourly = p && p.hourly || null;
    if (p && p.now) skew = p.now - Date.now();
    tickTimer();
    var mp = document.getElementById("mypage");
    if (mp) { if (p && bag.page) { mp.href = bag.page; mp.hidden = false; } else mp.hidden = true; }
    who.textContent = p ? p.display + " · " + p.starchrom.toLocaleString() + " Starchrom · " + p.units + " Securement Unit" + (p.units === 1 ? "" : "s") : "";
  }

  function setPage(page) {
    view.page = page; view.open = null; notice = null;
    Array.prototype.forEach.call(document.querySelectorAll(".pages button"), function (b) { b.className = b.getAttribute("data-page") === page ? "on" : ""; });
    document.getElementById("title").textContent = page === "shop" ? "Shop" : page === "cmds" ? "Commands" : "Securement Pods";
    if (page === "cmds") return renderCommands();
    if (bag) render();
    window.scrollTo(0, 0);
  }

  // ---- Commands tab: the same list as the website's Commands page (works before sign-in too) ----
  var commands = null;
  function renderCommands() {
    if (!commands) {
      el('<div class="msg">Loading commands…</div>');
      fetch(API + "/ext/commands").then(function (r) { return r.json(); }).then(function (c) { commands = c; if (view.page === "cmds") renderCommands(); })
        .catch(function () { if (view.page === "cmds") el('<div class="msg">Couldn’t load the commands. Try again in a minute.</div>'); });
      return;
    }
    var kbd = function (t) { return esc(t).replace(/`([^`]+)`/g, "<kbd>$1</kbd>"); };
    el(commands.map(function (s) {
      return '<div class="sect">' + esc(s.title) + '</div>' + (s.note ? '<div class="hint">' + esc(s.note) + '</div>' : "") +
        '<div class="cmdlist">' + s.rows.map(function (r) { return '<div class="cmd"><kbd>' + esc(r[0]) + '</kbd><div>' + kbd(r[1]) + '</div></div>'; }).join("") + '</div>';
    }).join("") + '<div class="hint">Full list: deviationhunt.ohwikiguide.com/commands</div>');
  }

  function render() {
    if (view.page === "cmds") return renderCommands();
    whoLine();
    if (view.page === "shop") return renderShop();
    if (view.open) return renderDetail(view.open);
    var s = bag.stats, p = bag.player;
    if (!p || !s.total) {
      el('<div class="msg"><p>Your Securement Pods are empty.</p><p>When a deviation is spotted in the wild in chat, type <b>!secure</b> to catch it. Get free Securement Units with <b>!daily</b>.</p></div>' + gridHtml());
      bindGrid(); return;
    }
    var pct = Math.round(s.unique / s.all * 100);
    el('<div class="stats"><div class="stat"><b>' + s.unique + '/' + s.all + '</b>deviations</div>' +
       '<div class="stat"><b>' + (s.variations || 0) + '<small>/' + (s.allVariations || 0) + '</small></b>variations</div>' +
       '<div class="stat skin"><b>' + (s.skins || 0) + '<small>/' + (s.allSkins || 0) + '</small></b>skins</div>' +
       (bag.player && bag.player.unitCap ? '<div class="stat"><b>' + bag.player.podsUsed + '<small>/' + bag.player.unitCap + '</small></b>pods · ' + (bag.player.units || 0) + ' open</div></div>' : '<div class="stat"><b>' + s.total + '</b>secured</div></div>') +
       '<div class="bar"><i id="barfill"></i></div>' + gridHtml() +
       (bag.page ? '<footer><a href="' + esc(bag.page) + '" target="_blank" rel="noopener">Open my full collection ↗</a></footer>' : ""));
    document.getElementById("barfill").style.width = pct + "%"; // set via CSSOM (Twitch CSP blocks inline styles)
    bindGrid();
  }

  function gridHtml() {
    var cats = [["all", "All"], ["combat", "Combat"], ["crafting", "Crafting"], ["territory", "Territory"]];
    var list = bag.deviations.filter(function (d) { return (view.cat === "all" || d.category === view.cat) && (!view.ownedOnly || d.owned); });
    list.sort(function (a, b) { return (b.owned - a.owned) || a.name.localeCompare(b.name); });
    return '<div class="tabs">' + cats.map(function (c) { return '<button data-cat="' + c[0] + '" class="' + (view.cat === c[0] ? "on" : "") + '">' + c[1] + '</button>'; }).join("") + '</div>' +
      '<label class="toggle"><input type="checkbox" id="owned"' + (view.ownedOnly ? " checked" : "") + '> Only show what I own</label>' +
      '<div class="grid">' + (list.length ? list.map(card).join("") : '<div class="msg span">Nothing here yet.</div>') + '</div>';
  }

  // caught variations/skins, skins first (they're the rarest)
  function caughtVariants(d) {
    return (d.variants || []).filter(function (v) { return v.owned; }).sort(function (a, b) { return (b.kind === "skin") - (a.kind === "skin"); });
  }

  // the variant the card features = the one the server picked as the featured specimen (best skin > best variation)
  function featuredVariant(d, got) {
    var name = d.best && d.best.variant;
    for (var i = 0; name && i < got.length; i++) if (got[i].name === name) return got[i];
    return got[0];
  }

  function vCount(list, kind) { return list.filter(function (v) { return v.kind === kind; }).length; }

  function card(d) {
    var got = caughtVariants(d), top = featuredVariant(d, got);
    var cls = "dev" + (d.owned ? "" : " missing") + (top ? " shiny" + (top.kind === "skin" ? " skin" : "") : "");
    var r = d.best ? '<div class="r">Skill ' + d.best.skill + ' \u00b7 Act ' + d.best.activity + '</div>' : "";
    return '<div class="' + cls + '" data-id="' + esc(d.id) + '">' +
      (d.owned ? '<span class="c">\u00d7' + d.count + '</span>' : "") +
      (vCount(got, "variation") ? '<span class="vb">\u2728 ' + vCount(got, "variation") + '</span>' : "") +
      (vCount(got, "skin") ? '<span class="vb sk">\u2728 ' + vCount(got, "skin") + '</span>' : "") +
      '<img loading="lazy" src="' + esc((top && top.img) || d.img) + '" alt=""><div class="n">' + (d.owned ? esc(d.name) : "???") + '</div>' +
      (top ? '<div class="vn">' + esc(top.name) + '</div>' : "") + r + '</div>';
  }

  function bindGrid() {
    Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (b) { b.onclick = function () { view.cat = b.getAttribute("data-cat"); render(); }; });
    var o = document.getElementById("owned"); if (o) o.onchange = function () { view.ownedOnly = o.checked; render(); };
    Array.prototype.forEach.call(document.querySelectorAll(".dev"), function (c) {
      c.onclick = function () { var d = find(c.getAttribute("data-id")); if (d && d.owned) { view.open = d.id; confirmId = null; detailNotice = null; render(); window.scrollTo(0, 0); } };
    });
  }

  function find(id) { for (var i = 0; i < bag.deviations.length; i++) if (bag.deviations[i].id === id) return bag.deviations[i]; return null; }

  var confirmId = null, detailNotice = null;

  function traitHtml(t) {
    if (!t.name) return '<div class="trait empty"><div class="h"><span>' + t.slot + '</span>Empty slot</div></div>';
    return '<div class="trait"><div class="h"><span>' + t.slot + '</span>' + esc(t.name) + '</div>' + (t.effect ? '<div class="e">' + esc(t.effect) + '</div>' : "") + '</div>';
  }

  function renderDetail(id) {
    var d = find(id);
    if (!d || !d.owned) { view.open = null; return render(); }
    var topV = featuredVariant(d, caughtVariants(d));
    var specs = (d.specimens || []).slice(); // already best-first from the server (skin > variation > Legendary trait > rating)
    var canDestroy = d.count > 1, value = bag.destroyValue || 500, units = bag.destroyUnits == null ? 1 : bag.destroyUnits;
    var reward = value.toLocaleString() + ' Starchrom' + (units ? ' + ' + units + ' Securement Unit' + (units > 1 ? 's' : '') : '');
    var html = '<button class="btn ghost" id="back">← Back</button><div class="detail"><div class="hero"><img src="' + esc((topV && topV.img) || d.img) + '" alt="">' +
      (topV ? '<div class="vn big' + (topV.kind === "skin" ? " skin" : "") + '">✨ ' + (topV.kind === "skin" ? "Skin" : "Variation") + ': ' + esc(topV.name) + '</div>' : "") +
      '<h2>' + esc(d.name) + '</h2><div class="sub">' + esc(d.category.charAt(0).toUpperCase() + d.category.slice(1)) + ' · secured ×' + d.count + '</div></div>';
    if (detailNotice) html += '<div class="notice ' + detailNotice.kind + '">' + esc(detailNotice.text) + '</div>';
    html += '<h3>Your ' + esc(d.name) + ' (' + specs.length + ')</h3>';
    if (canDestroy) html += '<div class="hint left">Scrap an extra one for <b>' + reward + '</b>. You always keep at least one.</div>';
    html += specs.map(function (x, i) {
      var confirming = confirmId === x.id;
      return '<div class="spec' + (i === 0 ? " best" : "") + '">' +
        '<div class="sh"><div class="rt"><b>' + x.skill + '/5</b> Skill <b>' + x.activity + '/5</b> Activity' + (x.skill === 5 && x.activity === 5 ? " ⭐" : "") + '</div>' +
        (i === 0 ? '<span class="tag">Best</span>' : "") + '</div>' +
        (x.variant ? '<div class="vn">✨ ' + esc(x.variant) + '</div>' : "") +
        x.traits.map(traitHtml).join("") +
        (canDestroy ? (confirming
          ? '<div class="confirm"><span>Scrap this one for ' + reward + '?</span><button class="btn danger" data-act="yes" data-id="' + x.id + '"' + (busy ? " disabled" : "") + '>' + (busy ? "…" : "Scrap") + '</button><button class="btn ghost" data-act="no">Cancel</button></div>'
          : '<button class="btn outline" data-act="ask" data-id="' + x.id + '">Scrap for ' + reward + '</button>') : "") +
        '</div>';
    }).join("");
    if (d.count > specs.length) html += '<div class="hint left">' + (d.count - specs.length) + ' older catch' + (d.count - specs.length > 1 ? "es" : "") + ' from before ratings existed ' + (d.count - specs.length > 1 ? "have" : "has") + ' no ratings or traits.</div>';
    [["variation", "Variations"], ["skin", "Skins"]].forEach(function (k) {
      var list = (d.variants || []).filter(function (v) { return v.kind === k[0]; });
      if (!list.length) return;
      var have = list.filter(function (v) { return v.owned; }).length;
      html += '<h3>' + k[1] + ' (' + have + '/' + list.length + ' secured) · <span class="leg">Legendary</span></h3><div class="chips">' +
        list.map(function (v) {
          return '<span class="' + (v.owned ? "have " + v.kind : "") + '">' + (v.owned ? "✨ " : "") + esc(v.name) + '</span>';
        }).join("") + '</div>';
    });
    html += '</div>';
    el(html);
    document.getElementById("back").onclick = function () { view.open = null; confirmId = null; detailNotice = null; render(); };
    Array.prototype.forEach.call(document.querySelectorAll(".spec button"), function (b) {
      b.onclick = function () {
        var act = b.getAttribute("data-act");
        if (act === "ask") { confirmId = +b.getAttribute("data-id"); detailNotice = null; return renderDetail(id); }
        if (act === "no") { confirmId = null; return renderDetail(id); }
        if (act === "yes") destroy(+b.getAttribute("data-id"), id);
      };
    });
  }

  function destroy(specId, devId) {
    if (busy) return;
    busy = true; renderDetail(devId);
    fetch(API + "/ext/specimen/destroy", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ id: specId }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        busy = false; confirmId = null;
        if (res.ok) { bag = res.j.bag; detailNotice = { kind: "ok", text: "Scrapped — +" + res.j.gained.toLocaleString() + " Starchrom" + (res.j.units ? " and +" + res.j.units + " Securement Unit" + (res.j.units > 1 ? "s" : "") : "") + "." }; }
        else if (res.j.error === "needs_identity") return askIdentity();
        else if (res.j.error === "last_one") detailNotice = { kind: "err", text: "You can’t scrap your last one." };
        else detailNotice = { kind: "err", text: "Couldn’t scrap that one. Try again." };
        render();
      })
      .catch(function () { busy = false; detailNotice = { kind: "err", text: "Couldn’t reach the server. Try again in a minute." }; render(); });
  }

  // ---------- shop ----------
  function money(n) { return Number(n).toLocaleString(); }

  function renderShop() {
    var p = bag.player;
    if (!p) {
      el('<div class="msg"><p>You haven’t played yet.</p><p>Type <b>!secure</b> in chat the next time a deviation shows up — you’ll start with 5 Securement Units and 200 Starchrom, then you can shop here.</p></div>');
      return;
    }
    var html = '<div class="wallet"><div><b>' + money(p.starchrom) + '</b>Starchrom</div><div><b>' + p.units + '</b>empty Securement Units</div><div><b>' + esc(/^\d+m$/.test(p.nextUnitIn || "") ? p.nextUnitIn : (/daily/.test(p.nextUnitIn || "") ? "!daily" : "—")) + '</b>' + (/daily/.test(p.nextUnitIn || "") ? "for free units" : "next free unit") + '</div></div>';
    if (notice) html += '<div class="notice ' + notice.kind + '">' + esc(notice.text) + '</div>';
    var gl = (bag.shop || []).filter(function (it) { return it.kind === "gloves"; });
    html += (bag.shop || []).map(function (it) {
      if (it.kind === "gloves") return gloveHtml(it, p, it === gl[0]);
      if (it.kind === "soup") return soupHtml(it, p);
      var room = unitRoom(p), lim = Math.min(it.maxQty, room);
      var q = Math.min(cart[it.id] || 1, Math.max(1, lim)), total = q * it.price, afford = p.starchrom >= total;
      var maxAfford = Math.min(lim, Math.floor(p.starchrom / it.price));
      return '<div class="item" data-id="' + esc(it.id) + '">' +
        '<div class="ih"><img src="' + esc(it.icon) + '" alt=""><div><div class="in">' + esc(it.name) + '</div><div class="ip">' + money(it.price) + ' Starchrom each</div></div></div>' +
        '<div class="id">' + esc(it.desc) + '</div>' +
        '<div class="qty"><button data-act="dec">−</button><span>' + q + '</span><button data-act="inc">+</button>' +
        [5, 10].map(function (n) { return '<button data-act="set" data-n="' + n + '" class="quick">' + n + '</button>'; }).join("") +
        (maxAfford > 1 ? '<button data-act="set" data-n="' + maxAfford + '" class="quick">Max</button>' : "") + '</div>' +
        (room < 1 ? '<button class="btn buy" disabled>Securement Pods full (' + p.podsUsed + '/' + p.unitCap + ')</button>' :
        '<button class="btn buy" data-act="buy"' + (afford && !busy ? "" : " disabled") + '>' + (busy ? "Buying…" : afford ? "Buy " + q + " for " + money(total) + " Starchrom" : "Need " + money(total - p.starchrom) + " more Starchrom") + '</button>') +
        '</div>';
    }).join("");
    html += bitsHtml();
    html += '<div class="hint">Earn Starchrom by securing deviations in chat and <b>!daily</b>, or scrap extras in the Pods tab. You can also buy in chat with <b>!buy &lt;amount&gt;</b>.</div>';
    el(html);
    Array.prototype.forEach.call(document.querySelectorAll(".bitsbuy"), function (b) {
      b.onclick = function () { buyBits(b.getAttribute("data-sku")); };
    });
    Array.prototype.forEach.call(document.querySelectorAll(".item:not(.bits) button"), function (b) {
      b.onclick = function () {
        var id = b.closest(".item").getAttribute("data-id"), it = findItem(id), q = cart[id] || 1, act = b.getAttribute("data-act");
        if (act === "inc") q = Math.min(it.maxQty, unitRoom(bag.player), q + 1);
        if (act === "dec") q = Math.max(1, q - 1);
        if (act === "set") q = Math.max(1, Math.min(it.maxQty, unitRoom(bag.player), +b.getAttribute("data-n")));
        cart[id] = q;
        if (act === "buy") return buy(it, q);
        notice = null; renderShop();
      };
    });
  }

  // ---- Starchrom packs bought with Bits (only shown when Twitch has Bits turned on for this viewer) ----
  var bitsOn = false, bitsProducts = {};
  function bitsHtml() {
    var packs = (bag.bitsPacks || []).filter(function (x) { return bitsProducts[x.sku]; });
    if (!bitsOn || !packs.length) return "";
    return '<div class="sect">Starchrom with Bits</div><div class="item bits"><div class="id">1 Bit = 5 Starchrom · 50 Bits = 5 more Securement Pods (permanent). Bits used here support the streamer.</div><div class="packs">' +
      packs.map(function (x) {
        var cost = bitsProducts[x.sku].cost && bitsProducts[x.sku].cost.amount || x.bits;
        // Artisan's Touch: restores the gloves you wear (only when they've used some catches)
        if (x.restoreGloves) { var gp = bag.player, worn = !!gp.glove; return '<button class="btn bitsbuy" data-sku="' + esc(x.sku) + '"' + (busy || !worn ? " disabled" : "") + '><b>Artisan’s Touch</b> ' + (worn ? "restore your gloves (" + (gp.gloveLeft || 0) + " catches left)" : "wear gloves to use it") + '<span>' + cost + ' Bits</span></button>'; }
        return '<button class="btn bitsbuy" data-sku="' + esc(x.sku) + '"' + (busy ? " disabled" : "") + '><b>' + (x.capacity ? "+" + x.capacity : money(x.starchrom)) + '</b> ' + (x.capacity ? "Securement Pod space" : "Starchrom") + '<span>' + cost + ' Bits</span></button>';
      }).join("") + '</div></div>';
  }
  function buyBits(sku) {
    if (busy) return;
    busy = true; notice = null; renderShop();
    window.Twitch.ext.bits.useBits(sku);
  }
  function initBits() {
    var ext = window.Twitch.ext;
    if (!ext.features || !ext.bits) return;
    bitsOn = !!ext.features.isBitsEnabled;
    if (ext.features.onChanged) ext.features.onChanged(function () { bitsOn = !!ext.features.isBitsEnabled; if (bag && view.page === "shop") renderShop(); });
    ext.bits.getProducts().then(function (ps) {
      (ps || []).forEach(function (p) { bitsProducts[p.sku] = p; });
      if (bag && view.page === "shop") renderShop();
    }).catch(function () {});
    ext.bits.onTransactionCancelled(function () { busy = false; if (view.page === "shop") renderShop(); });
    ext.bits.onTransactionComplete(function (tx) {
      fetch(API + "/ext/bits/complete", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ receipt: tx.transactionReceipt }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          busy = false;
          if (res.j.error === "wrong_user") return;
          if (res.j.player) bag.player = res.j.player;
          notice = res.ok ? { kind: "ok", text: (res.j.restored ? res.j.restored + " restored — like new again!" : res.j.capacity ? "+" + res.j.capacity + " Securement Pod space" : "+" + money(res.j.starchrom) + " Starchrom") + " — thanks for the Bits!" } : { kind: "err", text: "Your Bits went through but the Starchrom didn’t arrive yet. Refresh the panel; if it’s still missing, tell the streamer." };
          whoLine(); if (view.page === "shop") renderShop();
        })
        .catch(function () { busy = false; notice = { kind: "err", text: "Couldn’t reach the game to add your Starchrom. Refresh the panel in a minute." }; renderShop(); });
    });
  }

  function soupHtml(it, p) {
    var afford = p.starchrom >= it.price, left = p.soupMin || 0;
    return '<div class="item soup" data-id="' + esc(it.id) + '" style="--gc:' + esc(it.color || "#fb923c") + '">' +
      '<div class="ih"><div class="gicon"><img src="' + esc(it.icon) + '" alt=""></div><div><div class="in">' + esc(it.name) + '</div>' +
      '<div class="ip">+' + (it.bonus * 100) + '% catch chance for 1 hour · ' + money(it.price) + ' Starchrom</div></div></div>' +
      '<div class="id">' + esc(it.desc) + '</div>' +
      (left ? '<div class="soupon">🍲 Active — ' + left + ' min left</div>' : "") +
      '<button class="btn buy" data-act="buy"' + (afford && !busy ? "" : " disabled") + '>' + (busy ? "Buying…" : afford ? (left ? "Add 1 hour for " : "Buy for ") + money(it.price) + " Starchrom" : "Need " + money(it.price - p.starchrom) + " more Starchrom") + '</button></div>';
  }

  function gloveHtml(it, p, first) {
    var owned = (p.gloves || []).indexOf(it.glove) >= 0, active = p.glove === it.glove, afford = p.starchrom >= it.price;
    var better = !owned && (bag.shop || []).some(function (g) { return g.kind === "gloves" && g.glove === p.glove && g.bonus > it.bonus; });
    var btn = owned ? '<button class="btn buy owned" disabled>' + (active ? "✓ Owned · active" : "✓ Owned") + '</button>'
      : better ? '<button class="btn buy owned" disabled>You wear better gloves</button>'
      : '<button class="btn buy" data-act="buy"' + (afford && !busy ? "" : " disabled") + '>' + (busy ? "Buying…" : afford ? "Buy for " + money(it.price) + " Starchrom" : "Need " + money(it.price - p.starchrom) + " more Starchrom") + '</button>';
    return (first ? '<div class="sect">Gloves</div>' : "") +
      '<div class="item glove' + (active ? " active" : "") + '" data-id="' + esc(it.id) + '" style="--gc:' + esc(it.color || "#9fb0c0") + '">' +
      '<div class="ih"><div class="gicon">' + (it.icon ? '<img src="' + esc(it.icon) + '" alt="">' : "🧤") + '</div><div><div class="in">' + esc(it.name) + ' <span class="rar">' + esc(it.rarity || "") + '</span></div>' +
      '<div class="ip">+' + Math.round((it.bonus || 0) * 100) + '% catch chance · ' + money(it.price) + ' Starchrom</div></div></div>' +
      '<div class="id">' + esc(it.desc) + '</div>' + btn + '</div>';
  }

  function unitRoom(p) { return p.unitCap ? Math.max(0, p.unitCap - (p.podsUsed != null ? p.podsUsed : p.units)) : 100; }

  function findItem(id) { for (var i = 0; i < bag.shop.length; i++) if (bag.shop[i].id === id) return bag.shop[i]; return null; }

  function buy(it, q) {
    if (busy) return;
    busy = true; renderShop();
    fetch(API + "/ext/shop/buy", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ item: it.id, qty: q }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        busy = false;
        if (res.j.player) bag.player = res.j.player;
        if (res.ok) { notice = { kind: "ok", text: "Bought " + (it.kind === "gloves" ? it.name : it.kind === "soup" ? "Capture Soup — +" + (it.bonus * 100) + "% for " + ((res.j.player && res.j.player.soupMin) || 60) + " min" : res.j.qty + " " + it.name + (res.j.qty > 1 ? "s" : "")) + " for " + money(res.j.cost) + " Starchrom." }; cart[it.id] = 1; }
        else if (res.j.error === "needs_identity") return askIdentity();
        else if (res.j.error === "not_enough") notice = { kind: "err", text: "Not enough Starchrom for that." };
        else if (res.j.error === "full" || res.j.error === "too_many") notice = { kind: "err", text: "That goes over your " + (res.j.player && res.j.player.unitCap || 100) + " Securement Pods (caught + empty)." };
        else if (res.j.error === "outclassed") notice = { kind: "err", text: "You already wear better gloves." };
        else if (res.j.error === "owned") notice = { kind: "err", text: "You already own " + it.name + "." };
        else notice = { kind: "err", text: res.j.message || "Couldn’t complete that purchase. Try again." };
        render();
      })
      .catch(function () { busy = false; notice = { kind: "err", text: "Couldn’t reach the shop. Try again in a minute." }; render(); });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".pages button"), function (b) { b.onclick = function () { setPage(b.getAttribute("data-page")); }; });

  if (!window.Twitch || !window.Twitch.ext) { el('<div class="msg">This panel runs inside Twitch.</div>'); return; }
  window.Twitch.ext.onContext(function (ctx) { document.body.className = ctx.theme === "light" ? "light" : "dark"; });
  window.Twitch.ext.onAuthorized(function (auth) { token = auth.token; load(); });
  try { initBits(); } catch (e) {}
  // refresh every couple of minutes so new catches show up while watching
  setInterval(function () { if (!view.open && !busy) load(); }, 120000);
})();
