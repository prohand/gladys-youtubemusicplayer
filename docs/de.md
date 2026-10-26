# YouTube Music Player für Gladys

Mit dieser Integration steuert Gladys die **YouTube-Music-Desktop-App**
([th-ch/youtube-music](https://github.com/th-ch/youtube-music)) auf einem Computer in deinem
Heimnetz: ein PC, ein Mac oder ein Raspberry Pi an deinen Lautsprechern. Die Musik kommt aus diesem
Computer; Gladys zeigt, was läuft, und steuert es.

Was du in Gladys bekommst:

- ein **Musik-Player-Gerät** pro Computer: Wiedergabe, Pause, Zurück, Weiter, Lautstärke, Stumm,
  Zufall, Wiederholen, Position, Titel, Künstler, Album und Cover;
- die **Musikkarte** des Dashboards: aktuelle Wiedergabe, **Suche** in YouTube Music, die
  **Warteschlange** und ein Ordner „Recently played“ (zuletzt gespielt);
- ein **Widget „YouTube Music“** für das Dashboard: was läuft, die Lautstärke, Play/Pause,
  Zurück, Weiter und eine Taste, um einen Titel nach Namen abzuspielen;
- **Szenen-Auslöser**: ein neuer Titel beginnt, die Wiedergabe startet oder pausiert, ein Player
  geht online oder offline;
- **Szenen-Aktionen**: einen Titel nach Namen abspielen (jetzt, als Nächstes oder am Ende der
  Warteschlange), den aktuellen Titel mögen oder nicht mögen.

Gladys 5.3 oder neuer wird benötigt.

## 1. Die YouTube-Music-App vorbereiten

1. Installiere die YouTube-Music-App von
   [ihrer Release-Seite](https://github.com/th-ch/youtube-music/releases) (Windows, macOS,
   Linux). Halte sie aktuell: Neuere Versionen senden Änderungen live an Gladys.
2. Öffne die App und melde dich bei deinem YouTube-Music-Konto an, wenn du deine Bibliothek
   möchtest.
3. Öffne im Menü **Plugins** und aktiviere **API Server**.
4. Behalte in den Optionen von API Server:
   - **Hostname**: `0.0.0.0` (damit die App im Netzwerk antwortet, nicht nur auf dem Computer);
   - **Port**: `26538`;
   - **Authorization strategy**: „Authorize at first request“ (empfohlen). „No authorization“
     geht auch, dann kann aber jedes Gerät in deinem Netzwerk die App steuern.
5. Hat der Computer eine Firewall, erlaube eingehende TCP-Verbindungen auf Port `26538`.
6. Gib dem Computer in deinem Router eine feste IP-Adresse (DHCP-Reservierung): Gladys findet die
   App über ihre Adresse.

## 2. Die Integration in Gladys einrichten

1. Öffne die Konfiguration der Integration.
2. Trage unter **Player** die Computer ein, durch Kommas getrennt, als `Name=Adresse[:Port]`:

   ```text
   Wohnzimmer=192.168.1.20, Büro=192.168.1.30:26538
   ```

   Ohne Angabe ist der Port `26538`. Der Name ist der Name des Geräts in Gladys.

3. Speichern. Auf jedem Computer fragt YouTube Music in einem Dialog, ob `gladys-…` erlaubt wird:
   Klicke auf **Erlauben** (Allow). Nur einmal: Der Zugriff bleibt nach einem Neustart erhalten.
4. Klicke auf **Player testen**: Jeder Player sollte „OK“ antworten.
5. Öffne **Erkennung** und lege die Geräte an.

Hast du aus Versehen auf **Ablehnen** (Deny) geklickt, nutze die Taste **Player autorisieren** und
klicke dann am Computer auf **Erlauben**.

## 3. Verwenden

- **Dashboard**: Füge die Box „Musik“ hinzu und wähle den Player, oder füge das Widget
  **YouTube Music** hinzu (Box „Integrations-Widgets“). Ohne Auswahl zeigt das Widget den ersten
  Player.
- **Suche**: Suche in der Musikkarte einen Titel oder Künstler und wähle einen Titel. Er wird
  jetzt, nach dem aktuellen Titel oder am Ende der Warteschlange gespielt.
- **Szenen**:
  - der Auslöser **Ein neuer Titel beginnt** gibt `title`, `artist`, `album` und `video_id` an
    die folgenden Aktionen weiter;
  - der Auslöser **Wiedergabe startet oder pausiert** lässt sich auf „Wiedergabe“ oder
    „Pausiert“ beschränken — zum Beispiel abends das Licht dimmen, wenn Musik startet;
  - der Auslöser **Ein Player geht online oder offline** — zum Beispiel eine Nachricht, wenn der
    Wohnzimmer-PC ausgeht;
  - die Aktion **Titel nach Namen abspielen** — zum Beispiel ein Musikwecker: „Spiele
    `jazz radio` im Schlafzimmer um 7:00“. Sie liefert `found`, `title` und `artist`;
  - die Aktion **Aktuellen Titel bewerten**, um einen Titel per Wandtaster zu bewerten.
  - Die übliche Aktion „Ein Gerät steuern“ funktioniert auch mit den Funktionen des Players
    (Lautstärke, Pause…).

## Gut zu wissen

- Die App kann nur **einzelne Titel** in die Warteschlange stellen: Die Suche zeigt Titel und
  Videos, keine Alben oder Playlists.
- „Stopp“ pausiert: Die App hat keinen Stopp.
- **Recently played** zeigt die Titel, die die Integration seit ihrem Start gesehen hat (50 pro
  Player).
- Adresse und Port kennzeichnen einen Player. Änderst du sie, sieht Gladys ein neues Gerät: Lösche
  das alte.
- Mit einer alten Version der App (ohne Live-Verbindung) liest Gladys den Zustand alle 5 Sekunden,
  und das Gerät zeigt einen orangefarbenen Punkt. Aktualisiere die App für Live-Updates.
- Die Integration spricht nur mit der App in deinem Netzwerk (Transport **local**). Kein
  Cloud-Konto, kein API-Schlüssel.

## Fehlerbehebung

| Was du siehst                            | Was zu tun ist                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| „Keine Antwort unter 192.168.1.20:26538“ | Ist die App geöffnet? Ist API Server aktiv, mit Hostname `0.0.0.0`? Ist Port 26538 freigegeben?        |
| „Zugriff in der App verweigert“          | Nutze **Player autorisieren** und klicke am Computer auf **Erlauben**.                                 |
| „Prüfe die Liste der Player“             | Ein Eintrag unter **Player** ist unlesbar: Schreibe ihn als `Name=192.168.1.20` oder `Name=Host:Port`. |
| Das Gerät bleibt „nicht erreichbar“      | Der Computer schläft oder die App ist geschlossen. Gladys verbindet sich von selbst neu.               |
| Die Suche findet nichts                  | Die Suche nutzt deine YouTube-Music-Sitzung in der App: Prüfe, ob sie angemeldet und online ist.       |

Für mehr Details in den Logs aktiviere **Ausführliche Logs** in der Konfiguration.
