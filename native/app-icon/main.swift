import AppKit

// macOS 26 Tahoe renders legacy `.icns` app icons inside a grey "squircle
// jail". Assigning a Finder custom icon (the same mechanism as Finder →
// Get Info → paste icon) lets the app keep its own artwork; the marker is
// stored in the bundle's FinderInfo xattr and survives the DMG plus a Finder
// copy into /Applications. scripts/package-macos.py runs this before creating
// the installer, using the 1024 build/icon.png.
let arguments = CommandLine.arguments
guard arguments.count == 3, let image = NSImage(contentsOfFile: arguments[1]) else {
  FileHandle.standardError.write(Data("usage: app-icon <png> <app-bundle>\n".utf8))
  exit(64)
}
let applied = NSWorkspace.shared.setIcon(image, forFile: arguments[2], options: [])
exit(applied ? 0 : 1)
