import test from "node:test";
import assert from "node:assert/strict";
import { checkContra, checkJournal, voucherParticulars } from "./accountVoucherDomain.js";

test("journal must balance with one side per line", () => {
  const ok = checkJournal([
    { account: "Rent", debit: "1,000", credit: "" },
    { account: "Cash in Hand", debit: "", credit: "1000" },
    { account: "", debit: "", credit: "" },
  ]);
  assert.equal(ok.total, 1000);
  assert.equal(ok.rows.length, 2);
  assert.equal(checkJournal([{ account: "Rent", debit: 100 }, { account: "Cash", credit: 90 }]).error, "balance");
  assert.equal(checkJournal([{ account: "Rent", debit: 100, credit: 100 }, { account: "Cash", credit: 100 }]).error, "side");
  assert.equal(checkJournal([{ account: "", debit: 100 }, { account: "Cash", credit: 100 }]).error, "account");
  assert.equal(checkJournal([{ account: "Rent", debit: 100 }]).error, "lines");
});

test("contra moves money between two different accounts", () => {
  const ok = checkContra({ fromAccount: "Cash in Hand", toAccount: "Bank - ADCB", amount: "5000" });
  assert.equal(ok.total, 5000);
  assert.deepEqual(ok.rows.map((l) => [l.account, l.debit, l.credit]), [["Bank - ADCB", 5000, 0], ["Cash in Hand", 0, 5000]]);
  assert.equal(checkContra({ fromAccount: "Cash", toAccount: "cash", amount: 5 }).error, "same");
  assert.equal(checkContra({ fromAccount: "Cash", toAccount: "Bank", amount: 0 }).error, "amount");
  assert.equal(voucherParticulars({ voucherType: "contra", fromAccount: "Cash", toAccount: "Bank" }), "Cash → Bank");
  assert.equal(voucherParticulars({ voucherType: "journal", lines: ok.rows }), "Dr Bank - ADCB / Cr Cash in Hand");
});
