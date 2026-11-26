# G07 — Live ops checklist (ASP, bank, MOHRE / WPS)

**Not a code gap.** S4 already has e-invoice UI + ASP bridge hooks. This list is how **you** close G07 on a real shop.

Run only when owner says **go live** and provides credentials.

---

## Before you start

- [ ] Shop Info: company name, TRN, address, emirate correct  
- [ ] Tax settings match FTA registration  
- [ ] Desktop build (recommended for ASP) or approved bridge on the device you will use  
- [ ] ASP provider URL + token in Tax / e-Invoice settings (no fake “success” toasts)  

---

## ASP / FTA e-invoice (UAE)

- [ ] Submit **one test** tax invoice in a **sandbox / pilot** environment if ASP offers it  
- [ ] Confirm ASP returns a **real** reference / UUID in the response (saved on the bill)  
- [ ] Submit **one live** invoice only after sandbox OK  
- [ ] VAT201 / return numbers still from Tax module — separate from ASP line details  

---

## Bank / payments (shop process)

- [ ] Bank accounts in Chart of Accounts match real accounts  
- [ ] Receipt / payment vouchers reconcile to bank statements (Bank Rec)  
- [ ] No “live verify” in code — reconciliation is **your** monthly job  

---

## MOHRE / WPS (payroll export)

- [ ] Employees: MOHRE person ID, IBAN, routing code filled where `payMethod = wps`  
- [ ] Attendance month complete before payroll export  
- [ ] Payroll → export **SIF / WPS file** and upload via bank portal  
- [ ] Compare bank debit to payroll total  

---

## Sign-off

When the above pass once on production data, mark **G07 ops: verified** in your own log (date, invoice no, ASP ref). Roadmap stays **ops on ask** — no automatic cloud proof in S4.

**Blocked?** Note ASP error text, HTTP status, and bill no — fix credentials or ASP mapping before retrying.