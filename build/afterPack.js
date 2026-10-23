// Puts the PDF Reader icon and version details on the Windows .exe (no Wine needed).
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== "win32") return;
  const ResEdit = await import("resedit");
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + ".exe");
  const exeObj = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exeObj);

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, "icon.ico")));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map(i => i.data));

  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [major, minor, patch] = ctx.packager.appInfo.version.split(".").map(Number);
  const langs = vi.getAllLanguagesForStringValues();
  const target = langs.length ? langs[0] : { lang: 1033, codepage: 1200 };
  vi.setStringValues(target, {
    FileDescription: "PDF Reader",
    ProductName: "PDF Reader",
    CompanyName: "Terblanche Inc.",
    LegalCopyright: "Terblanche Inc.",
    OriginalFilename: "PDF Reader.exe",
    InternalName: "PDF Reader",
    FileVersion: ctx.packager.appInfo.version,
    ProductVersion: ctx.packager.appInfo.version
  });
  vi.setFileVersion(major, minor, patch, 0, target.lang);
  vi.setProductVersion(major, minor, patch, 0, target.lang);
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exeObj);
  fs.writeFileSync(exe, Buffer.from(exeObj.generate()));
  console.log("  • icon and version info set on", path.basename(exe), "(group " + groupId + ")");
};
