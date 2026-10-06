import AlarmKit
import Foundation
import SwiftUI

/// Terbit MY identifiers carried inside each AlarmKit alarm.
@available(iOS 26.0, *)
struct TerbitAlarmMetadata: AlarmMetadata {
  var alarmId: String
  var occurrenceId: String?
}

/// The only file that talks to AlarmKit. Milestone 1: authorisation,
/// one-time alarms, cancel and state. No repeats, snooze or countdown, so no
/// widget extension is needed (Apple only requires one for countdowns).
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
    let id = UUID()
    // The system shows its own Stop control. Terbit MY cannot force a
    // mission before the alarm stops; the mission happens in the app after.
    // This initializer is deprecated in newer SDKs but exists in every iOS 26
    // SDK, so it compiles whichever Xcode 26 version EAS uses.
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle"),
      secondaryButton: nil,
      secondaryButtonBehavior: nil
    )
    let attributes = AlarmAttributes<TerbitAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: TerbitAlarmMetadata(alarmId: alarmId, occurrenceId: occurrenceId),
      tintColor: Color.orange
    )
    let configuration: AlarmManager.AlarmConfiguration<TerbitAlarmMetadata> = .alarm(
      schedule: .fixed(date),
      attributes: attributes
    )
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
