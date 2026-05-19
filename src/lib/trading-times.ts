// Pre-computed A-share trading day time slots (constant, never changes)
// Morning: 09:30-11:30 (121 min), Afternoon: 13:00-15:00 (121 min) = 242 total
export const ALL_TRADE_TIMES: string[] = (() => {
  const times: string[] = [];
  for (let h = 9; h <= 11; h++) {
    const startM = h === 9 ? 30 : 0;
    const endM = h === 11 ? 30 : 59;
    for (let m = startM; m <= endM; m++) {
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  for (let h = 13; h <= 15; h++) {
    const endM = h === 15 ? 0 : 59;
    for (let m = 0; m <= endM; m++) {
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return times;
})();
