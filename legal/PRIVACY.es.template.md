# SkipSponsor AI — Política de privacidad

_Fecha de vigencia: {effectiveDate} · Versión {version} · Aplica a SkipSponsor AI 1.1.0 y versiones posteriores_

SkipSponsor AI es una extensión de navegador que salta las menciones de
patrocinadores dentro de los videos de YouTube. Para encontrar una mención de
patrocinador, analiza el **texto de los subtítulos** del video que usted está
viendo. Esta política explica qué se trata, para qué, dónde, durante cuánto
tiempo y cómo ejercer sus derechos. La versión en inglés y esta versión en
español tienen el mismo valor.

## Quién es responsable de sus datos

SkipSponsor AI es un servicio de **{entity}** (DevSpeak Labs, "nosotros"),
sociedad por acciones simplificada (S.A.S.) constituida en Colombia
({address}). {entity} es la responsable del tratamiento de los datos descritos
aquí: la empresa que decide para qué y cómo se tratan. Aplicamos esta política
junto con las normas de protección de datos que le apliquen.

- Correo para preguntas y solicitudes sobre privacidad: **{email}**
- Sitio web: <{brandUrl}>

## Resumen

- Solo se analiza el texto de los subtítulos: **nunca el audio, nunca las
  imágenes del video**.
- **Sin cuenta, sin inicio de sesión, sin nombre, sin correo.** La extensión no
  lee su cuenta de YouTube o de Google, sus cookies, sus comentarios ni las
  páginas de su historial de reproducciones.
- Solo funciona en `https://www.youtube.com/`.
- Cuenta las instalaciones, desinstalaciones y días de uso con un
  **identificador aleatorio que no está vinculado a usted**, para saber cuántas
  personas la usan. Usted puede desactivarlo.
- Los resultados de los análisis se guardan por video, no por persona, durante
  **30 días**, y luego se eliminan.
- Los datos **nunca se venden**, nunca se usan para publicidad y nunca se usan
  para fines ajenos a saltar segmentos de patrocinadores.

## Qué se trata y para qué

| Dato | Cuándo sale de su navegador | Para qué |
| --- | --- | --- |
| **Identificador del video de YouTube** que usted abre | Cada vez que abre una página de reproducción | Para consultar los segmentos de patrocinadores ya encontrados para ese video |
| **Texto de los subtítulos con marcas de tiempo** de ese video | Solo cuando ese video aún no tiene un resultado guardado | Para detectar dónde empieza y termina una mención de patrocinador |
| **Identificador del canal** de ese video | Junto con el texto de los subtítulos | Para guardar el resultado con su canal |
| **Token de instalación anónimo**: un valor aleatorio que nuestro servidor emite la primera vez que se ejecuta la extensión | Con cada solicitud | Limitar la frecuencia de uso, proteger contra abusos y administrar la cuota diaria gratuita de análisis nuevos. No está vinculado a su identidad |
| **Versión de la extensión** | Con cada solicitud | Compatibilidad |
| **Eventos de salto**: "saltado", "deshecho" o "el reproductor volvió atrás después de un salto", con el identificador del video y la latencia del salto | Cuando ocurre un salto o usted pulsa Undo (puede desactivarlo) | Para medir la precisión y el rendimiento, por ejemplo con qué frecuencia las personas pulsan Undo |
| **Conteo de uso anónimo**: un identificador de uso aleatorio creado en su navegador (distinto del token de instalación), el evento (instalada, actualizada, usada hoy o desinstalada) y la versión de la extensión | Una vez al instalar o actualizar, como máximo una vez al día cuando abre un video de YouTube, y una vez al desinstalar (Chrome abre entonces nuestra página de agradecimiento). Puede desactivarlo | Para contar instalaciones, desinstalaciones y usuarios activos semanales sin identificar a nadie |

La extensión lee los subtítulos de la página de YouTube que usted ya tiene
abierta (la misma transcripción que YouTube muestra debajo del video). No
descarga audio ni video.

**Su configuración** (activada o desactivada, modo, umbral de confianza y los
canales en los que usted desactivó los saltos) se guarda con `chrome.storage`
en su navegador. Si Chrome Sync está activado, Chrome la sincroniza entre sus
propios dispositivos. No se envía a nuestro servidor.

## Qué no se recopila

Su nombre, correo, cuenta de Google o de YouTube, cookies, audio, imágenes del
video, actividad de navegación fuera de `www.youtube.com`, búsquedas en
YouTube, comentarios, el contenido de cualquier otro sitio web y su ubicación.
No creamos perfiles de personas.

## A dónde van los datos

Todo el tráfico usa HTTPS.

1. **Nuestro servidor.** El backend de SkipSponsor AI, operado por {entity} en
   Amazon Web Services en los Estados Unidos (región us-east-2, Ohio), recibe
   los datos de la tabla anterior. Amazon Web Services aloja por cuenta
   nuestra el servidor, su base de datos y sus copias de seguridad. Para un
   video del que no tiene resultado, el servidor también puede pedir a YouTube
   la pista pública de subtítulos de ese video, enviando solo el identificador
   del video.
2. **Anthropic (API de Claude).** Cuando un video no tiene un resultado
   guardado, nuestro servidor envía **solo el texto de sus subtítulos y las
   marcas de tiempo** (sin token de instalación, sin dirección IP, sin
   configuración) a la API de Anthropic, que clasifica los segmentos de
   patrocinadores. Anthropic elimina las entradas y salidas de su API en un
   plazo de 30 días, salvo cuando deba conservarlas más tiempo para hacer
   cumplir su política de uso o para cumplir la ley
   ([Centro de privacidad de Anthropic](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)).
   No tenemos un acuerdo de retención cero con Anthropic.

Ningún otro tercero recibe datos. La extensión no contiene código de analítica
ni de publicidad de terceros. Los conteos de uso anónimos descritos arriba solo
van a nuestro servidor. Los videos sin subtítulos no se analizan: no se envía a
ninguna parte nada sobre su contenido, y la extensión le indica que el video no
se analizó.

El backend contiene una consulta a SponsorBlock que está desactivada. Solo se
activaría con el permiso escrito de SponsorBlock, y esta política se
actualizaría antes de que eso ocurra.

## Conservación

| Dato | Se conserva |
| --- | --- |
| Resultados de segmentos (identificador del video, identificador del canal, tiempos de inicio y fin, categoría, confianza, un hash de la transcripción) | Se eliminan automáticamente **30 días** después del análisis |
| Texto de los subtítulos | Se usa solo mientras se ejecuta el análisis. Nuestro servidor no lo guarda |
| Eventos de salto (identificador del video, tipo de evento, latencia) | Se guardan sin dirección IP ni token de instalación; se eliminan a los **30 días** |
| Contador de uso diario (un hash unidireccional con clave del token de instalación y un conteo) | Se elimina a los **2 días** |
| Conteos de uso (un hash unidireccional con clave del identificador de uso, el día, el evento y la versión de la extensión) | Se eliminan a los **12 meses** |
| Dirección IP | Nuestra aplicación no la escribe en sus registros ni en su base de datos. Se mantiene en memoria para limitar la frecuencia de uso, durante una hora como máximo |
| Registros de la aplicación (método, ruta, estado y hora de la solicitud) | Se renuevan por tamaño y se usan solo para la seguridad y la resolución de problemas |
| Copias de seguridad de la base de datos | Cifradas; se renuevan en unas 8 semanas, por lo que los datos eliminados pueden permanecer en una copia hasta entonces |

El proxy perimetral de la plataforma de alojamiento ve las direcciones IP
mientras reenvía las solicitudes, como cualquier servidor web.

## Base legal

Tratamos los datos descritos aquí para prestar la función por la que usted
instaló la extensión y, para las estadísticas de saltos, los conteos anónimos
de uso y la protección contra abusos, por nuestro interés legítimo en mantener
el servicio preciso y seguro. Puede oponerse a ambos desactivándolos (vea "Sus
opciones"). Cuando la ley que le aplica exige su autorización o
consentimiento, usted lo otorga al instalar y usar la extensión después de
haber sido informado por su ficha en Chrome Web Store y por esta política, y
puede retirarlo en cualquier momento desactivando o desinstalando la
extensión.

## Transferencias internacionales

Nuestro servidor y la API de Anthropic tratan los datos principalmente en los
Estados Unidos. Esto significa que sus datos pueden tratarse fuera del país
donde usted vive, bajo normas que pueden proteger los datos personales de otra
manera. Cada proveedor está obligado por términos que le exigen proteger los
datos y usarlos solo para prestarnos su servicio, y a cada uno le entregamos
solo lo que necesita. Puede pedirnos más información en {email}.

## Sus derechos

Según la ley que le aplique, usted tiene derecho a:

- saber si tratamos sus datos personales y acceder a ellos sin costo;
- corregir o actualizar los datos inexactos o incompletos;
- pedir la eliminación de sus datos cuando no tengamos un deber legal o
  contractual de conservarlos;
- recibir sus datos en un formato portátil y de uso común, o pedir que los
  enviemos a otro proveedor;
- oponerse a ciertos tratamientos, o pedirnos que los limitemos, incluidos los
  basados en nuestro interés legítimo;
- retirar su consentimiento o su autorización en cualquier momento, y pedir
  prueba de la autorización que otorgó;
- ser informado sobre el uso que hemos dado a sus datos;
- no recibir un trato diferente por ejercer estos derechos.

No vendemos datos personales ni los compartimos para publicidad comportamental
entre contextos, y no tomamos decisiones sobre usted basadas únicamente en un
tratamiento automatizado que produzcan efectos jurídicos o similarmente
significativos.

**Cómo ejercerlos.** Escríbanos a **{email}** con su solicitud. Respondemos las
consultas sobre sus datos en un máximo de 10 días hábiles, y las solicitudes
para corregir, actualizar o eliminar datos o para revocar su autorización en
un máximo de 15 días hábiles. Si necesitamos más tiempo, le explicamos el
motivo antes del vencimiento y respondemos dentro de 5 días hábiles
adicionales para las consultas u 8 para las demás solicitudes. Si la ley que
le aplica fija un plazo menor, lo cumplimos.

**Quejas.** Si no está conforme con nuestra respuesta, puede presentar una
queja ante la autoridad de protección de datos del país donde vive o trabaja,
o del país donde estamos establecidos. Le pedimos que primero nos contacte,
para intentar resolverlo.

Como no vinculamos los datos guardados con una persona, por lo general no
podemos encontrar datos "sobre usted" en nuestro servidor: los resultados se
guardan por video, y los eventos de salto no llevan token ni dirección IP. Los
conteos de uso se guardan solo como un hash unidireccional de un identificador
aleatorio, así que no pueden rastrearse hasta su navegador. Incluya los
identificadores de los videos sobre los que pregunta. Los datos de su
navegador están bajo su control (vea abajo).

## Sus opciones

La extensión está en inglés; los nombres de sus controles se citan tal como
aparecen.

- Desactive los saltos con el interruptor de la ventana emergente de la
  extensión, o elija el modo **Off**. Ambos detienen los saltos de inmediato.
- Desactive los saltos para un solo canal ("Don't skip this channel" en la
  ventana emergente, o Settings › Channels).
- Deje de enviar estadísticas de uso: Settings › Privacy › **Share usage
  statistics**. Los saltos siguen funcionando; no se envían eventos de salto
  ni de deshacer, ni conteos de uso, y no se abre ninguna página al
  desinstalar.
- Borre todo lo que guarda este navegador (configuración, lista de canales,
  token de instalación anónimo e identificador de uso): Settings › Privacy ›
  **Reset SkipSponsor AI**.
- **Desinstalar** la extensión elimina de su navegador su configuración, su
  token de instalación y su identificador de uso. Si las estadísticas de uso
  están activadas, Chrome abre una breve página de agradecimiento que cuenta
  la desinstalación.
- Para pedirnos que eliminemos el resultado guardado de un video específico,
  escriba a {email} con el identificador del video. En todo caso, los
  resultados se eliminan automáticamente a los 30 días.

## Política de datos de usuario de Chrome Web Store

El uso de la información recibida a través de la extensión cumple la
[Política de datos de usuario de Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies),
incluidos los requisitos de
[uso limitado (Limited Use)](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
Usamos los datos solo para prestar y mejorar el salto de segmentos de
patrocinadores, no los transferimos salvo como se describe arriba, nunca los
usamos para publicidad ni para evaluar la solvencia crediticia, y ninguna
persona los lee salvo por razones de seguridad, para cumplir la ley o de forma
agregada.

## Seguridad

Todo el tráfico entre la extensión y el backend usa HTTPS. La extensión
funciona bajo las reglas de Manifest V3 de Chrome: no contiene código alojado
de forma remota y usa solo el permiso `storage` y el acceso a
`https://www.youtube.com/*`. Los secretos que usa el backend (como la clave de
la API de Anthropic) se guardan como secretos del servidor y nunca se incluyen
en la extensión. El código fuente de la extensión y del backend es público en
<https://github.com/juanjaragavi/skip-sponsor-ai>.

## Menores de edad

SkipSponsor AI no está dirigida a menores de 16 años y no recopila a sabiendas
información personal de ellos.

## Cambios

Si esta política cambia, cambian la fecha de vigencia y la versión indicadas
arriba, y las versiones anteriores siguen disponibles en el historial de
`PRIVACY.es.md` (y de `PRIVACY.md`, en inglés) en GitHub. Los cambios
importantes se anuncian en las notas de versión de la extensión antes de que
entren en vigor.

| Versión | Cambio |
| --- | --- |
| 2026-10-28 | Responsable, base legal, transferencias, derechos y quejas redactados para usuarios de cualquier país; no está dirigida a menores de 16 años; primera versión en español. Sin cambios en qué se trata, dónde ni durante cuánto tiempo. |
| 2026-10-17 | Agrega conteos de uso anónimos (instalaciones, actualizaciones, días de uso, desinstalaciones) con un identificador aleatorio, conservados 12 meses, desactivables con "Share usage statistics" (solo en inglés). |
| 2026-10-15 | Publicada como página web junto con los Términos de uso; la dirección del responsable proviene de los datos de la empresa (solo en inglés). |
| 2026-10-14 | Primera versión publicada (solo en inglés). |

## Contacto

{entity} · {address} · **{email}**
