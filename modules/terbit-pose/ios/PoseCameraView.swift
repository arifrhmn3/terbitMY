import AVFoundation
import ExpoModulesCore
import QuartzCore
import Vision

/// The live camera with on-device body-pose detection (Apple Vision).
///
/// PRIVACY: frames go from the camera to Vision in memory and are dropped
/// straight after. There is no recording output (no movie or photo output),
/// nothing is written to disk and nothing is sent anywhere. Only joint
/// positions (a few numbers per frame) are passed to JavaScript.
///
/// The camera runs only while the `active` prop is true AND the view is on
/// screen; otherwise the session is stopped and the camera released.
final class PoseCameraView: ExpoView {
  let onPose = EventDispatcher()
  let onCameraError = EventDispatcher()

  private let session = AVCaptureSession()
  private let preview = AVCaptureVideoPreviewLayer()
  private let sessionQueue = DispatchQueue(label: "com.terbitmy.pose.session")
  private let analyzer = PoseAnalyzer()
  private var configured = false
  private var wantsActive = false

  /// The front camera (you can see yourself), or the back one if there's no front camera.
  static func camera() -> AVCaptureDevice? {
    AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
      ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    preview.session = session
    clipsToBounds = true
    preview.videoGravity = .resizeAspectFill
    layer.addSublayer(preview)
    analyzer.onJoints = { [weak self] payload in
      DispatchQueue.main.async { self?.onPose(payload) }
    }
    NotificationCenter.default.addObserver(
      self, selector: #selector(interrupted), name: AVCaptureSession.wasInterruptedNotification, object: session)
    NotificationCenter.default.addObserver(
      self, selector: #selector(runtimeError), name: AVCaptureSession.runtimeErrorNotification, object: session)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    let session = self.session
    sessionQueue.async {
      if session.isRunning { session.stopRunning() }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    update()
  }

  func setActive(_ active: Bool) {
    wantsActive = active
    update()
  }

  /// Starts the camera only while wanted and on screen; otherwise stops it.
  private func update() {
    let run = wantsActive && window != nil
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if run {
        guard self.configure() else { return }
        if !self.session.isRunning { self.session.startRunning() }
      } else if self.session.isRunning {
        self.session.stopRunning()
      }
    }
  }

  /// Camera in, frames to the analyser. Runs once, on the session queue.
  private func configure() -> Bool {
    if configured { return true }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      fail("permission")
      return false
    }
    guard let device = Self.camera(), let input = try? AVCaptureDeviceInput(device: device) else {
      fail("unavailable")
      return false
    }
    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(analyzer, queue: analyzer.queue)

    session.beginConfiguration()
    // Small frames are plenty for body pose and keep the phone cool.
    if session.canSetSessionPreset(.vga640x480) { session.sessionPreset = .vga640x480 }
    guard session.canAddInput(input), session.canAddOutput(output) else {
      session.commitConfiguration()
      fail("unavailable")
      return false
    }
    session.addInput(input)
    session.addOutput(output)
    if let connection = output.connection(with: .video) {
      // Upright (portrait) frames, so Vision sees people the right way up.
      if #available(iOS 17.0, *) {
        if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
      } else if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
    }
    session.commitConfiguration()
    configured = true
    return true
  }

  private func fail(_ code: String) {
    DispatchQueue.main.async { [weak self] in
      self?.onCameraError(["code": code])
    }
  }

  @objc private func interrupted() { fail("interrupted") }
  @objc private func runtimeError() { fail("unavailable") }
}

/// Receives camera frames on its own queue and runs Vision on at most ~15 per
/// second. Each frame is only read in memory; nothing is kept.
final class PoseAnalyzer: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let queue = DispatchQueue(label: "com.terbitmy.pose.frames")
  var onJoints: (([String: Any]) -> Void)?

  private var lastAnalysed: CFTimeInterval = 0
  private let interval: CFTimeInterval = 1.0 / 15.0
  private let request = VNDetectHumanBodyPoseRequest()

  /// The joints the rep counters use (names match src/features/missions/fitness/pose/types.ts).
  private static let joints: [(VNHumanBodyPoseObservation.JointName, String)] = [
    (.leftShoulder, "leftShoulder"), (.rightShoulder, "rightShoulder"),
    (.leftElbow, "leftElbow"), (.rightElbow, "rightElbow"),
    (.leftWrist, "leftWrist"), (.rightWrist, "rightWrist"),
    (.leftHip, "leftHip"), (.rightHip, "rightHip"),
    (.leftKnee, "leftKnee"), (.rightKnee, "rightKnee"),
    (.leftAnkle, "leftAnkle"), (.rightAnkle, "rightAnkle"),
  ]

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let now = CACurrentMediaTime()
    guard now - lastAnalysed >= interval, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lastAnalysed = now

    let width = CVPixelBufferGetWidth(pixels)
    let height = CVPixelBufferGetHeight(pixels)
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
    var found: [String: [String: Double]] = [:]
    if (try? handler.perform([request])) != nil,
       let body = request.results?.max(by: { $0.confidence < $1.confidence }) {
      for (name, key) in Self.joints {
        if let point = try? body.recognizedPoint(name), point.confidence > 0 {
          // Vision's origin is bottom-left; JavaScript uses top-left.
          found[key] = ["x": Double(point.location.x), "y": Double(1 - point.location.y), "c": Double(point.confidence)]
        }
      }
    }
    onJoints?([
      "at": Date().timeIntervalSince1970 * 1000,
      "aspect": height > 0 ? Double(width) / Double(height) : 1,
      "joints": found,
    ])
  }
}
