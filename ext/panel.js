// panel.js — Deviation Bag panel. Shows the viewer's own collection (same on every channel).
(function () {
  "use strict";
  var API = window.DH_API || "https://ohdeviationhunt-production.up.railway.app";
  var app = document.getElementById("app");
  var who = document.getElementById("who");
  var token = null, bag = null, view = { cat: "all", ownedOnly: false, open: null };

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
      .catch(function () { el('<div class="msg">Couldn’t load your Deviation Bag right now. Try again in a minute.</div>'); });
  }

  function askIdentity(botLogin) {
    who.textContent = "";
    el('<div class="msg"><p>See every deviation you’ve secured — on any channel running Deviation Hunt.</p>' +
       '<p>Twitch needs you to share your username with this panel once.</p>' +
       '<button class="btn" id="share">Show my Deviation Bag</button></div>');
    document.getElementById("share").onclick = function () { window.Twitch.ext.actions.requestIdShare(); };
  }

  function render() {
    if (view.open) return renderDetail(view.open);
    var s = bag.stats, p = bag.player;
    who.textContent = p ? p.display + " · " + p.starchrom.toLocaleString() + " Starchrom · " + p.units + " Securement Units" : "";
    if (!p || !s.total) {
      el('<div class="msg"><p>Your Deviation Bag is empty.</p><p>When a deviation breaches containment in chat, type <b>!secure</b> to catch it. Get free Securement Units with <b>!daily</b>.</p></div>' + gridHtml());
      bindGrid(); return;
    }
    var pct = Math.round(s.unique / s.all * 100);
    el('<div class="stats"><div class="stat"><b>' + s.unique + '/' + s.all + '</b>deviations</div>' +
       '<div class="stat"><b>' + s.variants + '</b>variants &amp; skins</div>' +
       '<div class="stat"><b>' + s.total + '</b>secured</div></div>' +
       '<div class="bar"><i id="barfill"></i></div>' + gridHtml() +
       (bag.page ? '<footer><a href="' + esc(bag.page) + '" target="_blank" rel="noopener">Open full Deviation Bag ↗</a></footer>' : ""));
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

  function card(d) {
    var got = caughtVariants(d), top = got[0];
    var cls = "dev" + (d.owned ? "" : " missing") + (top ? " shiny" + (top.kind === "skin" ? " skin" : "") : "");
    var r = d.best ? '<div class="r">Skill ' + d.best.skill + ' \u00b7 Act ' + d.best.activity + '</div>' : "";
    return '<div class="' + cls + '" data-id="' + esc(d.id) + '">' +
      (d.owned ? '<span class="c">\u00d7' + d.count + '</span>' : "") +
      (top ? '<span class="vb">\u2728 ' + got.length + '</span>' : "") +
      '<img loading="lazy" src="' + esc((top && top.img) || d.img) + '" alt=""><div class="n">' + (d.owned ? esc(d.name) : "???") + '</div>' +
      (top ? '<div class="vn">' + esc(top.name) + '</div>' : "") + r + '</div>';
  }

  function bindGrid() {
    Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (b) { b.onclick = function () { view.cat = b.getAttribute("data-cat"); render(); }; });
    var o = document.getElementById("owned"); if (o) o.onchange = function () { view.ownedOnly = o.checked; render(); };
    Array.prototype.forEach.call(document.querySelectorAll(".dev"), function (c) {
      c.onclick = function () { var d = find(c.getAttribute("data-id")); if (d && d.owned) { view.open = d.id; render(); window.scrollTo(0, 0); } };
    });
  }

  function find(id) { for (var i = 0; i < bag.deviations.length; i++) if (bag.deviations[i].id === id) return bag.deviations[i]; return null; }

  function renderDetail(id) {
    var d = find(id), b = d.best;
    var topV = caughtVariants(d)[0];
    var html = '<button class="btn ghost" id="back">← Back</button><div class="detail"><div class="hero"><img src="' + esc((topV && topV.img) || d.img) + '" alt="">' +
      (topV ? '<div class="vn big' + (topV.kind === "skin" ? " skin" : "") + '">✨ ' + (topV.kind === "skin" ? "Skin" : "Variation") + ': ' + esc(topV.name) + '</div>' : "") +
      '<h2>' + esc(d.name) + '</h2><div class="sub">' + esc(d.category.charAt(0).toUpperCase() + d.category.slice(1)) + ' · secured ×' + d.count + '</div></div>';
    if (b) {
      html += '<h3>Best specimen' + (b.variant ? " — " + esc(b.variant) : "") + '</h3>' +
        '<div class="ratings"><div><b>' + b.skill + '/5</b>Skill Rating</div><div><b>' + b.activity + '/5</b>Activity Rating</div></div>' +
        b.traits.map(function (t) { return '<div class="trait"><div class="h"><span>' + t.slot + '</span>' + esc(t.name) + '</div>' + (t.effect ? '<div class="e">' + esc(t.effect) + '</div>' : "") + '</div>'; }).join("");
    }
    if (d.variantsTotal) {
      var got = caughtVariants(d);
      html += '<h3>Variants &amp; skins (' + got.length + '/' + d.variantsTotal + ' caught)</h3><div class="chips">' +
        d.variants.map(function (v) {
          return '<span class="' + (v.owned ? "have " + v.kind : "") + '" title="' + (v.kind === "skin" ? "Skin" : "Variation") + '">' + (v.owned ? "\u2728 " : "") + esc(v.name) + '</span>';
        }).join("") + '</div>';
    }
    html += '</div>';
    el(html);
    document.getElementById("back").onclick = function () { view.open = null; render(); };
  }

  if (!window.Twitch || !window.Twitch.ext) { el('<div class="msg">This panel runs inside Twitch.</div>'); return; }
  window.Twitch.ext.onContext(function (ctx) { document.body.className = ctx.theme === "light" ? "light" : "dark"; });
  window.Twitch.ext.onAuthorized(function (auth) { token = auth.token; load(); });
  // refresh every couple of minutes so new catches show up while watching
  setInterval(function () { if (!view.open) load(); }, 120000);
})();
