import AppKit
import Foundation

guard CommandLine.arguments.count == 2,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let data = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: data) else {
    fputs("Cannot read iOS simulator screenshot.\n", stderr)
    exit(1)
}

var brandedPixels = 0

for y in stride(from: 0, to: bitmap.pixelsHigh, by: 8) {
    for x in stride(from: 0, to: bitmap.pixelsWide, by: 8) {
        guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else {
            continue
        }

        if color.greenComponent > 0.8,
           color.redComponent > 0.5,
           color.blueComponent < 0.6,
           color.greenComponent > color.blueComponent * 1.5 {
            brandedPixels += 1
        }
    }
}

print("Kito green pixels in screenshot: \(brandedPixels)")
exit(brandedPixels >= 12 ? 0 : 1)
