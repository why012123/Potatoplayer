#!/usr/bin/env python3
"""Validate a 24-bit DoP carrier WAV: marker alternation, payload entropy, rate."""
import sys, struct, collections

def read_wav(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE'
    pos, fmt, body = 12, None, None
    while pos + 8 <= len(data):
        cid = data[pos:pos+4]; size = struct.unpack('<I', data[pos+4:pos+8])[0]
        chunk = data[pos+8:pos+8+size]
        if cid == b'fmt ':
            tag, ch, rate, _, align, bits = struct.unpack('<HHIIHH', chunk[:16])
            fmt = dict(tag=tag, channels=ch, rate=rate, bits=bits, align=align)
        elif cid == b'data':
            body = chunk; break
        pos += 8 + size + (size & 1)
    return fmt, body

def main(path):
    fmt, body = read_wav(path)
    ch, bits = fmt['channels'], fmt['bits']
    assert bits == 24, f"expected 24-bit carrier, got {bits}"
    step = 3 * ch
    frames = len(body) // step
    markers = collections.Counter()
    errors = 0
    phase = None
    payload = bytearray()
    for i in range(frames):
        base = i * step
        for c in range(ch):
            s = body[base + 3*c: base + 3*c + 3]
            m = s[2]
            markers[m] += 1
            expected = 0x05 if (i % 2 == 0) else 0xFA
            if m != expected: errors += 1
            payload.append(s[1]); payload.append(s[0])  # earlier, later
    uniq = len(set(payload))
    print(f"file            : {path}")
    print(f"carrier rate    : {fmt['rate']} Hz, {ch} ch, {bits}-bit")
    print(f"carrier frames  : {frames} ({frames / fmt['rate']:.3f} s)")
    print(f"markers         : 0x05={markers[0x05]} 0xFA={markers[0xFA]} others={sum(v for k,v in markers.items() if k not in (5,250))}")
    print(f"marker errors   : {errors}")
    print(f"payload entropy : {uniq} distinct byte values")
    ok = errors == 0 and markers[0x05] > 0 and markers[0xFA] > 0 and uniq > 16
    print("RESULT          :", "PASS" if ok else "FAIL")
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
