import { billLeaveGuard } from "../shared/appShared.jsx";
import { useCallback, useEffect, useMemo } from "react";

export function useGlobalSearch({ can, globalFocusProductId, isDesktop, isOwner, perms, products, setGlobalFocusCustomerId, setGlobalFocusProductId, setGlobalFocusVendorId, setGlobalOpenPurchaseInvoiceId, setGlobalOpenSalesInvoiceId, setTabState, startProductEdit, tab, tabRef }) {
  const globalSearchCan = useMemo(() => ({
    products: isOwner || can("viewProducts") || can("manageSales") || can("managePurchase"),
    customers: isOwner,
    vendors: isOwner || can("viewVendors") || can("manageVendors") || can("managePurchase"),
    sales: isOwner || can("manageSales"),
    purchase: isOwner || can("managePurchase"),
  }), [isOwner, perms.viewProducts, perms.viewVendors, perms.manageVendors, perms.manageSales, perms.managePurchase]);
  const globalSearchCanAny = useMemo(
    () => Object.values(globalSearchCan).some(Boolean),
    [globalSearchCan],
  );

  const handleGlobalSearchNavigate = useCallback((hit) => {
    const goTab = (next) => {
      if (tabRef.current !== next && billLeaveGuard.current && !billLeaveGuard.current.leave()) return false;
      setTabState(next);
      return true;
    };
    if (hit.kind === "product") {
      const canFindProduct = isOwner || can("viewProducts") || can("manageSales") || can("managePurchase");
      if (!canFindProduct) return;
      if (!products.some((x) => x.id === hit.id)) return;
      if (isOwner || can("viewProducts")) {
        if (!goTab("products")) return;
        // Tab-change effect clears pm form; open product after switch (like customer/vendor focus).
        if (tabRef.current === "products") startProductEdit(products.find((x) => x.id === hit.id));
        else setGlobalFocusProductId(hit.id);
      } else if (can("manageSales")) {
        if (!goTab("sales")) return;
      } else if (can("managePurchase")) {
        if (!goTab("purchase")) return;
      }
      return;
    }
    if (hit.kind === "customer") {
      if (!isOwner) return;
      if (!goTab("customers")) return;
      setGlobalFocusCustomerId(hit.id);
      return;
    }
    if (hit.kind === "vendor") {
      if (!(isOwner || can("viewVendors") || can("manageVendors"))) return;
      if (!goTab("vendors")) return;
      setGlobalFocusVendorId(hit.id);
      return;
    }
    if (hit.kind === "salesInvoice") {
      if (!(isOwner || can("manageSales"))) return;
      if (!goTab("sales")) return;
      setGlobalOpenSalesInvoiceId(hit.id);
      return;
    }
    if (hit.kind === "purchaseInvoice") {
      if (!(isOwner || can("managePurchase"))) return;
      if (!goTab("purchase")) return;
      setGlobalOpenPurchaseInvoiceId(hit.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, isOwner, perms.viewProducts, perms.viewVendors, perms.manageVendors, perms.manageSales, perms.managePurchase]);

  useEffect(() => {
    if (!globalFocusProductId || tab !== "products") return;
    const p = products.find((x) => x.id === globalFocusProductId);
    setGlobalFocusProductId(null);
    if (p) startProductEdit(p);
  }, [globalFocusProductId, tab, products]);

  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (String(event.key).toLowerCase() !== "k") return;
      if (document.querySelector("[data-si-modal-open]")) return;
      event.preventDefault();
      if (isDesktop && tabRef.current !== "dashboard") setTabState("dashboard");
      window.dispatchEvent(new CustomEvent("s4-focus-global-search"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop]);
  return { globalSearchCan, globalSearchCanAny, handleGlobalSearchNavigate };
}
