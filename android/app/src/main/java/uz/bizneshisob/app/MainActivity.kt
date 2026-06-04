package uz.bizneshisob.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import uz.bizneshisob.app.bridge.WebAppBridge

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B1020"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false

            addJavascriptInterface(WebAppBridge(this@MainActivity), "BiznesHisobWidgetBridge")

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return false
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    injectBridgeShim()
                }
            }
            webChromeClient = WebChromeClient()
        }

        setContentView(webView)

        val startUrl = intent?.data?.toString() ?: DEFAULT_URL
        webView.loadUrl(startUrl)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onPause() {
        super.onPause()
        webView.evaluateJavascript("window.pushWidgetSnapshot && window.pushWidgetSnapshot()", null)
    }

    private fun injectBridgeShim() {
        val script = """
            (function () {
              if (typeof BiznesHisobWidgetBridge === 'undefined') return;
              window.BiznesHisobWidgetBridge = {
                updateWidget: function (json) {
                  BiznesHisobWidgetBridge.updateWidget(json);
                },
                scheduleWidgetRefresh: function () {
                  BiznesHisobWidgetBridge.scheduleWidgetRefresh();
                }
              };
              if (window.pushWidgetSnapshot) window.pushWidgetSnapshot();
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    companion object {
        const val DEFAULT_URL = "https://bizneshisob.vercel.app/"
    }
}
