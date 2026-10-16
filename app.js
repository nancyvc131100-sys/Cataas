"use strict";

// ---------- Configuración ----------
const API = "https://cataas.com";
const POR_PAGINA = 12;
const VENTANA = 2;

// ---------- Estado de la galería ----------
let paginaActual = 1;
let etiqueta = "";
let totalGatos = null;
let totalPaginas = null;
let hayMas = false;
let controladorPagina = null;

// ---------- Elementos del HTML ----------
const galeria = document.getElementById("galeria");
const estado = document.getElementById("estado");
const paginacion = document.getElementById("paginacion");
const resumen = document.getElementById("resumen");
const inputEtiqueta = document.getElementById("inputEtiqueta");
const listaEtiquetas = document.getElementById("listaEtiquetas");
const btnLimpiar = document.getElementById("btnLimpiar");

// ---------- Cargar una página de la galería ----------
async function cargarPagina(pagina) {
	// Si se inicia otra búsqueda, cancelo la petición anterior.
	// Así una respuesta vieja no reemplaza los resultados nuevos.
	if (controladorPagina) {
		controladorPagina.abort();
	}

	const controlador = new AbortController();
	controladorPagina = controlador;
	paginaActual = pagina;

	const skip = (pagina - 1) * POR_PAGINA;
	const params = new URLSearchParams({
		limit: String(POR_PAGINA + 1),
		skip: String(skip)
	});

	if (etiqueta) {
		params.set("tags", etiqueta);
	}

	mostrarCargando();

	try {
		const respuesta = await fetch(`${API}/api/cats?${params.toString()}`, {
			signal: controlador.signal
		});

		if (!respuesta.ok) {
			throw new Error(`La API respondió con el estado ${respuesta.status}.`);
		}

		const lista = await respuesta.json();

		if (!Array.isArray(lista)) {
			throw new Error("La API no devolvió una lista de gatos válida.");
		}

		hayMas = lista.length > POR_PAGINA;
		const gatos = lista.slice(0, POR_PAGINA);

		// El total general solo corresponde cuando no se ha aplicado un filtro.
		if (!etiqueta) {
			if (totalGatos === null) {
				totalGatos = await obtenerTotal(controlador.signal);
			}

			totalPaginas = Number.isFinite(totalGatos)
				? Math.ceil(totalGatos / POR_PAGINA)
				: null;
		} else {
			totalPaginas = null;
		}

		// Si otra petición empezó entretanto, ignoro esta respuesta.
		if (controlador !== controladorPagina) {
			return;
		}

		dibujarGatos(gatos);
		dibujarPaginacion();
		window.scrollTo({ top: 0, behavior: "smooth" });
	} catch (error) {
		if (error.name === "AbortError") {
			return;
		}

		if (controlador !== controladorPagina) {
			return;
		}

		mostrarError(error, pagina);
		console.error("No se pudo cargar la galería:", error);
	}
}

// ---------- Obtener el total del catálogo ----------
async function obtenerTotal(signal) {
	try {
		const respuesta = await fetch(`${API}/api/count`, { signal });

		if (!respuesta.ok) {
			return null;
		}

		const json = await respuesta.json();

		return typeof json.count === "number" && Number.isFinite(json.count)
			? json.count
			: null;
	} catch (error) {
		// Una cancelación debe llegar a cargarPagina para que se respete.
		if (error.name === "AbortError") {
			throw error;
		}

		console.warn("No se pudo obtener el total de gatos:", error);
		return null;
	}
}

// ---------- Dibujar las tarjetas ----------
function dibujarGatos(gatos) {
	estado.replaceChildren();
	galeria.replaceChildren();

	if (gatos.length === 0) {
		resumen.textContent = "";

		const aviso = document.createElement("div");
		aviso.className = "alert alert-light border";
		aviso.textContent = etiqueta
			? `No encontramos gatos con la etiqueta «${etiqueta}». Prueba con otra.`
			: "No hay gatos para mostrar en esta página.";

		estado.appendChild(aviso);
		return;
	}

	const desde = (paginaActual - 1) * POR_PAGINA + 1;
	const hasta = desde + gatos.length - 1;

	resumen.textContent = Number.isFinite(totalGatos) && totalPaginas !== null && !etiqueta
		? `Mostrando ${desde}–${hasta} de ${totalGatos.toLocaleString("es-PE")} gatos`
		: `Página ${paginaActual} · mostrando ${desde}–${hasta}`;

	const fragmento = document.createDocumentFragment();

	gatos.forEach((gato) => {
		const columna = document.createElement("div");
		columna.className = "col-12 col-sm-6 col-lg-4 col-xl-3";

		const tarjeta = document.createElement("article");
		tarjeta.className = "card h-100";

		const idGato = gato.id || gato._id;
		const imagen = document.createElement("img");
		imagen.className = "card-img-top gato-img";
		imagen.loading = "lazy";
		imagen.alt = "Fotografía de un gato de Cataas";

		if (idGato) {
			imagen.src = `${API}/cat/${encodeURIComponent(idGato)}`;
		} else if (typeof gato.url === "string") {
			imagen.src = gato.url;
		} else {
			imagen.src = `${API}/cat`;
		}

		imagen.addEventListener("error", () => {
			const avisoImagen = document.createElement("div");
			avisoImagen.className = "gato-img img-fallback";
			avisoImagen.textContent = "Imagen no disponible por ahora";
			imagen.replaceWith(avisoImagen);
		}, { once: true });

		const cuerpo = document.createElement("div");
		cuerpo.className = "card-body";

		if (gato.mimetype === "image/gif") {
			const insigniaGif = document.createElement("span");
			insigniaGif.className = "badge-gif";
			insigniaGif.textContent = "GIF";
			cuerpo.appendChild(insigniaGif);
		}

		const etiquetas = Array.isArray(gato.tags)
			? gato.tags.filter((tag) => typeof tag === "string" && tag.trim()).slice(0, 4)
			: [];

		if (etiquetas.length > 0) {
			etiquetas.forEach((tag) => {
				const insignia = document.createElement("span");
				insignia.className = "etiqueta";
				insignia.textContent = tag;
				cuerpo.appendChild(insignia);
			});
		} else if (gato.mimetype !== "image/gif") {
			const sinEtiquetas = document.createElement("span");
			sinEtiquetas.className = "no-etiquetas";
			sinEtiquetas.textContent = "Sin etiquetas";
			cuerpo.appendChild(sinEtiquetas);
		}

		tarjeta.append(imagen, cuerpo);
		columna.appendChild(tarjeta);
		fragmento.appendChild(columna);
	});

	galeria.appendChild(fragmento);
}

// ---------- Dibujar los controles de paginación ----------
function dibujarPaginacion() {
	paginacion.replaceChildren();

	// No se conoce el total: se usa navegación anterior/siguiente.
	if (totalPaginas === null) {
		if (paginaActual === 1 && !hayMas) {
			return;
		}

		agregarBoton("Anterior", paginaActual - 1, paginaActual === 1);
		agregarBoton(`Página ${paginaActual}`, paginaActual, true, true);
		agregarBoton("Siguiente", paginaActual + 1, !hayMas);
		return;
	}

	if (totalPaginas <= 1) {
		return;
	}

	agregarBoton("Anterior", paginaActual - 1, paginaActual === 1);

	const inicio = Math.max(1, paginaActual - VENTANA);
	const fin = Math.min(totalPaginas, paginaActual + VENTANA);

	if (inicio > 1) {
		agregarBoton("1", 1, false, paginaActual === 1);
		if (inicio > 2) {
			agregarPuntos();
		}
	}

	for (let numero = inicio; numero <= fin; numero += 1) {
		agregarBoton(String(numero), numero, false, numero === paginaActual);
	}

	if (fin < totalPaginas) {
		if (fin < totalPaginas - 1) {
			agregarPuntos();
		}
		agregarBoton(String(totalPaginas), totalPaginas, false, paginaActual === totalPaginas);
	}

	agregarBoton("Siguiente", paginaActual + 1, paginaActual === totalPaginas);
}

function agregarBoton(texto, pagina, deshabilitado = false, activo = false) {
	const elemento = document.createElement("li");
	elemento.className = "page-item";

	if (deshabilitado) {
		elemento.classList.add("disabled");
	}
	if (activo) {
		elemento.classList.add("active");
	}

	const boton = document.createElement("button");
	boton.type = "button";
	boton.className = "page-link";
	boton.textContent = texto;
	boton.disabled = deshabilitado || activo;

	if (activo) {
		boton.setAttribute("aria-current", "page");
		boton.setAttribute("aria-label", `${texto}, página actual`);
	}

	boton.addEventListener("click", () => {
		if (!boton.disabled && !activo) {
			cargarPagina(pagina);
		}
	});

	elemento.appendChild(boton);
	paginacion.appendChild(elemento);
}

function agregarPuntos() {
	const elemento = document.createElement("li");
	elemento.className = "page-item disabled";

	const texto = document.createElement("span");
	texto.className = "page-link";
	texto.textContent = "…";
	texto.setAttribute("aria-hidden", "true");

	elemento.appendChild(texto);
	paginacion.appendChild(elemento);
}

// ---------- Cargar opciones para el buscador ----------
async function cargarEtiquetas() {
	try {
		const respuesta = await fetch(`${API}/api/tags`);

		if (!respuesta.ok) {
			return;
		}

		const tags = await respuesta.json();
		if (!Array.isArray(tags)) {
			return;
		}

		const fragmento = document.createDocumentFragment();

		tags.filter((tag) => typeof tag === "string" && tag.trim())
			.slice(0, 300)
			.forEach((tag) => {
				const opcion = document.createElement("option");
				opcion.value = tag;
				fragmento.appendChild(opcion);
			});

		listaEtiquetas.replaceChildren(fragmento);
	} catch (error) {
		console.warn("No se pudieron cargar las etiquetas; puedes escribir una manualmente.", error);
	}
}

// ---------- Estados de carga y error ----------
function mostrarCargando() {
	estado.replaceChildren();
	galeria.replaceChildren();
	resumen.textContent = "";

	const contenedor = document.createElement("div");
	contenedor.className = "loading-state text-center py-5";

	const spinner = document.createElement("div");
	spinner.className = "spinner-border";
	spinner.setAttribute("role", "status");
	spinner.setAttribute("aria-label", "Cargando");

	const mensaje = document.createElement("p");
	mensaje.className = "mt-3 mb-0 text-secondary";
	mensaje.textContent = "Buscando gatitos…";

	contenedor.append(spinner, mensaje);
	estado.appendChild(contenedor);
}

function mostrarError(error, pagina) {
	estado.replaceChildren();
	galeria.replaceChildren();
	paginacion.replaceChildren();
	resumen.textContent = "";

	const alerta = document.createElement("div");
	alerta.className = "alert alert-warning d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3";

	const mensaje = document.createElement("span");
	mensaje.textContent = error instanceof TypeError
		? "No se pudo conectar con Cataas. Revisa tu conexión e inténtalo de nuevo."
		: error.message || "Ocurrió un problema al cargar los gatitos.";

	const boton = document.createElement("button");
	boton.type = "button";
	boton.className = "btn btn-garden btn-sm align-self-start align-self-sm-center";
	boton.textContent = "Reintentar";
	boton.addEventListener("click", () => cargarPagina(pagina));

	alerta.append(mensaje, boton);
	estado.appendChild(alerta);
}

// ---------- Eventos ----------
document.getElementById("formFiltro").addEventListener("submit", (evento) => {
	evento.preventDefault();
	etiqueta = inputEtiqueta.value.trim().toLowerCase();
	cargarPagina(1);
});

btnLimpiar.addEventListener("click", () => {
	inputEtiqueta.value = "";
	etiqueta = "";
	cargarPagina(1);
});


// ---------- Inicio ----------
cargarEtiquetas();
cargarPagina(1);