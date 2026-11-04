import { parseFieldOptions, splitIntoPages, type FormFieldType } from "@/lib/form-fields";
import { MAX_DATA_URL_ATTACHMENT_BYTES, MAX_DATA_URL_FILES_PER_FIELD } from "@/lib/uploads";

export interface StandaloneFormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  options: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  pattern: string | null;
  currencySymbol: string | null;
  conditionFieldId: string | null;
  conditionOperator: string | null;
  conditionValue: string | null;
}

export interface StandaloneFormData {
  title: string;
  description: string | null;
  slug: string;
  fields: StandaloneFormField[];
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Matches ALLOWED_DATA_URL_MIME_TYPES in src/lib/uploads.ts — the `accept`
// attribute is just a UI hint (the real gate is server-side), but it should
// still steer the picker toward what will actually be accepted.
const ACCEPT_EXTENSIONS = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

/**
 * A fully self-contained HTML document for a form — real `<input>`/`<select>`/
 * etc. fields with their own inline CSS/JS, not an iframe pointing back at
 * `/f/[slug]`. Built for hosting on a third-party site that isn't on the
 * `frame-ancestors` allowlist the live `/f/[slug]` page enforces (see
 * next.config.ts) and so can't embed that page in an iframe at all.
 *
 * Submits straight to `${origin}/api/forms/by-slug/${slug}/submit` via a
 * cross-origin `fetch()` POST — that route has its own CORS headers (see
 * next.config.ts's `/api/forms/by-slug/:path*` rule) specifically to allow
 * this. Pagination (PAGE_BREAK) is pre-split server-side via splitIntoPages
 * so the shipped JS never needs to re-derive it; conditional visibility
 * (isFieldVisible) and per-field validation (validateFieldValue) ARE
 * reimplemented inline in vanilla JS below, mirroring src/lib/form-fields.ts
 * exactly, since those depend on live visitor input the generator can't
 * precompute.
 */
export function generateStandaloneFormHtml(form: StandaloneFormData, origin: string): string {
  const submitUrl = `${origin}/api/forms/by-slug/${form.slug}/submit`;
  const thankYouUrl = `${origin}/f/${form.slug}/thank-you`;

  const pages = splitIntoPages(form.fields).map((page) =>
    page.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      placeholder: f.placeholder,
      helpText: f.helpText,
      required: f.required,
      options: f.type === "DROPDOWN" || f.type === "RADIO" || f.type === "CHECKBOX" ? parseFieldOptions(f.options) : [],
      minLength: f.minLength,
      maxLength: f.maxLength,
      minValue: f.minValue,
      maxValue: f.maxValue,
      pattern: f.pattern,
      currencySymbol: f.currencySymbol,
      conditionFieldId: f.conditionFieldId,
      conditionOperator: f.conditionOperator,
      conditionValue: f.conditionValue,
    }))
  );

  // Guards against a title/label containing "</script>" breaking out of the
  // embedded JSON blob early.
  const dataJson = JSON.stringify({
    submitUrl,
    thankYouUrl,
    maxFileBytes: MAX_DATA_URL_ATTACHMENT_BYTES,
    maxFilesPerField: MAX_DATA_URL_FILES_PER_FIELD,
    pages,
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(form.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
  .card { background: #fff; border: 1px solid #e2e2e2; border-radius: 10px; padding: 28px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .desc { color: #666; font-size: 0.9rem; margin: 0 0 20px; }
  .field { margin-bottom: 18px; }
  .field h2 { font-size: 1.05rem; margin: 24px 0 10px; border-top: 1px solid #eee; padding-top: 18px; }
  .field:first-child h2 { border-top: 0; padding-top: 0; margin-top: 0; }
  label.q { display: block; font-weight: 600; font-size: 0.92rem; margin-bottom: 4px; }
  .req { color: #d33; margin-left: 2px; }
  .help { color: #777; font-size: 0.8rem; margin: 2px 0 6px; }
  input[type=text], input[type=email], input[type=tel], input[type=url], input[type=password], input[type=number], input[type=date], textarea, select {
    width: 100%; padding: 9px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.95rem; font-family: inherit; background: #fff;
  }
  textarea { min-height: 90px; resize: vertical; }
  .choice-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.92rem; }
  .currency-row { display: flex; align-items: center; gap: 6px; }
  .currency-row span { color: #666; }
  .err { color: #d33; font-size: 0.8rem; margin-top: 4px; min-height: 1em; }
  .actions { display: flex; justify-content: space-between; margin-top: 24px; }
  button { appearance: none; border: 0; border-radius: 6px; padding: 10px 18px; font-size: 0.92rem; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #dc2626; color: #fff; margin-left: auto; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-ghost { background: transparent; color: #444; border: 1px solid #ccc; }
  .top-err { background: #fde8e8; border: 1px solid #f5b5b5; color: #a30000; border-radius: 6px; padding: 10px 12px; font-size: 0.88rem; margin-bottom: 16px; display: none; }
  .file-note { color: #888; font-size: 0.78rem; margin-top: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${escHtml(form.title)}</h1>
    ${form.description ? `<p class="desc">${escHtml(form.description)}</p>` : ""}
    <div class="top-err" id="top-err"></div>
    <form id="f" novalidate></form>
  </div>
</div>
<script id="form-data" type="application/json">${dataJson}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById("form-data").textContent);
  var formEl = document.getElementById("f");
  var topErr = document.getElementById("top-err");
  var pageIndex = 0;
  var values = {};        // fieldId -> string (CHECKBOX: "|"-joined; file: "1"/"")
  var files = {};         // fieldId -> [{fileName, dataUrl}]
  var inputEls = {};      // fieldId -> primary <input>/<textarea>/<select>, or null for radio/checkbox groups
  var lastVisibleKey = "";

  function isVisible(field) {
    if (!field.conditionFieldId || !field.conditionOperator) return true;
    var raw = (values[field.conditionFieldId] || "").trim();
    var target = (field.conditionValue || "").trim().toLowerCase();
    if (field.conditionOperator === "is_filled") return raw.length > 0;
    if (field.conditionOperator === "is_empty") return raw.length === 0;
    if (field.conditionOperator === "equals") return raw.split("|").some(function (v) { return v.trim().toLowerCase() === target; });
    if (field.conditionOperator === "not_equals") return !raw.split("|").some(function (v) { return v.trim().toLowerCase() === target; });
    if (field.conditionOperator === "contains") return raw.toLowerCase().indexOf(target) !== -1;
    return true;
  }

  function validateValue(field, value) {
    if (field.type === "NUMBER" || field.type === "DECIMAL" || field.type === "CURRENCY") {
      var n = Number(value);
      if (isNaN(n)) return '"' + field.label + '" must be a number';
      if (field.minValue != null && n < field.minValue) return '"' + field.label + '" must be at least ' + field.minValue;
      if (field.maxValue != null && n > field.maxValue) return '"' + field.label + '" must be at most ' + field.maxValue;
      return null;
    }
    if (field.minLength != null && value.length < field.minLength) return '"' + field.label + '" must be at least ' + field.minLength + ' character' + (field.minLength === 1 ? '' : 's');
    if (field.maxLength != null && value.length > field.maxLength) return '"' + field.label + '" must be at most ' + field.maxLength + ' character' + (field.maxLength === 1 ? '' : 's');
    if (field.pattern) {
      var matches = true;
      try { matches = new RegExp(field.pattern).test(value); } catch (e) {}
      if (!matches) return '"' + field.label + '" doesn\\'t match the required format';
    }
    return null;
  }

  function setFieldError(fieldId, msg) {
    var el = document.getElementById("err-" + fieldId);
    if (el) el.textContent = msg || "";
  }

  function visibleKey(page) {
    return page.filter(isVisible).map(function (f) { return f.id; }).join(",");
  }

  function maybeRerender() {
    if (visibleKey(DATA.pages[pageIndex]) !== lastVisibleKey) renderPage();
  }

  function updateValue(field) {
    if (field.type === "CHECKBOX") {
      var checked = Array.prototype.slice.call(document.querySelectorAll('input[name="f-' + field.id + '"]:checked')).map(function (el) { return el.value; });
      values[field.id] = checked.join("|");
    } else if (field.type === "RADIO") {
      var sel = document.querySelector('input[name="f-' + field.id + '"]:checked');
      values[field.id] = sel ? sel.value : "";
    } else if (field.type === "FILE_SINGLE" || field.type === "FILE_MULTI") {
      values[field.id] = (files[field.id] && files[field.id].length > 0) ? "1" : "";
    } else {
      var el = inputEls[field.id];
      values[field.id] = el ? el.value.trim() : "";
    }
    setFieldError(field.id, "");
  }

  function handleFiles(field, input) {
    var list = Array.prototype.slice.call(input.files || []);
    if (field.type === "FILE_SINGLE" && list.length > 1) list = list.slice(0, 1);
    if (list.length > DATA.maxFilesPerField) {
      setFieldError(field.id, '"' + field.label + '" allows up to ' + DATA.maxFilesPerField + ' files');
      list = list.slice(0, DATA.maxFilesPerField);
    }
    var oversized = list.some(function (f) { return f.size > DATA.maxFileBytes; });
    if (oversized) {
      setFieldError(field.id, '"' + field.label + '" exceeds the ' + Math.round(DATA.maxFileBytes / (1024 * 1024)) + 'MB limit per file');
      list = list.filter(function (f) { return f.size <= DATA.maxFileBytes; });
    } else {
      setFieldError(field.id, "");
    }
    if (list.length === 0) { files[field.id] = []; updateValue(field); return; }
    var results = [];
    var remaining = list.length;
    list.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        results.push({ fileName: file.name, dataUrl: reader.result });
        remaining--;
        if (remaining === 0) { files[field.id] = results; updateValue(field); }
      };
      reader.readAsDataURL(file);
    });
  }

  function renderField(field) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    wrap.id = "fw-" + field.id;

    if (field.type === "SECTION_HEADING") {
      var h = document.createElement("h2");
      h.textContent = field.label;
      wrap.appendChild(h);
      return wrap;
    }

    var labelEl = document.createElement("label");
    labelEl.className = "q";
    labelEl.setAttribute("for", "in-" + field.id);
    labelEl.textContent = field.label;
    if (field.required) {
      var star = document.createElement("span");
      star.className = "req";
      star.textContent = "*";
      labelEl.appendChild(star);
    }
    wrap.appendChild(labelEl);

    if (field.helpText) {
      var help = document.createElement("p");
      help.className = "help";
      help.textContent = field.helpText;
      wrap.appendChild(help);
    }

    var input;
    if (field.type === "LONG_TEXT") {
      input = document.createElement("textarea");
      input.id = "in-" + field.id;
      if (field.placeholder) input.placeholder = field.placeholder;
      input.addEventListener("input", function () { updateValue(field); });
      input.addEventListener("blur", function () { maybeRerender(); });
      wrap.appendChild(input);
      inputEls[field.id] = input;
    } else if (field.type === "DROPDOWN") {
      input = document.createElement("select");
      input.id = "in-" + field.id;
      var optBlank = document.createElement("option");
      optBlank.value = "";
      optBlank.textContent = "Select…";
      input.appendChild(optBlank);
      field.options.forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      });
      input.addEventListener("change", function () { updateValue(field); maybeRerender(); });
      wrap.appendChild(input);
      inputEls[field.id] = input;
    } else if (field.type === "RADIO") {
      field.options.forEach(function (opt, i) {
        var row = document.createElement("div");
        row.className = "choice-row";
        var r = document.createElement("input");
        r.type = "radio"; r.name = "f-" + field.id; r.value = opt; r.id = "in-" + field.id + "-" + i;
        r.addEventListener("change", function () { updateValue(field); maybeRerender(); });
        var l = document.createElement("label");
        l.setAttribute("for", r.id); l.textContent = opt;
        row.appendChild(r); row.appendChild(l);
        wrap.appendChild(row);
      });
      inputEls[field.id] = null;
    } else if (field.type === "CHECKBOX") {
      field.options.forEach(function (opt, i) {
        var row = document.createElement("div");
        row.className = "choice-row";
        var c = document.createElement("input");
        c.type = "checkbox"; c.name = "f-" + field.id; c.value = opt; c.id = "in-" + field.id + "-" + i;
        c.addEventListener("change", function () { updateValue(field); maybeRerender(); });
        var l = document.createElement("label");
        l.setAttribute("for", c.id); l.textContent = opt;
        row.appendChild(c); row.appendChild(l);
        wrap.appendChild(row);
      });
      inputEls[field.id] = null;
    } else if (field.type === "FILE_SINGLE" || field.type === "FILE_MULTI") {
      input = document.createElement("input");
      input.type = "file";
      input.id = "in-" + field.id;
      input.accept = "${ACCEPT_EXTENSIONS}";
      if (field.type === "FILE_MULTI") input.multiple = true;
      input.addEventListener("change", function () { handleFiles(field, input); maybeRerender(); });
      wrap.appendChild(input);
      var note = document.createElement("p");
      note.className = "file-note";
      note.textContent = "Up to " + DATA.maxFilesPerField + " files, " + Math.round(DATA.maxFileBytes / (1024 * 1024)) + "MB each.";
      wrap.appendChild(note);
      inputEls[field.id] = input;
    } else {
      input = document.createElement("input");
      input.id = "in-" + field.id;
      input.type = field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : field.type === "LINK" ? "url" :
        field.type === "PASSWORD" ? "password" : field.type === "DATE" ? "date" :
        (field.type === "NUMBER" || field.type === "DECIMAL" || field.type === "CURRENCY") ? "number" : "text";
      if (field.type === "DECIMAL" || field.type === "CURRENCY") input.step = "any";
      if (field.placeholder) input.placeholder = field.placeholder;
      input.addEventListener("input", function () { updateValue(field); });
      input.addEventListener("blur", function () { maybeRerender(); });
      if (field.type === "DATE") input.addEventListener("change", function () { updateValue(field); maybeRerender(); });

      if (field.type === "CURRENCY") {
        var row2 = document.createElement("div");
        row2.className = "currency-row";
        var sym = document.createElement("span");
        sym.textContent = field.currencySymbol || "₹";
        row2.appendChild(sym);
        row2.appendChild(input);
        wrap.appendChild(row2);
      } else {
        wrap.appendChild(input);
      }
      inputEls[field.id] = input;
    }

    var err = document.createElement("p");
    err.className = "err";
    err.id = "err-" + field.id;
    wrap.appendChild(err);
    return wrap;
  }

  function restoreField(field) {
    if (field.type === "FILE_SINGLE" || field.type === "FILE_MULTI") {
      var picked = files[field.id];
      if (picked && picked.length) {
        var note = document.querySelector("#fw-" + field.id + " .file-note");
        if (note) note.textContent = picked.length + " file" + (picked.length === 1 ? "" : "s") + " already selected. " + note.textContent;
      }
      return;
    }
    if (field.type === "RADIO") {
      var val = values[field.id];
      if (val) {
        var r = document.querySelector('input[name="f-' + field.id + '"][value="' + CSS.escape(val) + '"]');
        if (r) r.checked = true;
      }
      return;
    }
    if (field.type === "CHECKBOX") {
      var selected = (values[field.id] || "").split("|").filter(Boolean);
      selected.forEach(function (v) {
        var c = document.querySelector('input[name="f-' + field.id + '"][value="' + CSS.escape(v) + '"]');
        if (c) c.checked = true;
      });
      return;
    }
    var el = inputEls[field.id];
    if (el && values[field.id] !== undefined) el.value = values[field.id];
  }

  function validatePage() {
    var page = DATA.pages[pageIndex];
    var ok = true;
    var firstBad = null;
    page.forEach(function (field) {
      if (field.type === "SECTION_HEADING" || !isVisible(field)) return;
      if (field.type === "FILE_SINGLE" || field.type === "FILE_MULTI") {
        if (field.required && !(files[field.id] && files[field.id].length)) {
          setFieldError(field.id, '"' + field.label + '" is required');
          ok = false; if (!firstBad) firstBad = field.id;
        }
        return;
      }
      var value = values[field.id] || "";
      if (field.required && !value) {
        setFieldError(field.id, '"' + field.label + '" is required');
        ok = false; if (!firstBad) firstBad = field.id;
        return;
      }
      if (value) {
        var problem = validateValue(field, value);
        if (problem) { setFieldError(field.id, problem); ok = false; if (!firstBad) firstBad = field.id; }
      }
    });
    if (firstBad) {
      var el = document.getElementById("fw-" + firstBad);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return ok;
  }

  function renderPage() {
    var page = DATA.pages[pageIndex];
    formEl.innerHTML = "";
    page.forEach(function (field) {
      if (!isVisible(field)) return;
      formEl.appendChild(renderField(field));
    });
    page.forEach(function (field) {
      if (isVisible(field)) restoreField(field);
    });
    lastVisibleKey = visibleKey(page);

    var actions = document.createElement("div");
    actions.className = "actions";
    if (pageIndex > 0) {
      var back = document.createElement("button");
      back.type = "button"; back.className = "btn-ghost"; back.textContent = "Back";
      back.addEventListener("click", function () { pageIndex--; renderPage(); window.scrollTo(0, 0); });
      actions.appendChild(back);
    }
    var next = document.createElement("button");
    next.type = "button";
    next.className = "btn-primary";
    next.id = "next-btn";
    next.textContent = pageIndex < DATA.pages.length - 1 ? "Next" : "Submit";
    next.addEventListener("click", onNext);
    actions.appendChild(next);
    formEl.appendChild(actions);
  }

  function onNext() {
    if (!validatePage()) return;
    if (pageIndex < DATA.pages.length - 1) {
      pageIndex++;
      renderPage();
      window.scrollTo(0, 0);
    } else {
      submit();
    }
  }

  function submit() {
    var btn = document.getElementById("next-btn");
    var origLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Submitting…";
    topErr.style.display = "none";

    var answers = {};
    DATA.pages.forEach(function (page) {
      page.forEach(function (field) {
        if (field.type === "SECTION_HEADING" || !isVisible(field)) return;
        if (field.type === "FILE_SINGLE" || field.type === "FILE_MULTI") {
          if (files[field.id] && files[field.id].length) answers[field.id] = files[field.id];
        } else if (field.type === "CHECKBOX") {
          var v = values[field.id] || "";
          if (v) answers[field.id] = v.split("|");
        } else if (values[field.id]) {
          answers[field.id] = values[field.id];
        }
      });
    });

    fetch(DATA.submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answers })
    }).then(function (res) {
      if (res.status === 201) {
        window.location.href = DATA.thankYouUrl;
        return;
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        btn.disabled = false; btn.textContent = origLabel;
        topErr.textContent = data.error || "Something went wrong. Please try again.";
        topErr.style.display = "block";
        topErr.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }).catch(function () {
      btn.disabled = false; btn.textContent = origLabel;
      topErr.textContent = "Couldn't reach the server. Check your connection and try again.";
      topErr.style.display = "block";
    });
  }

  renderPage();
})();
</script>
</body>
</html>
`;
}
