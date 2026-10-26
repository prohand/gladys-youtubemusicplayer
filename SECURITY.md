# Security policy

## Supported versions

Only the latest release of the YouTube Music Player integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-youtubemusicplayer](https://github.com/prohand/gladys-youtubemusicplayer/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration, of Gladys and of the YouTube Music app;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the YouTube Music
desktop app and its API Server plugin (report to
[th-ch/youtube-music](https://github.com/th-ch/youtube-music/security)), and YouTube Music.

## Good practices for users

- Keep the **"Authorize at first request"** strategy of the API Server plugin: with "No
  authorization", any device of your network can control the app.
- Only click **Allow** in the app's dialog for a request you just made from Gladys.
- Do not expose port 26538 of the computer to the internet: the integration only needs it on your
  local network.
- The access tokens are kept in the integration's `/data` volume and never logged. Revoke one by
  removing `gladys-…` from the authorized clients of the API Server plugin.
- Keep Gladys, the integration and the YouTube Music app up to date.
