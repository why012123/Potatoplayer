package com.potato.player.core;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 网易云 .ncm 文件解密（AES-ECB + RC4，纯 Java 实现，对应原 ncm 转换脚本）。
 *
 * <p>NCM 文件结构：8 字节魔数 "CTENFDAM" + 2 字节（0x01） + 4 字节密钥长度 +
 * 密钥（XOR 0x64 后 AES-ECB 解密） + 4 字节元数据长度 + 元数据（XOR 0x63 后 JSON） +
 * 5 字节 CRC + 5 字节图片大小 + 图片数据 + 音频数据（RC4 加密）。</p>
 */
public final class NcmDecryptor {

    private static final byte[] AES_KEY = "hzHRAmso5kInbaxw".getBytes(StandardCharsets.UTF_8);

    private NcmDecryptor() {
    }

    /** 解密结果：{@code audio} 为音频数据，{@code ext} 为建议扩展名（mp3/flac）。 */
    public record Result(byte[] audio, String ext) {
    }

    /** 解密 NCM 文件，返回音频字节与扩展名；失败抛出异常。 */
    public static Result decrypt(Path ncmPath) throws IOException {
        byte[] all = Files.readAllBytes(ncmPath);
        if (all.length < 10 || !new String(all, 0, 8, StandardCharsets.US_ASCII).equals("CTENFDAM")) {
            throw new IOException("不是有效的 NCM 文件（魔数不匹配）");
        }
        int off = 10;
        // 密钥长度（4 字节小端）
        int keyLen = leInt(all, off);
        off += 4;
        byte[] key = new byte[keyLen];
        System.arraycopy(all, off, key, 0, keyLen);
        off += keyLen;
        for (int i = 0; i < key.length; i++) {
            key[i] ^= 0x64;
        }
        byte[] decKey = aesEcbDecrypt(AES_KEY, key);

        // 元数据长度（4 字节小端）
        int metaLen = leInt(all, off);
        off += 4;
        byte[] meta = new byte[metaLen];
        System.arraycopy(all, off, meta, 0, metaLen);
        off += metaLen;
        for (int i = 0; i < meta.length; i++) {
            meta[i] ^= 0x63;
        }
        String ext = detectExt(meta);

        // 跳过 5 字节 CRC + 5 字节图片大小 + 图片数据
        off += 5;
        int imgSize = leInt(all, off);
        off += 5;
        off += imgSize;

        // 音频数据（RC4 解密）
        byte[] enc = new byte[all.length - off];
        System.arraycopy(all, off, enc, 0, enc.length);
        byte[] audio = rc4Decrypt(decKey, enc);

        // 去掉尾部可能的 MP3 封面字节（以 "APIC" 或空结尾为界），保守处理交给上层。
        return new Result(audio, ext);
    }

    private static String detectExt(byte[] meta) {
        String s = new String(meta, StandardCharsets.UTF_8);
        if (s.contains("\"flac\"")) {
            return "flac";
        }
        return "mp3";
    }

    private static int leInt(byte[] b, int off) {
        return (b[off] & 0xff) | ((b[off + 1] & 0xff) << 8) | ((b[off + 2] & 0xff) << 16) | ((b[off + 3] & 0xff) << 24);
    }

    private static byte[] aesEcbDecrypt(byte[] key, byte[] data) {
        try {
            Cipher cipher = Cipher.getInstance("AES/ECB/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"));
            return cipher.doFinal(data);
        } catch (Exception e) {
            throw new RuntimeException("AES 解密失败", e);
        }
    }

    private static byte[] rc4Decrypt(byte[] key, byte[] data) {
        int[] keyBox = new int[256];
        int keyLen = key.length;
        int[] keyInt = new int[keyLen];
        for (int i = 0; i < keyLen; i++) {
            keyInt[i] = key[i] & 0xff;
        }
        for (int i = 0; i < 256; i++) {
            keyBox[i] = i;
        }
        int c = 0;
        int lastByte = 0;
        int keyOffset = 0;
        for (int i = 0; i < 256; i++) {
            int swap = keyBox[i];
            c = (swap + lastByte + keyInt[keyOffset]) & 0xff;
            keyBox[i] = keyBox[c];
            keyBox[c] = swap;
            lastByte = c;
            keyOffset = (keyOffset + 1) % keyLen;
        }
        byte[] out = new byte[data.length];
        for (int i = 1; i <= data.length; i++) {
            int j = i & 0xff;
            out[i - 1] = (byte) (data[i - 1] ^ keyBox[(keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff]);
        }
        return out;
    }

    /** 便捷：解密到文件，返回输出路径。 */
    public static Path decryptTo(Path ncmPath, Path outDir) throws IOException {
        Result r = decrypt(ncmPath);
        Files.createDirectories(outDir);
        String base = ncmPath.getFileName().toString();
        int dot = base.lastIndexOf('.');
        if (dot > 0) {
            base = base.substring(0, dot);
        }
        Path out = outDir.resolve(base + "." + r.ext());
        Files.write(out, r.audio());
        return out;
    }
}
