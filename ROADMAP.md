# Hoja de ruta

**Español** · [English](#english)

Ideas y pendientes, en orden de prioridad. ¿Quieres tomar alguno? Abre un issue para coordinarlo.

## 1. Demo y presentación

- [ ] Demo en vivo (Vercel o GitHub Pages), comprobando las cabeceras de aislamiento (COOP/COEP) que necesita ONNX Runtime y la descarga de los modelos desde ese dominio.
- [x] GIF corto en el README: subir foto → quitar fondo → elegir fondo.
- [x] Capturas en tema oscuro y claro, e imagen de vista previa para redes (Open Graph).
- [x] Insignias (CI, licencia) y temas del repositorio en GitHub.

## 2. Errores conocidos

- [ ] Lo pintado con el borrador mágico (sin aplicar) se pierde al mejorar la calidad.
- [ ] Investigar un "Maximum update depth exceeded" visto una vez durante un trazo de retoque. No se reproduce con pruebas de estrés aleatorias en modo desarrollo; si vuelve a salir, anota el texto completo del error.

## 3. Funciones

- [ ] Medidas para tiendas y redes con un clic (Amazon, Mercado Libre, Instagram, WhatsApp Business), aplicables a todo el lote.
- [ ] Efecto sticker: contorno blanco alrededor del sujeto.
- [ ] Plantillas: guardar fondo, sombra, tamaño y margen y aplicarlos a muchas fotos.
- [ ] Texto sobre la imagen (precio, nombre, "OFERTA").

## 4. Rendimiento

- [x] Avisar el tamaño de cada modelo antes de descargarlo.
- [ ] Cuando la GPU no soporta BiRefNet (Apple Silicon), buscar o adaptar un modelo de calidad cercana que sí corra en WebGPU: hoy el modo "máxima calidad" usa BEN2 en CPU (~1 min por foto).
- [ ] Probar LaMa en WebGPU para un borrado más rápido.

---

<a id="english"></a>

# Roadmap (English)

Ideas and open work, by priority. Want to pick one up? Open an issue first.

1. **Demo and presentation**: live demo (Vercel or GitHub Pages, checking the COOP/COEP headers ONNX Runtime needs). Done: README GIF, dark/light screenshots, Open Graph image, badges and repository topics.
2. **Known bugs**: unapplied magic-eraser strokes are lost when improving quality; a "Maximum update depth exceeded" seen once during a retouch stroke (not reproduced, even with randomized stress runs in development mode; if it shows up again, note the full error text).
3. **Features**: one-click store/social sizes (Amazon, Mercado Libre, Instagram, WhatsApp Business) for the whole batch; sticker outline; reusable templates; text over the image.
4. **Performance**: try LaMa on WebGPU; find or adapt a model close to BiRefNet that runs on WebGPU when the GPU does not fit it (Apple Silicon): today the "maximum quality" option runs BEN2 on the CPU (~1 min a photo). Model download sizes are now shown before fetching.
