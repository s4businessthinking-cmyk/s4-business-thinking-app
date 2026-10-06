// Saves a generated text file (CSV etc). Android WebView ignores <a download>, so the
// native app writes the file to cache and opens the share sheet instead.
// Resolves true when the file was handed to the user, false when they cancelled.
export async function saveTextFile(name, content, type = "text/csv;charset=utf-8") {
  if (typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: `exports/${name}`,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: name });
    } catch (error) {
      if (/cancel/i.test(String(error?.message || error))) return false;
      throw error;
    }
    return true;
  }

  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
