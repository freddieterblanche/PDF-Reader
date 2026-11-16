/* Opening .eml and .msg emails: read the message, lay it out as a printable page, and name the PDF from its details */
const fs = require("fs");
const path = require("path");

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const person = (name, address) => {
  name = String(name || "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  address = String(address || "").replace(/^<|>$/g, "").trim();
  if (/^\/o=/i.test(address) || !/@/.test(address)) address = /@/.test(address) ? address : "";
  if (name && address && name.toLowerCase() === address.toLowerCase()) name = "";
  return { name, address };
};
const label = p => p.name ? p.name + (p.address ? " <" + p.address + ">" : "") : p.address;
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " bytes";

async function readEml(buf) {
  const { simpleParser } = require("mailparser");
  const m = await simpleParser(buf, { skipImageLinks: true });
  const list = a => (a ? (Array.isArray(a) ? a : [a]) : []).flatMap(x => x.value || []).flatMap(v => v.group ? v.group : [v]).map(v => person(v.name, v.address));
  return {
    from: list(m.from)[0] || person("", ""),
    to: list(m.to), cc: list(m.cc),
    date: m.date instanceof Date && !isNaN(m.date) ? m.date : null,
    subject: m.subject || "",
    html: typeof m.html === "string" && m.html ? m.html : "",
    text: m.text || "",
    attachments: (m.attachments || []).map(a => ({ name: a.filename || "", type: a.contentType || "", size: a.size || (a.content ? a.content.length : 0), cid: a.cid || "", data: a.content, inline: a.contentDisposition === "inline" && !!a.cid }))
  };
}

function rtfToHtml(rtfBytes) {
  try {
    const { decompressRTF } = require("@kenjiuno/decompressrtf");
    const { deEncapsulateSync } = require("rtf-stream-parser");
    const iconv = require("iconv-lite");
    const rtf = Buffer.from(decompressRTF(Array.from(rtfBytes))).toString("latin1");
    const r = deEncapsulateSync(rtf, { decode: iconv.decode, mode: "either" });
    return { html: r.mode === "html" ? String(r.text) : "", text: r.mode === "text" ? String(r.text) : "" };
  } catch (e) { return { html: "", text: "" }; }
}

function readMsg(buf) {
  const MsgReader = require("@kenjiuno/msgreader").default;
  const r = new MsgReader(buf);
  const m = r.getFileData();
  if (!m || m.error) throw new Error("This is not an Outlook message file that can be read.");
  const rec = (m.recipients || []).map(x => ({ who: person(x.name, x.smtpAddress || x.email), kind: String(x.recipType || "to").toLowerCase() }));
  let html = "", text = m.body || "";
  if (m.html && m.html.length) html = Buffer.from(m.html).toString("utf8");
  else if (m.bodyHtml) html = m.bodyHtml;
  else if (m.compressedRtf && m.compressedRtf.length) { const x = rtfToHtml(m.compressedRtf); html = x.html; if (!text) text = x.text; }
  const when = m.messageDeliveryTime || m.clientSubmitTime || m.creationTime || "";
  const d = when ? new Date(when) : null;
  const attachments = (m.attachments || []).map(a => {
    let data = null;
    try { const x = r.getAttachment(a); data = x && x.content ? Buffer.from(x.content) : null; } catch (e) {}
    const name = a.fileName || a.fileNameShort || a.name || (a.innerMsgContent ? (a.name || "Attached message") + ".msg" : "");
    return { name, type: a.attachMimeTag || "", size: data ? data.length : (a.contentLength || 0), cid: a.pidContentId || "", data, inline: !!a.pidContentId && !!a.attachmentHidden };
  });
  return {
    from: person(m.senderName, m.senderSmtpAddress || m.senderEmail || m.creatorSMTPAddress),
    to: rec.filter(x => x.kind === "to").map(x => x.who), cc: rec.filter(x => x.kind === "cc").map(x => x.who),
    date: d && !isNaN(d) ? d : null,
    subject: m.subject || m.normalizedSubject || "",
    html, text, attachments
  };
}

async function readEmail(file) {
  const buf = fs.readFileSync(file);
  return /\.msg$/i.test(file) ? readMsg(buf) : readEml(buf);
}

/* File name: yyyy mm dd hhmm - Email from [sender] to [first recipient] */
function pdfName(m, fallbackDate) {
  const d = m.date || fallbackDate || new Date();
  const p = n => String(n).padStart(2, "0");
  const stamp = d.getFullYear() + " " + p(d.getMonth() + 1) + " " + p(d.getDate()) + " " + p(d.getHours()) + p(d.getMinutes());
  const who = x => x ? (x.name || x.address || "") : "";
  const first = m.to[0] || m.cc[0];
  let n = stamp + " - Email from " + (who(m.from) || "unknown sender") + (first ? " to " + who(first) : "");
  n = n.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  if (n.length > 180) n = n.slice(0, 180).trim();
  return n + ".pdf";
}

function uniquePath(dir, name) {
  let p = path.join(dir, name), i = 2;
  const stem = name.replace(/\.pdf$/i, "");
  while (fs.existsSync(p)) p = path.join(dir, stem + " (" + (i++) + ").pdf");
  return p;
}

/* A plain, Outlook-like printout: header block, then the message as sent */
function pageHtml(m) {
  const dateText = m.date ? m.date.toLocaleString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  let body = m.html;
  const cids = {};
  m.attachments.forEach(a => { if (a.cid && a.data) cids[a.cid.replace(/^<|>$/g, "").toLowerCase()] = "data:" + (a.type || "image/png") + ";base64," + a.data.toString("base64"); });
  if (body) {
    body = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<meta[^>]+http-equiv[^>]*>/gi, "")
      .replace(/\bcid:([^"'\s)>]+)/gi, (all, id) => cids[decodeURIComponent(id).toLowerCase()] || all);
    const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    // Outlook's own page rules (Letter size, Word sections) would break the printout, so they are dropped
    const styles = (body.match(/<style[\s\S]*?<\/style>/gi) || []).join("\n")
      .replace(/@page[^{]*\{[^}]*\}/gi, "").replace(/(^|[;{\s])page\s*:\s*[^;}]+;?/gi, "$1");
    body = styles + (bodyMatch ? bodyMatch[1] : body);
    // pictures that would be fetched from the internet are left out (they are often trackers); embedded ones stay
    body = body.replace(/<img\b[^>]*>/gi, t => /\ssrc\s*=\s*["']?data:/i.test(t) ? t : "")
      .replace(/<link\b[^>]*>/gi, "").replace(/\sstyle\s*=\s*(["'])([^"']*?)\bpage\s*:[^;"']+;?/gi, " style=$1$2");
  } else {
    body = '<pre class="plain">' + esc(m.text) + "</pre>";
  }
  const shown = m.attachments.filter(a => !(a.inline && a.cid && body.includes("data:")) && a.name);
  const row = (k, v) => v ? '<tr><th>' + k + '</th><td>' + v + "</td></tr>" : "";
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:">'
    + "<style>@page{size:A4;margin:16mm 15mm}body{font:10.5pt Calibri,'Segoe UI',Arial,sans-serif;color:#111;margin:0}"
    + ".hdr{border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:14px}.hdr h1{font-size:15pt;margin:0 0 8px;font-weight:700}"
    + ".hdr table{border-collapse:collapse;font-size:10pt}.hdr th{text-align:left;vertical-align:top;padding:1px 12px 1px 0;color:#444;font-weight:700;white-space:nowrap}.hdr td{padding:1px 0}"
    + ".body{overflow-wrap:anywhere}.body img{max-width:100%;height:auto}.body table{max-width:100%}pre.plain{white-space:pre-wrap;font:10.5pt Calibri,'Segoe UI',Arial,sans-serif;margin:0}</style></head><body>"
    + '<div class="hdr"><h1>' + esc(m.subject || "(no subject)") + "</h1><table>"
    + row("From:", esc(label(m.from)))
    + row("Sent:", esc(dateText))
    + row("To:", esc(m.to.map(label).join("; ")))
    + row("Cc:", esc(m.cc.map(label).join("; ")))
    + row("Subject:", esc(m.subject))
    + row("Attachments:", esc(shown.map(a => a.name + " (" + fmtSize(a.size) + ")").join("; ")))
    + '</table></div><div class="body">' + body + "</div></body></html>";
}

module.exports = { readEmail, pdfName, uniquePath, pageHtml };
