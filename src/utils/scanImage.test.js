import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanContentBounds, isPdfScanData } from "./scanImage.js";

function canvas(w, h, fill = [255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}

function stamp(data, w, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
    }
  }
}

describe("scan content crop", () => {
  it("keeps a full-frame photo", () => {
    const data = canvas(40, 20, [40, 80, 120]);
    assert.deepEqual(scanContentBounds(data, 40, 20), { x: 0, y: 0, w: 40, h: 20 });
  });

  it("crops an ID/cheque off a white scanner page", () => {
    const data = canvas(80, 50);
    stamp(data, 80, 20, 15, 60, 40, [30, 60, 140]);
    const b = scanContentBounds(data, 80, 50);
    assert.ok(b.x >= 10 && b.x <= 20, `x ${b.x}`);
    assert.ok(b.y >= 5 && b.y <= 15, `y ${b.y}`);
    assert.ok(b.x + b.w >= 60 && b.x + b.w <= 70, `right ${b.x + b.w}`);
    assert.ok(b.y + b.h >= 40 && b.y + b.h <= 50, `bottom ${b.y + b.h}`);
    assert.ok(b.w < 80 && b.h < 50);
  });
});

describe("pdf scan data", () => {
  it("treats a PDF data URL like a scan, not a leftover raw file", () => {
    assert.equal(isPdfScanData("data:application/pdf;base64,JVBERi0x"), true);
    assert.equal(isPdfScanData("data:image/jpeg;base64,/9j/4AAQ"), false);
    assert.equal(isPdfScanData(""), false);
  });
});
