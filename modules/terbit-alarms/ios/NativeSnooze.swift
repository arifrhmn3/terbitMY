import AlarmKit
import Foundation

/// Snooze for a saved alarm, entirely on the phone: no JavaScript, network
/// or Metro. A snooze ring is a one-time AlarmKit alarm recorded with kind
/// "snooze", the same `alarmId`, its number (`snoozeIndex`) and the original
/// ring it belongs to (`originAt`). JavaScript reads these records to keep
/// every snooze inside ONE morning; they never create mornings of their own.
@available(iOS 26.0, *)
enum NativeSnooze {
  /// Schedules ring `nextIndex` (1 = first snooze) of the morning that started at `originAt`
  /// (0 = this alarm's own time today). Does nothing past the configured maximum.
  static func scheduleNext(alarmId: String, nextIndex: Int, originAt: Double) async {
    var records = NativeAlarmRecords.load()
    guard
      let saved = records.last(where: { $0.alarmId == alarmId && $0.kind == "saved" && $0.cancelledAt == nil }),
      let offsets = saved.snoozeOffsets,
      nextIndex >= 1,
      nextIndex <= offsets.count
    else {
      // Deleted, edited without snooze, or past the maximum: no further ring.
      NativeAlarmActions.record(alarmId: alarmId, nativeId: "", action: "snooze_failed")
      return
    }

    let now = NativeAlarmRecords.nowMs()
    let origin = originAt > 0 ? originAt : originOfCurrentRing(hour: saved.hour ?? 0, minute: saved.minute ?? 0)
    // The same times as the Preview: the alarm time plus this snooze's offset. If that
    // moment has already passed (the ring was left going), ring one interval from now.
    var fireAt = origin + offsets[nextIndex - 1] * 60_000
    if fireAt < now + 30_000 {
      fireAt = now + offsets[0] * 60_000
    }

    // One pending snooze per alarm at a time.
    cancelPending(alarmId: alarmId, in: &records)

    let isFinal = nextIndex >= offsets.count
    let button: TerbitAlertButton = isFinal
      ? .mission(label: saved.actionLabel ?? "Stop & Open Terbit", icon: saved.actionIcon ?? "sunrise.fill")
      : .snooze(label: saved.snoozeLabel ?? "Snooze", nextIndex: nextIndex + 1, originAt: origin)
    do {
      let id = try await AlarmKitBridge.scheduleSnoozeRing(
        alarmId: alarmId,
        date: Date(timeIntervalSince1970: fireAt / 1000),
        title: saved.title ?? "Terbit MY",
        button: button
      )
      var record = NativeAlarmRecord(
        alarmId: alarmId,
        occurrenceId: nil,
        nativeId: id.uuidString,
        fireAt: fireAt,
        createdAt: now,
        cancelledAt: nil,
        kind: "snooze",
        hour: nil,
        minute: nil,
        weekdays: nil,
        completionMode: saved.completionMode,
        actionLabel: isFinal ? saved.actionLabel : saved.snoozeLabel,
        presentation: AlarmKitBridge.presentationName(hasButton: true)
      )
      record.snoozeIndex = nextIndex
      record.originAt = origin
      record.snoozeOffsets = offsets
      records.append(record)
      NativeAlarmRecords.save(records)
      NativeAlarmActions.record(alarmId: alarmId, nativeId: id.uuidString, action: "snooze")
    } catch {
      NativeAlarmRecords.save(records)
      NativeAlarmActions.record(alarmId: alarmId, nativeId: "", action: "snooze_failed")
    }
  }

  /// Cancels this alarm's snooze rings that haven't rung yet. Returns how many.
  @discardableResult
  static func cancelPending(alarmId: String, in records: inout [NativeAlarmRecord]) -> Int {
    let now = NativeAlarmRecords.nowMs()
    var cancelled = 0
    for index in records.indices
    where records[index].alarmId == alarmId && records[index].kind == "snooze" && records[index].cancelledAt == nil
      && records[index].fireAt > now
    {
      AlarmKitBridge.cancel(nativeId: records[index].nativeId)
      records[index].cancelledAt = now
      cancelled += 1
    }
    return cancelled
  }

  /// When the ringing alarm was due: its hour:minute today, or yesterday if that's still ahead (rang before midnight).
  private static func originOfCurrentRing(hour: Int, minute: Int) -> Double {
    let calendar = Calendar.current
    let now = Date()
    var parts = calendar.dateComponents([.year, .month, .day], from: now)
    parts.hour = hour
    parts.minute = minute
    parts.second = 0
    var due = calendar.date(from: parts) ?? now
    if due > now {
      due = calendar.date(byAdding: .day, value: -1, to: due) ?? due
    }
    return due.timeIntervalSince1970 * 1000
  }
}
