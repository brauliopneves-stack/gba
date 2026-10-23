import UIKit
import WebKit

// Hosts the web app full screen. Files are served from the app bundle under
// app://localhost/ so ES modules and IndexedDB behave like on a website.
final class WebViewController: UIViewController, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
    private var webView: WKWebView!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "app")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "share")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0x3b / 255, green: 0x2f / 255, blue: 0x86 / 255, alpha: 1)
        webView.allowsLinkPreview = false

        // The page handles safe areas itself (viewport-fit=cover); never zoom
        let scroll = webView.scrollView
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.bounces = false
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 1
        scroll.delegate = self
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: URL(string: "app://localhost/index.html")!))
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }

    // MARK: - Saves exported from the page go through the iOS share sheet

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "share",
              let body = message.body as? [String: Any],
              let name = body["name"] as? String,
              let base64 = body["data"] as? String,
              let data = Data(base64Encoded: base64) else { return }
        let safeName = name.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return
        }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
        present(sheet, animated: true)
    }

    // MARK: - alert / confirm / prompt from the page

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: prompt, message: nil, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText; $0.clearButtonMode = .whileEditing }
        alert.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}

// Serves the bundled www/ folder for app:// requests
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL!.appendingPathComponent("www").standardizedFileURL

    private static let types: [String: String] = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json",
        "webmanifest": "application/manifest+json",
        "png": "image/png",
        "svg": "image/svg+xml",
        "bin": "application/octet-stream",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        let file = root.appendingPathComponent(String(path.drop(while: { $0 == "/" }))).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": type,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
