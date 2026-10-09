export function splitRack(rackLocation) {
  const parts = String(rackLocation || "").split("/").map((v) => v.trim());
  return { rack: parts[0] || "", floor: parts[1] || "", bin: parts[2] || "" };
}
