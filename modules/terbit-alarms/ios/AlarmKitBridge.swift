import AlarmKit
import AppIntents
import Foundation
import SwiftUI

/// Terbit MY identifiers carried inside each AlarmKit alarm.
@available(iOS 26.0, *)
struct TerbitAlarmMetadata: AlarmMetadata {
  var alarmId: String
  var occurrenceId: String?
}

/// The one custom button an AlarmKit alert can have (next to the system's Stop).
@available(iOS 26.0, *)
enum TerbitAlertButton {
  /// "Stop & Open Terbit" / "Stop & Start Mission".
  case mission(label: String, icon: String)
  /// Snooze: schedules ring number `nextIndex` of the same morning (`originAt`, ms; 0 = the
  /// alarm's own time today). Only offered while snoozes remain, so the final ring has none.
  case snooze(label: String, nextIndex: Int, originAt: Double)
}

/// The only file that talks to AlarmKit: authorisation, one-off and weekly
/// alarms, snooze rings, cancel and state. Snooze is Terbit's own button and
/// App Intent (each snooze ring is a one-time AlarmKit alarm), not AlarmKit's
/// countdown, so no widget extension is needed and the maximum can be
/// enforced. The system's own Stop control is always shown; Terbit MY never
/// hides or bypasses it.
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
    try await schedule(alarmId: alarmId, occurrenceId: occurrenceId, title: title, schedule: .fixed(date), button: nil)
  }

  /// One snooze ring of a saved alarm: a one-time alarm at `date`, with the next Snooze or (final ring) the mission button.
  static func scheduleSnoozeRing(alarmId: String, date: Date, title: String, button: TerbitAlertButton) async throws -> UUID {
    try await schedule(alarmId: alarmId, occurrenceId: nil, title: title, schedule: .fixed(date), button: button)
  }

  /// A saved alarm: weekly at hour:minute on `weekdays` (0 = Sunday), or once at `date` when `weekdays` is empty.
  /// AlarmKit repeats weekly alarms itself, without Terbit MY running. `actionLabel` is the one-tap
  /// "Stop & Open Terbit" / "Stop & Start Mission" button, or Snooze when `snoozes` is true.
  static func scheduleSaved(
    alarmId: String,
    hour: Int,
    minute: Int,
    weekdays: [Int],
    date: Date,
    title: String,
    actionLabel: String,
    actionIcon: String,
    snoozeLabel: String?
  ) async throws -> UUID {
    let schedule: Alarm.Schedule
    if weekdays.isEmpty {
      schedule = .fixed(date)
    } else {
      let days = weekdays.compactMap { localeWeekdays[$0] }
      schedule = .relative(.init(time: .init(hour: hour, minute: minute), repeats: .weekly(days)))
    }
    let button: TerbitAlertButton
    if let snoozeLabel {
      button = .snooze(label: snoozeLabel, nextIndex: 1, originAt: 0)
    } else {
      button = .mission(
        label: actionLabel.isEmpty ? "Stop & Open Terbit" : actionLabel,
        icon: actionIcon.isEmpty ? "sunrise.fill" : actionIcon
      )
    }
    return try await self.schedule(alarmId: alarmId, occurrenceId: nil, title: title, schedule: schedule, button: button)
  }

  private static let localeWeekdays: [Int: Locale.Weekday] = [
    0: .sunday, 1: .monday, 2: .tuesday, 3: .wednesday, 4: .thursday, 5: .friday, 6: .saturday,
  ]

  private static func schedule(
    alarmId: String,
    occurrenceId: String?,
    title: String,
    schedule: Alarm.Schedule,
    button: TerbitAlertButton?
  ) async throws -> UUID {
    let id = UUID()
    // Apple's own Stop control is always available; Terbit MY can't remove it
    // or force the mission first. The one secondary button supplements it:
    // "Stop & Open Terbit" (stops the alarm and opens the mission), or Snooze.
    var secondaryButton: AlarmButton? = nil
    switch button {
    case .some(.mission(let label, let icon)):
      secondaryButton = AlarmButton(text: LocalizedStringResource(stringLiteral: label), textColor: .white, systemImageName: icon)
    case .some(.snooze(let label, _, _)):
      secondaryButton = AlarmButton(text: LocalizedStringResource(stringLiteral: label), textColor: .white, systemImageName: "zzz")
    case .none:
      break
    }
    let secondaryBehavior: AlarmPresentation.Alert.SecondaryButtonBehavior? =
      secondaryButton == nil ? nil : AlarmPresentation.Alert.SecondaryButtonBehavior.custom
    let alert: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      // Current API (iOS 26.1+): the system draws its own Stop control; we supply only the secondary button.
      alert = AlarmPresentation.Alert(
        title: LocalizedStringResource(stringLiteral: title),
        secondaryButton: secondaryButton,
        secondaryButtonBehavior: secondaryBehavior
      )
    } else {
      // iOS 26.0 only: this initializer was deprecated in 26.1 ("stopButton … will no longer be used").
      alert = AlarmPresentation.Alert(
        title: LocalizedStringResource(stringLiteral: title),
        stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle"),
        secondaryButton: secondaryButton,
        secondaryButtonBehavior: secondaryBehavior
      )
    }
    let attributes = AlarmAttributes<TerbitAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: TerbitAlarmMetadata(alarmId: alarmId, occurrenceId: occurrenceId),
      tintColor: Color.orange
    )
    let configuration: AlarmManager.AlarmConfiguration<TerbitAlarmMetadata>
    switch button {
    case .some(.mission):
      configuration = .alarm(
        schedule: schedule,
        attributes: attributes,
        stopIntent: TerbitStopIntent(alarmId: alarmId, nativeId: id.uuidString),
        secondaryIntent: TerbitOpenMissionIntent(alarmId: alarmId, nativeId: id.uuidString)
      )
    case .some(.snooze(_, let nextIndex, let originAt)):
      configuration = .alarm(
        schedule: schedule,
        attributes: attributes,
        stopIntent: TerbitStopIntent(alarmId: alarmId, nativeId: id.uuidString),
        secondaryIntent: TerbitSnoozeIntent(alarmId: alarmId, nativeId: id.uuidString, nextIndex: nextIndex, originAt: originAt)
      )
    case .none:
      configuration = .alarm(schedule: schedule, attributes: attributes)
    }
    _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
    return id
  }

  /// Which alert presentation this iOS version uses (shown in developer diagnostics).
  static func presentationName(hasButton: Bool) -> String {
    let base: String
    if #available(iOS 26.1, *) {
      base = "iOS 26.1+ alert (system Stop)"
    } else {
      base = "iOS 26.0 alert (custom Stop)"
    }
    return hasButton ? base + " + Terbit button" : base + ", no Terbit button"
  }

  /// Every alarm AlarmKit holds for this app, including ones from earlier builds that Terbit MY no longer tracks.
  static func allAlarmIds() -> [String] {
    ((try? AlarmManager.shared.alarms) ?? []).map { $0.id.uuidString }
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
