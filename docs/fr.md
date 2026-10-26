# YouTube Music Player pour Gladys

Cette intégration permet à Gladys de piloter l'**application de bureau YouTube Music**
([th-ch/youtube-music](https://github.com/th-ch/youtube-music)) installée sur un ordinateur de
votre réseau : un PC, un Mac, ou un Raspberry Pi branché sur vos enceintes. La musique sort de cet
ordinateur ; Gladys affiche ce qui est joué et le pilote.

Ce que vous obtenez dans Gladys :

- un **appareil lecteur de musique** par ordinateur : lecture, pause, précédent, suivant, volume,
  muet, aléatoire, répétition, position, titre, artiste, album et pochette ;
- la **carte musique** du tableau de bord : lecture en cours, **recherche** dans YouTube Music,
  **file d'attente**, et un dossier « Recently played » (écoutés récemment) ;
- un **widget « YouTube Music »** pour le tableau de bord : ce qui est joué, le volume,
  lecture/pause, précédent, suivant, et un bouton pour lancer un titre par son nom ;
- des **déclencheurs de scène** : un nouveau titre démarre, la lecture démarre ou se met en pause,
  un lecteur se connecte ou se déconnecte ;
- des **actions de scène** : jouer un titre par son nom (maintenant, ensuite, ou en fin de file),
  aimer ou ne pas aimer le titre en cours.

Gladys 5.3 ou plus récent est nécessaire.

## 1. Préparer l'application YouTube Music

1. Installez l'application YouTube Music depuis
   [sa page de versions](https://github.com/th-ch/youtube-music/releases) (Windows, macOS,
   Linux). Gardez-la à jour : les versions récentes envoient les changements en direct à Gladys.
2. Ouvrez l'application et connectez-vous à votre compte YouTube Music si vous voulez votre
   bibliothèque.
3. Dans le menu, ouvrez **Plugins**, puis activez **API Server**.
4. Dans les options d'API Server, gardez :
   - **Hostname** : `0.0.0.0` (l'application répond alors sur le réseau, pas seulement sur
     l'ordinateur) ;
   - **Port** : `26538` ;
   - **Authorization strategy** : « Authorize at first request » (recommandé). « No
     authorization » marche aussi, mais tout appareil de votre réseau peut alors piloter
     l'application.
5. Si l'ordinateur a un pare-feu, autorisez les connexions TCP entrantes sur le port `26538`.
6. Donnez une adresse IP fixe à l'ordinateur dans votre box (réservation DHCP) : Gladys trouve
   l'application par son adresse.

## 2. Configurer l'intégration dans Gladys

1. Ouvrez la configuration de l'intégration.
2. Dans **Lecteurs**, listez les ordinateurs, séparés par des virgules, sous la forme
   `Nom=adresse[:port]` :

   ```text
   Salon=192.168.1.20, Bureau=192.168.1.30:26538
   ```

   Le port vaut `26538` si vous ne l'indiquez pas. Le nom est celui de l'appareil dans Gladys.

3. Enregistrez. Sur chaque ordinateur, YouTube Music affiche une fenêtre qui demande d'autoriser
   `gladys-…` : cliquez sur **Autoriser** (Allow). Une seule fois : l'accès est gardé après un
   redémarrage.
4. Cliquez sur **Tester les lecteurs** : chaque lecteur doit répondre « OK ».
5. Ouvrez **Découverte** et créez les appareils.

Si vous avez cliqué sur **Refuser** (Deny) par erreur, utilisez le bouton **Autoriser un
lecteur**, puis cliquez sur **Autoriser** sur l'ordinateur.

## 3. L'utiliser

- **Tableau de bord** : ajoutez la boîte « Musique » et choisissez le lecteur, ou ajoutez le
  widget **YouTube Music** (boîte « Widgets d'intégration »). Le widget montre le premier lecteur
  si vous n'en choisissez pas.
- **Recherche** : dans la carte musique, cherchez un titre ou un artiste et choisissez un
  morceau. Il est joué maintenant, après le titre en cours, ou en fin de file.
- **Scènes** :
  - le déclencheur **Un nouveau titre démarre** donne `title`, `artist`, `album` et `video_id` aux
    actions suivantes ;
  - le déclencheur **La lecture démarre ou se met en pause** peut être limité à « Lecture » ou
    « Pause » — par exemple, baisser les lumières quand la musique démarre le soir ;
  - le déclencheur **Un lecteur se connecte ou se déconnecte** — par exemple, vous prévenir quand
    le PC du salon s'éteint ;
  - l'action **Jouer un titre par son nom** — par exemple un réveil en musique : « Jouer
    `radio jazz` sur Chambre à 7 h ». Elle renvoie `found`, `title` et `artist` ;
  - l'action **Aimer ou ne pas aimer le titre en cours**, pour noter un titre depuis un bouton
    mural.
  - L'action habituelle « Contrôler un appareil » marche aussi sur les fonctions du lecteur
    (volume, pause…).

## Bon à savoir

- L'application ne peut mettre en file que des **titres seuls** : la recherche montre des titres
  et des vidéos, pas des albums ni des playlists.
- « Stop » met en pause : l'application n'a pas d'arrêt.
- **Recently played** liste les titres vus par l'intégration depuis son démarrage (50 par
  lecteur).
- L'adresse et le port identifient un lecteur. Si vous les changez, Gladys voit un nouvel
  appareil : supprimez l'ancien.
- Avec une ancienne version de l'application (sans liaison en direct), Gladys lit l'état toutes
  les 5 secondes et l'appareil affiche un point orange. Mettez l'application à jour pour retrouver
  le direct.
- L'intégration ne parle qu'à l'application, sur votre réseau (transport **local**). Pas de compte
  cloud, pas de clé d'API.

## Dépannage

| Ce que vous voyez                         | Que faire                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| « Pas de réponse sur 192.168.1.20:26538 » | L'application est-elle ouverte ? API Server est-il activé, avec le hostname `0.0.0.0` ? Le port 26538 est-il ouvert ? |
| « Accès refusé dans l'application »       | Utilisez **Autoriser un lecteur**, puis cliquez sur **Autoriser** sur l'ordinateur.                                   |
| « Vérifiez la liste des lecteurs »        | Une entrée de **Lecteurs** est illisible : écrivez-la `Nom=192.168.1.20` ou `Nom=hôte:port`.                          |
| L'appareil reste « injoignable »          | L'ordinateur est en veille ou l'application est fermée. Gladys se reconnecte seul à son retour.                       |
| La recherche ne donne rien                | La recherche utilise votre session YouTube Music dans l'application : vérifiez qu'elle est connectée.                 |

Pour plus de détails dans les logs, activez **Logs détaillés** dans la configuration.
