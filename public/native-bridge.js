/* Bridges the web app to Android when it runs inside the Capacitor shell, and
   quietly does nothing in a normal browser.

   Two different mechanisms, for two different jobs:

   - APPROACHING-STOP alerts are LOCAL notifications. They depend on the
     device's own position, so the phone decides when to fire — no server, no
     network, works in a tunnel.
   - FIREBASE push is for messages the SERVER originates (service disruptions,
     a line suspended). It cannot know you are near your stop.

   Background limitation, stated plainly: @capacitor/geolocation only reports
   position while the app is in the foreground. Alerts fire reliably with the
   app open or on screen; surviving a locked screen needs a foreground service
   (a background-geolocation plugin), which is not wired here. */

(function () {
  const capacitor = window.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());

  if (!isNative) {
    // Browser: fall back to the Web Notifications API.
    window.RapidBusNative = {
      isNative: false,
      async notify(title, body) {
        if (!("Notification" in window)) return false;
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission !== "granted") return false;
        new Notification(title, { body, icon: "/assets/bus.svg" });
        return true;
      }
    };
    return;
  }

  const { LocalNotifications, PushNotifications, BackgroundGeolocation } = capacitor.Plugins;

  /* A HIGH-importance channel is what makes Android show a heads-up banner
     (the pop-over peek) with sound, instead of a silent tray entry. Both the
     push and local notifications target this channel by id. */
  async function ensureAlertChannel() {
    try {
      await LocalNotifications?.createChannel?.({
        id: "alerts",
        name: "Service alerts & reminders",
        description: "Disruptions, bus reminders and stop alerts",
        importance: 5, // IMPORTANCE_HIGH → heads-up
        visibility: 1,
        vibration: true,
        sound: undefined
      });
    } catch {
      /* channel API absent on this device */
    }
  }
  ensureAlertChannel();
  let notificationId = 1;

  window.RapidBusNative = {
    isNative: true,

    async notify(title, body) {
      if (!LocalNotifications) return false;
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") {
        const asked = await LocalNotifications.requestPermissions();
        if (asked.display !== "granted") return false;
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId++,
            title,
            body,
            channelId: "alerts",
            schedule: { at: new Date(Date.now() + 250) },
            ongoing: false,
            autoCancel: true
          }
        ]
      });
      return true;
    },

    /** Schedule a notification for a future moment (survives app close on
        Android). Returns false when scheduling is unavailable. */
    async notifyAt(id, title, body, atDate) {
      if (!LocalNotifications) return false;
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") {
        const asked = await LocalNotifications.requestPermissions();
        if (asked.display !== "granted") return false;
      }
      await LocalNotifications.schedule({
        notifications: [{ id, title, body, channelId: "alerts", schedule: { at: atDate }, autoCancel: true }]
      });
      return true;
    },

    async cancelScheduled(ids) {
      await LocalNotifications?.cancel({ notifications: ids.map((id) => ({ id })) }).catch(() => {});
    },

    /** Registers with FCM and returns the device token, or null. */
    async registerPush() {
      if (!PushNotifications) return null;
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") return null;

      return new Promise((resolve) => {
        let settled = false;
        PushNotifications.addListener("registration", (token) => {
          if (!settled) {
            settled = true;
            resolve(token.value);
          }
        });
        PushNotifications.addListener("registrationError", () => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        });
        PushNotifications.register();
        // Never hang the caller if the device cannot reach FCM.
        setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, 15000);
      });
    },

    /* Trip tracking that survives a locked screen. addWatcher runs an Android
       foreground service — the persistent notification is what buys GPS with
       the screen off; there is no quieter way that works. Returns a watcher id
       for stopTripWatch, or null when the plugin is missing. */
    async startTripWatch(onFix) {
      if (!BackgroundGeolocation) return null;
      return BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "Public Transport Live",
          backgroundMessage: "Tracking your trip \u2014 tap to return.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 15
        },
        (location, error) => {
          if (error) {
            if (error.code === "NOT_AUTHORIZED") {
              BackgroundGeolocation.openSettings();
            }
            return;
          }
          if (location) {
            onFix(location.latitude, location.longitude);
          }
        }
      );
    },

    async stopTripWatch(id) {
      if (id && BackgroundGeolocation) {
        await BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
      }
    },

    onPush(handler) {
      PushNotifications?.addListener("pushNotificationReceived", handler);
      PushNotifications?.addListener("pushNotificationActionPerformed", (action) =>
        handler(action.notification)
      );
    }
  };

  // Permission is requested only when the user turns reminders on —
  // an app that begs for notifications at first launch has already lost.
})();
