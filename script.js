(function () {
  "use strict";

  var CATEGORIES = [
    "Marketplaces", "Fashion", "Beauty", "Electronics", "Health",
    "Jewelry", "Travel", "Home", "Pets", "Digital", "Kids", "Auto",
  ];

  var baseBrands = (window.BRANDS || []).slice();
  var customBrands = [];
  var state = { query: "", category: "All" };

  var els = {
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty-state"),
    stats: document.getElementById("stats"),
    chips: document.getElementById("chip-row"),
    search: document.getElementById("search-input"),
    downloadAll: document.getElementById("download-all-btn"),
    lookupForm: document.getElementById("lookup-form"),
    lookupInput: document.getElementById("lookup-input"),
    lookupBtn: document.getElementById("lookup-btn"),
    lookupError: document.getElementById("lookup-error"),
  };

  // ---------- helpers ----------

  function displayAsset(resolved) {
    if (!resolved) return null;
    return resolved.mark || resolved.vector || null;
  }

  function qualityInfo(resolved) {
    if (!resolved) return { label: "\u2014", svg: false };
    if (resolved.vector) return { label: "SVG", svg: true };
    var m = resolved.mark;
    if (!m) return { label: "\u2014", svg: false };
    var min = Math.min(m.width, m.height);
    if (min >= 192) return { label: min + "px", svg: false };
    if (min >= 128) return { label: "128px+", svg: false };
    return { label: "\u2014", svg: false };
  }

  function parseDomain(raw) {
    var trimmed = raw.trim().toLowerCase();
    if (!trimmed) return "";
    try {
      var withProto = trimmed.indexOf("://") >= 0 ? trimmed : "https://" + trimmed;
      return new URL(withProto).hostname.replace(/^www\./, "");
    } catch (e) {
      return trimmed.replace(/^www\./, "").split("/")[0] || "";
    }
  }

  function saveBlob(blob, filename) {
    var href = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(href); }, 1500);
  }

  function loadImageEl(src, crossOrigin) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = "async";
      if (crossOrigin) img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Could not decode logo")); };
      img.src = src;
    });
  }

  // Public image proxy (wsrv.nl / Cloudflare-backed). It fetches the source
  // image server-side and always serves it back with permissive CORS headers,
  // so the canvas can read pixels regardless of whether the *original* logo
  // host supports cross-origin requests. This is what makes PNG rasterizing
  // (single download + ZIP) work reliably without a backend of our own.
  function proxyImageUrl(url, opts) {
    var qs = "url=" + encodeURIComponent(url) + "&output=png&n=-1";
    if (opts && opts.w) qs += "&w=" + opts.w;
    return "https://wsrv.nl/?" + qs;
  }

  // Load an image element for canvas use, trying the CORS-friendly proxy
  // first, then the raw source, in that order. Resolves with the <img>
  // element that actually loaded.
  function loadForCanvas(url) {
    return loadImageEl(proxyImageUrl(url, { w: 1024 }), true).catch(function () {
      return loadImageEl(url, true);
    });
  }

  // Fetch a URL as a blob, trying a direct request first, then the proxy.
  function fetchBlob(url) {
    return fetch(url, { mode: "cors" })
      .then(function (res) {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .catch(function () {
        return fetch(proxyImageUrl(url), { mode: "cors" }).then(function (res) {
          if (!res.ok) throw new Error("Download failed");
          return res.blob();
        });
      });
  }

  function rasterizeToPng(imgEl, size, padding) {
    size = size || 512;
    padding = padding == null ? 36 : padding;
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    var box = size - padding * 2;
    var scale = Math.min(box / Math.max(imgEl.naturalWidth, 1), box / Math.max(imgEl.naturalHeight, 1));
    var w = imgEl.naturalWidth * scale;
    var h = imgEl.naturalHeight * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgEl, (size - w) / 2, (size - h) / 2, w, h);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error("PNG encode failed"));
        else resolve(blob);
      }, "image/png");
    });
  }

  // Save a clean, rasterized 512x512 PNG. Loads via the image proxy first
  // (works for basically every source), falling back to the raw URL, and
  // only as a last resort opens the logo in a new tab for a manual save.
  function downloadPng(asset, filename) {
    var name = filename.replace(/\.[a-z0-9]+$/i, "") + ".png";
    return loadForCanvas(asset.url)
      .then(function (img) { return rasterizeToPng(img, 512); })
      .then(function (blob) { saveBlob(blob, name); return "saved"; })
      .catch(function () {
        window.open(asset.url, "_blank", "noopener");
        return "opened";
      });
  }

  function downloadSvg(asset, filename) {
    var name = filename.replace(/\.[a-z0-9]+$/i, "") + ".svg";
    return fetchBlob(asset.url)
      .then(function (blob) { saveBlob(blob, name); return "saved"; })
      .catch(function () {
        window.open(asset.url, "_blank", "noopener");
        return "opened";
      });
  }

  // ---------- rendering ----------

  function allBrands() {
    return customBrands.concat(baseBrands);
  }

  function visibleBrands() {
    var q = state.query.trim().toLowerCase();
    return allBrands().filter(function (b) {
      if (state.category !== "All" && b.category !== state.category) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().indexOf(q) >= 0 ||
        b.domain.toLowerCase().indexOf(q) >= 0 ||
        b.file.toLowerCase().indexOf(q) >= 0
      );
    });
  }

  function renderStats(list) {
    var svgCount = list.filter(function (b) { return b.resolved.vector; }).length;
    var hdCount = list.filter(function (b) {
      var m = b.resolved.mark;
      return m ? Math.min(m.width, m.height) >= 192 : false;
    }).length;
    els.stats.innerHTML = "";
    [["Listed", list.length], ["SVG", svgCount], ["HD marks", hdCount]].forEach(function (pair) {
      var div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = '<span class="stat-label">' + pair[0] + '</span><span class="stat-value">' + pair[1] + "</span>";
      els.stats.appendChild(div);
    });
  }

  function renderChips() {
    els.chips.innerHTML = "";
    var all = ["All"].concat(CATEGORIES);
    all.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.category === cat ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", function () {
        state.category = cat;
        render();
      });
      els.chips.appendChild(btn);
    });
  }

  function makeCard(brand, index) {
    var asset = displayAsset(brand.resolved);
    var vector = brand.resolved.vector;
    var quality = qualityInfo(brand.resolved);

    var card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = (Math.min(index, 18) * 28) + "ms";

    var tile = document.createElement("div");
    tile.className = "card-tile";

    if (asset) {
      var img = document.createElement("img");
      img.src = asset.url;
      img.alt = brand.name + " logo";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        tile.innerHTML = '<span class="fallback-letter">' + brand.name.slice(0, 1) + "</span>";
      });
      tile.appendChild(img);
    } else {
      tile.innerHTML = '<span class="fallback-letter">' + brand.name.slice(0, 1) + "</span>";
    }

    var badge = document.createElement("span");
    badge.className = "quality-badge" + (quality.svg ? " svg" : "");
    badge.textContent = quality.label;
    tile.appendChild(badge);
    card.appendChild(tile);

    var meta = document.createElement("div");
    meta.className = "card-meta";
    meta.innerHTML = "<h3>" + escapeHtml(brand.name) + "</h3><p>" + escapeHtml(brand.domain) + "</p>";
    card.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "card-actions";

    var pngBtn = document.createElement("button");
    pngBtn.type = "button";
    pngBtn.className = "btn btn-primary btn-png";
    pngBtn.innerHTML = '<span class="btn-label">PNG</span>';
    pngBtn.disabled = !asset;
    pngBtn.addEventListener("click", function () {
      if (!asset || pngBtn.disabled) return;
      pngBtn.disabled = true;
      pngBtn.innerHTML = '<span class="btn-label">Saving\u2026</span>';
      downloadPng(asset, brand.file).then(function (result) {
        pngBtn.innerHTML = '<span class="btn-label">' + (result === "saved" ? "Saved" : "Opened") + "</span>";
        setTimeout(function () {
          pngBtn.innerHTML = '<span class="btn-label">PNG</span>';
          pngBtn.disabled = false;
        }, 1400);
      });
    });
    actions.appendChild(pngBtn);

    if (vector) {
      var svgBtn = document.createElement("button");
      svgBtn.type = "button";
      svgBtn.className = "btn btn-secondary btn-svg";
      svgBtn.title = "Save " + brand.name + " SVG";
      svgBtn.setAttribute("aria-label", "Save " + brand.name + " SVG");
      svgBtn.textContent = "SVG";
      svgBtn.addEventListener("click", function () {
        svgBtn.disabled = true;
        downloadSvg(vector, brand.file).then(function () {
          svgBtn.disabled = false;
        });
      });
      actions.appendChild(svgBtn);
    }

    card.appendChild(actions);
    return card;
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function render() {
    var visible = visibleBrands();
    renderChips();
    renderStats(visible);
    els.grid.innerHTML = "";
    if (visible.length === 0) {
      els.empty.hidden = false;
    } else {
      els.empty.hidden = true;
      visible.forEach(function (brand, i) {
        els.grid.appendChild(makeCard(brand, i));
      });
    }
    els.downloadAll.querySelector(".btn-label").textContent = "Download " + visible.length + " as ZIP";
    els.downloadAll.disabled = visible.length === 0;
  }

  // ---------- search ----------

  els.search.addEventListener("input", function (e) {
    state.query = e.target.value;
    render();
  });

  // ---------- bulk zip download ----------

  els.downloadAll.addEventListener("click", function () {
    if (els.downloadAll.disabled) return;
    var visible = visibleBrands();
    var zip = new JSZip();
    var label = els.downloadAll.querySelector(".btn-label");
    var original = label.textContent;
    els.downloadAll.disabled = true;

    var i = 0;
    var packed = 0;

    function next() {
      if (i >= visible.length) return finish();
      var brand = visible[i];
      i += 1;
      var asset = displayAsset(brand.resolved);
      if (!asset) return next();
      label.textContent = "Packing " + i + " / " + visible.length;
      var base = brand.file.replace(/\.[a-z0-9]+$/i, "");
      var tasks = [
        loadForCanvas(asset.url)
          .then(function (img) { return rasterizeToPng(img, 512); })
          .then(function (blob) { zip.file(base + ".png", blob); packed += 1; })
          .catch(function () { /* skip: neither the proxy nor the source responded */ }),
      ];
      if (brand.resolved.vector) {
        tasks.push(
          fetchBlob(brand.resolved.vector.url)
            .then(function (blob) { zip.file(base + ".svg", blob); })
            .catch(function () { /* skip */ })
        );
      }
      Promise.all(tasks).then(next);
    }

    function finish() {
      if (packed === 0) {
        label.textContent = original;
        els.downloadAll.disabled = false;
        alert("Couldn't pack any logos — the sources blocked cross-origin downloads from this page. Try the individual PNG/SVG buttons instead; they'll open the logo in a new tab if a direct save isn't possible.");
        return;
      }
      zip.generateAsync({ type: "blob" }).then(function (blob) {
        saveBlob(blob, "hd-logos.zip");
        label.textContent = original;
        els.downloadAll.disabled = false;
      });
    }

    next();
  });

  // ---------- custom domain lookup ----------
  // No server here, so this can't run the full multi-source resolver (Wikimedia +
  // site-icon scraping + logo APIs) the original app used server-side to dodge CORS.
  // Instead it tries a couple of public, client-reachable logo services directly.

  function tryImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        if (img.naturalWidth < 16) { reject(new Error("empty")); return; }
        resolve({ url: url, width: img.naturalWidth || 256, height: img.naturalHeight || 256 });
      };
      img.onerror = function () { reject(new Error("not found")); };
      img.src = url;
    });
  }

  function resolveCustomLogo(domain) {
    var candidates = [
      "https://logo.clearbit.com/" + domain + "?size=256",
      "https://www.google.com/s2/favicons?sz=256&domain=" + domain,
    ];
    function attempt(idx) {
      if (idx >= candidates.length) return Promise.reject(new Error("No logo found"));
      return tryImage(candidates[idx]).catch(function () { return attempt(idx + 1); });
    }
    return attempt(0);
  }

  els.lookupForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var domain = parseDomain(els.lookupInput.value);
    els.lookupError.hidden = true;
    if (!domain || domain.indexOf(".") < 0) {
      els.lookupError.textContent = "Enter a site like myntra.com";
      els.lookupError.hidden = false;
      return;
    }
    els.lookupBtn.disabled = true;
    els.lookupBtn.querySelector(".btn-label").textContent = "Finding\u2026";

    resolveCustomLogo(domain)
      .then(function (found) {
        var name = domain.split(".")[0] || domain;
        var display = name.charAt(0).toUpperCase() + name.slice(1);
        var id = domain.replace(/\W+/g, "");
        var mark = { url: found.url, mime: "image/png", width: found.width, height: found.height, source: "lookup" };
        var brand = {
          id: id,
          file: id + ".png",
          domain: domain,
          name: display,
          category: "Marketplaces",
          resolved: { vector: null, mark: mark },
        };
        customBrands = [brand].concat(customBrands.filter(function (b) { return b.domain !== domain; }));
        els.lookupInput.value = "";
        render();
      })
      .catch(function () {
        els.lookupError.textContent = "No logo found for that domain.";
        els.lookupError.hidden = false;
      })
      .finally(function () {
        els.lookupBtn.disabled = false;
        els.lookupBtn.querySelector(".btn-label").textContent = "Find";
      });
  });

  render();
})();
