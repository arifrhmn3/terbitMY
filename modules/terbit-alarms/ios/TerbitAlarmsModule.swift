import ExpoModulesCore
import Foundation
import UIKit
import UserNotifications

struct OneTimeAlarmOptions: Record {
  @Field var alarmId: String = ""
  @Field var occurrenceId: String? = nil
  /// ms since 1970
  @Field var fireAt: Double = 0
  @Field var title: String = "Terbit MY"
}

struct SavedAlarmOptions: Record {
  @Field var alarmId: String = ""
  @Field var hour: Int = 0
  @Field var minute: Int = 0
  /// 0 = Sunday … 6 = Saturday. Empty = one-off at `fireAt`.
  @Field var weekdays: [Int] = []
  /// ms since 1970: the next ring
  @Field var fireAt: Double = 0
  @Field var title: String = "Terbit MY alarm"
  @Field var missionRequired: Bool = false
  @Field var completionMode: String = "reward"
  /// The one-tap button, e.g. "Stop & Open Terbit" / "Stop & Start Mission".
  @Field var actionLabel: String = "Stop & Open Terbit"
  /// SF Symbol for that button.
  @Field var actionIcon: String = "sunrise.fill"
}

struct ReminderOptions: Record {
  @Field var id: String = ""
  @Field var title: String = "Terbit MY"
  @Field var body: String = ""
  /// ms since 1970
  @Field var fireAt: Double = 0
}

/// iOS side of the TerbitAlarms module. Uses AlarmKit on iOS 26+; on older
/// versions every call reports `unsupported_os` instead of failing.
/// Note: static helpers must be called as `TerbitAlarmsModule.x` inside
/// `definition()`, which is an instance method.
public class TerbitAlarmsModule: Module {
  static let onAlarmAction = "onAlarmAction"

  @objc func handleAlarmActionRecorded(_ notification: Notification) {
    guard let action = notification.userInfo as? [String: Any] else { return }
    sendEvent(TerbitAlarmsModule.onAlarmAction, action)
  }

  public func definition() -> ModuleDefinition {
    Name("TerbitAlarms")

    // An AlarmKit button tap was just saved by an App Intent. JavaScript re-runs the
    // hand-off on this event, so it doesn't depend on when iOS ran the intent.
    Events(TerbitAlarmsModule.onAlarmAction)

    OnStartObserving(TerbitAlarmsModule.onAlarmAction) {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleAlarmActionRecorded),
        name: NativeAlarmActions.recordedNotification,
        object: nil
      )
    }

    OnStopObserving(TerbitAlarmsModule.onAlarmAction) {
      NotificationCenter.default.removeObserver(self, name: NativeAlarmActions.recordedNotification, object: nil)
    }

    AsyncFunction("getStatusAsync") { () -> [String: Any] in
      TerbitAlarmsModule.status(permission: nil)
    }

    AsyncFunction("requestPermissionAsync") { () async -> [String: Any] in
      if #available(iOS 26.0, *) {
        return TerbitAlarmsModule.status(permission: await AlarmKitBridge.requestPermission())
      }
      return TerbitAlarmsModule.status(permission: nil)
    }

    AsyncFunction("scheduleOneTimeAsync") { (options: OneTimeAlarmOptions) async -> [String: Any] in
      await TerbitAlarmsModule.scheduleOneTime(options)
    }

    AsyncFunction("scheduleAlarmAsync") { (options: SavedAlarmOptions) async -> [String: Any] in
      await TerbitAlarmsModule.scheduleSaved(options)
    }

    AsyncFunction("cancelAsync") { (alarmId: String) -> Int in
      var records = NativeAlarmRecords.load()
      let cancelled = TerbitAlarmsModule.cancelActive(alarmId: alarmId, in: &records)
      NativeAlarmRecords.save(records)
      return cancelled
    }

    AsyncFunction("listAsync") { () -> [[String: Any]] in
      var live: [String: String] = [:]
      if #available(iOS 26.0, *) {
        live = AlarmKitBridge.states()
      }
      return NativeAlarmRecords.load().map { record in
        let state: String
        if let systemState = live[record.nativeId] {
          state = systemState
        } else if record.cancelledAt != nil {
          state = "cancelled"
        } else {
          // AlarmKit no longer lists it: it alerted and was stopped, or was removed.
          state = "finished"
        }
        return [
          "kind": record.kind ?? "test",
          "alarmId": record.alarmId,
          "occurrenceId": TerbitAlarmsModule.orNull(record.occurrenceId),
          "nativeId": record.nativeId,
          "fireAt": record.fireAt,
          "createdAt": record.createdAt,
          "state": state,
          "firedAt": NSNull(),
          "stoppedAt": NSNull(),
          "cancelledAt": TerbitAlarmsModule.orNull(record.cancelledAt),
          "stopAction": NSNull(),
          "hour": TerbitAlarmsModule.orNull(record.hour),
          "minute": TerbitAlarmsModule.orNull(record.minute),
          "weekdays": TerbitAlarmsModule.orNull(record.weekdays),
          "completionMode": TerbitAlarmsModule.orNull(record.completionMode),
          "actionLabel": TerbitAlarmsModule.orNull(record.actionLabel),
          "presentation": TerbitAlarmsModule.orNull(record.presentation),
        ]
      }
    }

    /// Developer tool: cancels every AlarmKit alarm this app holds (including
    /// untracked ones from earlier builds). JavaScript then reschedules saved alarms.
    AsyncFunction("resetAllAsync") { () -> Int in
      var records = NativeAlarmRecords.load()
      var cancelled = 0
      if #available(iOS 26.0, *) {
        for nativeId in AlarmKitBridge.allAlarmIds() {
          AlarmKitBridge.cancel(nativeId: nativeId)
          cancelled += 1
        }
      }
      let now = NativeAlarmRecords.nowMs()
      for index in records.indices where records[index].cancelledAt == nil {
        records[index].cancelledAt = now
      }
      NativeAlarmRecords.save(records)
      return cancelled
    }

    AsyncFunction("listActionsAsync") { () -> [[String: Any]] in
      NativeAlarmActions.load()
    }

    AsyncFunction("requestReminderPermissionAsync") { () async -> String in
      await TerbitAlarmsModule.reminderPermission(askIfNeeded: true) ? "granted" : "denied"
    }

    AsyncFunction("scheduleReminderAsync") { (options: ReminderOptions) async -> Bool in
      await TerbitAlarmsModule.scheduleReminder(options)
    }

    AsyncFunction("cancelReminderAsync") { (id: String) in
      UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }

    AsyncFunction("openSettingsAsync") { () in
      DispatchQueue.main.async {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
      }
    }
  }

  private static func orNull(_ value: Any?) -> Any {
    value ?? NSNull()
  }

  private static func status(permission: String?) -> [String: Any] {
    let v = ProcessInfo.processInfo.operatingSystemVersion
    let osVersion = "\(v.majorVersion).\(v.minorVersion)"
    guard #available(iOS 26.0, *) else {
      return [
        "available": false,
        "backend": "alarmkit",
        "permission": "denied",
        "osVersion": osVersion,
        "reason": "AlarmKit needs iOS 26 or later. This iPhone has iOS \(osVersion).",
      ]
    }
    let current = permission ?? AlarmKitBridge.permission()
    let registered = AlarmKitBridge.allAlarmIds()
    let tracked = Set(NativeAlarmRecords.load().filter { $0.cancelledAt == nil }.map { $0.nativeId })
    var result: [String: Any] = [
      "available": true,
      "backend": "alarmkit",
      "permission": current,
      "osVersion": osVersion,
      "registeredAlarmCount": registered.count,
      "untrackedAlarmCount": registered.filter { !tracked.contains($0) }.count,
      "presentation": AlarmKitBridge.presentationName(hasButton: true),
    ]
    if current == "denied" {
      result["reason"] = "Alarms are turned off for Terbit MY. Turn them on in Settings."
    }
    return result
  }

  private static func failure(_ code: String, _ message: String) -> [String: Any] {
    ["ok": false, "code": code, "message": message]
  }

  /// Cancels every not-yet-cancelled native alarm for this Terbit MY ID. Returns how many.
  private static func cancelActive(alarmId: String, in records: inout [NativeAlarmRecord]) -> Int {
    var cancelled = 0
    for index in records.indices where records[index].alarmId == alarmId && records[index].cancelledAt == nil {
      if #available(iOS 26.0, *) {
        AlarmKitBridge.cancel(nativeId: records[index].nativeId)
      }
      records[index].cancelledAt = NativeAlarmRecords.nowMs()
      cancelled += 1
    }
    return cancelled
  }

  /// Shared checks: iOS version, arguments, time and AlarmKit permission (asked for if not yet asked).
  private static func precheck(alarmId: String, fireAt: Double) async -> [String: Any]? {
    guard #available(iOS 26.0, *) else {
      return failure("unsupported_os", "AlarmKit needs iOS 26 or later.")
    }
    guard !alarmId.isEmpty, fireAt > 0 else {
      return failure("invalid_arguments", "An alarm ID and time are required.")
    }
    guard Date(timeIntervalSince1970: fireAt / 1000).timeIntervalSinceNow > 0 else {
      return failure("time_in_past", "The alarm time must be in the future.")
    }
    var permission = AlarmKitBridge.permission()
    if permission == "undetermined" {
      permission = await AlarmKitBridge.requestPermission()
    }
    guard permission == "granted" else {
      return failure("not_authorized", "Terbit MY isn't allowed to set alarms. Turn on Alarms in Settings.")
    }
    return nil
  }

  private static func scheduleOneTime(_ options: OneTimeAlarmOptions) async -> [String: Any] {
    if let problem = await precheck(alarmId: options.alarmId, fireAt: options.fireAt) {
      return problem
    }
    guard #available(iOS 26.0, *) else {
      return failure("unsupported_os", "AlarmKit needs iOS 26 or later.")
    }

    var records = NativeAlarmRecords.load()
    _ = cancelActive(alarmId: options.alarmId, in: &records)
    do {
      let id = try await AlarmKitBridge.scheduleOneTime(
        alarmId: options.alarmId,
        occurrenceId: options.occurrenceId,
        date: Date(timeIntervalSince1970: options.fireAt / 1000),
        title: options.title
      )
      records.append(NativeAlarmRecord(
        alarmId: options.alarmId,
        occurrenceId: options.occurrenceId,
        nativeId: id.uuidString,
        fireAt: options.fireAt,
        createdAt: NativeAlarmRecords.nowMs(),
        cancelledAt: nil,
        kind: "test",
        hour: nil,
        minute: nil,
        weekdays: nil,
        completionMode: nil,
        actionLabel: nil,
        presentation: AlarmKitBridge.presentationName(hasButton: false)
      ))
      NativeAlarmRecords.save(records)
      return ["ok": true, "nativeId": id.uuidString]
    } catch {
      NativeAlarmRecords.save(records)
      return failure("scheduling_failed", error.localizedDescription)
    }
  }

  /// A saved alarm: one AlarmKit alarm (weekly repeats handled by AlarmKit). Replaces any earlier one.
  private static func scheduleSaved(_ options: SavedAlarmOptions) async -> [String: Any] {
    if let problem = await precheck(alarmId: options.alarmId, fireAt: options.fireAt) {
      return problem
    }
    guard #available(iOS 26.0, *) else {
      return failure("unsupported_os", "AlarmKit needs iOS 26 or later.")
    }
    let weekdays = Array(Set(options.weekdays.filter { (0...6).contains($0) })).sorted()

    var records = NativeAlarmRecords.load()
    _ = cancelActive(alarmId: options.alarmId, in: &records)
    do {
      let id = try await AlarmKitBridge.scheduleSaved(
        alarmId: options.alarmId,
        hour: options.hour,
        minute: options.minute,
        weekdays: weekdays,
        date: Date(timeIntervalSince1970: options.fireAt / 1000),
        title: options.title,
        actionLabel: options.actionLabel,
        actionIcon: options.actionIcon
      )
      records.append(NativeAlarmRecord(
        alarmId: options.alarmId,
        occurrenceId: nil,
        nativeId: id.uuidString,
        fireAt: options.fireAt,
        createdAt: NativeAlarmRecords.nowMs(),
        cancelledAt: nil,
        kind: "saved",
        hour: options.hour,
        minute: options.minute,
        weekdays: weekdays,
        completionMode: options.completionMode,
        actionLabel: options.actionLabel,
        presentation: AlarmKitBridge.presentationName(hasButton: true)
      ))
      NativeAlarmRecords.save(records)
      return ["ok": true, "nativeId": id.uuidString]
    } catch {
      NativeAlarmRecords.save(records)
      return failure("scheduling_failed", error.localizedDescription)
    }
  }

  /// Local notification permission for reminders (asks once if not yet asked).
  private static func reminderPermission(askIfNeeded: Bool) async -> Bool {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    switch settings.authorizationStatus {
    case .authorized, .provisional, .ephemeral:
      return true
    case .notDetermined:
      guard askIfNeeded else { return false }
      return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    default:
      return false
    }
  }

  /// Schedules (or replaces) a one-off local reminder. Device-only; no push.
  private static func scheduleReminder(_ options: ReminderOptions) async -> Bool {
    guard !options.id.isEmpty, await reminderPermission(askIfNeeded: true) else { return false }
    let seconds = options.fireAt / 1000 - Date().timeIntervalSince1970
    guard seconds > 0 else { return false }
    let content = UNMutableNotificationContent()
    content.title = options.title
    content.body = options.body
    content.sound = .default
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [options.id])
    do {
      try await center.add(UNNotificationRequest(identifier: options.id, content: content, trigger: trigger))
      return true
    } catch {
      return false
    }
  }
}
