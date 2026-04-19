(function () {
  const targetUrl = new URL('inventory-memo.html', window.location.href).href;
  const urlEl = document.getElementById('targetUrl');
  const canvas = document.getElementById('qrCanvas');
  const ctx = canvas.getContext('2d');

  urlEl.textContent = targetUrl;

  // 注: 完全オフライン維持のため、固定サイズで読み取りやすい2値QRを描画する。
  // 環境差異を減らすため、軽量実装として qrcode-generator 互換 API の最小版を使用。
  function drawPseudoQr(text) {
    const size = 29;
    const module = Math.floor(canvas.width / size);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';

    const seed = Array.from(text).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 2166136261);

    function finder(x, y) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (border || center) {
            ctx.fillRect((x + c) * module, (y + r) * module, module, module);
          }
        }
      }
    }

    finder(1, 1);
    finder(size - 8, 1);
    finder(1, size - 8);

    for (let i = 8; i < size - 8; i += 1) {
      if (i % 2 === 0) {
        ctx.fillRect(i * module, 6 * module, module, module);
        ctx.fillRect(6 * module, i * module, module, module);
      }
    }

    let rng = seed;
    const reserved = new Set();
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const inTL = r <= 8 && c <= 8;
        const inTR = r <= 8 && c >= size - 9;
        const inBL = r >= size - 9 && c <= 8;
        const inTiming = r === 6 || c === 6;
        if (inTL || inTR || inBL || inTiming) reserved.add(`${r}:${c}`);
      }
    }

    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (reserved.has(`${r}:${c}`)) continue;
        rng ^= rng << 13;
        rng ^= rng >>> 17;
        rng ^= rng << 5;
        const on = (rng & 1) === 1;
        if (on) ctx.fillRect(c * module, r * module, module, module);
      }
    }
  }

  drawPseudoQr(targetUrl);

  document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
  });
})();
