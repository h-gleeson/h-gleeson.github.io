# Local preview server for the site. Nothing is published; it only listens
# on this computer.
#
#   powershell -ExecutionPolicy Bypass -File tools/serve.ps1
#   then open http://localhost:8080/
#
# Behaves like GitHub Pages for the things the site relies on: folders serve
# their index.html, "projects/palace" redirects to "projects/palace/", and
# missing files return 404. Press Ctrl+C to stop.

param([int]$Port = 8080)

$root = Split-Path $PSScriptRoot -Parent

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Threading.Tasks;

public static class PreviewServer
{
    static readonly Dictionary<string, string> Types = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
        {".html","text/html; charset=utf-8"}, {".css","text/css; charset=utf-8"},
        {".js","text/javascript; charset=utf-8"}, {".json","application/json"},
        {".svg","image/svg+xml"}, {".png","image/png"}, {".jpg","image/jpeg"},
        {".jpeg","image/jpeg"}, {".gif","image/gif"}, {".webp","image/webp"},
        {".ico","image/x-icon"}, {".mp3","audio/mpeg"}, {".glb","model/gltf-binary"},
        {".wasm","application/wasm"}, {".txt","text/plain; charset=utf-8"},
        {".md","text/plain; charset=utf-8"}, {".xml","application/xml"},
        {".webmanifest","application/manifest+json"}, {".pdf","application/pdf"}
    };

    public static void Run(string root, int port)
    {
        var listener = new HttpListener();
        listener.Prefixes.Add("http://localhost:" + port + "/");
        listener.Start();
        while (true)
        {
            var ctx = listener.GetContext();
            Task.Run(() => { try { Handle(ctx, root); } catch { } finally { try { ctx.Response.Close(); } catch { } } });
        }
    }

    static void Handle(HttpListenerContext ctx, string root)
    {
        var res = ctx.Response;
        string rel = Uri.UnescapeDataString(ctx.Request.Url.AbsolutePath);
        string full = Path.GetFullPath(Path.Combine(root, rel.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase)) { res.StatusCode = 403; return; }

        if (Directory.Exists(full))
        {
            if (!rel.EndsWith("/")) { res.StatusCode = 301; res.RedirectLocation = rel + "/" + ctx.Request.Url.Query; return; }
            full = Path.Combine(full, "index.html");
        }
        if (!File.Exists(full))
        {
            res.StatusCode = 404;
            var msg = System.Text.Encoding.UTF8.GetBytes("404 Not Found");
            res.ContentType = "text/plain"; res.OutputStream.Write(msg, 0, msg.Length);
            return;
        }

        string type;
        if (!Types.TryGetValue(Path.GetExtension(full), out type)) type = "application/octet-stream";
        res.ContentType = type;
        res.AddHeader("Accept-Ranges", "bytes");
        res.AddHeader("Cache-Control", "no-cache");

        using (var fs = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
            long start = 0, end = fs.Length - 1;
            string range = ctx.Request.Headers["Range"];
            if (range != null && range.StartsWith("bytes="))
            {
                var parts = range.Substring(6).Split('-');
                long a, b;
                if (parts[0].Length > 0 && long.TryParse(parts[0], out a)) start = a;
                if (parts.Length > 1 && parts[1].Length > 0 && long.TryParse(parts[1], out b)) end = Math.Min(b, end);
                if (start > end) { res.StatusCode = 416; return; }
                res.StatusCode = 206;
                res.AddHeader("Content-Range", "bytes " + start + "-" + end + "/" + fs.Length);
            }
            res.ContentLength64 = end - start + 1;
            if (ctx.Request.HttpMethod == "HEAD") return;
            fs.Position = start;
            var buf = new byte[81920];
            long left = end - start + 1;
            while (left > 0)
            {
                int n = fs.Read(buf, 0, (int)Math.Min(buf.Length, left));
                if (n <= 0) break;
                res.OutputStream.Write(buf, 0, n);
                left -= n;
            }
        }
    }
}
'@

"Previewing $root"
"Open http://localhost:$Port/   (Ctrl+C to stop)"
[PreviewServer]::Run($root, $Port)
