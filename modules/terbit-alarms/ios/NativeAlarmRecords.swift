import Foundation

/// What this app remembers about each native alarm it scheduled, so the
/// state can be checked after the app restarts. AlarmKit only reports
/// alarms that still exist, so this fills in the history.
struct NativeAlarmRecord: Codable {
  var alarmId: String
  var occurrenceId: String?
  /// The AlarmKit alarm UUID.
  var nativeId: String
  /// ms since 1970 (one-off: when it rings; weekly: the first ring)
  var fireAt: Double
  var createdAt: Double
  var cancelledAt: Double?
  /// "test" (developer test alarm) or "saved" (a saved Terbit MY alarm). Older records: nil = test.
  var kind: String?
  /// Saved alarms: the schedule given to AlarmKit. Empty weekdays = one-off.
  var hour: Int?
  var minute: Int?
  var weekdays: [Int]?
  /// Saved alarms: the mode the AlarmKit alarm was created with (decides its button label).
  var completionMode: String?
}

enum NativeAlarmRecords {
  private static let key = "terbit.nativeAlarmRecords.v1"
  private static let maxRecords = 60

  static func load() -> [NativeAlarmRecord] {
    guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
    return (try? JSONDecoder().decode([NativeAlarmRecord].self, from: data)) ?? []
  }

  static func save(_ records: [NativeAlarmRecord]) {
    let trimmed = Array(records.sorted { $0.createdAt > $1.createdAt }.prefix(maxRecords))
    if let data = try? JSONEncoder().encode(trimmed) {
      UserDefaults.standard.set(data, forKey: key)
    }
  }

  static func nowMs() -> Double {
    Date().timeIntervalSince1970 * 1000
  }
}

/// Taps on the AlarmKit buttons, recorded by Terbit MY's App Intents (which
/// run even when the app isn't open). JavaScript reads these on launch to
/// learn which alarm fired and how it was stopped.
enum NativeAlarmActions {
  private static let key = "terbit.nativeAlarmActions.v1"
  private static let maxActions = 60

  /// action: "mission" (Stop & Open Terbit / Stop & Start Mission) or "stop" (the system Stop button).
  static func record(alarmId: String, nativeId: String, action: String) {
    var actions = load()
    actions.insert(
      ["alarmId": alarmId, "nativeId": nativeId, "action": action, "at": NativeAlarmRecords.nowMs()],
      at: 0
    )
    UserDefaults.standard.set(Array(actions.prefix(maxActions)), forKey: key)
  }

  /// Newest first.
  static func load() -> [[String: Any]] {
    (UserDefaults.standard.array(forKey: key) as? [[String: Any]]) ?? []
  }
}
