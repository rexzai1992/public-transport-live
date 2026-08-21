# Rapid Bus Live — Android shell

Wraps the web app in a Capacitor WebView, adds on-device stop alerts, and
registers for Firebase push.

## What is already wired

- `@capacitor/geolocation` — position for approaching-stop alerts
- `@capacitor/local-notifications` — the alert itself, fired on-device
- `@capacitor/push-notifications` — Firebase Cloud Messaging
- Manifest permissions: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
  `POST_NOTIFICATIONS`
- Capacitor already applies the `google-services` Gradle plugin, but only when
  `android/app/google-services.json` exists

## Two kinds of notification, deliberately

**Approaching-stop alerts are local, not push.** They depend on where the phone
is, so the phone decides when to fire — no server round-trip, works with no
signal. `../public/native-bridge.js` handles this.

**Firebase push is for server-originated messages** — a suspended line, a
disruption. FCM cannot know you are near your stop, so using it for alighting
alerts would be the wrong tool.

## You must supply

1. **A hosted API.** The APK cannot reach `localhost:3000`. Deploy the Node
   server and pass its HTTPS origin at bundle time:
   ```bash
   RAPIDBUS_API_BASE=https://api.yourdomain.com npm run sync
   ```
   The bundler refuses a missing or non-HTTPS base — Android blocks cleartext
   traffic by default. Enable CORS on the server for the app origin.

2. **A Firebase project** (yours — it needs your Google account):
   - Firebase console → add an **Android** app with package
     `my.prasarana.rapidbuslive` (must match `capacitor.config.json`)
   - Download `google-services.json` into `android/app/`
   - Push is inert until that file is present; everything else still works

3. **The Android SDK** — already present on this machine at
   `/opt/homebrew/share/android-commandlinetools` (platform `android-36`,
   build-tools `36.0.0`), which matches Capacitor's `compileSdk 36`.

4. **A signing keystore**, for a release build:
   ```bash
   keytool -genkey -v -keystore rapidbus.keystore \
     -alias rapidbus -keyalg RSA -keysize 2048 -validity 10000
   ```
   Reference it from `android/app/build.gradle` via a `signingConfigs` block.

## Build

This exact recipe produced a working 5.8 MB debug APK on this machine:

```bash
cd mobile
npm install

export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

RAPIDBUS_API_BASE=https://api.yourdomain.com npm run sync
cd android && ./gradlew assembleDebug --no-daemon
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Android Studio's bundled JDK 21 is used deliberately — AGP 8.13 wants JDK 17+,
and the system JDK is 17, so either works, but the bundled one is what was
verified.

Verified in the built APK: package `my.prasarana.rapidbuslive`, targetSdk 36,
the web app under `assets/public/` (including the offline service worker), and
merged permissions for location, `POST_NOTIFICATIONS`, FCM
(`com.google.android.c2dm.permission.RECEIVE`) and exact alarms.

**The APK built here carries a placeholder API base**
(`https://rapidbus.example.com`), so it will show no data until you rebuild with
your own hosted origin.

Install on a connected device: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`

## Sending a push

Server-side, with the device token from `RapidBusNative.registerPush()`:

```bash
curl -X POST https://fcm.googleapis.com/v1/projects/<PROJECT_ID>/messages:send \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{"message":{"token":"<DEVICE_TOKEN>",
        "notification":{"title":"LRT Ampang Line","body":"Delays between Chan Sow Lin and Ampang"}}}'
```

The legacy `fcm.googleapis.com/fcm/send` server key API is shut down — use
HTTP v1 with a service-account token as above.

## Known limitation: background alerts

`@capacitor/geolocation` reports position only while the app is in the
foreground. Alerts fire reliably with the app open. Surviving a locked screen
needs a foreground service — either a background-geolocation plugin
(`@transistorsoft/capacitor-background-geolocation` is the usual choice, and is
paid) or a small custom Android service. Not wired here, so the app does not
promise something it cannot do.

An alternative that avoids background location entirely: have the server track
the journey and push via FCM when the ETA says you are close. That trades
battery for a network dependency, and needs the journey stored server-side.

## Offline behaviour

`public/sw.js` is a service worker, so it works the same in the browser and in
the shell. Verified with the API server fully stopped: the app still booted,
listed all 292 routes, and opened LRT Ampang Line with its 18 stations.

What is kept, and what is not:

| Data | Strategy | Why |
| --- | --- | --- |
| App shell (HTML/JS/CSS/Leaflet) | cache, revalidate behind | Works offline, and a deploy still reaches users |
| `/categories`, `/routes`, `/stops/search` | stale-while-revalidate | Changes about daily |
| `/map`, `/journey` | network first, cache as fallback | Only useful current |
| Map tiles | not cached | Too many to store usefully; Leaflet tolerates gaps |

Two honest limits:

- **Reachability is judged by whether requests succeed, not by
  `navigator.onLine`** — that flag reports online on a Wi-Fi network with no
  route to the internet. Cached responses are stamped by the worker, so the UI
  says "Offline · saved 11:56 MYT" rather than implying the data is current, and
  the live-vehicle stat shows "Offline" instead of a stale count.
- **Only what you already visited is available offline.** Searching a station
  you have never searched before fails offline rather than inventing a result.
  A full stop index could be precached if that matters.
