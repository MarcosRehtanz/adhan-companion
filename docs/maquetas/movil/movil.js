// Maqueta móvil: estado en memoria, sin core. Parámetros: tema=noche, permisos=faltan,
// pantalla=hoy|registro|quran|mas|avisos, hoja=dhuhr (abre la hoja de sonido), ahora=HH:MM.
(function () {
  "use strict";
  var q = new URLSearchParams(location.search);
  if (q.get("tema") === "noche") document.documentElement.className = "noche";
  if (q.get("permisos") === "faltan") document.getElementById("aviso-permisos").hidden = false;

  var REZOS = [
    { id: "fajr", nombre: "Fajr", ar: "الفجر", hora: "05:04" },
    { id: "dhuhr", nombre: "Dhuhr", ar: "الظهر", hora: "13:05" },
    { id: "asr", nombre: "Asr", ar: "العصر", hora: "16:40" },
    { id: "maghrib", nombre: "Maghrib", ar: "المغرب", hora: "19:42" },
    { id: "isha", nombre: "Isha", ar: "العشاء", hora: "21:05" }
  ];
  var MODOS = { adhan: "Adhan", tono: "Tono discreto", notificacion: "Solo notificación" };
  var sonido = { fajr: "adhan", dhuhr: "tono", asr: "tono", maghrib: "adhan", isha: "notificacion" };
  var guardado = JSON.stringify(sonido) + "|70|10";
  var marcados = { fajr: true, dhuhr: true };
  var ahora = minutos(q.get("ahora") || "15:10");
  var segundos = 2;

  function minutos(hhmm) { var p = hhmm.split(":"); return +p[0] * 60 + +p[1]; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Recorrido del sol: el horizonte separa el día de la noche. Fajr llega antes de la
  // salida del sol, Dhuhr en lo más alto, Maghrib con la puesta e Isha ya de noche.
  var SALIDA = minutos("06:40"), PUESTA = minutos("19:42");
  function arco() {
    var svg = document.getElementById("arco");
    var x0 = 8, x1 = 334, horizonte = 74, alto = 58, desde = minutos("05:04"), hasta = minutos("21:05");
    function punto(m) {
      var x = x0 + (m - desde) / (hasta - desde) * (x1 - x0);
      return { x: x, y: horizonte - Math.sin(Math.PI * (m - SALIDA) / (PUESTA - SALIDA)) * alto };
    }
    function trazo(a, b) {
      var d = "", n = 60;
      for (var i = 0; i <= n; i++) { var p = punto(a + (b - a) * i / n); d += (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }
      return d;
    }
    var ns = "http://www.w3.org/2000/svg";
    function nodo(tag, attrs) { var n = document.createElementNS(ns, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; }
    svg.innerHTML = "";
    nodo("rect", { x: 0, y: horizonte, width: 342, height: 40, fill: "var(--noche-arco)" });
    nodo("line", { x1: 0, y1: horizonte, x2: 342, y2: horizonte, stroke: "var(--borde)", "stroke-width": 1 });
    nodo("path", { d: trazo(ahora, hasta), fill: "none", stroke: "var(--arco-pendiente)", "stroke-width": 2, "stroke-dasharray": "2 5", "stroke-linecap": "round" });
    nodo("path", { d: trazo(desde, ahora), fill: "none", stroke: "var(--acento)", "stroke-width": 3, "stroke-linecap": "round" });
    REZOS.forEach(function (r) {
      var p = punto(minutos(r.hora)), pasado = minutos(r.hora) <= ahora, sig = r.id === siguiente().id;
      nodo("circle", { cx: p.x, cy: p.y, r: sig ? 6 : 4, fill: pasado ? "var(--acento)" : "var(--superficie)", stroke: pasado || sig ? "var(--acento)" : "var(--arco-pendiente)", "stroke-width": 2 });
      if (sig) {
        var t = nodo("text", { x: p.x + 10, y: p.y - 8, "font-size": 12, "font-weight": 600, fill: "var(--acento)" });
        t.textContent = r.nombre;
      }
    });
    var sol = punto(ahora);
    nodo("circle", { cx: sol.x, cy: sol.y, r: 11, fill: "var(--oro-claro)", opacity: .35 });
    nodo("circle", { cx: sol.x, cy: sol.y, r: 6.5, fill: "var(--oro)" });
  }
  function siguiente() { for (var i = 0; i < REZOS.length; i++) if (minutos(REZOS[i].hora) > ahora) return REZOS[i]; return REZOS[0]; }

  function cuenta() {
    var falta = (minutos(siguiente().hora) - ahora) * 60 - segundos;
    var h = Math.floor(falta / 3600), m = Math.floor(falta % 3600 / 60);
    document.getElementById("cuenta").textContent = (h ? h + " h " : "") + m + " min";
  }

  // Filas de rezos: un toque marca o desmarca; los que todavía no llegaron no se marcan.
  function lista(contenedor, deHoy) {
    var ul = document.getElementById(contenedor);
    ul.innerHTML = "";
    REZOS.forEach(function (r) {
      var futuro = deHoy && minutos(r.hora) > ahora, sig = deHoy && r.id === siguiente().id;
      var b = el("button", (futuro ? "futuro" : "") + (sig ? " siguiente" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", marcados[r.id] ? "true" : "false");
      if (futuro) b.setAttribute("aria-disabled", "true");
      var detalle = sig ? "Siguiente" : futuro ? "Todavía no" : marcados[r.id] ? "Rezado" : "Sin marcar";
      b.innerHTML = '<span class="marca">' + CHECK + '</span><span class="rezo-nombre"><b>' + r.nombre + "</b><small>" + detalle + '</small></span><span class="rezo-hora">' + r.hora + "</span>";
      b.setAttribute("aria-label", r.nombre + ", " + r.hora + ", " + detalle);
      b.addEventListener("click", function () {
        if (futuro) return;
        marcados[r.id] = !marcados[r.id];
        pintar();
      });
      var li = el("li"); li.appendChild(b); ul.appendChild(li);
    });
  }
  function pintar() {
    var n = REZOS.filter(function (r) { return marcados[r.id]; }).length;
    document.getElementById("progreso-texto").textContent = n + " de 5";
    document.getElementById("dia-progreso").textContent = n + " de 5";
    document.getElementById("progreso-barra").style.width = n * 20 + "%";
    lista("lista-hoy", true);
    lista("lista-dia", true);
  }

  // Registro: octubre de 2026 empieza en jueves.
  function mes() {
    var dias = document.getElementById("dias");
    var completos = [1, 2, 3, 4, 6, 7, 8, 9, 12, 13, 14, 16, 17, 18, 19], parciales = [10, 15, 20, 21];
    for (var v = 0; v < 3; v++) dias.appendChild(el("span"));
    for (var d = 1; d <= 31; d++) {
      var b = el("button", "dia" + (completos.indexOf(d) >= 0 ? " completo" : "") + (parciales.indexOf(d) >= 0 ? " parcial" : "") + (d === 21 ? " hoy" : ""), String(d));
      b.type = "button";
      b.setAttribute("role", "gridcell");
      b.setAttribute("aria-label", d + " de octubre");
      if (d > 21) b.disabled = true;
      if (d === 21) b.setAttribute("aria-selected", "true");
      b.addEventListener("click", function () {
        var previo = dias.querySelector('[aria-selected="true"]');
        if (previo) previo.removeAttribute("aria-selected");
        this.setAttribute("aria-selected", "true");
        document.getElementById("dia-titulo").textContent = this.textContent + " de octubre";
      });
      dias.appendChild(b);
    }
  }

  // Adhan y avisos: borrador hasta Guardar; volver con cambios pide confirmar.
  var editando = null;
  function sonidos() {
    var ul = document.getElementById("lista-sonidos");
    ul.innerHTML = "";
    REZOS.forEach(function (r) {
      var b = el("button", "fila-sonido", '<span class="fila-texto"><b>' + r.nombre + "</b><span>" + MODOS[sonido[r.id]] + '</span></span><span class="chevron" aria-hidden="true">›</span>');
      b.type = "button";
      b.addEventListener("click", function () { abrirHoja(r); });
      var li = el("li"); li.appendChild(b); ul.appendChild(li);
    });
  }
  function estado() { return JSON.stringify(sonido) + "|" + document.getElementById("volumen").value + "|" + document.getElementById("preaviso").textContent; }
  function sucio() { document.getElementById("guardar").disabled = estado() === guardado; }
  function abrirHoja(r) {
    editando = r;
    document.getElementById("hoja-titulo").textContent = "Sonido de " + r.nombre;
    var radios = document.querySelectorAll("#segmentos input");
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === sonido[r.id];
      radios[i].parentNode.className = radios[i].checked ? "elegido" : "";
    }
    document.getElementById("probar").disabled = sonido[r.id] === "notificacion";
    document.getElementById("velo").hidden = false;
    document.getElementById("hoja").hidden = false;
    document.getElementById("hoja-listo").focus();
  }
  function cerrarHoja() { document.getElementById("velo").hidden = true; document.getElementById("hoja").hidden = true; }
  document.getElementById("segmentos").addEventListener("change", function (e) {
    sonido[editando.id] = e.target.value;
    var labels = this.querySelectorAll("label");
    for (var i = 0; i < labels.length; i++) labels[i].className = labels[i].firstChild.checked ? "elegido" : "";
    document.getElementById("probar").disabled = e.target.value === "notificacion";
    sonidos(); sucio();
  });
  document.getElementById("hoja-listo").addEventListener("click", cerrarHoja);
  document.getElementById("velo").addEventListener("click", cerrarHoja);
  document.getElementById("probar").addEventListener("click", function () { aviso("Probando " + MODOS[sonido[editando.id]].toLowerCase() + " de " + editando.nombre + "…"); });
  document.getElementById("volumen").addEventListener("input", function () { document.getElementById("volumen-valor").textContent = this.value + " %"; sucio(); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-paso]"), function (b) {
    b.addEventListener("click", function () {
      var p = document.getElementById("preaviso");
      p.textContent = Math.max(0, Math.min(60, +p.textContent + +b.getAttribute("data-paso")));
      sucio();
    });
  });
  document.getElementById("guardar").addEventListener("click", function () { guardado = estado(); sucio(); aviso("Avisos guardados"); });
  document.querySelector("[data-volver]").addEventListener("click", function () {
    if (estado() !== guardado && !confirm("¿Descartar los cambios sin guardar?")) return;
    location.hash = "#mas";
  });

  var temporizador = 0;
  function aviso(texto) {
    var t = document.getElementById("toast") || document.getElementById("telefono").appendChild(el("div", ""));
    t.id = "toast"; t.setAttribute("role", "status"); t.textContent = texto;
    t.style.cssText = "position:absolute;left:16px;right:16px;bottom:84px;z-index:6;padding:12px 16px;border-radius:12px;background:#1c1b17;color:#fff;font-size:14px";
    clearTimeout(temporizador); temporizador = setTimeout(function () { t.remove(); }, 2600);
  }

  // Navegación: barra inferior y subpantallas de Más.
  var TABS = ["hoy", "registro", "quran", "mas"];
  function ir() {
    var ruta = (location.hash || "#" + (q.get("pantalla") || "hoy")).slice(1).split("/");
    var destino = ruta[1] === "avisos" || ruta[0] === "avisos" ? "avisos" : TABS.indexOf(ruta[0]) >= 0 ? ruta[0] : "hoy";
    if (ruta[1] && ruta[1] !== "avisos") { aviso("En la maqueta solo está armada «Adhan y avisos»."); destino = ruta[0]; }
    Array.prototype.forEach.call(document.querySelectorAll(".pantalla"), function (p) { p.hidden = p.id !== destino; });
    var tab = destino === "avisos" ? "mas" : destino;
    Array.prototype.forEach.call(document.querySelectorAll(".barra-inferior a"), function (a) {
      if (a.getAttribute("data-tab") === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = document.getElementById(destino).getAttribute("data-titulo") + " · Maqueta móvil";
  }
  window.addEventListener("hashchange", ir);

  arco(); cuenta(); pintar(); mes(); sonidos(); ir();
  setInterval(function () { segundos++; cuenta(); }, 1000);
  if (q.get("hoja")) abrirHoja(REZOS.filter(function (r) { return r.id === q.get("hoja"); })[0] || REZOS[1]);
})();
