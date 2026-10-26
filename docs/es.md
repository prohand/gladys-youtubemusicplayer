# YouTube Music Player para Gladys

Esta integración permite a Gladys controlar la **app de escritorio YouTube Music**
([th-ch/youtube-music](https://github.com/th-ch/youtube-music)) instalada en un ordenador de su
red: un PC, un Mac o una Raspberry Pi conectada a sus altavoces. La música suena en ese ordenador;
Gladys muestra lo que suena y lo controla.

Lo que obtiene en Gladys:

- un **dispositivo reproductor de música** por ordenador: reproducir, pausa, anterior, siguiente,
  volumen, silencio, aleatorio, repetición, posición, título, artista, álbum y carátula;
- la **tarjeta de música** del panel: lo que suena, **búsqueda** en YouTube Music, la **cola** y
  una carpeta «Recently played» (escuchado recientemente);
- un **widget «YouTube Music»** para el panel: lo que suena, el volumen, reproducir/pausa,
  anterior, siguiente y un botón para reproducir una canción por su nombre;
- **disparadores de escena**: empieza una nueva canción, la reproducción empieza o se pausa, un
  reproductor se conecta o desconecta;
- **acciones de escena**: reproducir una canción por su nombre (ahora, a continuación o al final
  de la cola), dar «me gusta» o «no me gusta» a la canción actual.

Se necesita Gladys 5.3 o más reciente.

## 1. Preparar la app YouTube Music

1. Instale la app YouTube Music desde
   [su página de versiones](https://github.com/th-ch/youtube-music/releases) (Windows, macOS,
   Linux). Manténgala actualizada: las versiones recientes envían los cambios en directo a Gladys.
2. Abra la app e inicie sesión en su cuenta de YouTube Music si quiere su biblioteca.
3. En el menú, abra **Plugins** y active **API Server**.
4. En las opciones de API Server, mantenga:
   - **Hostname**: `0.0.0.0` (así la app responde en la red, no solo en el ordenador);
   - **Port**: `26538`;
   - **Authorization strategy**: «Authorize at first request» (recomendado). «No authorization»
     también funciona, pero entonces cualquier equipo de su red puede controlar la app.
5. Si el ordenador tiene un cortafuegos, permita las conexiones TCP entrantes en el puerto
   `26538`.
6. Dé una dirección IP fija al ordenador en su router (reserva DHCP): Gladys encuentra la app por
   su dirección.

## 2. Configurar la integración en Gladys

1. Abra la configuración de la integración.
2. En **Reproductores**, indique los ordenadores, separados por comas, como
   `Nombre=dirección[:puerto]`:

   ```text
   Salón=192.168.1.20, Oficina=192.168.1.30:26538
   ```

   El puerto es `26538` si no lo indica. El nombre es el del dispositivo en Gladys.

3. Guarde. En cada ordenador, YouTube Music muestra una ventana que pide permitir `gladys-…`: haga
   clic en **Permitir** (Allow). Solo una vez: el acceso se conserva tras un reinicio.
4. Haga clic en **Probar los reproductores**: cada reproductor debe responder «OK».
5. Abra **Descubrimiento** y cree los dispositivos.

Si hizo clic en **Denegar** (Deny) por error, use el botón **Autorizar un reproductor** y luego
haga clic en **Permitir** en el ordenador.

## 3. Usarla

- **Panel**: añada la caja «Música» y elija el reproductor, o añada el widget **YouTube Music**
  (caja «Widgets de integración»). Sin elección, el widget muestra el primer reproductor.
- **Búsqueda**: en la tarjeta de música, busque una canción o un artista y elija una pista. Suena
  ahora, después de la canción actual o al final de la cola.
- **Escenas**:
  - el disparador **Empieza una nueva canción** pasa `title`, `artist`, `album` y `video_id` a las
    acciones siguientes;
  - el disparador **La reproducción empieza o se pausa** puede limitarse a «Reproduciendo» o «En
    pausa» — por ejemplo, bajar las luces cuando empieza la música por la noche;
  - el disparador **Un reproductor se conecta o desconecta** — por ejemplo, avisarle cuando se
    apaga el PC del salón;
  - la acción **Reproducir una canción por su nombre** — por ejemplo, un despertador musical:
    «Reproducir `jazz radio` en Dormitorio a las 7:00». Devuelve `found`, `title` y `artist`;
  - la acción **Valorar la canción actual**, para valorar una canción desde un botón de pared.
  - La acción habitual «Controlar un dispositivo» también funciona con las funciones del
    reproductor (volumen, pausa…).

## Conviene saber

- La app solo puede poner en cola **canciones sueltas**: la búsqueda muestra canciones y vídeos,
  no álbumes ni listas.
- «Stop» pausa: la app no tiene parada.
- **Recently played** muestra las canciones que la integración vio desde que arrancó (50 por
  reproductor).
- La dirección y el puerto identifican un reproductor. Si los cambia, Gladys ve un dispositivo
  nuevo: borre el antiguo.
- Con una versión antigua de la app (sin enlace en directo), Gladys lee el estado cada 5 segundos
  y el dispositivo muestra un punto naranja. Actualice la app para volver al directo.
- La integración solo habla con la app, en su red (transporte **local**). Sin cuenta en la nube,
  sin clave de API.

## Solución de problemas

| Lo que ve                             | Qué hacer                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| «Sin respuesta en 192.168.1.20:26538» | ¿Está abierta la app? ¿Está API Server activado, con hostname `0.0.0.0`? ¿Está permitido el puerto 26538?  |
| «Acceso denegado en la app»           | Use **Autorizar un reproductor** y haga clic en **Permitir** en el ordenador.                              |
| «Revise la lista de reproductores»    | Una entrada de **Reproductores** no se puede leer: escríbala `Nombre=192.168.1.20` o `Nombre=host:puerto`. |
| El dispositivo sigue «inaccesible»    | El ordenador está en reposo o la app está cerrada. Gladys se reconecta solo cuando vuelve.                 |
| La búsqueda no da nada                | La búsqueda usa su sesión de YouTube Music en la app: compruebe que está conectada y en línea.             |

Para ver más en los registros, active **Registros detallados** en la configuración.
