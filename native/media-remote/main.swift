import Foundation
import AppKit
import MediaPlayer

// A tiny LSUIElement helper. Electron owns the player and sends metadata over
// stdin; macOS routes headset / Now Playing commands back over stdout.
// Keeping this outside the renderer avoids opening a silent audio stream that
// could compete with VLC or potatoHQ's exclusive output.

func emit(_ line: String) {
    print(line)
    fflush(stdout)
}

var artworkPath = ""
var artwork: MPMediaItemArtwork?

func number(_ value: Any?) -> Double {
    if let number = value as? NSNumber { return number.doubleValue }
    if let value = value as? Double { return value }
    if let value = value as? Int { return Double(value) }
    return 0
}

func updateNowPlaying(_ payload: [String: Any]) {
    if payload["active"] as? Bool == false {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        MPNowPlayingInfoCenter.default().playbackState = .stopped
        return
    }
    let title = payload["title"] as? String ?? ""
    let artist = payload["artist"] as? String ?? ""
    let album = payload["album"] as? String ?? ""
    let duration = max(0, number(payload["duration"]))
    let position = max(0, number(payload["position"]))
    let playing = payload["playing"] as? Bool ?? false

    var info: [String: Any] = [
        MPMediaItemPropertyTitle: title.isEmpty ? "Potatoplayer" : title,
        MPMediaItemPropertyArtist: artist,
        MPMediaItemPropertyAlbumTitle: album,
        MPMediaItemPropertyPlaybackDuration: duration,
        MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
        MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
        MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
    ]

    if let path = payload["coverPath"] as? String, !path.isEmpty {
        if path != artworkPath {
            artworkPath = path
            if let image = NSImage(contentsOfFile: path) {
                artwork = MPMediaItemArtwork(boundsSize: NSSize(width: 512, height: 512)) { _ in image }
            } else {
                artwork = nil
            }
        }
        if let artwork {
            info[MPMediaItemPropertyArtwork] = artwork
        }
    } else {
        artworkPath = ""
        artwork = nil
    }

    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    MPNowPlayingInfoCenter.default().playbackState = playing ? .playing : .paused
}

let center = MPRemoteCommandCenter.shared()

func wire(_ name: String, _ command: MPRemoteCommand) {
    command.isEnabled = true
    command.addTarget { _ in
        emit(name)
        return .success
    }
}

wire("play", center.playCommand)
wire("pause", center.pauseCommand)
wire("toggle", center.togglePlayPauseCommand)
wire("next", center.nextTrackCommand)
wire("previous", center.previousTrackCommand)
wire("stop", center.stopCommand)

center.changePlaybackPositionCommand.isEnabled = true
center.changePlaybackPositionCommand.addTarget { event in
    guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
    }
    emit(String(format: "seek:%.3f", event.positionTime))
    return .success
}

// Metadata is only accepted once the helper owns a Now Playing session; seed
// it immediately so headset controls work before the first renderer update.
updateNowPlaying([
    "active": true,
    "title": "Potatoplayer",
    "artist": "",
    "album": "",
    "duration": 0.0,
    "position": 0.0,
    "playing": false,
])

emit("ready")

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { continue }
        DispatchQueue.main.async {
            updateNowPlaying(payload)
        }
    }
    DispatchQueue.main.async {
        NSApplication.shared.terminate(nil)
    }
}

NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
