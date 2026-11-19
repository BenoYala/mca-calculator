(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // Daily payments: 22 business days per month (252 per year). Weekly: 52 per year.
  var FREQ = {
    daily:  { perYear: 252, perMonth: 22,      label: "Daily payment" },
    weekly: { perYear: 52,  perMonth: 52 / 12, label: "Weekly payment" }
  };
  var INPUTS = ["amount", "factor", "term", "fee", "freq"];
  var DEFAULTS = { amount: "50000", factor: "1.3", term: "6", fee: "0", freq: "daily" };
  var OFFERS_KEY = "mca_offers_v1";
  var LAST_KEY = "mca_last_v1";
  var MAX_OFFERS = 10;

  function money(n) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function pct(n) {
    if (n >= 1000) return Math.round(n).toLocaleString("en-US") + "%";
    return n.toFixed(1) + "%";
  }

  // storage helpers (may be unavailable in private mode)
  function readStore(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
  function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }

  // Solve net = pay * (1 - (1 + r)^-n) / r for the periodic rate r (bisection).
  function solveRate(net, pay, n) {
    if (pay * n <= net) return 0;
    var lo = 0, hi = 10, i, r, pv;
    for (i = 0; i < 300; i++) {
      r = (lo + hi) / 2;
      pv = pay * (1 - Math.pow(1 + r, -n)) / r;
      if (pv > net) lo = r; else hi = r;
    }
    return (lo + hi) / 2;
  }

  function compute(amount, factor, months, feePct, freqKey) {
    var f = FREQ[freqKey];
    var n = Math.max(1, Math.round(months * f.perMonth));
    var payback = amount * factor;
    var net = amount * (1 - feePct / 100);
    var cost = payback - net;
    var pay = payback / n;
    var r = solveRate(net, pay, n);
    return {
      n: n, r: r, payback: payback, net: net, cost: cost, pay: pay,
      apr: r * f.perYear * 100,
      eff: (Math.pow(1 + r, f.perYear) - 1) * 100,
      flat: (cost / net) / (months / 12) * 100,
      perDollar: cost / net
    };
  }

  // Month-by-month split of payments into principal and cost (accounting view at the solved rate).
  function schedule(res, months, perMonth) {
    var rows = [], bal = res.net, k = 0, M = Math.ceil(months), m, end, interest, princ, row;
    for (m = 1; m <= M; m++) {
      end = (m === M) ? res.n : Math.min(res.n, Math.round(m * perMonth));
      row = { m: m, count: 0, paid: 0, cost: 0, princ: 0, bal: 0 };
      while (k < end) {
        interest = bal * res.r; princ = res.pay - interest; bal -= princ;
        row.cost += interest; row.princ += princ; row.paid += res.pay; row.count++; k++;
      }
      row.bal = Math.max(0, bal);
      rows.push(row);
    }
    return rows;
  }

  var els = {
    amount: $("amount"), factor: $("factor"), term: $("term"),
    fee: $("fee"), freq: $("freq"),
    apr: $("apr"), meter: $("meter-cover"), msg: $("msg"),
    payback: $("payback"), cost: $("cost"), net: $("net"),
    pay: $("pay"), payLabel: $("pay-label"), count: $("count"),
    eff: $("eff"), flat: $("flat"), perDollar: $("per-dollar"),
    got: $("bar-got"), costBar: $("bar-cost"), legendGot: $("lg-got"), legendCost: $("lg-cost")
  };
  if (!els.amount) return;

  var current = null; // last valid result + inputs

  function setInvalid(el, bad) { el.setAttribute("aria-invalid", bad ? "true" : "false"); }
  function clearSchedule() { var b = $("sched-body"); if (b) b.textContent = ""; }

  function empty(message) {
    current = null;
    els.apr.textContent = "—";
    els.apr.setAttribute("data-level", "none");
    els.meter.style.width = "100%";
    ["payback", "cost", "net", "pay", "count", "eff", "flat", "perDollar"].forEach(function (k) { els[k].textContent = "—"; });
    els.got.style.width = "0%"; els.costBar.style.width = "0%";
    els.legendGot.textContent = "You receive";
    els.legendCost.textContent = "Cost of the advance";
    els.msg.textContent = message || "";
    clearSchedule();
  }

  function cell(tag, text, cls) {
    var c = document.createElement(tag);
    c.textContent = text;
    if (cls) c.className = cls;
    return c;
  }

  function renderSchedule(res, months, freqKey) {
    var body = $("sched-body");
    if (!body) return;
    body.textContent = "";
    var rows = schedule(res, months, FREQ[freqKey].perMonth);
    var tp = 0, tc = 0, tpr = 0;
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.appendChild(cell("th", String(r.m)));
      tr.appendChild(cell("td", String(r.count), "num"));
      tr.appendChild(cell("td", money0(r.paid), "num"));
      tr.appendChild(cell("td", money0(r.princ), "num"));
      tr.appendChild(cell("td", money0(r.cost), "num"));
      tr.appendChild(cell("td", money0(r.bal), "num"));
      body.appendChild(tr);
      tp += r.paid; tc += r.cost; tpr += r.princ;
    });
    var tot = document.createElement("tr");
    tot.className = "total";
    tot.appendChild(cell("th", "Total"));
    tot.appendChild(cell("td", String(res.n), "num"));
    tot.appendChild(cell("td", money0(tp), "num"));
    tot.appendChild(cell("td", money0(tpr), "num"));
    tot.appendChild(cell("td", money0(tc), "num"));
    tot.appendChild(cell("td", "", "num"));
    body.appendChild(tot);
  }

  function snapshotInputs() {
    var o = {};
    INPUTS.forEach(function (id) { o[id] = els[id].value; });
    return o;
  }

  function update() {
    var amount = parseFloat(els.amount.value);
    var factor = parseFloat(els.factor.value);
    var months = parseFloat(els.term.value);
    var fee = parseFloat(els.fee.value);
    if (isNaN(fee)) fee = 0;
    var freqKey = els.freq.value === "weekly" ? "weekly" : "daily";

    writeStore(LAST_KEY, snapshotInputs());

    var badAmount = !(amount > 0);
    var badFactor = !(factor > 1 && factor <= 3);
    var badTerm = !(months >= 1 && months <= 36);
    var badFee = fee < 0 || fee >= 50;
    setInvalid(els.amount, badAmount && els.amount.value !== "");
    setInvalid(els.factor, badFactor && els.factor.value !== "");
    setInvalid(els.term, badTerm && els.term.value !== "");
    setInvalid(els.fee, badFee);

    if (badAmount || badFactor || badTerm || badFee) {
      var m = "Enter an amount above 0, a factor rate between 1.01 and 3, a term of 1 to 36 months, and fees from 0% to under 50%.";
      if (els.amount.value === "" && els.factor.value === "" && els.term.value === "") m = "";
      empty(m);
      return;
    }

    var res = compute(amount, factor, months, fee, freqKey);
    current = { res: res, amount: amount, factor: factor, months: months, fee: fee, freq: freqKey };
    els.msg.textContent = "";
    els.apr.textContent = pct(res.apr);
    els.apr.setAttribute("data-level", res.apr < 36 ? "low" : (res.apr < 100 ? "mid" : "high"));
    els.meter.style.width = (100 - Math.min(100, res.apr / 300 * 100)) + "%";

    els.payback.textContent = money(res.payback);
    els.cost.textContent = money(res.cost);
    els.net.textContent = money(res.net);
    els.payLabel.textContent = FREQ[freqKey].label;
    els.pay.textContent = money(res.pay);
    els.count.textContent = res.n.toLocaleString("en-US") + (freqKey === "daily" ? " business days" : " weeks");
    els.eff.textContent = pct(res.eff);
    els.flat.textContent = pct(res.flat);
    els.perDollar.textContent = "$" + res.perDollar.toFixed(2);

    var gotPct = Math.max(0, Math.min(100, res.net / res.payback * 100));
    els.got.style.width = gotPct + "%";
    els.costBar.style.width = (100 - gotPct) + "%";
    els.legendGot.textContent = "You receive " + money0(res.net);
    els.legendCost.textContent = "Cost " + money0(res.cost);

    renderSchedule(res, months, freqKey);
  }

  /* ---------------- restore: URL params > last used > defaults ---------------- */
  function applyValues(values) {
    INPUTS.forEach(function (id) {
      if (values[id] === undefined || values[id] === null) return;
      var el = els[id], v = String(values[id]);
      if (el.tagName === "SELECT") {
        var ok = false, i;
        for (i = 0; i < el.options.length; i++) if (el.options[i].value === v) ok = true;
        if (ok) el.value = v;
      } else if (v === "" || isFinite(parseFloat(v))) {
        el.value = v;
      }
    });
  }
  (function restore() {
    var fromUrl = {}, has = false;
    try {
      var p = new URLSearchParams(location.search);
      INPUTS.forEach(function (id) { if (p.has(id)) { fromUrl[id] = p.get(id); has = true; } });
    } catch (e) {}
    if (has) { applyValues(fromUrl); return; }
    var last = readStore(LAST_KEY);
    if (last && typeof last === "object") applyValues(last);
  })();

  INPUTS.forEach(function (id) { els[id].addEventListener(id === "freq" ? "change" : "input", update); });

  /* ---------------- buttons ---------------- */
  var actMsg = $("act-msg");
  var actTimer;
  function say(text) {
    if (!actMsg) return;
    actMsg.textContent = text;
    clearTimeout(actTimer);
    actTimer = setTimeout(function () { actMsg.textContent = ""; }, 3500);
  }

  var reset = $("reset");
  if (reset) reset.addEventListener("click", function () { applyValues(DEFAULTS); update(); say("Example restored."); });

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { say("Could not copy. Long-press the address bar to copy the link."); }
    document.body.removeChild(ta);
  }
  var share = $("share");
  if (share) share.addEventListener("click", function () {
    var p = new URLSearchParams();
    INPUTS.forEach(function (id) { p.set(id, els[id].value); });
    var url = location.origin + location.pathname + "?" + p.toString();
    var done = function () { say("Link copied. Anyone who opens it sees these numbers."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, done); });
    else fallbackCopy(url, done);
  });

  /* ---------------- saved offers ---------------- */
  var offers = [];
  function loadOffers() { var o = readStore(OFFERS_KEY); offers = Array.isArray(o) ? o : []; }

  function renderOffers() {
    var body = $("saved-body"), wrap = $("saved-wrap"), emptyEl = $("saved-empty"), clearBtn = $("clear-all");
    if (!body) return;
    body.textContent = "";
    wrap.style.display = offers.length ? "" : "none";
    emptyEl.style.display = offers.length ? "none" : "";
    clearBtn.style.display = offers.length ? "" : "none";
    var minApr = Infinity;
    offers.forEach(function (o) { if (o.apr < minApr) minApr = o.apr; });
    offers.forEach(function (o, idx) {
      var tr = document.createElement("tr");
      tr.appendChild(cell("th", o.name));
      tr.appendChild(cell("td", pct(o.apr), "num" + (offers.length > 1 && o.apr === minApr ? " win" : "")));
      tr.appendChild(cell("td", money0(o.cost), "num"));
      tr.appendChild(cell("td", money0(o.amount), "num"));
      tr.appendChild(cell("td", Number(o.factor).toFixed(2), "num"));
      tr.appendChild(cell("td", o.term + " mo", "num"));
      var act = document.createElement("td");
      act.className = "num";
      var load = document.createElement("button");
      load.type = "button"; load.className = "mini"; load.textContent = "Load";
      load.addEventListener("click", function () {
        applyValues({ amount: o.amount, factor: o.factor, term: o.term, fee: o.fee, freq: o.freq });
        update();
        var calc = $("calculator"); if (calc && calc.scrollIntoView) calc.scrollIntoView({ behavior: "smooth" });
      });
      var del = document.createElement("button");
      del.type = "button"; del.className = "mini danger"; del.textContent = "Delete";
      del.setAttribute("aria-label", "Delete " + o.name);
      del.addEventListener("click", function () { offers.splice(idx, 1); writeStore(OFFERS_KEY, offers); renderOffers(); });
      act.appendChild(load); act.appendChild(del);
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  var saveBtn = $("save");
  if (saveBtn) saveBtn.addEventListener("click", function () {
    if (!current) { say("Enter a valid offer first."); return; }
    if (offers.length >= MAX_OFFERS) { say("You can keep up to " + MAX_OFFERS + " offers. Delete one first."); return; }
    var nameEl = $("offer-name");
    var name = (nameEl.value || "").trim().slice(0, 40) || ("Offer " + (offers.length + 1));
    offers.push({
      name: name, amount: current.amount, factor: current.factor, term: current.months,
      fee: current.fee, freq: current.freq, apr: current.res.apr, cost: current.res.cost
    });
    if (!writeStore(OFFERS_KEY, offers)) { offers.pop(); say("Saving is not available in this browser (private mode?)."); return; }
    nameEl.value = "";
    renderOffers();
    say("Saved on this device. Scroll down to compare your offers.");
  });
  var clearAll = $("clear-all");
  if (clearAll) clearAll.addEventListener("click", function () {
    if (!confirm("Delete all saved offers from this device?")) return;
    offers = []; writeStore(OFFERS_KEY, offers); renderOffers();
  });

  loadOffers();
  renderOffers();
  update();
})();
