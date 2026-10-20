/* Maqueta de lectura del Qur’an — versión simplificada del prototipo.
   Lee el corpus instalado de la app (Tanzil Uthmani + Bórnez) sin
   modificarlo. El estado vive en memoria: es una maqueta, no persiste.
   Parámetros: ?sura=2&aleya=5&tema=noche&modo=arabe&punto=36:12
   &marcas=2:3,2:255&escuchando=2:7&enfoque=1&acento=azul&captura=1 */
"use strict";
(function () {
  var BASE = "../../../public/quran/";
  var TOTAL_ALEYAS = 6236;
  var MAX_MARCAS = 1000;
  var ACENTOS = {
    verde: ["#0e6f63", "#6ed6bd"], azul: ["#245cac", "#90bcff"], violeta: ["#7043a5", "#ccb0ff"],
    rosa: ["#a53660", "#ffa5c4"], ambar: ["#805600", "#f1cb75"]
  };
  var COLUMNAS = { estrecha: ["Estrecha", "36rem"], media: ["Media", "42rem"], amplia: ["Amplia", "50rem"] };
  var INTERLINEADOS = { compacto: ["Compacto", 2.0], normal: ["Normal", 2.3], amplio: ["Amplio", 2.7] };
  var TEMAS = { papel: "Papel", noche: "Noche" };
  var MODOS = { traduccion: "Con traducción", arabe: "Solo árabe, de corrido" };

  var PATHS = {
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    izq: '<path d="m15 18-6-6 6-6"/>',
    der: '<path d="m9 18 6-6-6-6"/>',
    marcador: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    marcadorLleno: '<path fill="currentColor" d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    enfoque: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
    play: '<path fill="currentColor" stroke="none" d="M8 4.5v15l12-7.5z"/>',
    pausa: '<rect fill="currentColor" stroke="none" x="6" y="4.5" width="4" height="15" rx="1"/><rect fill="currentColor" stroke="none" x="14" y="4.5" width="4" height="15" rx="1"/>',
    anterior: '<path fill="currentColor" d="M18 19 9 12l9-7z"/><path d="M5 5v14"/>',
    siguiente: '<path fill="currentColor" d="m6 5 9 7-9 7z"/><path d="M19 5v14"/>',
    detener: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    cerrar: '<path d="M18 6 6 18M6 6l12 12"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    altavoz: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    estrella: '<path fill="currentColor" stroke="none" d="M12 2.5l2.6 3.2 4.1-.4-.4 4.1 3.2 2.6-3.2 2.6.4 4.1-4.1-.4L12 21.5l-2.6-3.2-4.1.4.4-4.1L2.5 12l3.2-2.6-.4-4.1 4.1.4z"/>'
  };
  function icono(nombre) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + PATHS[nombre] + "</svg>";
  }
  function $(sel) { return document.querySelector(sel); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function arabigo(n) { return String(n).replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }
  function clave(sura, aya) { return sura + ":" + aya; }
  function anunciar(texto) { $("#anuncio").textContent = ""; setTimeout(function () { $("#anuncio").textContent = texto; }, 30); }

  // ── Estado ───────────────────────────────────────────────────────
  var q = new URLSearchParams(location.search);
  function posicion(texto) {
    var m = /^(\d+):(\d+)$/.exec(texto || "");
    return m ? { sura: Number(m[1]), aya: Number(m[2]) } : null;
  }
  var estado = {
    sura: Number(q.get("sura")) || 1,
    aya: Number(q.get("aleya")) || 1,
    visible: 1,
    punto: posicion(q.get("punto")),
    marcas: new Set((q.get("marcas") || "").split(",").filter(function (m) { return posicion(m); })),
    escuchando: posicion(q.get("escuchando")),
    sonando: !!q.get("escuchando"),
    prefs: {
      tema: q.get("tema") === "noche" ? "noche" : "papel",
      modo: q.get("modo") === "arabe" ? "arabe" : "traduccion",
      ar: Number(q.get("ar")) || 32,
      es: Number(q.get("es")) || 17,
      columna: COLUMNAS[q.get("columna")] ? q.get("columna") : "media",
      interlineado: INTERLINEADOS[q.get("interlineado")] ? q.get("interlineado") : "normal"
    },
    borrador: null,
    modoDibujado: null
  };
  var corpus = null;
  var acento = ACENTOS[q.get("acento")];
  if (acento) {
    document.documentElement.style.setProperty("--acento-claro-solido", acento[0]);
    document.documentElement.style.setProperty("--acento-oscuro-brillante", acento[1]);
  }

  // ── Carga del corpus (sin normalizar ni recortar el texto) ───────
  function leer(ruta) {
    if (q.get("captura")) {
      // Solo para capturas: carga síncrona para que el evento load espere al texto.
      var xhr = new XMLHttpRequest();
      xhr.open("GET", BASE + ruta, false);
      xhr.send();
      if (xhr.status !== 200) return Promise.reject(new Error("No se pudo abrir " + ruta + "."));
      return Promise.resolve(xhr.responseText);
    }
    return fetch(BASE + ruta).then(function (r) {
      if (!r.ok) throw new Error("No se pudo abrir el recurso local " + ruta + ".");
      return r.text();
    });
  }
  function porSura(texto, metadatos) {
    var suras = metadatos.map(function () { return []; });
    var total = 0;
    texto.split(/\r?\n/).forEach(function (linea) {
      if (!linea || linea.charAt(0) === "#") return;
      var m = /^(\d+)\|(\d+)\|(.+)$/.exec(linea);
      if (!m) throw new Error("El archivo del Qur’an no tiene el formato esperado.");
      var s = Number(m[1]), a = Number(m[2]);
      if (!suras[s - 1] || suras[s - 1].length !== a - 1) throw new Error("Las aleyas del archivo están incompletas o fuera de orden.");
      suras[s - 1].push(m[3]);
      total++;
    });
    if (total !== TOTAL_ALEYAS) throw new Error("El archivo del Qur’an está incompleto.");
    return suras;
  }
  function cargar() {
    mostrarEstado("Abriendo los textos instalados…");
    var trabajo = leer("suras.json").then(function (json) {
      var meta = JSON.parse(json).suras;
      return Promise.all([leer("quran-uthmani.txt"), leer("es.bornez.txt"), leer("quran-data.xml")]).then(function (r) {
        var tipos = {};
        var xml = new DOMParser().parseFromString(r[2], "application/xml");
        Array.prototype.forEach.call(xml.querySelectorAll("suras > sura"), function (n) { tipos[n.getAttribute("index")] = n.getAttribute("type"); });
        corpus = {
          suras: meta.map(function (s) { return { numero: s.number, total: s.count, nombre: s.name, arabe: s.arabic_name, tipo: tipos[s.number] === "Medinan" ? "Mediní" : "Mequí" }; }),
          ar: porSura(r[0], meta),
          es: porSura(r[1], meta)
        };
      });
    });
    trabajo.then(function () {
      estado.sura = Math.min(Math.max(estado.sura, 1), 114);
      estado.aya = Math.min(Math.max(estado.aya, 1), corpus.suras[estado.sura - 1].total);
      aplicarPreferencias(estado.prefs);
      construirIndice();
      dibujarSura();
      if (q.get("enfoque")) entrarEnfoque();
      // Solo para revisar la maqueta: ?panel=indice|marcadores|preferencias (&editar=1).
      if (q.get("panel") === "indice") abrirIndice();
      if (q.get("panel") === "marcadores") { dibujarMarcadores(); abrir("marcadores"); }
      if (q.get("panel") === "preferencias") {
        if (q.get("editar")) estado.borrador = Object.assign({}, estado.prefs);
        dibujarPreferencias(); abrir("preferencias");
      }
    }).catch(function (e) { mostrarError(e); });
  }
  function mostrarEstado(texto) {
    $("#estado").hidden = false;
    $("#estado").textContent = texto;
    $("#sura").hidden = true;
  }
  function mostrarError(e) {
    var el = $("#estado");
    el.hidden = false;
    el.setAttribute("role", "alert");
    el.innerHTML = "<b>No se pudieron abrir los textos instalados.</b><br>" + esc(e.message || e) +
      '<br><span>Abrí la maqueta con un servidor local desde la raíz del repo: <code>python3 -m http.server 8000</code> y luego <code>http://localhost:8000/docs/maquetas/lectura-quran/</code></span><br><button class="boton" id="reintentar">Reintentar</button>';
    $("#reintentar").addEventListener("click", function () { el.setAttribute("role", "status"); cargar(); });
  }

  // ── Dibujo de la sura ────────────────────────────────────────────
  function suraActual() { return corpus.suras[estado.sura - 1]; }
  function cartela(s) {
    return '<header class="cartela"><div class="filete" aria-hidden="true">' + icono("estrella") + "</div>" +
      '<h1 lang="ar" dir="rtl">' + esc(s.arabe) + "</h1>" +
      '<p class="cartela-nombre">' + s.numero + " · " + esc(s.nombre) + "</p>" +
      '<p class="cartela-datos">' + s.tipo + " · " + s.total + " aleyas</p>" +
      '<div class="filete" aria-hidden="true">' + icono("estrella") + "</div></header>";
  }
  function finDeAleya(n) { return " <span class=\"fin\">۝" + arabigo(n) + "</span>"; }
  function aleyaConTraduccion(s, i) {
    var n = i + 1;
    return '<li class="aleya" id="a-' + n + '" data-aya="' + n + '" tabindex="-1" aria-label="Sura ' + s.numero + ", aleya " + n + '">' +
      '<div class="aleya-cabecera"><div class="aleya-estado"></div><div class="acciones">' +
      '<button class="accion" data-accion="escuchar" title="Escuchar desde aquí">' + icono("play") + '<span class="etiqueta">Escuchar</span></button>' +
      '<button class="accion" data-accion="marcar" aria-pressed="false">' + icono("marcador") + '<span class="etiqueta">Marcar</span></button>' +
      '<button class="accion" data-accion="continuar" title="Guardar como punto de lectura">' + icono("pin") + '<span class="etiqueta">Continuar aquí</span></button>' +
      "</div></div>" +
      '<p class="ar" lang="ar" dir="rtl">' + esc(corpus.ar[s.numero - 1][i]) + finDeAleya(n) + "</p>" +
      '<p class="es" lang="es"><span class="num">' + n + "</span>" + esc(corpus.es[s.numero - 1][i]) + "</p></li>";
  }
  function aleyaDeCorrido(s, i) {
    var n = i + 1;
    return '<span class="aleya-m" id="a-' + n + '" data-aya="' + n + '" tabindex="-1">' + esc(corpus.ar[s.numero - 1][i]) + finDeAleya(n) + "</span>";
  }
  function finDeSura(s) {
    var html = '<footer class="fin-sura"><div class="filete" aria-hidden="true">' + icono("estrella") + "</div>";
    if (s.numero < 114) {
      var sig = corpus.suras[s.numero];
      html += '<button class="continuar" data-ir="' + sig.numero + '"><span>Continuar con</span><b>' + sig.numero + ". " + esc(sig.nombre) + '</b><span class="ar-mini" lang="ar" dir="rtl">' + esc(sig.arabe) + "</span>" + icono("der") + "</button>";
    }
    return html + '<p class="fuentes">Árabe: Tanzil Uthmani 1.1, transmisión Hafs. Español: Raúl González Bórnez, versión es.bornez de Tanzil, uso no comercial. ' +
      "Fuente Amiri Quran 1.003, SIL OFL 1.1. La traducción ayuda a comprender el texto y tiene sus propias interpretaciones. " +
      '<a href="#" data-fuentes>Fuentes y condiciones</a></p></footer>';
  }
  function dibujarSura() {
    var s = suraActual();
    var modo = modoVigente();
    var cuerpo = "";
    for (var i = 0; i < s.total; i++) cuerpo += modo === "arabe" ? aleyaDeCorrido(s, i) + " " : aleyaConTraduccion(s, i);
    var html = cartela(s) + (modo === "arabe" ? '<p class="mushaf" lang="ar" dir="rtl">' + cuerpo + "</p>" : '<ol class="aleyas">' + cuerpo + "</ol>") + finDeSura(s);
    var art = $("#sura");
    art.innerHTML = html;
    art.hidden = false;
    $("#estado").hidden = true;
    estado.modoDibujado = modo;
    actualizarAleyas();
    actualizarBarra();
    actualizarReproductor();
    llevarA(estado.aya, true);
  }
  function modoVigente() { return (estado.borrador || estado.prefs).modo; }
  function elementoAleya(n) { return document.getElementById("a-" + n); }
  function llevarA(n, alInicio) {
    var mover = function () {
      var el = elementoAleya(n);
      if (!el) return;
      if (n === 1 && alInicio) $("#hoja").scrollTop = 0;
      else el.scrollIntoView({ block: modoVigente() === "arabe" ? "center" : "start" });
      medirVisible();
    };
    mover();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { requestAnimationFrame(mover); });
  }

  // ── Estados por aleya (selección, marcas, punto, recitación) ─────
  function actualizarAleyas() {
    var s = suraActual();
    var arabe = estado.modoDibujado === "arabe";
    for (var n = 1; n <= s.total; n++) {
      var el = elementoAleya(n);
      if (!el) continue;
      var marcada = estado.marcas.has(clave(s.numero, n));
      var esPunto = !!estado.punto && estado.punto.sura === s.numero && estado.punto.aya === n;
      var recitando = !!estado.escuchando && estado.escuchando.sura === s.numero && estado.escuchando.aya === n;
      el.classList.toggle("actual", n === estado.aya);
      el.classList.toggle("marcada", marcada);
      el.classList.toggle("escuchando", recitando);
      if (arabe) continue;
      var info = "";
      if (recitando) info += "<span>" + icono("altavoz") + (estado.sonando ? "Recitando" : "Recitación en pausa") + "</span>";
      if (esPunto) info += "<span>" + icono("pin") + "Punto de lectura</span>";
      if (marcada) info += '<span class="es-marcada">' + icono("marcadorLleno") + "Marcada</span>";
      if (!info) info = '<span class="solo-lector">Aleya ' + n + "</span>";
      el.querySelector(".aleya-estado").innerHTML = info;
      var boton = el.querySelector('[data-accion="marcar"]');
      boton.setAttribute("aria-pressed", String(marcada));
      boton.innerHTML = icono(marcada ? "marcadorLleno" : "marcador") + '<span class="etiqueta">' + (marcada ? "Marcada" : "Marcar") + "</span>";
      boton.title = marcada ? "Quitar marcador" : "Marcar aleya";
      boton.disabled = !marcada && estado.marcas.size >= MAX_MARCAS;
    }
    actualizarContexto();
  }
  function actualizarContexto() {
    var ctx = $("#contexto");
    if (estado.modoDibujado !== "arabe") { ctx.hidden = true; return; }
    var s = suraActual(), n = estado.aya;
    var marcada = estado.marcas.has(clave(s.numero, n));
    ctx.hidden = false;
    ctx.innerHTML = '<span class="contexto-ref">' + s.numero + ":" + n + "</span>" +
      '<p class="contexto-texto" lang="es">' + esc(corpus.es[s.numero - 1][n - 1]) + "</p>" +
      '<div class="acciones">' +
      '<button class="accion" data-accion="escuchar" title="Escuchar desde aquí">' + icono("play") + '<span class="etiqueta">Escuchar</span></button>' +
      '<button class="accion" data-accion="marcar" aria-pressed="' + marcada + '"' + (!marcada && estado.marcas.size >= MAX_MARCAS ? " disabled" : "") + ">" + icono(marcada ? "marcadorLleno" : "marcador") + '<span class="etiqueta">' + (marcada ? "Marcada" : "Marcar") + "</span></button>" +
      '<button class="accion" data-accion="continuar" title="Guardar como punto de lectura">' + icono("pin") + '<span class="etiqueta">Continuar aquí</span></button></div>';
  }

  // ── Barra del lector ─────────────────────────────────────────────
  function actualizarBarra() {
    var s = suraActual();
    $("#barra-nombre").textContent = s.numero + ". " + s.nombre;
    $("#barra-arabe").textContent = s.arabe;
    $("#sura-anterior").disabled = s.numero === 1;
    $("#sura-siguiente").disabled = s.numero === 114;
    $("#barra-posicion").textContent = "Aleya " + estado.visible + " de " + s.total;
    $("#pista-relleno").style.width = (estado.visible / s.total * 100) + "%";
    var retomar = $("#retomar");
    var p = estado.punto;
    var mostrar = !!p && (p.sura !== s.numero || p.aya !== estado.aya);
    retomar.hidden = !mostrar;
    if (mostrar) {
      retomar.textContent = "Retomar " + p.sura + ":" + p.aya;
      retomar.title = "Volver al punto de lectura: " + corpus.suras[p.sura - 1].nombre + ", aleya " + p.aya;
    }
  }
  // Posición de lectura según el desplazamiento: solo informa, no guarda.
  var medicionPendiente = false;
  function medirVisible() {
    var hoja = $("#hoja");
    var tope = hoja.getBoundingClientRect().top + 64;
    var s = suraActual();
    var visible = 1;
    for (var n = 1; n <= s.total; n++) {
      var el = elementoAleya(n);
      if (el && el.getBoundingClientRect().bottom > tope) { visible = n; break; }
      visible = n;
    }
    if (hoja.scrollTop + hoja.clientHeight >= hoja.scrollHeight - 4) visible = s.total;
    estado.visible = visible;
    actualizarBarra();
  }
  $("#hoja").addEventListener("scroll", function () {
    if (medicionPendiente || !corpus) return;
    medicionPendiente = true;
    requestAnimationFrame(function () { medicionPendiente = false; medirVisible(); });
  });

  // ── Navegación ───────────────────────────────────────────────────
  function irA(sura, aya) {
    var cambia = sura !== estado.sura;
    estado.sura = sura;
    estado.aya = aya;
    if (cambia) dibujarSura();
    else { actualizarAleyas(); actualizarBarra(); llevarA(aya, false); }
  }
  $("#sura-anterior").addEventListener("click", function () { if (estado.sura > 1) irA(estado.sura - 1, 1); });
  $("#sura-siguiente").addEventListener("click", function () { if (estado.sura < 114) irA(estado.sura + 1, 1); });
  $("#retomar").addEventListener("click", function () { if (estado.punto) irA(estado.punto.sura, estado.punto.aya); });

  // Clic en una aleya: la selecciona para sus acciones. No guarda nada.
  $("#hoja").addEventListener("click", function (e) {
    var t = e.target;
    var accion = t.closest("[data-accion]");
    if (accion) {
      // Una acción en otra aleya (visible al pasar el mouse) actúa sobre esa aleya.
      var propia = accion.closest("[data-aya]");
      if (propia) estado.aya = Number(propia.getAttribute("data-aya"));
      ejecutar(accion.getAttribute("data-accion"));
      return;
    }
    var ir = t.closest("[data-ir]");
    if (ir) { irA(Number(ir.getAttribute("data-ir")), 1); return; }
    if (t.closest("[data-fuentes]")) { e.preventDefault(); anunciar("En la app, las fuentes y condiciones completas se abren en un panel."); return; }
    var aleya = t.closest("[data-aya]");
    if (aleya) {
      estado.aya = Number(aleya.getAttribute("data-aya"));
      actualizarAleyas();
      actualizarBarra();
    }
  });
  function ejecutar(accion) {
    var s = suraActual(), n = estado.aya, k = clave(s.numero, n);
    if (accion === "marcar") {
      if (estado.marcas.has(k)) { estado.marcas.delete(k); anunciar("Marcador quitado de " + k + "."); }
      else if (estado.marcas.size < MAX_MARCAS) { estado.marcas.add(k); anunciar("Aleya " + k + " marcada."); }
    } else if (accion === "continuar") {
      estado.punto = { sura: s.numero, aya: n };
      anunciar("Punto de lectura guardado en " + k + ".");
    } else if (accion === "escuchar") {
      estado.escuchando = { sura: s.numero, aya: n };
      estado.sonando = true;
      actualizarReproductor();
    }
    actualizarAleyas();
    actualizarBarra();
  }

  // ── Reproductor (sin audio: solo muestra la presentación) ────────
  function actualizarReproductor() {
    var pos = estado.escuchando || { sura: estado.sura, aya: estado.aya };
    $("#rep-nombre").textContent = corpus.suras[pos.sura - 1].nombre;
    $("#rep-ref").textContent = pos.sura + ":" + pos.aya;
    var activa = !!estado.escuchando;
    var etiqueta = estado.sonando ? "Pausar recitación" : activa ? "Reanudar recitación" : "Escuchar desde " + pos.sura + ":" + pos.aya;
    var play = $("#rep-play");
    play.innerHTML = icono(estado.sonando ? "pausa" : "play");
    play.setAttribute("aria-label", etiqueta);
    play.title = etiqueta;
    $("#rep-anterior").disabled = !activa || estado.escuchando.aya === 1;
    $("#rep-siguiente").disabled = !activa || estado.escuchando.aya === corpus.suras[estado.escuchando.sura - 1].total;
    $("#rep-detener").disabled = !activa;
  }
  $("#rep-play").addEventListener("click", function () {
    if (!estado.escuchando) estado.escuchando = { sura: estado.sura, aya: estado.aya };
    estado.sonando = !estado.sonando;
    actualizarReproductor(); actualizarAleyas();
  });
  $("#rep-anterior").addEventListener("click", function () { if (estado.escuchando) { estado.escuchando.aya--; actualizarReproductor(); actualizarAleyas(); } });
  $("#rep-siguiente").addEventListener("click", function () { if (estado.escuchando) { estado.escuchando.aya++; actualizarReproductor(); actualizarAleyas(); } });
  $("#rep-detener").addEventListener("click", function () { estado.escuchando = null; estado.sonando = false; actualizarReproductor(); actualizarAleyas(); });
  $("#rep-posicion").addEventListener("click", function () {
    var pos = estado.escuchando || { sura: estado.sura, aya: estado.aya };
    if (pos.sura !== estado.sura) irA(pos.sura, pos.aya); else llevarA(pos.aya, false);
  });

  // ── Modo enfoque ─────────────────────────────────────────────────
  function entrarEnfoque() {
    document.body.classList.add("enfoque");
    $("#salir-enfoque").hidden = false;
    $("#salir-enfoque").focus();
  }
  function salirEnfoque() {
    document.body.classList.remove("enfoque");
    $("#salir-enfoque").hidden = true;
    $("#entrar-enfoque").focus();
  }
  $("#entrar-enfoque").addEventListener("click", entrarEnfoque);
  $("#salir-enfoque").addEventListener("click", salirEnfoque);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("enfoque") && !document.querySelector("dialog[open]")) salirEnfoque();
  });

  // ── Paneles ──────────────────────────────────────────────────────
  function abrir(id) { var d = document.getElementById(id); if (!d.open) d.showModal(); }
  Array.prototype.forEach.call(document.querySelectorAll("dialog.panel"), function (d) {
    d.querySelector(".cerrar").innerHTML = icono("cerrar");
    d.querySelector(".cerrar").addEventListener("click", function () { d.close(); });
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
  });

  // Índice de suras
  function normalizar(t) { return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ'’\-\s]/g, ""); }
  function construirIndice() {
    $("#indice-lista").innerHTML = corpus.suras.map(function (s) {
      return '<li data-filtro="' + esc(s.numero + " " + normalizar(s.nombre) + " " + s.arabe) + '"><button data-sura="' + s.numero + '">' +
        '<span class="indice-num">' + s.numero + '</span><span class="indice-nombre"><b>' + esc(s.nombre) + "</b><span>" + s.tipo + " · " + s.total + " aleyas</span></span>" +
        '<span class="indice-ar" lang="ar" dir="rtl">' + esc(s.arabe) + "</span></button></li>";
    }).join("");
  }
  function abrirIndice() {
    $("#indice-filtro").value = "";
    filtrarIndice();
    Array.prototype.forEach.call(document.querySelectorAll("#indice-lista button"), function (b) {
      b.setAttribute("aria-current", String(Number(b.getAttribute("data-sura")) === estado.sura));
    });
    abrir("indice");
    // El foco va a la sura actual (no al filtro): en Android no abre el teclado
    // y la lista queda centrada en lo que se está leyendo.
    var actual = document.querySelector('#indice-lista button[aria-current="true"]');
    if (actual) { actual.focus({ preventScroll: true }); actual.scrollIntoView({ block: "center" }); }
  }
  function filtrarIndice() {
    var f = normalizar($("#indice-filtro").value);
    Array.prototype.forEach.call(document.querySelectorAll("#indice-lista li"), function (li) {
      var datos = li.getAttribute("data-filtro");
      li.hidden = !!f && !(datos.split(" ")[0] === f || datos.indexOf(f) !== -1);
    });
  }
  $("#indice-filtro").addEventListener("input", filtrarIndice);
  $("#indice-lista").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sura]");
    if (!b) return;
    $("#indice").close();
    irA(Number(b.getAttribute("data-sura")), 1);
  });
  $("#abrir-indice").addEventListener("click", abrirIndice);
  $("#barra-titulo").addEventListener("click", abrirIndice);

  // Marcadores
  function dibujarMarcadores() {
    var lista = Array.from(estado.marcas).map(posicion).sort(function (a, b) { return a.sura - b.sura || a.aya - b.aya; });
    var cont = $("#marcadores-contenido");
    if (!lista.length) { cont.innerHTML = '<p class="vacio">Todavía no tenés marcadores. Usá «Marcar» en una aleya.</p>'; return; }
    cont.innerHTML = '<ul class="lista-marcadores">' + lista.map(function (p) {
      var k = clave(p.sura, p.aya);
      return '<li><span class="ref">' + k + "<span>" + esc(corpus.suras[p.sura - 1].nombre) + ", aleya " + p.aya + "</span></span>" +
        '<button class="boton" data-ir-marca="' + k + '">Ir</button><button class="enlace" data-quitar="' + k + '" aria-label="Quitar marcador de ' + k + '">Quitar</button></li>';
    }).join("") + "</ul>" + (estado.marcas.size >= MAX_MARCAS ? '<p class="vacio">Alcanzaste el máximo de 1000 marcadores. Quitá alguno para agregar otro.</p>' : "");
  }
  $("#marcadores-contenido").addEventListener("click", function (e) {
    var ir = e.target.closest("[data-ir-marca]");
    var quitar = e.target.closest("[data-quitar]");
    if (ir) { var p = posicion(ir.getAttribute("data-ir-marca")); $("#marcadores").close(); irA(p.sura, p.aya); }
    if (quitar) { estado.marcas.delete(quitar.getAttribute("data-quitar")); dibujarMarcadores(); actualizarAleyas(); }
  });
  $("#abrir-marcadores").addEventListener("click", function () { dibujarMarcadores(); abrir("marcadores"); });

  // Preferencias: vista de lo guardado → Editar → Guardar o Cancelar.
  function aplicarPreferencias(p) {
    document.body.setAttribute("data-tema", p.tema);
    document.body.setAttribute("data-modo", p.modo);
    var raiz = document.documentElement.style;
    raiz.setProperty("--ar-size", p.ar + "px");
    raiz.setProperty("--es-size", p.es + "px");
    raiz.setProperty("--columna", COLUMNAS[p.columna][1]);
    raiz.setProperty("--ar-interlineado", String(INTERLINEADOS[p.interlineado][1]));
    if (corpus && estado.modoDibujado && estado.modoDibujado !== p.modo) dibujarSura();
  }
  function segmentos(nombre, opciones, valor) {
    return '<div class="segmentos">' + Object.keys(opciones).map(function (k) {
      var etiqueta = Array.isArray(opciones[k]) ? opciones[k][0] : opciones[k];
      return '<label><input type="radio" name="' + nombre + '" value="' + k + '"' + (k === valor ? " checked" : "") + ">" + etiqueta + "</label>";
    }).join("") + "</div>";
  }
  function dibujarPreferencias() {
    var p = estado.prefs, b = estado.borrador, cont = $("#preferencias-contenido");
    if (!b) {
      cont.innerHTML = '<div class="prefs"><div class="prefs-resumen">' +
        "<div><span>Modo</span><b>" + MODOS[p.modo] + "</b></div><div><span>Tema de lectura</span><b>" + TEMAS[p.tema] + "</b></div>" +
        "<div><span>Árabe · español</span><b>" + p.ar + " px · " + p.es + " px</b></div><div><span>Columna · interlineado</span><b>" + COLUMNAS[p.columna][0] + " · " + INTERLINEADOS[p.interlineado][0] + "</b></div>" +
        '</div><div class="prefs-acciones"><button class="boton primario" id="editar-lectura">Editar lectura</button></div></div>';
      $("#editar-lectura").addEventListener("click", function () { estado.borrador = Object.assign({}, estado.prefs); dibujarPreferencias(); });
      return;
    }
    cont.innerHTML = '<form class="prefs" id="form-prefs">' +
      "<fieldset><legend>Modo</legend>" + segmentos("modo", MODOS, b.modo) + "</fieldset>" +
      "<fieldset><legend>Tema de lectura</legend>" + segmentos("tema", TEMAS, b.tema) + "</fieldset>" +
      '<label class="campo" for="pref-ar">Tamaño del árabe · <span id="v-ar">' + b.ar + ' px</span></label><input id="pref-ar" name="ar" type="range" min="22" max="48" value="' + b.ar + '">' +
      '<label class="campo" for="pref-es" style="margin-top:12px">Tamaño del español · <span id="v-es">' + b.es + ' px</span></label><input id="pref-es" name="es" type="range" min="12" max="24" value="' + b.es + '">' +
      '<fieldset style="margin-top:14px"><legend>Ancho de columna</legend>' + segmentos("columna", COLUMNAS, b.columna) + "</fieldset>" +
      "<fieldset><legend>Interlineado del árabe</legend>" + segmentos("interlineado", INTERLINEADOS, b.interlineado) + "</fieldset>" +
      '<p class="nota">Vista previa en el texto. El tema, el ancho, el interlineado y el modo de corrido serían preferencias nuevas del lector, guardadas junto a las actuales.</p>' +
      '<div class="prefs-acciones"><button type="button" class="boton" id="cancelar-prefs">Cancelar</button><button type="submit" class="boton primario">Guardar preferencias</button></div></form>';
    var form = $("#form-prefs");
    form.addEventListener("input", function (e) {
      var t = e.target;
      estado.borrador[t.name] = t.type === "range" ? Number(t.value) : t.value;
      if (t.name === "ar") $("#v-ar").textContent = t.value + " px";
      if (t.name === "es") $("#v-es").textContent = t.value + " px";
      aplicarPreferencias(estado.borrador);
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      estado.prefs = estado.borrador;
      estado.borrador = null;
      anunciar("Preferencias guardadas.");
      dibujarPreferencias();
    });
    $("#cancelar-prefs").addEventListener("click", cancelarPreferencias);
  }
  function cancelarPreferencias() {
    if (!estado.borrador) return;
    estado.borrador = null;
    aplicarPreferencias(estado.prefs);
    dibujarPreferencias();
  }
  $("#abrir-preferencias").addEventListener("click", function () { dibujarPreferencias(); abrir("preferencias"); });
  // Cerrar el panel con una edición abierta la descarta, como al salir del lector en la app.
  $("#preferencias").addEventListener("close", cancelarPreferencias);

  // ── Íconos estáticos y arranque ──────────────────────────────────
  $("#abrir-indice").innerHTML = icono("lista");
  $("#sura-anterior").innerHTML = icono("izq");
  $("#sura-siguiente").innerHTML = icono("der");
  $("#abrir-marcadores").innerHTML = icono("marcador");
  $("#entrar-enfoque").innerHTML = icono("enfoque");
  $("#rep-icono").innerHTML = icono("altavoz");
  $("#rep-anterior").innerHTML = icono("anterior");
  $("#rep-siguiente").innerHTML = icono("siguiente");
  $("#rep-detener").innerHTML = icono("detener");
  $("#rep-play").innerHTML = icono("play");
  cargar();
})();
