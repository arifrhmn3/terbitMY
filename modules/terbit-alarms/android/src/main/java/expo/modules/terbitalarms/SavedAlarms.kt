package expo.modules.terbitalarms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** A saved Terbit MY alarm, kept natively so it can repeat and be rescheduled without the app running. */
data class AlarmDefinition(
  val alarmId: String,
  val hour: Int,
  val minute: Int,
  /** 0 = Sunday … 6 = Saturday. Empty = one-off at `fireAt`. */
  val weekdays: List<Int>,
  val fireAt: Long,
  val title: String,
  val missionRequired: Boolean,
  val completionMode: String,
)

/** Next local time strictly after `after` at hour:minute on one of `weekdays`. Mirrors nextOccurrence() in TypeScript. */
object NextTrigger {
  fun next(hour: Int, minute: Int, weekdays: List<Int>, after: Long): Long? {
    if (weekdays.isEmpty()) return null
    val calendar = Calendar.getInstance()
    for (offset in 0..7) {
      calendar.timeInMillis = after
      calendar.add(Calendar.DAY_OF_YEAR, offset)
      calendar.set(Calendar.HOUR_OF_DAY, hour)
      calendar.set(Calendar.MINUTE, minute)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
      val weekday = calendar.get(Calendar.DAY_OF_WEEK) - 1 // Calendar.SUNDAY == 1
      if (calendar.timeInMillis > after && weekday in weekdays) return calendar.timeInMillis
    }
    return null
  }
}

object SavedAlarms {
  private const val PREFS = "terbit_native_alarms"
  private const val KEY = "definitions_v1"

  @Synchronized
  fun all(context: Context): MutableMap<String, AlarmDefinition> {
    val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return mutableMapOf()
    return try {
      val array = JSONArray(json)
      val result = mutableMapOf<String, AlarmDefinition>()
      for (i in 0 until array.length()) {
        val definition = fromJson(array.getJSONObject(i))
        result[definition.alarmId] = definition
      }
      result
    } catch (e: Exception) {
      mutableMapOf()
    }
  }

  fun get(context: Context, alarmId: String): AlarmDefinition? = all(context)[alarmId]

  @Synchronized
  fun put(context: Context, definition: AlarmDefinition) {
    val definitions = all(context)
    definitions[definition.alarmId] = definition
    write(context, definitions.values)
  }

  @Synchronized
  fun remove(context: Context, alarmId: String) {
    val definitions = all(context)
    if (definitions.remove(alarmId) != null) write(context, definitions.values)
  }

  /**
   * Schedules the saved alarm to ring at `fireAt` and records it. Any other
   * not-yet-fired record for this alarm is marked cancelled (it was replaced).
   */
  fun schedule(context: Context, definition: AlarmDefinition, fireAt: Long) {
    AlarmScheduler.schedule(
      context,
      definition.alarmId,
      occurrenceId = null,
      fireAt = fireAt,
      title = definition.title,
      kind = "saved",
      missionRequired = definition.missionRequired,
      completionMode = definition.completionMode,
    )
    val now = System.currentTimeMillis()
    val records = NativeAlarmRecords.load(context)
    records.replaceAll {
      if (it.alarmId == definition.alarmId && it.firedAt == null && it.cancelledAt == null && it.fireAt != fireAt) {
        it.copy(cancelledAt = now)
      } else {
        it
      }
    }
    val exists = records.any {
      it.alarmId == definition.alarmId && it.fireAt == fireAt && it.firedAt == null && it.cancelledAt == null
    }
    if (!exists) {
      records.add(
        NativeAlarmRecord(
          alarmId = definition.alarmId,
          occurrenceId = null,
          nativeId = "alarm-manager:" + AlarmScheduler.requestCode(definition.alarmId),
          fireAt = fireAt,
          createdAt = now,
          kind = "saved",
        ),
      )
    }
    NativeAlarmRecords.save(context, records)
  }

  /** After the alarm fired: schedule the next weekly ring, or forget a one-off alarm. */
  fun afterFire(context: Context, alarmId: String, fireAt: Long) {
    val definition = get(context, alarmId) ?: return
    if (definition.weekdays.isEmpty()) {
      remove(context, alarmId)
      return
    }
    val next = NextTrigger.next(definition.hour, definition.minute, definition.weekdays, maxOf(fireAt, System.currentTimeMillis()))
    if (next != null) schedule(context, definition.copy(fireAt = next), next)
  }

  /** After a restart, app update or time change: put every saved alarm back on the system schedule. */
  fun rescheduleAll(context: Context) {
    if (!AlarmScheduler.canScheduleExact(context)) return
    val now = System.currentTimeMillis()
    for (definition in all(context).values) {
      val target =
        if (definition.weekdays.isNotEmpty()) {
          NextTrigger.next(definition.hour, definition.minute, definition.weekdays, now)
        } else {
          definition.fireAt.takeIf { it > now }
        }
      if (target == null) {
        remove(context, definition.alarmId)
      } else {
        schedule(context, definition.copy(fireAt = target), target)
      }
    }
  }

  private fun write(context: Context, definitions: Collection<AlarmDefinition>) {
    val array = JSONArray()
    definitions.forEach { array.put(toJson(it)) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, array.toString()).commit()
  }

  private fun toJson(d: AlarmDefinition) = JSONObject().apply {
    put("alarmId", d.alarmId)
    put("hour", d.hour)
    put("minute", d.minute)
    put("weekdays", JSONArray(d.weekdays))
    put("fireAt", d.fireAt)
    put("title", d.title)
    put("missionRequired", d.missionRequired)
    put("completionMode", d.completionMode)
  }

  private fun fromJson(o: JSONObject): AlarmDefinition {
    val days = o.optJSONArray("weekdays") ?: JSONArray()
    return AlarmDefinition(
      alarmId = o.getString("alarmId"),
      hour = o.getInt("hour"),
      minute = o.getInt("minute"),
      weekdays = List(days.length()) { days.getInt(it) },
      fireAt = o.getLong("fireAt"),
      title = o.optString("title", "Terbit MY alarm"),
      missionRequired = o.optBoolean("missionRequired", false),
      completionMode = o.optString("completionMode", "reward"),
    )
  }
}
