package expo.modules.terbitalarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Runs when an alarm goes off, even if Terbit MY is closed (Android starts the
 * process for it). Records the fire time, schedules the next weekly ring and
 * shows the alarm notification. Also handles the notification's Stop button
 * (the phone's alarm control, which Terbit MY never blocks).
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
    val fireAt = intent.getLongExtra(AlarmScheduler.EXTRA_FIRE_AT, 0L)
    val now = System.currentTimeMillis()

    when (intent.action) {
      AlarmScheduler.ACTION_FIRE -> {
        NativeAlarmRecords.update(context, alarmId, fireAt) { it.copy(firedAt = now) }
        // Clear this ring's PendingIntent, then schedule the next weekly ring (saved alarms only).
        AlarmScheduler.cancel(context, alarmId)
        SavedAlarms.afterFire(context, alarmId, fireAt)
        AlarmNotifications.show(context, intent)
      }
      AlarmScheduler.ACTION_STOP -> stop(context, alarmId, fireAt, ACTION_NAME_STOP)
    }
  }

  companion object {
    const val ACTION_NAME_STOP = "stop"
    const val ACTION_NAME_MISSION = "mission"

    /** Silences the alarm and records when and how ("stop" or "mission"). */
    fun stop(context: Context, alarmId: String, fireAt: Long, action: String) {
      AlarmNotifications.dismiss(context, alarmId)
      NativeAlarmRecords.update(context, alarmId, fireAt) {
        if (it.stoppedAt == null) it.copy(stoppedAt = System.currentTimeMillis(), stopAction = action) else it
      }
    }
  }
}
