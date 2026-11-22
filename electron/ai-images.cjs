'use strict';

// Keep the whole turn below the provider's 48 MiB request limit after base64 encoding.
function clipboardBlocks(images) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 4) throw Error('每条消息最多附 4 张图片');
  let total = 0;
  return images.map(url => {
    if (typeof url !== 'string' || (total += url.length) > 34 * 1024 * 1024) throw Error('图片合计超过 24 MiB');
    const comma = url.indexOf(',');
    const header = url.slice(0, comma);
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64$/.test(header) || comma < 0) throw Error('不支持的剪贴板图片');
    const prefix = Buffer.from(url.slice(comma + 1, comma + 25), 'base64');
    const supported = header.includes('/png;') ? prefix.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      : header.includes('/jpeg;') ? prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255
      : header.includes('/webp;') ? prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP'
      : ['GIF87a', 'GIF89a'].includes(prefix.toString('ascii', 0, 6));
    if (!supported) throw Error('图片内容与格式不符');
    return { type:'image_url', image_url:{url, detail:'high'} };
  });
}
module.exports = { clipboardBlocks };
