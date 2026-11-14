/* Chausima Code: a read-only viewer for silocell's public GitHub repositories.
   Everything comes straight from GitHub's public API (the repo list and the file
   tree) and raw.githubusercontent.com (file contents), so nothing is stored here.
   Addresses are #/repo, #/repo/folder and #/repo/path/to/file. */
(function () {
  "use strict";
  var USER = "silocell";
  var PINNED = ["OpenMCL-Launcher", "HEH-Suite", "HEH-AI", "HEH-Homework"]; // shown first
  var HIDE = /^(silocell|LGNTHWHK)$/i;                                      // profile-readme repo, and ones kept off the list
  var app = document.getElementById("app");
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var LANG = { JavaScript: "#f1e05a", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#563d7c", Python: "#3572A5", Kotlin: "#A97BFF", "C#": "#178600", Swift: "#F05138", Shell: "#89e051", PLpgSQL: "#336790", Java: "#b07219" };

  /* GitHub allows 60 API calls an hour per visitor without a key, so answers are kept for the visit */
  function api(path) {
    var k = "cc:" + path;
    try { var hit = sessionStorage.getItem(k); if (hit) return Promise.resolve(JSON.parse(hit)); } catch (e) {}
    return fetch("https://api.github.com/" + path, { headers: { Accept: "application/vnd.github+json" } }).then(function (r) {
      if (r.status === 403 || r.status === 429) throw new Error("rate");
      if (!r.ok) throw new Error(r.status === 404 ? "missing" : "net");
      return r.json();
    }).then(function (d) { try { sessionStorage.setItem(k, JSON.stringify(d)); } catch (e) {} return d; });
  }
  function raw(repo, branch, path) {
    return "https://raw.githubusercontent.com/" + USER + "/" + encodeURIComponent(repo) + "/" + encodeURIComponent(branch) + "/" + path.split("/").map(encodeURIComponent).join("/");
  }
  function oops(e) {
    var m = e && e.message === "rate"
      ? "GitHub only lets each visitor look around so much in an hour. Try again in a little while, or open the code on GitHub."
      : e && e.message === "missing" ? "That page isn't in the notebook. It may have been renamed or made private."
      : "Couldn't reach GitHub just now. Check your internet and refresh.";
    app.innerHTML = '<div class="empty"><span class="note">Hmm.</span>' + esc(m) + '<p><a class="btn" href="#/">See all the code</a></p></div>';
  }
  function ago(iso) {
    var d = (Date.now() - new Date(iso)) / 864e5;
    if (d < 1) return "updated today";
    if (d < 2) return "updated yesterday";
    if (d < 30) return "updated " + Math.round(d) + " days ago";
    return "updated " + new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  /* ---------- the list of repositories ---------- */
  var allRepos = null;
  function home() {
    document.title = "Chausima Code";
    app.innerHTML = '<h1>The code</h1><p class="lede">Every public project behind Chausima and the Homework Launchpad, file by file. Pick one to look inside.</p><p class="wait">Fetching the list…</p>';
    (allRepos ? Promise.resolve(allRepos) : api("users/" + USER + "/repos?per_page=100&sort=pushed")).then(function (list) {
      allRepos = list.filter(function (r) { return !r.private && !HIDE.test(r.name); });
      allRepos.sort(function (a, b) {
        var pa = PINNED.findIndex(function (n) { return n.toLowerCase() === a.name.toLowerCase(); }), pb = PINNED.findIndex(function (n) { return n.toLowerCase() === b.name.toLowerCase(); });
        if (pa < 0) pa = 99; if (pb < 0) pb = 99;
        return pa - pb || new Date(b.pushed_at) - new Date(a.pushed_at);
      });
      app.innerHTML = '<h1>The code</h1><p class="lede">Every public project behind Chausima and the Homework Launchpad, file by file. Pick one to look inside.</p>' +
        '<input class="search" id="q" type="search" placeholder="Find a project…" aria-label="Find a project"><ul class="repos" id="repos"></ul>';
      var q = document.getElementById("q");
      function draw() {
        var t = q.value.trim().toLowerCase();
        document.getElementById("repos").innerHTML = allRepos.filter(function (r) { return !t || (r.name + " " + (r.description || "")).toLowerCase().indexOf(t) >= 0; }).map(function (r) {
          var wip = /openmcl/i.test(r.name) ? '<span class="tag">in progress</span>' : "";
          return '<li><a class="r" href="#/' + esc(r.name) + '"><b>' + esc(r.name) + wip + '</b><span class="m">' +
            (r.language ? '<span class="lang"><i style="background:' + (LANG[r.language] || "var(--soft)") + '"></i>' + esc(r.language) + '</span><br>' : "") + esc(ago(r.pushed_at)) +
            '</span><span class="d">' + esc(r.description || "No description yet.") + "</span></a></li>";
        }).join("") || '<li class="empty">Nothing matches that.</li>';
      }
      q.addEventListener("input", draw); draw();
    }).catch(oops);
  }

  /* ---------- inside a repository ---------- */
  var trees = {};
  function repoInfo(name) {
    return api("repos/" + USER + "/" + encodeURIComponent(name)).then(function (r) {
      if (r.private) throw new Error("missing");
      if (trees[r.name]) return { r: r, t: trees[r.name] };
      return api("repos/" + USER + "/" + encodeURIComponent(r.name) + "/git/trees/" + encodeURIComponent(r.default_branch) + "?recursive=1").then(function (t) {
        trees[r.name] = t.tree || []; return { r: r, t: trees[r.name] };
      });
    });
  }
  function kids(tree, dir) {
    var pre = dir ? dir + "/" : "";
    return tree.filter(function (x) { return x.path.indexOf(pre) === 0 && x.path.slice(pre.length).indexOf("/") < 0 && x.path !== dir; })
      .sort(function (a, b) { return (a.type === b.type ? 0 : a.type === "tree" ? -1 : 1) || a.path.localeCompare(b.path); });
  }
  function icon(p, type) {
    if (type === "tree") return "📁";
    var e = (p.split(".").pop() || "").toLowerCase();
    return /^(png|jpe?g|gif|svg|webp|ico)$/.test(e) ? "🖼" : /^(md|txt)$/.test(e) ? "📄" : /^(js|ts|py|kt|cs|swift|sh|sql|css|html|json|yml|yaml)$/.test(e) ? "📜" : "📃";
  }
  function treeHtml(name, tree, dir, open, current, depth) {
    if (depth > 12) return "";
    return "<ul>" + kids(tree, dir).map(function (x) {
      var base = x.path.split("/").pop();
      if (x.type === "tree") {
        var isOpen = open.indexOf(x.path) >= 0;
        return '<li><button type="button" data-dir="' + esc(x.path) + '" aria-expanded="' + isOpen + '"><span class="ic">' + (isOpen ? "📂" : "📁") + "</span>" + esc(base) + "</button>" + (isOpen ? treeHtml(name, tree, x.path, open, current, depth + 1) : "") + "</li>";
      }
      if (x.type !== "blob") return "";
      return '<li><a href="#/' + esc(name) + "/" + esc(x.path) + '"' + (x.path === current ? ' aria-current="page"' : "") + '><span class="ic">' + icon(x.path) + "</span>" + esc(base) + "</a></li>";
    }).join("") + "</ul>";
  }
  function crumbs(name, path) {
    var out = '<a href="#/">code</a> / <a href="#/' + esc(name) + '">' + esc(name) + "</a>", acc = "";
    (path ? path.split("/") : []).forEach(function (part) { acc = acc ? acc + "/" + part : part; out += ' / <a href="#/' + esc(name) + "/" + esc(acc) + '">' + esc(part) + "</a>"; });
    return '<p class="crumbs">' + out + "</p>";
  }
  var openDirs = {};
  function repo(name, path) {
    app.innerHTML = '<p class="wait">Opening ' + esc(name) + "…</p>";
    repoInfo(name).then(function (o) {
      var r = o.r, tree = o.t; name = r.name;
      var item = path ? tree.find(function (x) { return x.path === path; }) : null;
      if (path && !item) throw new Error("missing");
      var isDir = !path || item.type === "tree", dir = isDir ? path : path.split("/").slice(0, -1).join("/");
      var open = openDirs[name] = openDirs[name] || [];
      (dir ? dir.split("/") : []).reduce(function (acc, p) { var d = acc ? acc + "/" + p : p; if (open.indexOf(d) < 0) open.push(d); return d; }, "");
      document.title = (path ? path.split("/").pop() + " · " : "") + name + " · Chausima Code";
      var zip = "https://github.com/" + USER + "/" + encodeURIComponent(name) + "/archive/refs/heads/" + encodeURIComponent(r.default_branch) + ".zip";
      var gh = r.html_url + (path ? "/" + (isDir ? "tree" : "blob") + "/" + encodeURIComponent(r.default_branch) + "/" + path : "");
      app.innerHTML = crumbs(name, path) +
        "<h1>" + esc(name) + (/openmcl/i.test(name) ? ' <span class="tag">in progress</span>' : "") + "</h1>" +
        '<p class="lede">' + esc(r.description || "") + (r.homepage ? ' <a href="' + esc(r.homepage) + '">Visit it</a>' : "") + "</p>" +
        '<div class="bar"><a class="btn go" href="' + zip + '">Download ZIP</a><a class="btn" href="' + esc(gh) + '">Open on GitHub</a>' +
        '<button type="button" class="btn menu" id="treeBtn" aria-expanded="false">Files</button>' + (r.license ? '<span class="note">' + esc(r.license.spdx_id === "NOASSERTION" ? "Licence: see the code" : r.license.spdx_id) + "</span>" : "") + "</div>" +
        '<div class="split"><nav class="tree" id="tree" aria-label="Files">' + treeHtml(name, tree, "", open, path, 0) + '</nav><section class="view" id="view"></section></div>';
      var tr = document.getElementById("tree");
      tr.addEventListener("click", function (e) {
        var b = e.target.closest("[data-dir]"); if (!b) return;
        var d = b.dataset.dir, i = open.indexOf(d);
        if (i >= 0) open.splice(i, 1); else open.push(d);
        tr.innerHTML = treeHtml(name, tree, "", open, path, 0);
        var again = tr.querySelector('[data-dir="' + CSS.escape(d) + '"]'); if (again) again.focus();
      });
      document.getElementById("treeBtn").addEventListener("click", function () { var o2 = tr.classList.toggle("open"); this.setAttribute("aria-expanded", String(o2)); });
      var view = document.getElementById("view");
      if (isDir) {
        var readme = kids(tree, path || "").find(function (x) { return x.type === "blob" && /^readme(\.md|\.txt)?$/i.test(x.path.split("/").pop()); });
        var list = '<ul class="files">' + kids(tree, path || "").filter(function (x) { return x.type === "tree" || x.type === "blob"; }).map(function (x) {
          return '<li><a href="#/' + esc(name) + "/" + esc(x.path) + '"><span>' + icon(x.path, x.type) + "</span>" + esc(x.path.split("/").pop()) + "</a></li>";
        }).join("") + "</ul>";
        view.innerHTML = '<div class="vhead"><b>' + esc(path || name) + '</b><span class="sp"></span>' + kids(tree, path || "").length + " items</div>" + (readme ? '<div class="md" id="readme"><p class="wait">Reading the README…</p></div>' : list);
        if (readme) {
          fetch(raw(name, r.default_branch, readme.path)).then(function (x) { return x.text(); }).then(function (t) {
            var html = window.marked ? marked.parse(t) : "<pre>" + esc(t) + "</pre>";
            document.getElementById("readme").innerHTML = (window.DOMPurify ? DOMPurify.sanitize(html) : esc(t)) + '<hr><h3>Files here</h3>' + list;
            fixRelative(document.getElementById("readme"), name, r.default_branch, path);
          }, function () { document.getElementById("readme").innerHTML = list; });
        }
        return;
      }
      showFile(view, name, r.default_branch, item);
    }).catch(oops);
  }
  function fixRelative(box, name, branch, dir) {
    box.querySelectorAll("img[src]").forEach(function (img) {
      var s = img.getAttribute("src"); if (/^(https?:|data:)/.test(s)) return;
      img.src = raw(name, branch, (dir ? dir + "/" : "") + s.replace(/^\.\//, ""));
    });
    box.querySelectorAll("a[href]").forEach(function (a) {
      var h = a.getAttribute("href"); if (/^(https?:|#|mailto:)/.test(h)) return;
      a.setAttribute("href", "#/" + name + "/" + (dir ? dir + "/" : "") + h.replace(/^\.\//, "").replace(/\/$/, ""));
    });
  }
  function showFile(view, name, branch, item) {
    var p = item.path, base = p.split("/").pop(), ext = (base.split(".").pop() || "").toLowerCase(), url = raw(name, branch, p);
    var size = item.size != null ? (item.size > 1024 ? (item.size / 1024).toFixed(1) + " KB" : item.size + " bytes") : "";
    var head = '<div class="vhead"><b>' + esc(base) + "</b><span>" + esc(size) + '</span><span class="sp"></span><a href="' + url + '" download>Raw file</a></div>';
    if (/^(png|jpe?g|gif|webp|ico|svg)$/.test(ext)) { view.innerHTML = head + '<div class="pic"><img alt="' + esc(base) + '" src="' + url + '"></div>'; return; }
    if (item.size > 900000) { view.innerHTML = head + '<div class="empty"><span class="note">That one\'s big.</span>Open the raw file to see it all.</div>'; return; }
    if (/^(zip|apk|ipa|dmg|exe|msix|jar|keystore|jks|pdf|mp4|mp3|wav|woff2?|ttf|otf|gz|tgz|bin|so|dll|class|pyc|appimage|deb|snap)$/.test(ext)) {
      view.innerHTML = head + '<div class="empty"><span class="note">Not readable as text.</span>This is a ' + esc(ext.toUpperCase()) + ' file. Download it with Raw file.</div>'; return;
    }
    view.innerHTML = head + '<p class="wait">Reading…</p>';
    fetch(url).then(function (x) { if (!x.ok) throw new Error("net"); return x.text(); }).then(function (t) {
      if (ext === "md") { view.innerHTML = head + '<div class="md">' + DOMPurify.sanitize(marked.parse(t)) + "</div>"; fixRelative(view.querySelector(".md"), name, branch, p.split("/").slice(0, -1).join("/")); return; }
      var lines = t.replace(/\n$/, "").split("\n").length, code = document.createElement("code");
      var hl = { js: "javascript", mjs: "javascript", ts: "typescript", py: "python", kt: "kotlin", kts: "kotlin", cs: "csharp", sh: "bash", yml: "yaml", html: "xml", svg: "xml", xml: "xml", webmanifest: "json" }[ext] || ext;
      code.textContent = t;
      if (window.hljs && hljs.getLanguage(hl) && t.length < 400000) { code.className = "hljs language-" + hl; hljs.highlightElement(code); }
      view.innerHTML = head + '<div class="code"><div class="ln" aria-hidden="true"></div><pre></pre></div>';
      view.querySelector(".ln").textContent = Array.from({ length: lines }, function (_, i) { return i + 1; }).join("\n");
      view.querySelector("pre").appendChild(code);
    }).catch(function () { view.innerHTML = head + '<div class="empty"><span class="note">Couldn\'t load it.</span>Try the raw file.</div>'; });
  }

  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, "")), parts = h.split("/").filter(Boolean);
    window.scrollTo(0, 0);
    if (!parts.length) home(); else repo(parts[0], parts.slice(1).join("/"));
  }
  addEventListener("hashchange", route); route();
})();
