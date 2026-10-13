import DeviceActivity
import Foundation

/// Called by iOS at the start and end of each night schedule (and each
/// one-time "end early" marker), whether or not Terbit MY is running. All the
/// rules are in NightShield.swift (the same file the app uses).
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    NightShield.intervalDidStart(activity.rawValue)
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    NightShield.intervalDidEnd(activity.rawValue)
  }
}
