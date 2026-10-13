import AVFoundation
import ExpoModulesCore

/// Camera rep counting (Phase 4.5): camera permission and the live pose view.
/// Pose detection is Apple Vision, on the phone; see PoseCameraView.swift.
public class TerbitPoseModule: Module {
  static func permission() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "undetermined"
    @unknown default: return "undetermined"
    }
  }

  public func definition() -> ModuleDefinition {
    Name("TerbitPose")

    AsyncFunction("getCameraPermissionAsync") { () -> String in
      Self.permission()
    }

    // Only asks when iOS has never asked; afterwards iOS answers without a prompt.
    AsyncFunction("requestCameraPermissionAsync") { () async -> String in
      if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
        _ = await AVCaptureDevice.requestAccess(for: .video)
      }
      return Self.permission()
    }

    AsyncFunction("isCameraAvailableAsync") { () -> Bool in
      PoseCameraView.camera() != nil
    }

    View(PoseCameraView.self) {
      Events("onPose", "onCameraError")

      Prop("active") { (view: PoseCameraView, active: Bool) in
        view.setActive(active)
      }
    }
  }
}
