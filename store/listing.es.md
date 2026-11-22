# Chrome Web Store, ficha en español — SkipSponsor AI

Spanish store listing for SkipSponsor AI (draft for the CEO's copy approval,
2026-11-21). Same facts and structure as the English listing
(`store/listing.md` §2); written natively in neutral international Spanish
with _usted_. The UI terms match the extension's Spanish catalog
(`public/_locales/es/messages.json`). Side-by-side review:
`store/i18n-es-review.md`.

**When it can be used:** only after a build that ships `_locales/es` (this
branch) is published. The dashboard offers a per-locale description only for
locales the package declares. Until Juan approves this copy and that version
is live, do not paste it anywhere.

How the dashboard uses it:

- **Name:** comes from the package (`extName`, the brand, untranslated).
- **Summary:** comes from the package (`_locales/es/messages.json` →
  `extDescription`); it is not editable in the dashboard.
- **Description:** paste the block below into the Spanish (`es`) locale of the
  Store listing tab.
- **Screenshots:** the current ones show the English UI. Spanish screenshots
  need a new capture of the packaged extension with Chrome in Spanish (same
  method as the English ones); until then the English images are shown.

## Nombre (del manifiesto, máximo 75)

```text
SkipSponsor AI
```

## Resumen (del manifiesto `description`, máximo 132; no se edita en el panel)

```text
Omita las menciones patrocinadas en videos de YouTube. Lee los subtítulos, marca el segmento y lo salta, con Deshacer en un clic.
```

## Descripción (máximo 16 000)

```text
SkipSponsor AI omite las menciones patrocinadas dentro de los videos de YouTube, esa parte de "este video está patrocinado por…", para que usted vuelva al contenido.

No bloquea ni omite los anuncios de YouTube. Solo actúa sobre las menciones pagadas que los creadores incluyen dentro de sus propios videos.

CÓMO FUNCIONA
• Cuando usted abre un video, SkipSponsor AI lee sus subtítulos y un modelo de IA encuentra dónde empieza y dónde termina una mención patrocinada.
• Cuando la reproducción llega a ese tramo, lo salta.
• En el reproductor aparece una pequeña nota, por ejemplo "CORTE 00:06 → 00:43 · Patrocinio · 37 s omitidos". Pulse Deshacer para volver atrás y verla.

USTED TIENE EL CONTROL
• Omitir automáticamente: salta las menciones patrocinadas de forma automática.
• Avisar: marca el tramo y muestra un botón Omitir, para que usted decida cada vez.
• Desactivado: las menciones patrocinadas se reproducen con normalidad.
• Umbral de corte: elija el nivel de certeza que debe tener la IA antes de actuar (50–95 %). El control deslizante muestra los segmentos detectados en el video, para que vea qué se va a cortar.
• No omitir en este canal: apoye a los creadores cuyas menciones quiere escuchar. Administre la lista en Configuración.
• Los cambios se aplican al video que se está reproduciendo, sin recargar la página.

VEA LO QUE ENCONTRÓ
Abra la ventana emergente de la barra de herramientas para ver la línea de tiempo del video actual y una lista de cada segmento detectado: qué se cortó, qué se va a cortar y la confianza de la IA en cada uno.

QUÉ OMITE Y QUÉ NO
• Omite las menciones patrocinadas pagadas dentro de los videos.
• No omite la promoción que un creador hace de sus propios productos o canales.
• No bloquea los anuncios propios de YouTube, y no omite introducciones, cierres ni recordatorios para suscribirse.
• Los videos sin subtítulos no se analizan: la extensión lo indica y el video se reproduce con normalidad.
• Funciona con subtítulos generados automáticamente y con subtítulos subidos por el creador. Se ha probado con videos en inglés, español, portugués, alemán y francés.
• En los bordes de una mención patrocinada, la IA puede desviarse unos segundos, y no detecta algunas menciones, que entonces se reproducen con normalidad. Deshacer siempre está a un clic.
• En nuestra prueba con 178 videos de YouTube con subtítulos, de 75 canales (2026-10-16), el 96,8 % de los segundos que SkipSponsor AI omitió eran menciones patrocinadas.

QUÉ SE ENVÍA Y A DÓNDE
• Para encontrar las menciones patrocinadas, la extensión envía al servidor de SkipSponsor AI el ID del video de YouTube y, en los videos que aún no se han analizado, el texto de sus subtítulos. El servidor le pide a la API de Claude, de Anthropic, que clasifique ese texto.
• También envía un token de instalación anónimo (para limitar la frecuencia de solicitudes y para la cuota diaria) y, salvo que usted lo desactive en Configuración › Privacidad, los eventos de omisión y de deshacer con el ID del video.
• Salvo que usted lo desactive en el mismo lugar, cuenta instalaciones, desinstalaciones y días de uso: un ID aleatorio creado en su navegador, la versión de la extensión y el evento, nunca el video ni la página. Cuando usted la desinstala, Chrome abre una breve página de agradecimiento que lo cuenta.
• Nunca audio ni video. Sin cuenta, sin inicio de sesión, sin nombre ni correo. Solo funciona en www.youtube.com, con un único permiso adicional (storage, almacenamiento).
• Los resultados se guardan por video, no por persona, y se eliminan a los 30 días. Los datos nunca se venden ni se usan para publicidad.

GRATIS
SkipSponsor AI es gratis y no necesita cuenta. Cada navegador tiene una cuota diaria de análisis nuevos con IA. Los videos que ya se analizaron no cuentan para esa cuota. Si la cuota se agota, en los videos ya analizados la omisión sigue funcionando hasta que se renueva.

Política de privacidad: https://juanjaragavi.github.io/skip-sponsor-ai/es/privacy/
Términos de uso: https://juanjaragavi.github.io/skip-sponsor-ai/es/terms/
Soporte: info@devspeak.dev · https://github.com/juanjaragavi/skip-sponsor-ai/issues

SkipSponsor AI es un producto independiente de Devspeak S.A.S. No está afiliado a YouTube ni a Google, ni cuenta con su respaldo.

© 2026 Devspeak S.A.S. · DevSpeak Labs
```

## Idioma

Español (`es`). Sin país: el texto es español internacional neutro y la
extensión usa el mismo catálogo `es` para cualquier variante de español que
Chrome tenga configurada.
