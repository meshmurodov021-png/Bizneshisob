package uz.bizneshisob.app.bridge

import android.content.Context
import android.webkit.JavascriptInterface
import uz.bizneshisob.app.widget.ProfitWidgetUpdater
import uz.bizneshisob.app.widget.WidgetDataStore
import uz.bizneshisob.app.widget.WidgetRefreshScheduler

class WebAppBridge(private val context: Context) {

    @JavascriptInterface
    fun updateWidget(snapshotJson: String) {
        WidgetDataStore.save(context, snapshotJson)
        ProfitWidgetUpdater.refreshAll(context)
    }

    @JavascriptInterface
    fun scheduleWidgetRefresh() {
        WidgetRefreshScheduler.enqueueLightRefresh(context)
    }
}
