# Contribuir a QuitaFondo

¡Gracias por tu interés! Issues y pull requests en **español o inglés** son bienvenidos.
*Contributions in English are welcome too.*

## Preparar el entorno

Requisitos: Node.js 20+ y npm.

```bash
git clone https://github.com/3rikml/quitafondo.git
cd quitafondo
npm install
npm run dev
```

Abre http://localhost:3000. La primera imagen descarga el modelo de IA (~90–110 MB); después queda en la caché del navegador.

> Este proyecto usa Next.js 16. Algunas APIs difieren de versiones anteriores: consulta la documentación incluida en `node_modules/next/dist/docs/` antes de usar una API de Next.

## Antes de abrir un pull request

```bash
npm run lint
npm run test
npm run build
```

Las tres deben pasar; la CI de GitHub corre lo mismo en cada PR.

- Mantén los cambios enfocados: un PR por mejora o corrección.
- Añade o actualiza pruebas en `__tests__/` junto al código que cambies, sobre todo en `lib/` (lógica pura, fácil de probar).
- Si tocas el lienzo o la exportación, revisa que la vista previa y la descarga sigan coincidiendo (ambas usan `lib/image/drawSubject.ts`).
- Si cambias la UI, incluye una captura en el PR y pruébala también a ancho de móvil.
- Los textos de la interfaz están en español.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `app/` | Página principal, layout, manifiesto PWA |
| `components/Editor/` | Lienzo y paneles del editor |
| `hooks/` | Cola de procesamiento, cliente del worker de IA, entrada global de imágenes |
| `lib/ai/` | Web Worker de IA (quitar fondo y mejorar calidad), su protocolo y el procesado por mosaicos |
| `lib/image/` | Procesamiento de imagen puro (encuadre, retoque, sombras, exportación) |
| `lib/storage/` | Persistencia en IndexedDB |
| `public/sw.js` | Service worker para el modo sin conexión |

## Modelos y licencias

QuitaFondo es MIT. Cualquier modelo o dependencia nueva debe tener una licencia compatible (MIT, Apache-2.0, BSD…). No se aceptan modelos con licencias no comerciales (p. ej. RMBG de BRIA) ni copyleft fuerte (AGPL).

## Reportar errores

Usa la plantilla de *bug report* e incluye navegador, sistema operativo y, si puedes, los mensajes de la consola (la app registra con `[QuitaFondo]` qué modelo y dispositivo usó).
