# QuitaFondo

**Español** · [English](#english)

QuitaFondo es un editor de imágenes en el navegador para quitar el fondo de fotos, reencuadrarlas y exportarlas en lote. Todo el procesamiento ocurre **100% en el cliente** (WebGPU/WebAssembly): no hay backend, no se suben imágenes a ningún servidor y no se requiere ninguna API key.

## Privacidad

Tus fotos **nunca salen de tu equipo**. El modelo de IA se descarga una sola vez desde Hugging Face y corre dentro de tu navegador; después la app funciona incluso sin internet.

## Funcionalidades

- **Quitar fondo automáticamente** con IA, en un Web Worker para que la interfaz nunca se congele. Usa WebGPU cuando está disponible y WebAssembly si no.
- **Pega (Ctrl/Cmd+V) o arrastra** imágenes a cualquier parte de la ventana; la imagen se abre sola mientras se procesa.
- **Comparar antes/después** con un deslizador sobre el lienzo.
- **Fondos**: galería de colores y degradados, color o degradado personalizado, tu propia imagen o la **foto original desenfocada** (efecto retrato).
- **Sombras** suave o de contacto, con intensidad ajustable.
- **Reencuadrar y centrar el sujeto**, con presets (cuadrado, retrato 4:5, historia 9:16) o un tamaño personalizado.
- **Recorte**, **mover, redimensionar y rotar** el sujeto directamente sobre el lienzo.
- **Selección mágica con un clic** (SlimSAM): haz clic en un objeto para quitarlo del recorte o agregarlo de vuelta, y elige entre 3 tamaños de selección.
- **Borrador mágico** (LaMa): pinta sobre algo de la foto —una persona al fondo, un logo, una mancha— y la IA lo borra rellenando el hueco.
- **Luz y color**: brillo, contraste, saturación y temperatura del sujeto, y un botón para **armonizarlo con el fondo** elegido.
- **Bordes finos**: suavizar, contraer/expandir y quitar el halo de color del fondo original.
- **Retoque manual** (borrar/restaurar) con pincel, incluyendo un modo "inteligente" por flood-fill.
- **Mejora de resolución (upscaling) 2x** con Swin2SR en el mismo worker, por mosaicos, sin congelar la interfaz.
- **Deshacer/rehacer** por imagen.
- **Descarga en 1 clic** y **exportación en lote (ZIP)** a PNG, JPG o WebP.
- **Instalable (PWA) y funciona sin conexión** después de la primera visita.
- **Interfaz en español e inglés**, según el idioma del navegador o con el botón del encabezado.
- Persistencia local (IndexedDB) para no perder el trabajo al recargar.

## Empezar

Requisitos: Node.js 20+ y npm.

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # build de producción
npm run start   # sirve el build de producción (incluye el service worker)
npm run lint    # ESLint
npm run test    # pruebas (Vitest)
```

## Cómo funciona

```
Imagen ──► Web Worker (lib/ai/ai.worker.ts)
              │  Transformers.js + ONNX Runtime Web
              │  WebGPU ─► BiRefNet_lite   (GPUs compatibles)
              │  WebGPU ─► IS-Net          (Apple Silicon)
              │  WASM   ─► IS-Net          (sin GPU / respaldo)
              ▼
         recorte PNG ──► EditorCanvas (fondo, sombra, encuadre, retoque) ──► PNG/JPG/WebP/ZIP
```

- `lib/ai/client.ts`: cliente del worker. Si WebGPU falla en plena inferencia, reemplaza el worker, corre esa tarea en WASM y lo recuerda para la próxima visita.
- `lib/image/drawSubject.ts`: dibuja sujeto y sombra; lo comparten la vista previa y la exportación para que coincidan píxel a píxel.
- `public/sw.js`: service worker que guarda la app para usarla sin conexión.

## Modelos de IA

| Modelo | Licencia | Cuándo se usa |
| --- | --- | --- |
| [BiRefNet_lite](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) | MIT | GPUs con WebGPU que soportan el modelo (mejor calidad) |
| [IS-Net general-use](https://huggingface.co/imgly/isnet-general-onnx) | MIT (pesos originales Apache-2.0) | Apple Silicon y equipos sin WebGPU |
| [Swin2SR lightweight x2](https://huggingface.co/Xenova/swin2SR-lightweight-x2-64) | Apache-2.0 | "Mejorar calidad" (fotos de hasta ~1 MP) |
| [SlimSAM](https://huggingface.co/Xenova/slimsam-77-uniform) | Apache-2.0 | Selección mágica con un clic |
| [LaMa](https://huggingface.co/Carve/LaMa-ONNX) | Apache-2.0 | Borrador mágico (~208 MB, CPU) |

## Stack técnico

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Transformers.js](https://github.com/huggingface/transformers.js) (ONNX Runtime Web) para quitar fondos y mejorar la calidad
- Tailwind CSS, Vitest

## Contribuir

¡Las contribuciones son bienvenidas! Lee [CONTRIBUTING.md](./CONTRIBUTING.md) y el [Código de Conducta](./CODE_OF_CONDUCT.md).

## Licencia

MIT — ver [LICENSE](./LICENSE).

---

<a id="english"></a>

# QuitaFondo (English)

QuitaFondo is an in-browser image editor to remove photo backgrounds, reframe subjects and batch-export the results. Everything runs **100% client-side** (WebGPU/WebAssembly): no backend, no uploads, no API keys.

## Privacy

Your photos **never leave your device**. The AI model is downloaded once from Hugging Face and runs inside your browser; after that the app even works offline.

## Features

- **Automatic background removal** with AI in a Web Worker, so the UI never freezes. Uses WebGPU when available, WebAssembly otherwise.
- **Paste (Ctrl/Cmd+V) or drop** images anywhere; the image opens right away while it is processed.
- **Before/after comparison** slider.
- **Backgrounds**: preset colors and gradients, custom color/gradient, your own image, or the **blurred original photo** (portrait effect).
- **Soft or contact shadows** with adjustable intensity.
- **Reframe and center** with presets (square, 4:5 portrait, 9:16 story) or a custom size; crop, move, resize and rotate on the canvas.
- **One-click magic selection** (SlimSAM): click an object to remove it from the cutout or add it back, with 3 selection sizes to choose from.
- **Magic eraser** (LaMa): paint over something in the photo — a person in the back, a logo, a stain — and the AI removes it, filling the gap.
- **Light & color**: brightness, contrast, saturation and temperature of the subject, plus a button to **match it to the chosen background**.
- **Fine edges**: soften, shrink/grow and remove the old background's color halo.
- **Manual retouch** (erase/restore) brush with a "smart" flood-fill mode.
- **2x upscaling** with Swin2SR in the same worker, tile by tile, without freezing the UI.
- Per-image **undo/redo**.
- **One-click download** and **batch ZIP export** as PNG, JPG or WebP.
- **Installable PWA that works offline** after the first visit.
- **Spanish and English interface**, following the browser language or the header toggle.
- Local persistence (IndexedDB) so a reload never loses your work.

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). See the commands and architecture overview in the Spanish section above.

## AI models

| Model | License | Used on |
| --- | --- | --- |
| [BiRefNet_lite](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) | MIT | WebGPU adapters that can run it (best quality) |
| [IS-Net general-use](https://huggingface.co/imgly/isnet-general-onnx) | MIT (original weights Apache-2.0) | Apple Silicon and devices without WebGPU |
| [Swin2SR lightweight x2](https://huggingface.co/Xenova/swin2SR-lightweight-x2-64) | Apache-2.0 | "Improve quality" (photos up to ~1 MP) |
| [SlimSAM](https://huggingface.co/Xenova/slimsam-77-uniform) | Apache-2.0 | One-click magic selection |
| [LaMa](https://huggingface.co/Carve/LaMa-ONNX) | Apache-2.0 | Magic eraser (~208 MB, CPU) |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md). Issues and pull requests in English or Spanish are both fine.

## License

MIT — see [LICENSE](./LICENSE).
