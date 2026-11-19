(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function val(id) { var el = $(id); if (!el) return NaN; var v = parseFloat(el.value); return isFinite(v) ? v : NaN; }
  function filled(id) { var el = $(id); return !!el && el.value !== ""; }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }
  function invalid(id, bad) { var e = $(id); if (e) e.setAttribute("aria-invalid", bad ? "true" : "false"); }
  function money(n) { return (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function pct(n) { if (n >= 1000) return Math.round(n).toLocaleString("en-US") + "%"; return n.toFixed(1) + "%"; }
  function listen(ids, fn) {
    ids.forEach(function (id) {
      var e = $(id); if (!e) return;
      e.addEventListener(e.tagName === "SELECT" ? "change" : "input", fn);
    });
  }

  // Daily payments: 22 business days per month (252 per year). Weekly: 52 per year.
  var FREQ = {
    daily:  { perYear: 252, perMonth: 22,      unit: "business day", label: "Daily payment" },
    weekly: { perYear: 52,  perMonth: 52 / 12, unit: "week",         label: "Weekly payment" }
  };

  // Solve net = pay * (1 - (1 + r)^-n) / r for the periodic rate r.
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

  function mca(amount, factor, months, feePct, freqKey) {
    var f = FREQ[freqKey];
    var n = Math.max(1, Math.round(months * f.perMonth));
    var payback = amount * factor;
    var net = amount * (1 - feePct / 100);
    var pay = payback / n;
    var r = solveRate(net, pay, n);
    return { n: n, payback: payback, net: net, cost: payback - net, pay: pay,
             monthly: payback / months, apr: r * f.perYear * 100, perDollar: (payback - net) / net };
  }

  function loan(amount, aprPct, months, feePct) {
    var n = Math.round(months);
    var i = aprPct / 100 / 12;
    var pay = i === 0 ? amount / n : amount * i / (1 - Math.pow(1 + i, -n));
    var payback = pay * n;
    var net = amount * (1 - feePct / 100);
    var r = solveRate(net, pay, n);
    return { n: n, payback: payback, net: net, cost: payback - net, pay: pay,
             monthly: pay, apr: r * 12 * 100, perDollar: (payback - net) / net };
  }

  function mcaInputsBad(prefix) {
    var amount = val(prefix + "amount"), factor = val(prefix + "factor"), term = val(prefix + "term");
    var fee = val(prefix + "fee"); if (isNaN(fee)) fee = 0;
    var bad = {
      amount: !(amount > 0), factor: !(factor > 1 && factor <= 3),
      term: !(term >= 1 && term <= 36), fee: fee < 0 || fee >= 50
    };
    invalid(prefix + "amount", bad.amount && filled(prefix + "amount"));
    invalid(prefix + "factor", bad.factor && filled(prefix + "factor"));
    invalid(prefix + "term", bad.term && filled(prefix + "term"));
    invalid(prefix + "fee", bad.fee);
    return bad.amount || bad.factor || bad.term || bad.fee;
  }

  function resetButton(id, defaults, fn) {
    var b = $(id); if (!b) return;
    b.addEventListener("click", function () {
      Object.keys(defaults).forEach(function (k) { var e = $(k); if (e) e.value = defaults[k]; });
      fn();
      persistInputs();
    });
  }

  /* ------------------------------------------------ 1. payment & revenue share */
  function initPayment() {
    if (!$("pc-revenue")) return;
    var ids = ["pc-revenue", "pc-margin", "pc-amount", "pc-factor", "pc-term", "pc-fee", "pc-freq"];
    var outs = ["pc-share", "pc-pay", "pc-monthly", "pc-left", "pc-gp", "pc-apr", "pc-count", "pc-total"];

    function clear(msg) {
      outs.forEach(function (o) { setText(o, "—"); });
      $("pc-share").setAttribute("data-level", "none");
      $("pc-meter").style.width = "100%";
      setText("pc-msg", msg || "");
    }

    function update() {
      var rev = val("pc-revenue"), margin = val("pc-margin");
      var freqKey = $("pc-freq").value === "weekly" ? "weekly" : "daily";
      var badRev = !(rev > 0);
      var badMargin = filled("pc-margin") && !(margin > 0 && margin <= 100);
      invalid("pc-revenue", badRev && filled("pc-revenue"));
      invalid("pc-margin", badMargin);
      var badMca = mcaInputsBad("pc-");
      if (badRev || badMargin || badMca) {
        var any = filled("pc-revenue") || filled("pc-amount") || filled("pc-factor") || filled("pc-term");
        clear(any ? "Check your inputs: revenue above 0, factor rate 1.01 to 3, term 1 to 36 months, fees 0% to under 50%, margin 1% to 100%." : "");
        return;
      }
      var r = mca(val("pc-amount"), val("pc-factor"), val("pc-term"), isNaN(val("pc-fee")) ? 0 : val("pc-fee"), freqKey);
      var share = r.monthly / rev * 100;
      setText("pc-msg", "");
      setText("pc-share", pct(share));
      $("pc-share").setAttribute("data-level", "neutral");
      $("pc-meter").style.width = (100 - Math.min(100, share / 50 * 100)) + "%";
      setText("pc-pay", money(r.pay) + " / " + FREQ[freqKey].unit);
      setText("pc-monthly", money(r.monthly));
      setText("pc-left", money(rev - r.monthly));
      setText("pc-gp", filled("pc-margin") ? pct(r.monthly / (rev * margin / 100) * 100) : "Add a margin");
      setText("pc-apr", pct(r.apr));
      setText("pc-count", r.n.toLocaleString("en-US") + (freqKey === "daily" ? " business days" : " weeks"));
      setText("pc-total", money(r.payback));
    }
    listen(ids, update);
    resetButton("pc-reset", { "pc-revenue": "40000", "pc-margin": "30", "pc-amount": "50000", "pc-factor": "1.3", "pc-term": "6", "pc-fee": "0", "pc-freq": "daily" }, update);
    update();
  }

  /* ------------------------------------------------ 2. MCA vs loan */
  function initCompare() {
    if (!$("a-amount")) return;
    var ids = ["a-amount", "a-factor", "a-term", "a-fee", "a-freq", "b-amount", "b-apr", "b-term", "b-fee"];
    var rows = ["net", "payback", "cost", "pay", "monthly", "apr", "per"];

    function clear(msg) {
      rows.forEach(function (k) { setText("r-" + k + "-a", "—"); setText("r-" + k + "-b", "—"); });
      ["net", "payback", "cost", "monthly", "apr", "per"].forEach(function (k) { $("r-" + k + "-a").className = "num"; $("r-" + k + "-b").className = "num"; });
      setText("cmp-summary", "Enter both offers to compare them.");
      setText("cmp-msg", msg || "");
    }
    function mark(k, a, b, lowerWins) {
      var ea = $("r-" + k + "-a"), eb = $("r-" + k + "-b");
      ea.className = "num"; eb.className = "num";
      if (Math.abs(a - b) < 1e-9) return;
      var aWins = lowerWins ? a < b : a > b;
      (aWins ? ea : eb).className = "num win";
    }

    function update() {
      var badA = mcaInputsBad("a-");
      var amountB = val("b-amount"), aprB = val("b-apr"), termB = val("b-term");
      var feeB = val("b-fee"); if (isNaN(feeB)) feeB = 0;
      var bad = { amount: !(amountB > 0), apr: !(aprB >= 0 && aprB <= 200) || !filled("b-apr"), term: !(termB >= 1 && termB <= 120), fee: feeB < 0 || feeB >= 50 };
      invalid("b-amount", bad.amount && filled("b-amount"));
      invalid("b-apr", bad.apr && filled("b-apr"));
      invalid("b-term", bad.term && filled("b-term"));
      invalid("b-fee", bad.fee);
      if (badA || bad.amount || bad.apr || bad.term || bad.fee) {
        clear("Check your inputs. MCA: factor rate 1.01 to 3 and term 1 to 36 months. Loan: APR 0% to 200% and term 1 to 120 months. Fees 0% to under 50%.");
        return;
      }
      var freqKey = $("a-freq").value === "weekly" ? "weekly" : "daily";
      var a = mca(val("a-amount"), val("a-factor"), val("a-term"), isNaN(val("a-fee")) ? 0 : val("a-fee"), freqKey);
      var b = loan(amountB, aprB, termB, feeB);
      setText("cmp-msg", "");
      setText("r-net-a", money(a.net)); setText("r-net-b", money(b.net));
      setText("r-payback-a", money(a.payback)); setText("r-payback-b", money(b.payback));
      setText("r-cost-a", money(a.cost)); setText("r-cost-b", money(b.cost));
      setText("r-pay-a", money(a.pay) + " / " + FREQ[freqKey].unit); setText("r-pay-b", money(b.pay) + " / month");
      setText("r-monthly-a", money(a.monthly)); setText("r-monthly-b", money(b.monthly));
      setText("r-apr-a", pct(a.apr)); setText("r-apr-b", pct(b.apr));
      setText("r-per-a", "$" + a.perDollar.toFixed(2)); setText("r-per-b", "$" + b.perDollar.toFixed(2));
      mark("net", a.net, b.net, false);
      mark("payback", a.payback, b.payback, true);
      mark("cost", a.cost, b.cost, true);
      mark("monthly", a.monthly, b.monthly, true);
      mark("apr", a.apr, b.apr, true);
      mark("per", a.perDollar, b.perDollar, true);

      var diff = a.cost - b.cost;
      var s = "On these inputs the advance costs " + money0(Math.abs(diff)) + (diff > 0 ? " more" : " less") +
        " than the loan in total (" + money0(a.cost) + " vs " + money0(b.cost) + "), and the estimated APR is " +
        pct(a.apr) + " vs " + pct(b.apr) + ". The advance's monthly outflow is " + money0(a.monthly) +
        " vs " + money0(b.monthly) + " for the loan.";
      if (Math.abs(a.net - b.net) > 1) s += " Note that the two offers deliver different amounts of cash, so compare cost per $1 received as well.";
      setText("cmp-summary", s);
    }
    listen(ids, update);
    resetButton("cmp-reset", { "a-amount": "50000", "a-factor": "1.3", "a-term": "6", "a-fee": "0", "a-freq": "daily", "b-amount": "50000", "b-apr": "12", "b-term": "24", "b-fee": "0" }, update);
    update();
  }

  /* ------------------------------------------------ 3. payback period */
  function initPayback() {
    if (!$("pb-profit")) return;
    var ids = ["pb-amount", "pb-factor", "pb-term", "pb-fee", "pb-profit", "pb-delay"];
    var outs = ["pb-result", "pb-cost", "pb-repay", "pb-net", "pb-total-profit", "pb-breakeven", "pb-roi"];

    function clear(msg) {
      outs.forEach(function (o) { setText(o, "—"); });
      $("pb-result").setAttribute("data-level", "none");
      setText("pb-verdict", "");
      setText("pb-msg", msg || "");
    }

    function update() {
      var badMca = mcaInputsBad("pb-");
      var profit = val("pb-profit"), delay = val("pb-delay"); if (isNaN(delay)) delay = 0;
      var term = val("pb-term");
      var badProfit = !(profit >= 0) || !filled("pb-profit");
      var badDelay = delay < 0 || delay > term;
      invalid("pb-profit", badProfit && filled("pb-profit"));
      invalid("pb-delay", badDelay);
      if (badMca || badProfit || badDelay) {
        var any = filled("pb-amount") || filled("pb-factor") || filled("pb-term") || filled("pb-profit");
        clear(any ? "Check your inputs: factor rate 1.01 to 3, term 1 to 36 months, extra profit 0 or more, and a delay no longer than the term." : "");
        return;
      }
      var fee = isNaN(val("pb-fee")) ? 0 : val("pb-fee");
      var r = mca(val("pb-amount"), val("pb-factor"), term, fee, "daily");
      var earningMonths = Math.max(0, term - delay);
      var totalProfit = profit * earningMonths;
      var result = totalProfit - r.cost;
      var breakeven = profit > 0 ? delay + r.cost / profit : Infinity;

      setText("pb-msg", "");
      setText("pb-result", money0(result));
      $("pb-result").setAttribute("data-level", result >= 0 ? "low" : "high");
      setText("pb-cost", money(r.cost));
      setText("pb-repay", money(r.monthly) + " / month");
      setText("pb-net", money(r.net));
      setText("pb-total-profit", money(totalProfit));
      setText("pb-breakeven", isFinite(breakeven) ? breakeven.toFixed(1) + " months" : "Never");
      setText("pb-roi", pct(result / r.cost * 100));
      var verdict;
      if (!isFinite(breakeven)) verdict = "With no extra profit, the advance never covers its cost.";
      else if (breakeven <= term) verdict = "Under these assumptions the extra profit covers the advance's cost about " + breakeven.toFixed(1) + " months in, before the " + term + "-month term ends.";
      else verdict = "Under these assumptions the extra profit would only cover the advance's cost about " + breakeven.toFixed(1) + " months in, after the " + term + "-month term has ended, leaving a shortfall of " + money0(-result) + " by the end of the term.";
      setText("pb-verdict", verdict);
    }
    listen(ids, update);
    resetButton("pb-reset", { "pb-amount": "50000", "pb-factor": "1.3", "pb-term": "6", "pb-fee": "0", "pb-profit": "4000", "pb-delay": "1" }, update);
    update();
  }

  /* ------------------------------------------------ remember inputs and share link */
  var CALC_INPUTS = Array.prototype.slice.call(document.querySelectorAll(".calc input, .calc select")).filter(function (e) { return !!e.id; });
  var PAGE_KEY = "mca_last_" + location.pathname;

  function setField(el, v) {
    if (el.tagName === "SELECT") {
      var i;
      for (i = 0; i < el.options.length; i++) { if (el.options[i].value === v) { el.value = v; return; } }
    } else if (v === "" || isFinite(parseFloat(v))) {
      el.value = v;
    }
  }
  function restoreInputs() {
    if (!CALC_INPUTS.length) return;
    var vals = null, fromUrl = {}, has = false;
    try {
      var p = new URLSearchParams(location.search);
      CALC_INPUTS.forEach(function (e) { if (p.has(e.id)) { fromUrl[e.id] = p.get(e.id); has = true; } });
    } catch (e1) {}
    if (has) { vals = fromUrl; }
    else { try { vals = JSON.parse(localStorage.getItem(PAGE_KEY) || "null"); } catch (e2) {} }
    if (!vals || typeof vals !== "object") return;
    CALC_INPUTS.forEach(function (e) { if (vals[e.id] !== undefined) setField(e, String(vals[e.id])); });
  }
  function persistInputs() {
    if (!CALC_INPUTS.length) return;
    var o = {};
    CALC_INPUTS.forEach(function (e) { o[e.id] = e.value; });
    try { localStorage.setItem(PAGE_KEY, JSON.stringify(o)); } catch (e) {}
  }
  CALC_INPUTS.forEach(function (e) { e.addEventListener(e.tagName === "SELECT" ? "change" : "input", persistInputs); });

  function copyText(text, ok, fail) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { fail(); }
      document.body.removeChild(ta);
    }
  }
  function flash(id, text) {
    var el = $(id); if (!el) return;
    el.textContent = text;
    clearTimeout(flash["t" + id]);
    flash["t" + id] = setTimeout(function () { el.textContent = ""; }, 3500);
  }
  function bindShare() {
    var btn = $("share-link");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var p = new URLSearchParams();
      CALC_INPUTS.forEach(function (e) { p.set(e.id, e.value); });
      var url = location.origin + location.pathname + "?" + p.toString();
      copyText(url, function () { flash("share-msg", "Link copied. Anyone who opens it sees these numbers."); },
                    function () { flash("share-msg", "Could not copy automatically."); });
    });
  }

  /* ------------------------------------------------ 4. interactive checklist */
  function initChecklist() {
    var list = $("ck-list");
    if (!list) return;
    var KEY = "mca_checklist_v1";
    var state = { funder: "", checks: {}, notes: {} };
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && typeof s === "object") { state.funder = s.funder || ""; state.checks = s.checks || {}; state.notes = s.notes || {}; }
    } catch (e) {}
    var boxes = Array.prototype.slice.call(list.querySelectorAll("input[data-ck]"));
    var notes = Array.prototype.slice.call(list.querySelectorAll("input[data-note]"));
    var funder = $("ck-funder");
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
    function progress() {
      var done = boxes.filter(function (b) { return b.checked; }).length;
      setText("ck-count", done + " of " + boxes.length + " checked");
      $("ck-fill").style.width = (done / boxes.length * 100) + "%";
    }
    funder.value = state.funder;
    funder.addEventListener("input", function () { state.funder = funder.value; save(); });
    boxes.forEach(function (b) {
      var id = b.getAttribute("data-ck");
      b.checked = !!state.checks[id];
      b.addEventListener("change", function () { state.checks[id] = b.checked; save(); progress(); });
    });
    notes.forEach(function (n) {
      var id = n.getAttribute("data-note");
      n.value = state.notes[id] || "";
      n.addEventListener("input", function () { state.notes[id] = n.value; save(); });
    });
    progress();

    $("ck-copy").addEventListener("click", function () {
      var lines = ["MCA offer checklist" + (state.funder ? " - " + state.funder : "")];
      boxes.forEach(function (b) {
        var item = b.closest(".ck-item");
        var q = item.querySelector(".ck-q").textContent;
        var note = state.notes[b.getAttribute("data-ck")];
        lines.push((b.checked ? "[x] " : "[ ] ") + q + (note ? " -> " + note : ""));
      });
      copyText(lines.join("\n"), function () { flash("ck-msg", "Summary copied."); }, function () { flash("ck-msg", "Could not copy automatically."); });
    });
    $("ck-print").addEventListener("click", function () { window.print(); });
    $("ck-clear").addEventListener("click", function () {
      if (!confirm("Clear all answers on this device?")) return;
      state = { funder: "", checks: {}, notes: {} };
      funder.value = "";
      boxes.forEach(function (b) { b.checked = false; });
      notes.forEach(function (n) { n.value = ""; });
      save(); progress();
    });
  }

  restoreInputs();
  bindShare();
  initPayment();
  initCompare();
  initPayback();
  initChecklist();
})();
