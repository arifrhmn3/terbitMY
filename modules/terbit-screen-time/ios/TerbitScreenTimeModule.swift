import DeviceActivity
import ExpoModulesCore
import FamilyControls
import Foundation
import ManagedSettings
import SwiftUI

struct TimeOfWeekRecord: Record {
  /// Apple numbering: 1 = Sunday … 7 = Saturday.
  @Field var weekday: Int = 1
  @Field var hour: Int = 0
  @Field var minute: Int = 0
}

struct NightScheduleRecord: Record {
  @Field var id: String = ""
  @Field var start: TimeOfWeekRecord = TimeOfWeekRecord()
  @Field var end: TimeOfWeekRecord = TimeOfWeekRecord()
}

struct EarlyEndRecord: Record {
  @Field var id: String = ""
  @Field var year: Int = 0
  @Field var month: Int = 0
  @Field var day: Int = 0
  @Field var hour: Int = 0
  @Field var minute: Int = 0
}

struct NightPlanRecord: Record {
  @Field var selection: String? = nil
  @Field var nights: [NightScheduleRecord] = []
  @Field var earlyEnds: [EarlyEndRecord] = []
  @Field var shieldNow: Bool = false
  @Field var signature: String = ""
}

/// Night restrictions with Apple's Screen Time frameworks (individual
/// authorization, iOS 16+). The schedule itself runs in the Device Activity
/// Monitor extension, so restrictions start and end with Terbit MY closed.
public class TerbitScreenTimeModule: Module {
  /// Set in Info.plist by app.config.js only for builds that include the
  /// Family Controls capability (after Apple's approval). Without it every
  /// call reports "not_configured" instead of failing.
  static var configured: Bool {
    Bundle.main.object(forInfoDictionaryKey: "TerbitScreenTimeEnabled") as? Bool == true
  }

  static func status() -> String {
    guard configured else { return "not_configured" }
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved: return "approved"
    case .denied: return "denied"
    case .notDetermined: return "not_determined"
    @unknown default: return "not_determined"
    }
  }

  public func definition() -> ModuleDefinition {
    Name("TerbitScreenTime")

    AsyncFunction("getAuthorizationStatusAsync") { () -> String in
      Self.status()
    }

    AsyncFunction("requestAuthorizationAsync") { () async -> [String: Any] in
      guard Self.configured else { return ["status": "not_configured"] }
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        return ["status": Self.status()]
      } catch {
        let code = (error as? FamilyControlsError).map { String(describing: $0) } ?? error.localizedDescription
        return ["status": Self.status(), "error": code]
      }
    }

    AsyncFunction("pickAppsAsync") { (current: String?, promise: Promise) in
      guard Self.configured, AuthorizationCenter.shared.authorizationStatus == .approved else {
        promise.reject("ERR_NOT_AUTHORIZED", "Screen Time access isn't allowed for Terbit MY yet.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_SCREEN", "Couldn't show the app picker.")
        return
      }
      var initial = FamilyActivitySelection()
      if let current, let data = Data(base64Encoded: current),
         let decoded = try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data) {
        initial = decoded
      }
      var host: UIHostingController<AppPickerView>?
      let picker = AppPickerView(selection: initial) { result in
        host?.dismiss(animated: true)
        guard let result else {
          promise.resolve(nil as Any?)
          return
        }
        do {
          let data = try PropertyListEncoder().encode(result)
          promise.resolve([
            "token": data.base64EncodedString(),
            "applications": result.applicationTokens.count,
            "categories": result.categoryTokens.count,
            "webDomains": result.webDomainTokens.count,
          ])
        } catch {
          promise.reject("ERR_SELECTION", error.localizedDescription)
        }
      }
      let controller = UIHostingController(rootView: picker)
      // Only Cancel or Done close it, so the promise always settles.
      controller.isModalInPresentation = true
      host = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("applyPlanAsync") { (plan: NightPlanRecord) -> [String: Any] in
      guard Self.configured else { return ["scheduled": 0, "restarted": false, "errors": ["not_configured"]] }
      NightShield.saveSelection(plan.selection.flatMap { Data(base64Encoded: $0) })

      let center = DeviceActivityCenter()
      var errors: [String] = []
      var restarted = false
      // Restart the schedules only when they changed.
      if NightShield.signature != plan.signature {
        center.stopMonitoring(center.activities.filter { $0.rawValue.hasPrefix(NightShield.nightPrefix) })
        for night in plan.nights {
          let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: night.start.hour, minute: night.start.minute, weekday: night.start.weekday),
            intervalEnd: DateComponents(hour: night.end.hour, minute: night.end.minute, weekday: night.end.weekday),
            repeats: true
          )
          do {
            try center.startMonitoring(DeviceActivityName(night.id), during: schedule)
          } catch {
            errors.append("\(night.id): \(error.localizedDescription)")
          }
        }
        let calendar = Calendar.current
        for marker in plan.earlyEnds {
          let start = DateComponents(year: marker.year, month: marker.month, day: marker.day, hour: marker.hour, minute: marker.minute)
          guard let startDate = calendar.date(from: start),
                let endDate = calendar.date(byAdding: .minute, value: 15, to: startDate) else { continue }
          let end = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: endDate)
          do {
            try center.startMonitoring(DeviceActivityName(marker.id), during: DeviceActivitySchedule(intervalStart: start, intervalEnd: end, repeats: false))
          } catch {
            errors.append("\(marker.id): \(error.localizedDescription)")
          }
        }
        NightShield.signature = errors.isEmpty ? plan.signature : nil
        restarted = true
      }

      // Inside tonight's period now (e.g. the routine was just set up at 23:30): match it straight away.
      if plan.shieldNow {
        if !NightShield.isOverridden() { NightShield.applyShield() }
      } else {
        NightShield.clearShield()
      }
      return ["scheduled": plan.nights.count + plan.earlyEnds.count, "restarted": restarted, "errors": errors]
    }

    AsyncFunction("clearAsync") { () in
      let center = DeviceActivityCenter()
      center.stopMonitoring(center.activities.filter { $0.rawValue.hasPrefix(NightShield.nightPrefix) })
      NightShield.clearShield()
      NightShield.saveSelection(nil)
      NightShield.signature = nil
      NightShield.overriddenUntil = nil
    }

    AsyncFunction("endTonightAsync") { (untilMs: Double) in
      NightShield.overriddenUntil = untilMs
      NightShield.clearShield()
    }

    AsyncFunction("getStateAsync") { () -> [String: Any] in
      let monitoring = DeviceActivityCenter().activities
        .map { $0.rawValue }
        .filter { $0.hasPrefix(NightShield.nightPrefix) }
      var state: [String: Any] = ["shieldActive": NightShield.shieldActive, "monitoring": monitoring]
      if let until = NightShield.overriddenUntil, until > NightShield.nowMs() { state["overriddenUntil"] = until }
      return state
    }
  }
}
