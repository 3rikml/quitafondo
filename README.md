# QuitaFondo

QuitaFondo es un editor de imágenes en el navegador para quitar el fondo de fotos, reencuadrarlas y exportarlas en lote. Todo el procesamiento ocurre **100% en el cliente** (WebGPU/WebAssembly): no hay backend, no se suben imágenes a ningún servidor, y no se requiere ninguna API key.

## Funcionalidades

- **Quitar fondo automáticamente** con IA directamente en el navegador, en un Web Worker para que la interfaz nunca se congele. Usa WebGPU cuando está disponible y WebAssembly si no.
- **Reencuadrar y centrar el sujeto**, con presets (cuadrado, retrato 4:5, historia 9:16) o un tamaño personalizado.
- **Recorte (crop)** manual arrastrando un rectángulo sobre la imagen.
- **Mover, redimensionar y rotar** el sujeto directamente sobre el lienzo, incluyendo un control para enderezar fotos torcidas o girarlas en incrementos de 90°.
- **Retoque manual** (borrar/restaurar) con pincel, incluyendo un modo "inteligente" por flood-fill.
- **Fondos personalizables**: transparente, color sólido, degradado o imagen.
- **Mejora de resolución (upscaling)** con un modelo ESRGAN corriendo en el navegador.
- **Deshacer/rehacer** por imagen.
- **Exportación en lote (ZIP)** a PNG, JPG o WebP, aplicando la configuración de cada imagen (o la misma a todas con "Aplicar a todas").
- Persistencia local (IndexedDB) de los trabajos ya procesados, para no perder el progreso al recargar la página.

## Stack técnico

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Transformers.js](https://github.com/huggingface/transformers.js) (ONNX Runtime Web) para la segmentación, con WebGPU o WASM
- [TensorFlow.js](https://www.tensorflow.org/js) para el escalado de imagen
- [UpscalerJS](https://github.com/upscalerjs/upscaler) (ESRGAN) para el escalado de imagen
- Tailwind CSS para los estilos
- Vitest para las pruebas

## Empezar

Requisitos: Node.js 20+ y npm (o tu gestor de paquetes preferido).

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

Otros comandos útiles:

```bash
npm run build   # build de producción
npm run start   # sirve el build de producción
npm run lint    # ESLint
npm run test    # corre las pruebas (Vitest)
```

## Modelos de IA

Los modelos se descargan una sola vez desde Hugging Face y quedan guardados en la caché del navegador. Tus imágenes nunca salen de tu equipo.

| Modelo | Licencia | Cuándo se usa |
| --- | --- | --- |
| [BiRefNet_lite](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) | MIT | GPUs con WebGPU que soportan el modelo (mejor calidad) |
| [IS-Net general-use](https://huggingface.co/imgly/isnet-general-onnx) | MIT (pesos originales Apache-2.0) | Apple Silicon y equipos sin WebGPU |

## Licencia

MIT — ver [LICENSE](./LICENSE).
