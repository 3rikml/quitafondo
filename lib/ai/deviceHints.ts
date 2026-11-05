/** The slice of `navigator` we read; everything is optional (Chromium-only APIs). */
export interface DeviceHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/**
 * True on devices where a 110 MB model plus its working memory is a bad bet:
 * 4 GB of RAM or less, the browser's "data saver", or a 2G/3G connection.
 * Those get the lighter model (IS-Net, ~88 MB) and never the 219 MB BEN2.
 * Browsers without the hints (Safari, Firefox) are treated as capable.
 */
export function isConstrainedDevice(nav: DeviceHints | undefined): boolean {
  if (!nav) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) return true;
  const connection = nav.connection;
  if (connection?.saveData) return true;
  return connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g" || connection?.effectiveType === "3g";
}
