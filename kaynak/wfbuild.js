// Xiaomi Watch S1 Active (Gen2, 466x466) saat yuzu derleyici.
// Tarayicida ve Node'da ayni kod calisir.
(function (root) {
  'use strict';

  var SEC = { ELEM: 0, IMG: 2, IMGLIST: 3, WIDGET: 7 };
  var HEADER_SIZE = 0xA8;
  var VERSION = 0x0701;

  function u8(n) { return new Uint8Array(n); }
  function dv(a) { return new DataView(a.buffer, a.byteOffset, a.byteLength); }

  // --- Kodlayicilar -------------------------------------------------------
  function encImage(w, h, bgra) {
    var size = w * h * 4;
    if (bgra.length !== size) throw new Error('Gorsel boyutu uyusmuyor');
    var b = u8(12 + size), v = dv(b);
    v.setUint16(4, w, true); v.setUint16(6, h, true); v.setUint32(8, size, true);
    b.set(bgra, 12);
    return b;
  }

  function encImageList(w, h, frames) {
    var one = w * h * 4, n = frames.length, size = one * n;
    var b = u8(12 + size), v = dv(b);
    b[1] = n;
    v.setUint16(4, w, true); v.setUint16(6, h, true); v.setUint32(8, size, true);
    for (var i = 0; i < n; i++) {
      if (frames[i].length !== one) throw new Error('Kare boyutu uyusmuyor');
      b.set(frames[i], 12 + i * one);
    }
    return b;
  }

  function encElement(target, x, y) {
    var b = u8(16), v = dv(b);
    v.setUint32(0, target >>> 0, true); v.setUint16(4, x & 0xFFFF, true); v.setUint16(6, y & 0xFFFF, true);
    return b;
  }

  // Tek haneli rakam gostergesi (ornek: saat onlar basamagi)
  function encDigitWidget(src, target) {
    var b = u8(0x14), v = dv(b);
    b[0] = src[0]; b[1] = src[1]; b[2] = 1; b[3] = 0x15;
    v.setUint32(8, target >>> 0, true);
    return b;
  }

  // Cok haneli sayi (adim gibi). flags: 0x11 = sola hizali, bastaki sifirlar yok
  function encNumberWidget(src, target, digits, flags) {
    var b = u8(0x14), v = dv(b);
    b[0] = src[0]; b[1] = src[1]; b[2] = digits; b[3] = flags;
    v.setUint32(8, target >>> 0, true);
    return b;
  }

  // Degere gore kare secen gosterge (gun, haftanin gunu, pil...)
  function encListWidget(src, target, values) {
    var b = u8(0x10 + 4 * values.length), v = dv(b);
    b[0] = src[0]; b[1] = src[1]; b[2] = 0; b[3] = 0x20;
    v.setUint32(8, target >>> 0, true);
    v.setUint16(0x0C, 0x0200, true);
    for (var i = 0; i < values.length; i++) v.setUint32(0x10 + 4 * i, values[i] >>> 0, true);
    return b;
  }

  // Analog ibre: kind 0x08 akrep, 0x10 yelkovan, 0x18 saniye.
  // (px, py) gorsel icindeki donme noktasi; eleman konumu = merkez - donme noktasi.
  function encHandWidget(kind, target, px, py) {
    var b = u8(0x20), v = dv(b);
    b[0] = kind; b[1] = 0x11; b[2] = 0; b[3] = 0x30;
    v.setUint16(6, 1000, true);
    v.setUint32(8, target >>> 0, true);
    b[0x10] = 0; b[0x11] = kind === 0x08 ? 24 : 60;
    v.setUint16(0x14, px, true); v.setUint16(0x16, py, true);
    v.setUint16(0x18, 0, true); v.setUint16(0x1A, kind === 0x08 ? 7200 : 3600, true);
    return b;
  }

  // --- Paketleyici ----------------------------------------------------------
  // model = { id: '9 haneli', title, preview: Uint8Array(blob), slots: [
  //   { elements:[blob], images:[blob], imageLists:[blob], widgets:[blob] } ] }
  function build(model) {
    var slots = model.slots;
    var slotHdr = 8 + 10 * 8;
    var tablesStart = HEADER_SIZE + slots.length * slotHdr;

    // Tablo ve veri yerlesimi
    var tblPos = tablesStart;
    var secOrder = [['elements', SEC.ELEM], ['images', SEC.IMG], ['imageLists', SEC.IMGLIST], ['widgets', SEC.WIDGET]];
    var layout = slots.map(function (s) {
      var L = { tables: {} };
      for (var sec = 0; sec < 10; sec++) {
        var key = null;
        secOrder.forEach(function (p) { if (p[1] === sec) key = p[0]; });
        var cnt = key ? s[key].length : 0;
        L.tables[sec] = { pos: tblPos, count: cnt, key: key };
        tblPos += cnt * 16;
      }
      return L;
    });

    var dataPos = tblPos;
    var blobOrder = ['elements', 'widgets', 'images', 'imageLists'];
    slots.forEach(function (s, si) {
      layout[si].offsets = {};
      blobOrder.forEach(function (k) {
        layout[si].offsets[k] = s[k].map(function (blob) { var p = dataPos; dataPos += blob.length; return p; });
      });
    });
    var previewPos = dataPos;
    var total = previewPos + model.preview.length;

    var out = u8(total), v = dv(out);
    out.set([0x5A, 0xA5, 0x34, 0x12], 0);
    v.setUint32(0x10, VERSION, true);
    out[0x1C] = slots.length;
    v.setUint32(0x20, previewPos, true);
    var idStr = String(model.id);
    if (!/^\d{9}$/.test(idStr)) throw new Error('Kimlik 9 haneli olmali');
    for (var i = 0; i < 9; i++) out[0x28 + i] = idStr.charCodeAt(i);
    var t = new TextEncoder().encode(model.title || 'Saat');
    out.set(t.subarray(0, 0x3F), 0x68);

    var idBase = { elements: 0, images: 0x02000000, imageLists: 0x03000000, widgets: 0x07000000 };
    slots.forEach(function (s, si) {
      var h = HEADER_SIZE + si * slotHdr;
      v.setUint32(h, 0, true);
      v.setUint32(h + 4, si === 0 ? previewPos : 0xFFFFFFFF, true);
      for (var sec = 0; sec < 10; sec++) {
        var T = layout[si].tables[sec];
        v.setUint32(h + 8 + sec * 8, T.count, true);
        v.setUint32(h + 12 + sec * 8, T.pos, true);
        if (!T.key) continue;
        s[T.key].forEach(function (blob, k) {
          var e = T.pos + k * 16;
          v.setUint32(e, idBase[T.key] + k, true);
          v.setUint32(e + 8, layout[si].offsets[T.key][k], true);
          v.setUint32(e + 12, blob.length, true);
          out.set(blob, layout[si].offsets[T.key][k]);
        });
      }
    });
    out.set(model.preview, previewPos);
    return out;
  }

  // --- Ayristirici (test ve ice aktarma icin) -------------------------------
  function parse(bin) {
    var v = dv(bin);
    var n = bin[0x1C], off = HEADER_SIZE + 4 * bin[0x1D] + 4 * bin[0x18];
    var id = String.fromCharCode.apply(null, bin.subarray(0x28, 0x31));
    var tEnd = 0x68; while (tEnd < 0xA8 && bin[tEnd]) tEnd++;
    var model = { id: id, title: new TextDecoder().decode(bin.subarray(0x68, tEnd)), slots: [] };
    var pv = v.getUint32(0x20, true);
    model.preview = bin.slice(pv);
    var keys = { 0: 'elements', 2: 'images', 3: 'imageLists', 7: 'widgets' };
    for (var si = 0; si < n; si++) {
      off += 8;
      var s = { elements: [], images: [], imageLists: [], widgets: [] };
      for (var sec = 0; sec < 10; sec++) {
        var c = v.getUint32(off, true), p = v.getUint32(off + 4, true);
        if (c && !keys[sec]) throw new Error('Desteklenmeyen bolum ' + sec);
        for (var k = 0; k < c; k++) {
          var e = p + 16 * k, o = v.getUint32(e + 8, true), l = v.getUint32(e + 12, true);
          s[keys[sec]].push(bin.slice(o, o + l));
        }
        off += 8;
      }
      model.slots.push(s);
    }
    return model;
  }

  var api = {
    build: build, parse: parse,
    encImage: encImage, encImageList: encImageList, encElement: encElement,
    encDigitWidget: encDigitWidget, encNumberWidget: encNumberWidget, encListWidget: encListWidget, encHandWidget: encHandWidget,
    HAND: { HOUR: 0x08, MINUTE: 0x10, SECOND: 0x18 },
    SRC: {
      HOUR_TENS: [0x0A, 0x11], HOUR_ONES: [0x09, 0x11],
      MIN_TENS: [0x12, 0x11], MIN_ONES: [0x11, 0x11],
      DAY: [0x18, 0x12], WEEKDAY: [0x20, 0x12],
      BATTERY: [0x08, 0x41], STEPS: [0x08, 0x21], CHARGING: [0x10, 0x41], BLUETOOTH: [0x20, 0x41]
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WFBuild = api;
})(this);
