import FamilyControls
import Foundation
import ManagedSettings

/// Night restrictions, shared by the app (TerbitScreenTime module) and the
/// Device Activity Monitor extension (`targets/activity-monitor`). The two
/// copies of this file must stay identical (a unit test checks).
///
/// Everything here runs on the phone. The selection is Apple's opaque
/// FamilyActivitySelection: Terbit MY can't see which apps it contains.
enum NightShield {
  /// Shared storage between the app and the extension.
  static let appGroup = "group.com.terbitmy.app"
  static let storeName = ManagedSettingsStore.Name("terbit.night")
  /// Nightly schedules: `terbit.night.<weekday>`.
  static let nightPrefix = "terbit.night."
  /// One-time "end early" markers: `terbit.night.end.<date>`.
  static let endPrefix = "terbit.night.end."

  private static let selectionKey = "night.selection"
  private static let overrideKey = "night.overriddenUntil"
  private static let signatureKey = "night.signature"
  private static let shieldKey = "night.shieldActive"

  static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

  static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

  // MARK: Selection

  static func saveSelection(_ data: Data?) {
    if let data { defaults.set(data, forKey: selectionKey) } else { defaults.removeObject(forKey: selectionKey) }
  }

  static func loadSelection() -> FamilyActivitySelection? {
    guard let data = defaults.data(forKey: selectionKey) else { return nil }
    return try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  // MARK: State

  static var overriddenUntil: Double? {
    get { defaults.object(forKey: overrideKey) as? Double }
    set { if let newValue { defaults.set(newValue, forKey: overrideKey) } else { defaults.removeObject(forKey: overrideKey) } }
  }

  static var signature: String? {
    get { defaults.string(forKey: signatureKey) }
    set { defaults.set(newValue, forKey: signatureKey) }
  }

  static var shieldActive: Bool {
    get { defaults.bool(forKey: shieldKey) }
    set { defaults.set(newValue, forKey: shieldKey) }
  }

  static func isOverridden() -> Bool { (overriddenUntil ?? 0) > nowMs() }

  // MARK: Shields

  /// Shields the chosen apps, categories and websites.
  static func applyShield() {
    guard let selection = loadSelection() else {
      clearShield()
      return
    }
    let store = ManagedSettingsStore(named: storeName)
    store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
    store.shield.webDomainCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    shieldActive = true
  }

  static func clearShield() {
    ManagedSettingsStore(named: storeName).clearAllSettings()
    shieldActive = false
  }

  // MARK: Schedule events (called by the extension, with Terbit MY closed)

  static func intervalDidStart(_ name: String) {
    if name.hasPrefix(endPrefix) {
      // A one-off Main Wake-Up earlier than usual: tonight ends now.
      clearShield()
      return
    }
    guard name.hasPrefix(nightPrefix) else { return }
    // Ended early tonight by the user: stay off until the morning.
    if isOverridden() { return }
    applyShield()
  }

  static func intervalDidEnd(_ name: String) {
    guard name.hasPrefix(nightPrefix), !name.hasPrefix(endPrefix) else { return }
    clearShield()
    overriddenUntil = nil
  }
}
