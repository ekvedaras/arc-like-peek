// Decodes every frame of a QuickTime/MP4 screen recording (H.264, HEVC, ProRes: whatever macOS can play)
// with AVFoundation, which ships with macOS, so no ffmpeg is needed. Screen recordings have a variable frame
// rate, so each PNG is named by its presentation time and the times are listed in frames.json.
//
// Usage: swift scripts/decode-video-frames.swift <video> <output dir> <width px>

import AVFoundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let arguments = CommandLine.arguments
guard arguments.count == 4, let width = Double(arguments[3]) else {
  FileHandle.standardError.write("Usage: decode-video-frames.swift <video> <output dir> <width px>\n".data(using: .utf8)!)
  exit(1)
}
let videoURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2], isDirectory: true)

let asset = AVURLAsset(url: videoURL)
let semaphore = DispatchSemaphore(value: 0)
var videoTrack: AVAssetTrack?
Task {
  videoTrack = try? await asset.loadTracks(withMediaType: .video).first
  semaphore.signal()
}
semaphore.wait()
guard let track = videoTrack else {
  FileHandle.standardError.write("No video track in \(videoURL.path)\n".data(using: .utf8)!)
  exit(1)
}

let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(
  track: track,
  outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
)
reader.add(output)
reader.startReading()

let context = CIContext()
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
var frames: [[String: Any]] = []
var firstTime: Double?

while let sample = output.copyNextSampleBuffer() {
  guard let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
  let time = CMSampleBufferGetPresentationTimeStamp(sample).seconds
  let start = firstTime ?? time
  firstTime = start
  let ms = Int(((time - start) * 1000).rounded())

  var image = CIImage(cvPixelBuffer: pixels)
  let sourceWidth = image.extent.width
  let scale = width / sourceWidth
  if scale != 1 { image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) }
  guard let cgImage = context.createCGImage(image, from: image.extent, format: .RGBA8, colorSpace: colorSpace)
  else { continue }

  let name = String(format: "frame-%05dms.png", ms)
  let destination = CGImageDestinationCreateWithURL(
    outputURL.appendingPathComponent(name) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, cgImage, nil)
  CGImageDestinationFinalize(destination)
  frames.append(["file": name, "ms": ms, "sourceWidth": Int(sourceWidth), "scale": scale])
}

guard reader.status == .completed else {
  FileHandle.standardError.write("Decoding failed: \(reader.error?.localizedDescription ?? "unknown")\n".data(using: .utf8)!)
  exit(1)
}
let json = try JSONSerialization.data(withJSONObject: frames, options: [.prettyPrinted])
try json.write(to: outputURL.appendingPathComponent("frames.json"))
