import test from "node:test";
import assert from "node:assert/strict";
import { entityGroupOf, entityGroupPrintLines, entitiesTextOf, injectEntityGroupHeader, parseEntitiesText } from "./entityGroup.js";

const esc = (s) => String(s).replace(/&/g, "&amp;");

test("entity group: empty shop has no header lines", () => {
  assert.equal(entityGroupOf({}), null);
  assert.deepEqual(entityGroupPrintLines({}), []);
});

test("entity group: group name + entities on print", () => {
  const shop = {
    companyName: "Al Noor Trading LLC",
    entityGroup: {
      name: "Al Noor Group",
      entities: [
        { name: "Al Noor Trading LLC", trn: "100000000000003", isThisShop: true },
        { name: "Gulf Parts FZCO", trn: "100000000000099" },
      ],
    },
  };
  const lines = entityGroupPrintLines(shop, false);
  assert.match(lines[0], /Group: Al Noor Group/);
  assert.match(lines[1], /this shop/);
  assert.match(lines[1], /Gulf Parts/);
  const html = injectEntityGroupHeader('<div class="shop-name">Shop</div>', shop, esc);
  assert.match(html, /entity-group/);
  assert.match(html, /Al Noor Group/);
});

test("entity group: parse textarea lines", () => {
  const ents = parseEntitiesText("Al Noor Trading LLC | 1003 *\nGulf Parts FZCO | 99", { companyName: "Al Noor Trading LLC" });
  assert.equal(ents.length, 2);
  assert.equal(ents[0].isThisShop, true);
  assert.equal(entitiesTextOf({ entities: ents }).split("\n").length, 2);
});