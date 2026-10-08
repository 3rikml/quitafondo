# Hoja de ruta

**Español** · [English](#english)

Ideas y pendientes, en orden de prioridad. ¿Quieres tomar alguno? Abre un issue para coordinarlo.

## 1. Demo y presentación

- [ ] Demo en vivo (Vercel o GitHub Pages), comprobando las cabeceras de aislamiento (COOP/COEP) que necesita ONNX Runtime y la descarga de los modelos desde ese dominio.
- [ ] GIF corto en el README: subir foto → quitar fondo → descargar.
- [ ] Capturas en tema oscuro y claro, e imagen de vista previa para redes (Open Graph).
- [ ] Insignias (CI, licencia) y temas del repositorio en GitHub.

## 2. Errores conocidos

- [ ] Tras "Mejorar calidad", deshacer puede volver a pasos guardados para el tamaño anterior de la foto.
- [ ] Lo pintado con el borrador mágico (sin aplicar) se pierde al mejorar la calidad.
- [ ] Investigar un "Maximum update depth exceeded" visto una vez durante un trazo de retoque (no reproducido aún).

## 3. Funciones

- [ ] Medidas para tiendas y redes con un clic (Amazon, Mercado Libre, Instagram, WhatsApp Business), aplicables a todo el lote.
- [ ] Efecto sticker: contorno blanco alrededor del sujeto.
- [ ] Plantillas: guardar fondo, sombra, tamaño y margen y aplicarlos a muchas fotos.
- [ ] Texto sobre la imagen (precio, nombre, "OFERTA").

## 4. Rendimiento

- [ ] Avisar el tamaño de cada modelo antes de descargarlo (LaMa pesa ~208 MB).
- [ ] Probar LaMa en WebGPU para un borrado más rápido.

---

<a id="english"></a>

# Roadmap (English)

Ideas and open work, by priority. Want to pick one up? Open an issue first.

1. **Demo and presentation**: live demo (Vercel or GitHub Pages, checking the COOP/COEP headers ONNX Runtime needs), a short GIF in the README, dark/light screenshots and an Open Graph image, badges and repository topics.
2. **Known bugs**: undo after "Improve quality" can return to steps saved for the old photo size; unapplied magic-eraser strokes are lost when improving quality; a "Maximum update depth exceeded" seen once during a retouch stroke (not reproduced yet).
3. **Features**: one-click store/social sizes (Amazon, Mercado Libre, Instagram, WhatsApp Business) for the whole batch; sticker outline; reusable templates; text over the image.
4. **Performance**: show each model's download size before fetching it (LaMa is ~208 MB); try LaMa on WebGPU.
