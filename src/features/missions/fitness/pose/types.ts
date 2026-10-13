/**
 * Body-pose data as the rep counters see it: a few joints from one camera
 * frame, analysed on the phone. No image is ever part of this, only points.
 * Today the points come from Apple Vision (iOS); a later Android version can
 * send the same shape from another detector.
 */
export type JointName =
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle';

/** A joint in the upright image: x and y from 0 to 1 (top-left origin); `c` is the detector's confidence (0–1). */
export type PoseJoint = { x: number; y: number; c: number };

export type PoseFrame = {
  /** When the frame was analysed (ms since 1970). */
  at: number;
  /** Image width ÷ height, so angles can be measured in real proportions. */
  aspect: number;
  /** Joints the detector found (missing ones simply aren't there). */
  joints: Partial<Record<JointName, PoseJoint>>;
};
