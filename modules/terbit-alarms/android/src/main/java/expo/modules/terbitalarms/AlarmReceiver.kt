package expo.modules.terbitalarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Runs when an alarm goes off, even if Terbit MY is closed (Android starts the
 * process for it). Records the fire time and shows the alarm notification.
 * Also handles the notification's Stop button.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
    val fireAt = intent.getLongExtra(AlarmScheduler.EXTRA_FIRE_AT, 0L)
    val now = System.currentTimeMillis()

    when (intent.action) {
      AlarmScheduler.ACTION_FIRE -> {
        NativeAlarmRecords.update(context, alarmId, fireAt) { it.copy(firedAt = now) }
        // One-time alarm: clear the PendingIntent so it no longer counts as scheduled.
        AlarmScheduler.cancel(context, alarmId)
        AlarmNotifications.show(context, intent)
      }
      AlarmScheduler.ACTION_STOP -> stop(context, alarmId, fireAt)
    }
  }

  companion object {
    fun stop(context: Context, alarmId: String, fireAt: Long) {
      AlarmNotifications.dismiss(context, alarmId)
      NativeAlarmRecords.update(context, alarmId, fireAt) {
        if (it.stoppedAt == null) it.copy(stoppedAt = System.currentTimeMillis()) else it
      }
    }
  }
}
