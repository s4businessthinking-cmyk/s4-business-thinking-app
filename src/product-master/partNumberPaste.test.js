import test from "node:test";
import assert from "node:assert/strict";
import { parsePartNumbers } from "./partNumberPaste.js";

const SAMPLE = `OE Numbers
DAF
1526297 1533870 1535381
RENAULT
50 01 868 493 5001868493 74 20 745 605 74 20 998 349 74 21 380 483
VOLVO
20745605 20998349 20998349 21041613 21041613
Cross-Reference Numbers
BALDWIN FILTERS
7421380483 BF1292-O BF1387-O
BOSCH
F 026 402 132
DELPHI DIESEL
HDF304
HIFI FILTER
H328WK SN 55090 SN 909230
KNECHT
70537611 KC 374D KC 429D
MAHLE
KC 429 D KC 633D
MANN-FILTER
PL 121 WK 11 001 X
MEYLE
16-34 323 0006
MS (Motor Service)
50014194
SAMPA
033.452 033.452-01
TRUCKTEC AUTOMOTIVE
03.14.028 03.38.016
Fit Vehicles
VOLVO FH 12 2005`;

test("splits a pasted catalogue into unique part numbers", () => {
  assert.deepEqual(parsePartNumbers(SAMPLE), [
    "1526297", "1533870", "1535381",
    "5001868493", "7420745605", "7420998349", "7421380483",
    "20745605", "20998349", "21041613",
    "BF1292-O", "BF1387-O",
    "F026402132",
    "HDF304",
    "H328WK", "SN55090", "SN909230",
    "70537611", "KC374D", "KC429D",
    "KC633D",
    "PL121", "WK11001X",
    "16-343230006",
    "50014194",
    "033.452", "033.452-01",
    "03.14.028", "03.38.016",
  ]);
});

test("a single code stays as typed", () => {
  assert.deepEqual(parsePartNumbers("LF3644"), ["LF3644"]);
  assert.deepEqual(parsePartNumbers("VOLVO\nBOSCH"), []);
});
