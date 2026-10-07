import ExpoModulesCore
import Foundation
import UIKit

struct OneTimeAlarmOptions: Record {
  @Field var alarmId: String = ""
  @Field var occurrenceId: String? = nil
  /// ms since 1970
  @Field var fireAt: Double = 0
  @Field var title: String = "Terbit MY"
}

/// iOS side of the TerbitAlarms module. Uses AlarmKit on iOS 26+; on older
/// versions every call reports `unsupported_os` instead of failing.
public class TerbitAlarmsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TerbitAlarms")

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

    AsyncFunction("cancelAsync") { (alarmId: String) -> Int in
      var records = NativeAlarmRecords.load()
      var cancelled = 0
      for index in records.indices where records[index].alarmId == alarmId && records[index].cancelledAt == nil {
        if #available(iOS 26.0, *) {
          AlarmKitBridge.cancel(nativeId: records[index].nativeId)
        }
        records[index].cancelledAt = NativeAlarmRecords.nowMs()
        cancelled += 1
      }
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
          "alarmId": record.alarmId,
          "occurrenceId": TerbitAlarmsModule.orNull(record.occurrenceId),
          "nativeId": record.nativeId,
          "fireAt": record.fireAt,
          "createdAt": record.createdAt,
          "state": state,
          "firedAt": NSNull(),
          "stoppedAt": NSNull(),
          "cancelledAt": TerbitAlarmsModule.orNull(record.cancelledAt),
        ]
      }
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
    var result: [String: Any] = [
      "available": true,
      "backend": "alarmkit",
      "permission": current,
      "osVersion": osVersion,
    ]
    if current == "denied" {
      result["reason"] = "Alarms are turned off for Terbit MY. Turn them on in Settings."
    }
    return result
  }

  private static func failure(_ code: String, _ message: String) -> [String: Any] {
    ["ok": false, "code": code, "message": message]
  }

  private static func scheduleOneTime(_ options: OneTimeAlarmOptions) async -> [String: Any] {
    guard #available(iOS 26.0, *) else {
      return failure("unsupported_os", "AlarmKit needs iOS 26 or later.")
    }
    guard !options.alarmId.isEmpty, options.fireAt > 0 else {
      return failure("invalid_arguments", "An alarm ID and time are required.")
    }
    let date = Date(timeIntervalSince1970: options.fireAt / 1000)
    guard date.timeIntervalSinceNow > 5 else {
      return failure("time_in_past", "The alarm time must be in the future.")
    }

    var permission = AlarmKitBridge.permission()
    if permission == "undetermined" {
      permission = await AlarmKitBridge.requestPermission()
    }
    guard permission == "granted" else {
      return failure("not_authorized", "Terbit MY isn't allowed to set alarms. Turn on Alarms in Settings.")
    }

    // Replace any earlier active alarm with the same Terbit MY ID.
    var records = NativeAlarmRecords.load()
    for index in records.indices where records[index].alarmId == options.alarmId && records[index].cancelledAt == nil {
      AlarmKitBridge.cancel(nativeId: records[index].nativeId)
      records[index].cancelledAt = NativeAlarmRecords.nowMs()
    }

    do {
      let id = try await AlarmKitBridge.scheduleOneTime(
        alarmId: options.alarmId,
        occurrenceId: options.occurrenceId,
        date: date,
        title: options.title
      )
      records.append(NativeAlarmRecord(
        alarmId: options.alarmId,
        occurrenceId: options.occurrenceId,
        nativeId: id.uuidString,
        fireAt: options.fireAt,
        createdAt: NativeAlarmRecords.nowMs(),
        cancelledAt: nil
      ))
      NativeAlarmRecords.save(records)
      return ["ok": true, "nativeId": id.uuidString]
    } catch {
      NativeAlarmRecords.save(records)
      return failure("scheduling_failed", error.localizedDescription)
    }
  }
}
