(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // Daily payments: 22 business days per month (252 per year). Weekly: 52 per year.
  var FREQ = {
    daily:  { perYear: 252, perMonth: 22,      label: "Daily payment" },
    weekly: { perYear: 52,  perMonth: 52 / 12, label: "Weekly payment" }
  };

  function money(n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function money0(n) {
    return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function pct(n) {
    if (n >= 1000) return Math.round(n).toLocaleString("en-US") + "%";
    return n.toFixed(1) + "%";
  }

  // Solve N = p * (1 - (1 + r)^-n) / r for the periodic rate r (bisection).
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
      n: n,
      payback: payback,
      net: net,
      cost: cost,
      pay: pay,
      apr: r * f.perYear * 100,
      eff: (Math.pow(1 + r, f.perYear) - 1) * 100,
      flat: (cost / net) / (months / 12) * 100,
      perDollar: cost / net
    };
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

  function setInvalid(el, bad) { el.setAttribute("aria-invalid", bad ? "true" : "false"); }

  function empty(message) {
    els.apr.textContent = "—";
    els.apr.setAttribute("data-level", "none");
    els.meter.style.width = "100%";
    ["payback", "cost", "net", "pay", "count", "eff", "flat", "perDollar"].forEach(function (k) { els[k].textContent = "—"; });
    els.got.style.width = "0%"; els.costBar.style.width = "0%";
    els.legendGot.textContent = "You receive";
    els.legendCost.textContent = "Cost of the advance";
    els.msg.textContent = message || "";
  }

  function update() {
    var amount = parseFloat(els.amount.value);
    var factor = parseFloat(els.factor.value);
    var months = parseFloat(els.term.value);
    var fee = parseFloat(els.fee.value);
    if (isNaN(fee)) fee = 0;
    var freqKey = els.freq.value === "weekly" ? "weekly" : "daily";

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
  }

  ["amount", "factor", "term", "fee"].forEach(function (id) { els[id].addEventListener("input", update); });
  els.freq.addEventListener("change", update);

  var reset = $("reset");
  if (reset) reset.addEventListener("click", function () {
    els.amount.value = "50000"; els.factor.value = "1.3"; els.term.value = "6";
    els.fee.value = "0"; els.freq.value = "daily"; update();
  });

  update();
})();
