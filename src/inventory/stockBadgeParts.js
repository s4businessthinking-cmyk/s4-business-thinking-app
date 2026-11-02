export function stockBadgeParts(stock, extraQty = 0, reorderMin = 0) {
  const left = Number(stock) - (Number(extraQty) || 0);
  const color = left < 0 ? "#ef4444" : left <= (Number(reorderMin) || 0) ? "#f59e0b" : "#22c55e";
  return { left, color, over: extraQty > 0 && left < 0 };
}
