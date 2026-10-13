import AlarmKit
import AppIntents
import Foundation

/// "Stop & Open Terbit" / "Stop & Start Mission": the secondary button on a
/// Terbit MY alarm. Stops this alarm, records which alarm it was, and asks
/// iOS to bring Terbit MY to the foreground. The app then reads the record
/// and opens that morning's mission. (AlarmKit has no direct route-into-a-screen
/// API; this record-then-reconcile hand-off is the supported pattern.)
@available(iOS 26.0, *)
struct TerbitOpenMissionIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Open Terbit MY mission"
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
  /// Current API (iOS 26): bring the app to the foreground right away.
  static var supportedModes: IntentModes { .foreground(.immediate) }
  /// Older equivalent used in Apple's own AlarmKit sample; kept for compatibility (deprecated in iOS 26).
  static var openAppWhenRun: Bool = true

  @Parameter(title: "Alarm ID")
  var alarmId: String
  @Parameter(title: "Native alarm ID")
  var nativeId: String

  init() {
    alarmId = ""
    nativeId = ""
  }

  init(alarmId: String, nativeId: String) {
    self.alarmId = alarmId
    self.nativeId = nativeId
  }

  func perform() async throws -> some IntentResult {
    if let id = UUID(uuidString: nativeId) {
      // Ends this alert only; a weekly alarm stays scheduled for its next day.
      try? AlarmManager.shared.stop(id: id)
    }
    NativeAlarmActions.record(alarmId: alarmId, nativeId: nativeId, action: "mission")
    return .result()
  }
}

/// "Snooze": runs in the background (no JavaScript, works on the lock screen
/// and with Terbit MY closed). Stops this ring and schedules ring number
/// `nextIndex` of the same morning as a one-time AlarmKit alarm. It never
/// opens the app or touches the morning's mission; the next ring offers
/// Snooze again only while snoozes remain (see `NativeSnooze`).
@available(iOS 26.0, *)
struct TerbitSnoozeIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Snooze Terbit MY alarm"
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
  static var supportedModes: IntentModes { .background }

  @Parameter(title: "Alarm ID")
  var alarmId: String
  @Parameter(title: "Native alarm ID")
  var nativeId: String
  @Parameter(title: "Snooze number")
  var nextIndex: Int
  @Parameter(title: "Original ring time")
  var originAt: Double

  init() {
    alarmId = ""
    nativeId = ""
    nextIndex = 1
    originAt = 0
  }

  init(alarmId: String, nativeId: String, nextIndex: Int, originAt: Double) {
    self.alarmId = alarmId
    self.nativeId = nativeId
    self.nextIndex = nextIndex
    self.originAt = originAt
  }

  func perform() async throws -> some IntentResult {
    if let id = UUID(uuidString: nativeId) {
      // Ends this ring only; a weekly alarm stays scheduled for its next day.
      try? AlarmManager.shared.stop(id: id)
    }
    await NativeSnooze.scheduleNext(alarmId: alarmId, nextIndex: nextIndex, originAt: originAt)
    return .result()
  }
}

/// Runs in the background when the alarm's Stop button is used. It only
/// records the stop: the system Stop control is never blocked or changed.
@available(iOS 26.0, *)
struct TerbitStopIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Record alarm stop"
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
  static var supportedModes: IntentModes { .background }

  @Parameter(title: "Alarm ID")
  var alarmId: String
  @Parameter(title: "Native alarm ID")
  var nativeId: String

  init() {
    alarmId = ""
    nativeId = ""
  }

  init(alarmId: String, nativeId: String) {
    self.alarmId = alarmId
    self.nativeId = nativeId
  }

  func perform() async throws -> some IntentResult {
    NativeAlarmActions.record(alarmId: alarmId, nativeId: nativeId, action: "stop")
    return .result()
  }
}
