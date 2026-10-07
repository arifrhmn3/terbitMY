import AlarmKit
import Foundation
import SwiftUI

/// Terbit MY identifiers carried inside each AlarmKit alarm.
@available(iOS 26.0, *)
struct TerbitAlarmMetadata: AlarmMetadata {
  var alarmId: String
  var occurrenceId: String?
}

/// The only file that talks to AlarmKit: authorisation, one-off and weekly
/// alarms, cancel and state. No snooze or countdown, so no widget extension is
/// needed (Apple only requires one for countdowns). The system's own Stop
/// control is always shown; Terbit MY never hides or bypasses it.
@available(iOS 26.0, *)
enum AlarmKitBridge {
  static func permission() -> String {
    map(AlarmManager.shared.authorizationState)
  }

  static func requestPermission() async -> String {
    do {
      return map(try await AlarmManager.shared.requestAuthorization())
    } catch {
      return permission()
    }
  }

  static func scheduleOneTime(alarmId: String, occurrenceId: String?, date: Date, title: String) async throws -> UUID {
    try await schedule(alarmId: alarmId, occurrenceId: occurrenceId, title: title, schedule: .fixed(date), actionLabel: nil)
  }

  /// A saved alarm: weekly at hour:minute on `weekdays` (0 = Sunday), or once at `date` when `weekdays` is empty.
  /// AlarmKit repeats weekly alarms itself, without Terbit MY running. `actionLabel` is the one-tap
  /// "Stop & Open Terbit" / "Stop & Start Mission" button.
  static func scheduleSaved(
    alarmId: String,
    hour: Int,
    minute: Int,
    weekdays: [Int],
    date: Date,
    title: String,
    actionLabel: String
  ) async throws -> UUID {
    let schedule: Alarm.Schedule
    if weekdays.isEmpty {
      schedule = .fixed(date)
    } else {
      let days = weekdays.compactMap { localeWeekdays[$0] }
      schedule = .relative(.init(time: .init(hour: hour, minute: minute), repeats: .weekly(days)))
    }
    return try await self.schedule(
      alarmId: alarmId,
      occurrenceId: nil,
      title: title,
      schedule: schedule,
      actionLabel: actionLabel.isEmpty ? "Stop & Open Terbit" : actionLabel
    )
  }

  private static let localeWeekdays: [Int: Locale.Weekday] = [
    0: .sunday, 1: .monday, 2: .tuesday, 3: .wednesday, 4: .thursday, 5: .friday, 6: .saturday,
  ]

  private static func schedule(
    alarmId: String,
    occurrenceId: String?,
    title: String,
    schedule: Alarm.Schedule,
    actionLabel: String?
  ) async throws -> UUID {
    let id = UUID()
    // The system Stop button is always shown and always works. Terbit MY
    // can't force the mission before the alarm stops. The optional secondary
    // button ("Stop & Open Terbit") stops the alarm and opens the mission.
    // This initializer is deprecated in newer SDKs but exists in every iOS 26
    // SDK, so it compiles whichever Xcode 26 version EAS uses.
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle"),
      secondaryButton: actionLabel.map {
        AlarmButton(text: LocalizedStringResource(stringLiteral: $0), textColor: .white, systemImageName: "sunrise.fill")
      },
      secondaryButtonBehavior: actionLabel == nil ? nil : AlarmPresentation.Alert.SecondaryButtonBehavior.custom
    )
    let attributes = AlarmAttributes<TerbitAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: TerbitAlarmMetadata(alarmId: alarmId, occurrenceId: occurrenceId),
      tintColor: Color.orange
    )
    let configuration: AlarmManager.AlarmConfiguration<TerbitAlarmMetadata>
    if actionLabel != nil {
      configuration = .alarm(
        schedule: schedule,
        attributes: attributes,
        stopIntent: TerbitStopIntent(alarmId: alarmId, nativeId: id.uuidString),
        secondaryIntent: TerbitOpenMissionIntent(alarmId: alarmId, nativeId: id.uuidString)
      )
    } else {
      configuration = .alarm(schedule: schedule, attributes: attributes)
    }
    _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
    return id
  }

  static func cancel(nativeId: String) {
    guard let id = UUID(uuidString: nativeId) else { return }
    // Throws if the alarm already finished or was stopped; nothing to do then.
    try? AlarmManager.shared.cancel(id: id)
  }

  /// AlarmKit's current state for each alarm it still knows about.
  static func states() -> [String: String] {
    let alarms = (try? AlarmManager.shared.alarms) ?? []
    var result: [String: String] = [:]
    for alarm in alarms {
      result[alarm.id.uuidString] = map(alarm.state)
    }
    return result
  }

  private static func map(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .notDetermined: return "undetermined"
    @unknown default: return "undetermined"
    }
  }

  private static func map(_ state: Alarm.State) -> String {
    switch state {
    case .scheduled: return "scheduled"
    case .countdown: return "countdown"
    case .paused: return "paused"
    case .alerting: return "alerting"
    @unknown default: return "unknown"
    }
  }
}
