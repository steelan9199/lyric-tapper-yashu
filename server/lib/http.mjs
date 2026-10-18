/**
 * HTTP 小工具。只做「发 JSON / 读请求体」两件事，不认识业务。
 */

export function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function sendText(res, code, text) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/** 读完整请求体，超限直接抛错（别把 25 MB 音频塞进内存做别的用） */
export async function readBody(req, limitBytes) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limitBytes) throw new Error(`请求体超过 ${(limitBytes / 1048576).toFixed(0)} MB`);
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
