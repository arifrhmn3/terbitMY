package expo.modules.terbitalarms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** What this app remembers about each native alarm, so state survives the app closing. */
data class NativeAlarmRecord(
  val alarmId: String,
  val occurrenceId: String?,
  val nativeId: String,
  val fireAt: Long,
  val createdAt: Long,
  val firedAt: Long? = null,
  val stoppedAt: Long? = null,
  val cancelledAt: Long? = null,
  /** "test" (developer test alarm) or "saved" (a saved Terbit MY alarm). */
  val kind: String = "test",
  /** How it was stopped: "stop" (alarm controls) or "mission" (Start mission). */
  val stopAction: String? = null,
)

object NativeAlarmRecords {
  private const val PREFS = "terbit_native_alarms"
  private const val KEY = "records_v1"
  private const val MAX_RECORDS = 60

  @Synchronized
  fun load(context: Context): MutableList<NativeAlarmRecord> {
    val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return mutableListOf()
    return try {
      val array = JSONArray(json)
      MutableList(array.length()) { i -> fromJson(array.getJSONObject(i)) }
    } catch (e: Exception) {
      mutableListOf()
    }
  }

  @Synchronized
  fun save(context: Context, records: List<NativeAlarmRecord>) {
    val array = JSONArray()
    records.sortedByDescending { it.createdAt }.take(MAX_RECORDS).forEach { array.put(toJson(it)) }
    // commit() (not apply()) so the write finishes even if the process is about to end.
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, array.toString()).commit()
  }

  @Synchronized
  fun update(context: Context, alarmId: String, fireAt: Long, change: (NativeAlarmRecord) -> NativeAlarmRecord) {
    val records = load(context)
    val index = records.indexOfFirst { it.alarmId == alarmId && it.fireAt == fireAt }
    if (index >= 0) {
      records[index] = change(records[index])
      save(context, records)
    }
  }

  private fun toJson(r: NativeAlarmRecord) = JSONObject().apply {
    put("alarmId", r.alarmId)
    put("occurrenceId", r.occurrenceId ?: JSONObject.NULL)
    put("nativeId", r.nativeId)
    put("fireAt", r.fireAt)
    put("createdAt", r.createdAt)
    put("firedAt", r.firedAt ?: JSONObject.NULL)
    put("stoppedAt", r.stoppedAt ?: JSONObject.NULL)
    put("cancelledAt", r.cancelledAt ?: JSONObject.NULL)
    put("kind", r.kind)
    put("stopAction", r.stopAction ?: JSONObject.NULL)
  }

  private fun fromJson(o: JSONObject): NativeAlarmRecord {
    fun optLong(key: String): Long? = if (o.isNull(key)) null else o.getLong(key)
    return NativeAlarmRecord(
      alarmId = o.getString("alarmId"),
      occurrenceId = if (o.isNull("occurrenceId")) null else o.getString("occurrenceId"),
      nativeId = o.getString("nativeId"),
      fireAt = o.getLong("fireAt"),
      createdAt = o.getLong("createdAt"),
      firedAt = optLong("firedAt"),
      stoppedAt = optLong("stoppedAt"),
      cancelledAt = optLong("cancelledAt"),
      kind = o.optString("kind", "test"),
      stopAction = if (o.isNull("stopAction")) null else o.optString("stopAction", null),
    )
  }
}
