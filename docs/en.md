# YouTube Music Player for Gladys

This integration lets Gladys drive the **YouTube Music desktop app**
([th-ch/youtube-music](https://github.com/th-ch/youtube-music)) running on a computer of your
home network: a PC, a Mac, or a Raspberry Pi plugged into your speakers. The music plays on that
computer; Gladys shows what plays and controls it.

What you get in Gladys:

- one **music player device** per computer: play, pause, previous, next, volume, mute, shuffle,
  repeat, position, title, artist, album and cover;
- the **music card** of the dashboard: now playing, **search** in YouTube Music, the **queue**,
  and a "Recently played" folder;
- a **"YouTube Music" widget** for the dashboard: what plays, the volume, play/pause, previous,
  next, and a button to play a song by its name;
- **scene triggers**: a new track starts, playback starts or pauses, a player goes online or
  offline;
- **scene actions**: play a song by its name (now, next, or at the end of the queue), like or
  dislike the current track.

Gladys 5.3 or newer is required.

## 1. Prepare the YouTube Music app

1. Install the YouTube Music desktop app from
   [its releases page](https://github.com/th-ch/youtube-music/releases) (Windows, macOS, Linux).
   Keep it up to date: recent versions send live updates to Gladys.
2. Open the app and sign in to your YouTube Music account if you want your library.
3. In the menu, open **Plugins**, then turn on **API Server**.
4. In the options of API Server, keep:
   - **Hostname**: `0.0.0.0` (so the app answers on the network, not only on the computer);
   - **Port**: `26538`;
   - **Authorization strategy**: "Authorize at first request" (recommended). "No
     authorization" also works, but then anyone on your network can control the app.
5. If the computer has a firewall, allow incoming TCP connections on port `26538`.
6. Give the computer a fixed IP address in your router (DHCP reservation): Gladys finds the app
   by its address.

## 2. Configure the integration in Gladys

1. Open the configuration of the integration.
2. In **Players**, list the computers, separated by commas, as `Name=address[:port]`:

   ```text
   Living room=192.168.1.20, Office=192.168.1.30:26538
   ```

   The port is `26538` when you leave it out. The name is the name of the device in Gladys.

3. Save. On each computer, YouTube Music shows a dialog asking to allow `gladys-…`: click
   **Allow**. You only do this once: the access is kept across restarts.
4. Click **Test the players**: each player should answer "OK".
5. Open **Discovery** and create the devices.

If you clicked **Deny** by mistake, use the **Authorize a player** button, then click **Allow** on
the computer.

## 3. Use it

- **Dashboard**: add the "Music" box and choose the player, or add the **YouTube Music** widget
  (box "Integration widgets"). The widget shows the first player unless you choose one.
- **Search**: in the music card, search a song or an artist and pick a track. It plays now, after
  the current track, or at the end of the queue.
- **Scenes**:
  - trigger **A new track starts** gives `title`, `artist`, `album` and `video_id` to the next
    actions;
  - trigger **Playback starts or pauses** can be limited to "Playing" or "Paused" — for example,
    dim the lights when music starts in the evening;
  - trigger **A player goes online or offline** — for example, warn you when the PC of the living
    room turns off;
  - action **Play a song by its name** — for example, a wake-up radio: "Play `jazz radio` on
    Bedroom at 7:00". It returns `found`, `title` and `artist`;
  - action **Like or dislike the current track**, to rate a song from a wall button.
  - The usual "Control a device" action also works on the player features (volume, pause…).

## Good to know

- The app can only queue **single tracks**: search shows songs and videos, not albums nor
  playlists.
- "Stop" pauses: the app has no stop.
- **Recently played** lists the tracks the integration saw since it started (50 per player).
- The address and port identify a player. If you change them, Gladys sees a new device: delete
  the old one.
- With an old version of the app (no live connection), Gladys reads the state every 5 seconds and
  the device shows an orange dot. Update the app to get live updates back.
- The integration only talks to the app on your network (transport **local**). No cloud account,
  no API key.

## Troubleshooting

| What you see                      | What to do                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| "No answer at 192.168.1.20:26538" | Is the app open? Is API Server on, with hostname `0.0.0.0`? Is port 26538 allowed?            |
| "Access denied in the app"        | Use **Authorize a player**, then click **Allow** on the computer.                             |
| "Check the player list"           | An entry of **Players** cannot be read: write it as `Name=192.168.1.20` or `Name=host:port`.  |
| The device stays "unreachable"    | The computer is asleep or the app is closed. Gladys reconnects by itself when it comes back.  |
| Nothing happens when I search     | The search uses your YouTube Music session in the app: check the app is signed in and online. |

To see more in the logs, turn on **Detailed logs** in the configuration.
