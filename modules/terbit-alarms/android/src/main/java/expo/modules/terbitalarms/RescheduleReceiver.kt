package expo.modules.terbitalarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android forgets every alarm when the phone restarts, and times shift when
 * the clock or time zone changes. This puts saved alarms back on the system
 * schedule. (It doesn't run before the first unlock after a restart.)
 */
class RescheduleReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      -> SavedAlarms.rescheduleAll(context)
    }
  }
}
