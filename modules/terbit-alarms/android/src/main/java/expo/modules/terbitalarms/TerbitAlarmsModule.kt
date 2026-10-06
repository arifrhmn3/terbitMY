package expo.modules.terbitalarms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class OneTimeAlarmOptions : Record {
  @Field var alarmId: String = ""
  @Field var occurrenceId: String? = null
  /** ms since 1970 */
  @Field var fireAt: Double = 0.0
  @Field var title: String = "Terbit MY"
}

/** Android side of the TerbitAlarms module (AlarmManager.setAlarmClock). */
class TerbitAlarmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TerbitAlarms")

    AsyncFunction("getStatusAsync") {
      status()
    }

    AsyncFunction("requestPermissionAsync") { promise: Promise ->
      val permissions = appContext.permissions
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        AlarmNotifications.notificationsAllowed(context) ||
        permissions == null
      ) {
        promise.resolve(status())
        return@AsyncFunction
      }
      permissions.askForPermissions(
        PermissionsResponseListener { promise.resolve(status()) },
        Manifest.permission.POST_NOTIFICATIONS,
      )
    }

    AsyncFunction("scheduleOneTimeAsync") { options: OneTimeAlarmOptions ->
      scheduleOneTime(options)
    }

    AsyncFunction("cancelAsync") { alarmId: String ->
      val now = System.currentTimeMillis()
      AlarmScheduler.cancel(context, alarmId)
      AlarmNotifications.dismiss(context, alarmId)
      val records = NativeAlarmRecords.load(context)
      var cancelled = 0
      records.replaceAll {
        if (it.alarmId == alarmId && it.cancelledAt == null && it.firedAt == null) {
          cancelled++
          it.copy(cancelledAt = now)
        } else {
          it
        }
      }
      NativeAlarmRecords.save(context, records)
      cancelled
    }

    AsyncFunction("listAsync") {
      val now = System.currentTimeMillis()
      NativeAlarmRecords.load(context).map { r ->
        val state = when {
          r.cancelledAt != null -> "cancelled"
          r.stoppedAt != null -> "stopped"
          r.firedAt != null -> "fired"
          r.fireAt > now && AlarmScheduler.isScheduled(context, r.alarmId) -> "scheduled"
          else -> "missing"
        }
        mapOf(
          "alarmId" to r.alarmId,
          "occurrenceId" to r.occurrenceId,
          "nativeId" to r.nativeId,
          "fireAt" to r.fireAt.toDouble(),
          "createdAt" to r.createdAt.toDouble(),
          "state" to state,
          "firedAt" to r.firedAt?.toDouble(),
          "stoppedAt" to r.stoppedAt?.toDouble(),
          "cancelledAt" to r.cancelledAt?.toDouble(),
        )
      }
    }

    AsyncFunction("openSettingsAsync") {
      val ctx = context
      val intent = when {
        !AlarmScheduler.canScheduleExact(ctx) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.packageName))
        !AlarmNotifications.fullScreenAllowed(ctx) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ->
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx.packageName))
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        else ->
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName))
      }
      ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun status(): Map<String, Any?> {
    val ctx = context
    val notifications = AlarmNotifications.notificationsAllowed(ctx)
    val exact = AlarmScheduler.canScheduleExact(ctx)
    val fullScreen = AlarmNotifications.fullScreenAllowed(ctx)
    val reason = when {
      !notifications -> "Notifications are off for Terbit MY, so an alarm can't show or ring."
      !exact -> "\"Alarms & reminders\" access is off for Terbit MY."
      !fullScreen -> "Full-screen alarms are off, so the alarm shows as a banner instead of over the lock screen."
      else -> null
    }
    return mapOf(
      "available" to true,
      "backend" to "alarm-manager",
      "permission" to if (notifications && exact) "granted" else "denied",
      "osVersion" to Build.VERSION.RELEASE,
      "notificationsAllowed" to notifications,
      "exactAlarmsAllowed" to exact,
      "fullScreenAllowed" to fullScreen,
      "reason" to reason,
    )
  }

  private fun failure(code: String, message: String) = mapOf("ok" to false, "code" to code, "message" to message)

  private fun scheduleOneTime(options: OneTimeAlarmOptions): Map<String, Any?> {
    val ctx = context
    val fireAt = options.fireAt.toLong()
    val now = System.currentTimeMillis()
    if (options.alarmId.isEmpty() || fireAt <= 0L) {
      return failure("invalid_arguments", "An alarm ID and time are required.")
    }
    if (fireAt - now < 5_000L) {
      return failure("time_in_past", "The alarm time must be in the future.")
    }
    if (!AlarmScheduler.canScheduleExact(ctx)) {
      return failure("exact_alarm_not_allowed", "Turn on \"Alarms & reminders\" for Terbit MY in Settings.")
    }
    if (!AlarmNotifications.notificationsAllowed(ctx)) {
      return failure("not_authorized", "Turn on notifications for Terbit MY so the alarm can show and ring.")
    }

    // Replace any earlier active alarm with the same Terbit MY ID.
    val records = NativeAlarmRecords.load(ctx)
    records.replaceAll {
      if (it.alarmId == options.alarmId && it.cancelledAt == null && it.firedAt == null) it.copy(cancelledAt = now) else it
    }

    return try {
      AlarmScheduler.schedule(ctx, options.alarmId, options.occurrenceId, fireAt, options.title)
      val nativeId = "alarm-manager:" + AlarmScheduler.requestCode(options.alarmId)
      records.add(NativeAlarmRecord(options.alarmId, options.occurrenceId, nativeId, fireAt, now))
      NativeAlarmRecords.save(ctx, records)
      mapOf("ok" to true, "nativeId" to nativeId)
    } catch (e: SecurityException) {
      NativeAlarmRecords.save(ctx, records)
      failure("exact_alarm_not_allowed", e.message ?: "Exact alarms are not allowed.")
    } catch (e: Exception) {
      NativeAlarmRecords.save(ctx, records)
      failure("scheduling_failed", e.message ?: e.toString())
    }
  }
}
