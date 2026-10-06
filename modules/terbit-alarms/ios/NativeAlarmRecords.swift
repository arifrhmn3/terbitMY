import Foundation

/// What this app remembers about each native alarm it scheduled, so the
/// state can be checked after the app restarts. AlarmKit only reports
/// alarms that still exist, so this fills in the history.
struct NativeAlarmRecord: Codable {
  var alarmId: String
  var occurrenceId: String?
  /// The AlarmKit alarm UUID.
  var nativeId: String
  /// ms since 1970
  var fireAt: Double
  var createdAt: Double
  var cancelledAt: Double?
}

enum NativeAlarmRecords {
  private static let key = "terbit.nativeAlarmRecords.v1"
  private static let maxRecords = 20

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
