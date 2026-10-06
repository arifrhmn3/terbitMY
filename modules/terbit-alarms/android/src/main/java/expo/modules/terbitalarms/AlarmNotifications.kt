package expo.modules.terbitalarms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build

/**
 * The alarm notification: alarm-category sound that repeats until handled
 * (FLAG_INSISTENT), vibration, and a full-screen intent that opens
 * AlarmAlertActivity over the lock screen where Android allows it.
 */
object AlarmNotifications {
  // Channel settings can't change after creation; bump the ID to change them.
  private const val CHANNEL_ID = "terbit_alarms_v1"

  fun notificationId(alarmId: String) = alarmId.hashCode()

  private val alarmAudio: AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

  private fun alarmSound() =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Alarms", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Terbit MY alarms"
      setSound(alarmSound(), alarmAudio)
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 800, 600, 800)
      setBypassDnd(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  fun notificationsAllowed(context: Context): Boolean =
    context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()

  fun fullScreenAllowed(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    return context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
  }

  fun alertIntent(context: Context, extras: Intent): Intent =
    Intent(context, AlarmAlertActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
      .putExtras(extras)

  fun show(context: Context, extras: Intent) {
    ensureChannel(context)
    val alarmId = extras.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
    val title = extras.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Terbit MY alarm"
    val code = notificationId(alarmId)

    val open = PendingIntent.getActivity(
      context, code, alertIntent(context, extras),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val stop = PendingIntent.getBroadcast(
      context, code,
      Intent(context, AlarmReceiver::class.java).setAction(AlarmScheduler.ACTION_STOP).putExtras(extras),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
          .setPriority(Notification.PRIORITY_MAX)
          .setSound(alarmSound(), alarmAudio)
          .setVibrate(longArrayOf(0, 800, 600, 800))
      }

    val notification = builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(title)
      .setContentText("Tap to open the alarm.")
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(context, android.R.drawable.ic_lock_idle_alarm), "Stop", stop,
        ).build(),
      )
      .build()
    // Repeat the sound until the notification is cancelled (Stop / alarm screen).
    notification.flags = notification.flags or Notification.FLAG_INSISTENT

    context.getSystemService(NotificationManager::class.java).notify(code, notification)
  }

  fun dismiss(context: Context, alarmId: String) {
    context.getSystemService(NotificationManager::class.java).cancel(notificationId(alarmId))
  }
}
