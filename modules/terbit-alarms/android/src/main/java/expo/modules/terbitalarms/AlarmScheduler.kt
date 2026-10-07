package expo.modules.terbitalarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * Schedules alarms with AlarmManager.setAlarmClock(): exact, allowed in Doze,
 * and shown to the user as an alarm by the system. Each call schedules one
 * ring; weekly repeats are rescheduled by SavedAlarms after each fire.
 */
object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.terbitalarms.ALARM_FIRE"
  const val ACTION_STOP = "expo.modules.terbitalarms.ALARM_STOP"
  const val EXTRA_ALARM_ID = "alarmId"
  const val EXTRA_OCCURRENCE_ID = "occurrenceId"
  const val EXTRA_FIRE_AT = "fireAt"
  const val EXTRA_TITLE = "title"
  const val EXTRA_KIND = "kind"
  const val EXTRA_MISSION_REQUIRED = "missionRequired"
  const val EXTRA_COMPLETION_MODE = "completionMode"

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
  }

  /** Same alarm ID → same PendingIntent, so scheduling again replaces the old alarm. */
  fun requestCode(alarmId: String) = alarmId.hashCode()

  private fun fireIntent(context: Context, alarmId: String) =
    Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      .setData(Uri.parse("terbitalarm://alarm/" + Uri.encode(alarmId)))

  fun schedule(
    context: Context,
    alarmId: String,
    occurrenceId: String?,
    fireAt: Long,
    title: String,
    kind: String = "test",
    missionRequired: Boolean = false,
    completionMode: String = "reward",
  ) {
    val intent = fireIntent(context, alarmId)
      .putExtra(EXTRA_ALARM_ID, alarmId)
      .putExtra(EXTRA_OCCURRENCE_ID, occurrenceId)
      .putExtra(EXTRA_FIRE_AT, fireAt)
      .putExtra(EXTRA_TITLE, title)
      .putExtra(EXTRA_KIND, kind)
      .putExtra(EXTRA_MISSION_REQUIRED, missionRequired)
      .putExtra(EXTRA_COMPLETION_MODE, completionMode)
    val operation = PendingIntent.getBroadcast(
      context,
      requestCode(alarmId),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    // Shown when the user taps the alarm icon / next alarm in the system UI.
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    val show = PendingIntent.getActivity(context, requestCode(alarmId), launch, PendingIntent.FLAG_IMMUTABLE)

    val alarmManager = context.getSystemService(AlarmManager::class.java)
    alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(fireAt, show), operation)
  }

  fun cancel(context: Context, alarmId: String) {
    val pending = PendingIntent.getBroadcast(
      context,
      requestCode(alarmId),
      fireIntent(context, alarmId),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    ) ?: return
    context.getSystemService(AlarmManager::class.java).cancel(pending)
    pending.cancel()
  }

  fun isScheduled(context: Context, alarmId: String): Boolean =
    PendingIntent.getBroadcast(
      context,
      requestCode(alarmId),
      fireIntent(context, alarmId),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    ) != null
}
